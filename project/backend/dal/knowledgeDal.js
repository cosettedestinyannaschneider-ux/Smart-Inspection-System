const path = require('path')
const db = require('./db')

/** 允许更新的知识库字段白名单 */
const ALLOWED_COLUMNS = new Set([
  'title',
  'file_path',
  'file_size',
  'file_type',
  'description',
  'category_id',
  'source_code',
  'source_url',
  'issuing_authority',
  'document_type',
  'publish_date',
  'effective_date',
  'current_status',
  'verification_status',
  'parse_status',
  'parse_message',
  'status',
])

/** 将驼峰键转换为数据库列名 */
const normalizeColumnName = (key) => String(key || '')
  .trim()
  .replace(/[A-Z]/g, (matched) => `_${matched.toLowerCase()}`)

/** 查询基础字段，统一补全分类名称和文件名 */
const KNOWLEDGE_SELECT_SQL = `
  SELECT
    k.*,
    c.name AS category_name,
    COALESCE(kcr.applicable_category_ids, '') AS applicable_category_ids,
    COALESCE(kcr.applicable_category_names, '') AS applicable_category_names,
    COALESCE(kcc.clause_count, 0) AS clause_count
  FROM knowledge k
  LEFT JOIN knowledge_categories c ON c.id = k.category_id
  LEFT JOIN (
    SELECT
      r.knowledge_id,
      GROUP_CONCAT(r.category_id ORDER BY rc.sort ASC, rc.id ASC) AS applicable_category_ids,
      GROUP_CONCAT(rc.name ORDER BY rc.sort ASC, rc.id ASC SEPARATOR '、') AS applicable_category_names
    FROM knowledge_category_relations r
    INNER JOIN knowledge_categories rc ON rc.id = r.category_id
    GROUP BY r.knowledge_id
  ) kcr ON kcr.knowledge_id = k.id
  LEFT JOIN (
    SELECT knowledge_id, COUNT(*) AS clause_count
    FROM knowledge_clauses
    WHERE status = 'active'
    GROUP BY knowledge_id
  ) kcc ON kcc.knowledge_id = k.id
`

const knowledgeDal = {
  /** 新增知识库文档 */
  async create(params = {}) {
    const {
      title,
      file_path = null,
      description = null,
      category_id = null,
      file_size = null,
      file_type = null,
      source_code = null,
      source_url = null,
      issuing_authority = null,
      document_type = null,
      publish_date = null,
      effective_date = null,
      current_status = '现行有效',
      verification_status = 'pending',
    } = params

    const [res] = await db.execute(
      `INSERT INTO knowledge (
        title, file_path, file_size, file_type, description, category_id,
        source_code, source_url, issuing_authority, document_type, publish_date,
        effective_date, current_status, verification_status
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        file_path,
        file_size,
        file_type,
        description,
        category_id,
        source_code,
        source_url,
        issuing_authority,
        document_type,
        publish_date,
        effective_date,
        current_status,
        verification_status,
      ]
    )
    return res.insertId
  },

  /** 查询有效知识库列表 */
  async findAll() {
    const [rows] = await db.execute(`
      ${KNOWLEDGE_SELECT_SQL}
      WHERE k.status = 'active'
      ORDER BY k.updated_at DESC, k.id DESC
    `)
    return rows.map((row) => ({
      ...row,
      file_name: row.file_path ? path.posix.basename(String(row.file_path).replace(/\\/g, '/')) : null,
    }))
  },

  /** 按 ID 查询知识库记录 */
  async findById(id) {
    const [rows] = await db.execute(`
      ${KNOWLEDGE_SELECT_SQL}
      WHERE k.id = ?
      LIMIT 1
    `, [id])
    const record = rows[0]
    if (!record) return null
    return {
      ...record,
      file_name: record.file_path ? path.posix.basename(String(record.file_path).replace(/\\/g, '/')) : null,
    }
  },

  /** 按 ID 集合查询有效知识库记录 */
  async findActiveByIds(ids = []) {
    const normalizedIds = ids.map((item) => Number(item || 0)).filter((item) => item > 0)
    if (!normalizedIds.length) return []

    const placeholders = normalizedIds.map(() => '?').join(', ')
    const [rows] = await db.execute(`
      ${KNOWLEDGE_SELECT_SQL}
      WHERE k.status = 'active' AND k.id IN (${placeholders})
      ORDER BY k.updated_at DESC, k.id DESC
    `, normalizedIds)

    return rows.map((row) => ({
      ...row,
      file_name: row.file_path ? path.posix.basename(String(row.file_path).replace(/\\/g, '/')) : null,
    }))
  },

  /** 统计分类下仍有效的文档数量 */
  async countActiveByCategoryId(categoryId) {
    const [rows] = await db.execute(
      `SELECT COUNT(DISTINCT k.id) AS total
       FROM knowledge k
       LEFT JOIN knowledge_category_relations r ON r.knowledge_id = k.id
       WHERE k.status = 'active'
         AND (k.category_id = ? OR r.category_id = ?)`,
      [categoryId, categoryId]
    )
    return Number(rows[0]?.total || 0)
  },

  /** 白名单更新知识库记录 */
  async updateById(id, params = {}) {
    const fields = []
    const values = []

    for (const [key, value] of Object.entries(params)) {
      const columnName = normalizeColumnName(key)
      if (!ALLOWED_COLUMNS.has(columnName)) continue
      fields.push(`${columnName} = ?`)
      values.push(value)
    }

    if (!fields.length) return
    values.push(id)
    await db.execute(`UPDATE knowledge SET ${fields.join(', ')} WHERE id = ?`, values)
  },

  /** 单条归档 */
  async archiveById(id) {
    await db.execute(`UPDATE knowledge SET status = 'archived' WHERE id = ?`, [id])
  },

  /** 批量归档 */
  async archiveMany(ids = []) {
    const normalizedIds = ids.map((item) => Number(item || 0)).filter((item) => item > 0)
    if (!normalizedIds.length) return

    const placeholders = normalizedIds.map(() => '?').join(', ')
    await db.execute(
      `UPDATE knowledge
       SET status = 'archived'
       WHERE id IN (${placeholders})`,
      normalizedIds
    )
  },
}

module.exports = knowledgeDal
