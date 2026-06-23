const db = require('./db')

const ALLOWED_RULE_UPDATE_COLUMNS = new Set([
  'seed_key',
  'name',
  'category_id',
  'hazard_level',
  'visible_fact_keywords',
  'trigger_condition',
  'required_evidence',
  'image_evidence_supported',
  'insufficient_evidence_level',
  'rectification_template',
  'is_active',
  'status',
])

/** 将驼峰字段转换为数据库列名，避免任意字段拼接 SQL */
const normalizeColumnName = (key) => String(key || '')
  .trim()
  .replace(/[A-Z]/g, (matched) => `_${matched.toLowerCase()}`)

/** 将规则行转换为前端和服务层统一使用的对象 */
const mapRuleRow = (row = {}) => ({
  ...row,
  id: Number(row.id),
  category_id: row.category_id ? Number(row.category_id) : null,
  image_evidence_supported: Number(row.image_evidence_supported || 0) === 1,
  is_active: Number(row.is_active || 0) === 1,
  clause_ref_count: Number(row.clause_ref_count || 0),
})

/** 查询规则关联的法规条款快照 */
const findRefsByRuleIds = async (ruleIds = []) => {
  const ids = ruleIds.map((item) => Number(item || 0)).filter((item) => item > 0)
  if (!ids.length) return new Map()

  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await db.execute(
    `SELECT
       r.rule_id,
       r.clause_id,
       r.sort,
       c.knowledge_id,
       c.source_title,
       c.source_code,
       c.clause_no,
       c.content,
       c.keywords,
       c.verification_status,
       c.current_status
     FROM hazard_rule_clause_refs r
     INNER JOIN knowledge_clauses c ON c.id = r.clause_id
     WHERE r.rule_id IN (${placeholders})
     ORDER BY r.rule_id ASC, r.sort ASC, r.clause_id ASC`,
    ids
  )

  const map = new Map()
  rows.forEach((row) => {
    const ruleId = Number(row.rule_id)
    if (!map.has(ruleId)) map.set(ruleId, [])
    map.get(ruleId).push({
      clause_id: Number(row.clause_id),
      sort: Number(row.sort || 0),
      knowledge_id: row.knowledge_id ? Number(row.knowledge_id) : null,
      source_title: row.source_title,
      source_code: row.source_code,
      clause_no: row.clause_no,
      content: row.content,
      keywords: row.keywords,
      verification_status: row.verification_status,
      current_status: row.current_status,
    })
  })
  return map
}

/** 隐患判定规则数据访问层 */
const hazardRuleDal = {
  /** 查询规则列表，默认排除已归档规则 */
  async findAll({ keyword = '', category_id = null, hazard_level = '', status = 'active', limit = 500 } = {}) {
    const where = []
    const params = []
    if (status !== 'all') {
      where.push('r.status = ?')
      params.push(status || 'active')
    }
    if (category_id) {
      where.push('r.category_id = ?')
      params.push(Number(category_id))
    }
    if (hazard_level) {
      where.push('r.hazard_level = ?')
      params.push(hazard_level)
    }
    const searchText = String(keyword || '').trim()
    if (searchText) {
      const likeValue = `%${searchText}%`
      where.push(`(
        r.name LIKE ?
        OR r.visible_fact_keywords LIKE ?
        OR r.trigger_condition LIKE ?
        OR r.required_evidence LIKE ?
        OR r.rectification_template LIKE ?
      )`)
      params.push(likeValue, likeValue, likeValue, likeValue, likeValue)
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 1000))
    const [rows] = await db.execute(
      `SELECT
         r.*,
         c.name AS category_name,
         COUNT(ref.clause_id) AS clause_ref_count
       FROM hazard_rules r
       LEFT JOIN knowledge_categories c ON c.id = r.category_id
       LEFT JOIN hazard_rule_clause_refs ref ON ref.rule_id = r.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY r.id
       ORDER BY r.updated_at DESC, r.id DESC
       LIMIT ${safeLimit}`,
      params
    )

    const rules = rows.map(mapRuleRow)
    const refMap = await findRefsByRuleIds(rules.map((item) => item.id))
    return rules.map((rule) => ({ ...rule, clause_refs: refMap.get(rule.id) || [] }))
  },

  /** 按 ID 查询规则及关联条款 */
  async findById(id) {
    const [rows] = await db.execute(
      `SELECT r.*, c.name AS category_name
       FROM hazard_rules r
       LEFT JOIN knowledge_categories c ON c.id = r.category_id
       WHERE r.id = ? AND r.status <> 'archived'
       LIMIT 1`,
      [id]
    )
    if (!rows[0]) return null
    const rule = mapRuleRow(rows[0])
    const refMap = await findRefsByRuleIds([rule.id])
    return { ...rule, clause_refs: refMap.get(rule.id) || [] }
  },

  /** 按种子 Key 查询规则，用于重复导入时更新而不是重复创建 */
  async findBySeedKey(seedKey) {
    const text = String(seedKey || '').trim()
    if (!text) return null
    const [rows] = await db.execute(
      `SELECT r.*, c.name AS category_name
       FROM hazard_rules r
       LEFT JOIN knowledge_categories c ON c.id = r.category_id
       WHERE r.seed_key = ? AND r.status <> 'archived'
       LIMIT 1`,
      [text]
    )
    if (!rows[0]) return null
    const rule = mapRuleRow(rows[0])
    const refMap = await findRefsByRuleIds([rule.id])
    return { ...rule, clause_refs: refMap.get(rule.id) || [] }
  },

  /** 新增规则并写入条款关联 */
  async create(rule = {}, clauseIds = []) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const [res] = await connection.execute(
        `INSERT INTO hazard_rules
          (
            seed_key, name, category_id, hazard_level, visible_fact_keywords,
            trigger_condition, required_evidence, image_evidence_supported,
            insufficient_evidence_level, rectification_template, is_active, status
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rule.seed_key || null,
          rule.name,
          rule.category_id || null,
          rule.hazard_level,
          rule.visible_fact_keywords || null,
          rule.trigger_condition || '',
          rule.required_evidence || '',
          rule.image_evidence_supported ? 1 : 0,
          rule.insufficient_evidence_level || '需人工复核',
          rule.rectification_template || '',
          rule.is_active ? 1 : 0,
          rule.status || 'active',
        ]
      )
      const ruleId = res.insertId
      await this._replaceRefsWithConnection(connection, ruleId, clauseIds)
      await connection.commit()
      return ruleId
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  /** 白名单更新规则字段，可选替换条款关联 */
  async updateById(id, params = {}, clauseIds = null) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const fields = []
      const values = []
      for (const [key, value] of Object.entries(params)) {
        const columnName = normalizeColumnName(key)
        if (!ALLOWED_RULE_UPDATE_COLUMNS.has(columnName)) continue
        fields.push(`${columnName} = ?`)
        values.push(value)
      }
      if (fields.length) {
        values.push(id)
        await connection.execute(`UPDATE hazard_rules SET ${fields.join(', ')} WHERE id = ?`, values)
      }
      if (Array.isArray(clauseIds)) {
        await this._replaceRefsWithConnection(connection, id, clauseIds)
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  /** 更新启用状态 */
  async setActive(id, isActive) {
    await db.execute(
      'UPDATE hazard_rules SET is_active = ? WHERE id = ? AND status <> \'archived\'',
      [isActive ? 1 : 0, id]
    )
  },

  /** 归档规则并同时停用 */
  async archiveById(id) {
    await db.execute(
      'UPDATE hazard_rules SET status = \'archived\', is_active = 0 WHERE id = ?',
      [id]
    )
  },

  /** 仅查询已校验、现行有效、未归档条款，保证规则引用来源可靠 */
  async findVerifiedClausesByIds(ids = []) {
    const clauseIds = Array.from(new Set(
      ids.map((item) => Number(item || 0)).filter((item) => item > 0)
    ))
    if (!clauseIds.length) return []

    const placeholders = clauseIds.map(() => '?').join(', ')
    const [rows] = await db.execute(
      `SELECT *
       FROM knowledge_clauses
       WHERE id IN (${placeholders})
         AND status = 'active'
         AND verification_status = 'verified'
         AND current_status = '现行有效'`,
      clauseIds
    )
    return rows
  },

  /** 管理端搜索可关联到规则的已校验条款 */
  async searchVerifiedClauses({ keyword = '', category_id = null, limit = 20 } = {}) {
    const where = [
      'kc.status = \'active\'',
      'kc.verification_status = \'verified\'',
      'kc.current_status = \'现行有效\'',
    ]
    const params = []
    if (category_id) {
      where.push('kc.category_id = ?')
      params.push(Number(category_id))
    }
    const text = String(keyword || '').trim()
    if (text) {
      const likeValue = `%${text}%`
      where.push(`(
        kc.source_title LIKE ?
        OR kc.source_code LIKE ?
        OR kc.clause_no LIKE ?
        OR kc.content LIKE ?
        OR kc.keywords LIKE ?
      )`)
      params.push(likeValue, likeValue, likeValue, likeValue, likeValue)
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100))
    const [rows] = await db.execute(
      `SELECT kc.*, c.name AS category_name
       FROM knowledge_clauses kc
       LEFT JOIN knowledge_categories c ON c.id = kc.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY kc.source_title ASC, kc.sort ASC, kc.id ASC
       LIMIT ${safeLimit}`,
      params
    )
    return rows
  },


  /** 查询后续 AI 判定可使用的启用规则，未启用草稿不会进入正式候选 */
  async findActiveForAssessment({ category_id = null, limit = 200 } = {}) {
    const where = [
      'r.status = \'active\'',
      'r.is_active = 1',
    ]
    const params = []
    if (category_id) {
      where.push('r.category_id = ?')
      params.push(Number(category_id))
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500))
    const [rows] = await db.execute(
      `SELECT
         r.*,
         c.name AS category_name,
         COUNT(ref.clause_id) AS clause_ref_count
       FROM hazard_rules r
       LEFT JOIN knowledge_categories c ON c.id = r.category_id
       LEFT JOIN hazard_rule_clause_refs ref ON ref.rule_id = r.id
       WHERE ${where.join(' AND ')}
       GROUP BY r.id
       ORDER BY r.category_id ASC, r.id ASC
       LIMIT ${safeLimit}`,
      params
    )

    const rules = rows.map(mapRuleRow)
    const refMap = await findRefsByRuleIds(rules.map((item) => item.id))
    return rules
      .map((rule) => ({ ...rule, clause_refs: refMap.get(rule.id) || [] }))
      .filter((rule) => rule.clause_refs.length > 0)
  },
  /** 种子规则按关键词匹配本地已校验条款 */
  async searchVerifiedClausesForSeed({ category_id = null, keywords = [], limit = 5 } = {}) {
    const cleanedKeywords = Array.from(new Set(
      keywords.map((item) => String(item || '').trim()).filter((item) => item.length >= 2)
    )).slice(0, 12)
    if (!cleanedKeywords.length) return []

    const where = [
      'kc.status = \'active\'',
      'kc.verification_status = \'verified\'',
      'kc.current_status = \'现行有效\'',
    ]
    const params = []
    if (category_id) {
      where.push('(kc.category_id = ? OR rel.category_id = ?)')
      params.push(Number(category_id), Number(category_id))
    }

    const keywordParts = []
    cleanedKeywords.forEach((keyword) => {
      const likeValue = `%${keyword}%`
      keywordParts.push(`(
        kc.source_title LIKE ?
        OR kc.source_code LIKE ?
        OR kc.clause_no LIKE ?
        OR kc.content LIKE ?
        OR kc.keywords LIKE ?
      )`)
      params.push(likeValue, likeValue, likeValue, likeValue, likeValue)
    })
    where.push(`(${keywordParts.join(' OR ')})`)

    const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 20))
    const [rows] = await db.execute(
      `SELECT DISTINCT kc.*
       FROM knowledge_clauses kc
       LEFT JOIN knowledge_category_relations rel ON rel.knowledge_id = kc.knowledge_id
       WHERE ${where.join(' AND ')}
       ORDER BY kc.sort ASC, kc.id ASC
       LIMIT ${safeLimit}`,
      params
    )
    return rows
  },

  /** 事务内替换规则条款关联 */
  async _replaceRefsWithConnection(connection, ruleId, clauseIds = []) {
    await connection.execute('DELETE FROM hazard_rule_clause_refs WHERE rule_id = ?', [ruleId])
    const ids = Array.from(new Set(
      clauseIds.map((item) => Number(item || 0)).filter((item) => item > 0)
    ))
    for (let index = 0; index < ids.length; index += 1) {
      await connection.execute(
        'INSERT INTO hazard_rule_clause_refs (rule_id, clause_id, sort) VALUES (?, ?, ?)',
        [ruleId, ids[index], index + 1]
      )
    }
  },
}

module.exports = hazardRuleDal
