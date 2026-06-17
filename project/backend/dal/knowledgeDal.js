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
    c.name AS category_name
  FROM knowledge k
  LEFT JOIN knowledge_categories c ON c.id = k.category_id
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
    } = params

    const [res] = await db.execute(
      `INSERT INTO knowledge (title, file_path, file_size, file_type, description, category_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, file_path, file_size, file_type, description, category_id]
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
      `SELECT COUNT(*) AS total
       FROM knowledge
       WHERE category_id = ? AND status = 'active'`,
      [categoryId]
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
