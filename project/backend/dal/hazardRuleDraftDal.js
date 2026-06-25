const db = require('./db')

const ALLOWED_DRAFT_UPDATE_COLUMNS = new Set([
  'name',
  'category_id',
  'hazard_level',
  'visible_fact_keywords',
  'trigger_condition',
  'required_evidence',
  'image_evidence_supported',
  'insufficient_evidence_level',
  'rectification_template',
  'clause_ids_json',
  'ai_raw_response',
  'generation_prompt',
  'review_status',
  'review_note',
  'reviewed_by',
  'reviewed_at',
  'approved_rule_id',
  'status',
])

/** 将驼峰字段转换为数据库列名，避免动态 SQL 注入 */
const normalizeColumnName = (key) => String(key || '')
  .trim()
  .replace(/[A-Z]/g, (matched) => `_${matched.toLowerCase()}`)

/** 安全解析草稿中保存的条文 ID JSON */
const parseClauseIds = (value) => {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed)
      ? parsed.map((item) => Number(item || 0)).filter((item) => item > 0)
      : []
  } catch {
    return []
  }
}

/** 将数据库行转换为业务层对象 */
const mapDraftRow = (row = {}) => ({
  ...row,
  id: Number(row.id),
  category_id: row.category_id ? Number(row.category_id) : null,
  image_evidence_supported: Number(row.image_evidence_supported || 0) === 1,
  generated_by: row.generated_by ? Number(row.generated_by) : null,
  reviewed_by: row.reviewed_by ? Number(row.reviewed_by) : null,
  approved_rule_id: row.approved_rule_id ? Number(row.approved_rule_id) : null,
  clause_ids: parseClauseIds(row.clause_ids_json),
})

/** 隐患规则 AI 草稿数据访问层 */
const hazardRuleDraftDal = {
  /** 查询草稿列表 */
  async findAll({ keyword = '', review_status = 'pending', category_id = null, limit = 500 } = {}) {
    const where = ['d.status = \'active\'']
    const params = []

    if (review_status && review_status !== 'all') {
      where.push('d.review_status = ?')
      params.push(review_status)
    }
    if (category_id) {
      where.push('d.category_id = ?')
      params.push(Number(category_id))
    }
    const text = String(keyword || '').trim()
    if (text) {
      const likeValue = `%${text}%`
      where.push(`(
        d.name LIKE ?
        OR d.visible_fact_keywords LIKE ?
        OR d.trigger_condition LIKE ?
        OR d.required_evidence LIKE ?
        OR d.rectification_template LIKE ?
      )`)
      params.push(likeValue, likeValue, likeValue, likeValue, likeValue)
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 1000))
    const [rows] = await db.execute(
      `SELECT d.*, c.name AS category_name, u.username AS generated_by_name, ru.username AS reviewed_by_name
       FROM hazard_rule_drafts d
       LEFT JOIN knowledge_categories c ON c.id = d.category_id
       LEFT JOIN users u ON u.id = d.generated_by
       LEFT JOIN users ru ON ru.id = d.reviewed_by
       WHERE ${where.join(' AND ')}
       ORDER BY d.updated_at DESC, d.id DESC
       LIMIT ${safeLimit}`,
      params
    )
    return rows.map(mapDraftRow)
  },

  /** 按 ID 查询草稿 */
  async findById(id) {
    const [rows] = await db.execute(
      `SELECT d.*, c.name AS category_name, u.username AS generated_by_name, ru.username AS reviewed_by_name
       FROM hazard_rule_drafts d
       LEFT JOIN knowledge_categories c ON c.id = d.category_id
       LEFT JOIN users u ON u.id = d.generated_by
       LEFT JOIN users ru ON ru.id = d.reviewed_by
       WHERE d.id = ? AND d.status = 'active'
       LIMIT 1`,
      [id]
    )
    return rows[0] ? mapDraftRow(rows[0]) : null
  },

  /** 批量创建 AI 生成的草稿 */
  async createMany(drafts = []) {
    const ids = []
    for (const draft of drafts) {
      const [res] = await db.execute(
        `INSERT INTO hazard_rule_drafts
          (
            name, category_id, hazard_level, visible_fact_keywords, trigger_condition,
            required_evidence, image_evidence_supported, insufficient_evidence_level,
            rectification_template, clause_ids_json, generation_prompt, ai_raw_response,
            generated_by, review_status, status
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'active')`,
        [
          draft.name,
          draft.category_id || null,
          draft.hazard_level,
          draft.visible_fact_keywords || null,
          draft.trigger_condition || '',
          draft.required_evidence || '',
          draft.image_evidence_supported ? 1 : 0,
          draft.insufficient_evidence_level || '需人工复核',
          draft.rectification_template || '',
          JSON.stringify(draft.clause_ids || []),
          draft.generation_prompt || null,
          draft.ai_raw_response || null,
          draft.generated_by || null,
        ]
      )
      ids.push(res.insertId)
    }
    return ids
  },

  /** 更新草稿字段 */
  async updateById(id, params = {}) {
    const fields = []
    const values = []
    for (const [key, value] of Object.entries(params)) {
      const columnName = normalizeColumnName(key)
      if (!ALLOWED_DRAFT_UPDATE_COLUMNS.has(columnName)) continue
      fields.push(`${columnName} = ?`)
      values.push(value)
    }
    if (!fields.length) return
    values.push(id)
    await db.execute(`UPDATE hazard_rule_drafts SET ${fields.join(', ')} WHERE id = ?`, values)
  },
}

module.exports = hazardRuleDraftDal
