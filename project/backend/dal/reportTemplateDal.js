const db = require('./db')

/** 允许写入的模板字段白名单，避免任意键直接拼接 SQL */
const ALLOWED_COLUMNS = new Set([
  'name',
  'file_path',
  'description',
  'is_default',
])

const reportTemplateDal = {
  async findAll() {
    const [rows] = await db.execute('SELECT * FROM report_templates ORDER BY is_default DESC, id ASC')
    return rows
  },

  async findDefault() {
    const [rows] = await db.execute('SELECT * FROM report_templates WHERE is_default = 1 LIMIT 1')
    return rows[0] || null
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM report_templates WHERE id = ?', [id])
    return rows[0]
  },

  async create(params = {}) {
    const {
      name,
      filePath = null,
      description = null,
      isDefault = 0,
    } = params
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      if (isDefault) {
        await connection.execute('UPDATE report_templates SET is_default = 0')
      }
      const [res] = await connection.execute(
        'INSERT INTO report_templates (name, file_path, description, is_default) VALUES (?, ?, ?, ?)',
        [name, filePath, description, isDefault ? 1 : 0]
      )
      await connection.commit()
      return res.insertId
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  async updateById(id, params) {
    const fields = []
    const values = []
    for (const [k, v] of Object.entries(params)) {
      const col = String(k || '').trim().replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
      if (!ALLOWED_COLUMNS.has(col)) continue
      fields.push(`${col} = ?`)
      values.push(v)
    }
    if (!fields.length) return
    values.push(id)
    await db.execute(`UPDATE report_templates SET ${fields.join(', ')} WHERE id = ?`, values)
  },

  async setDefault(id) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('UPDATE report_templates SET is_default = 0')
      await connection.execute('UPDATE report_templates SET is_default = 1 WHERE id = ?', [id])
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  async deleteById(id) {
    await db.execute('DELETE FROM report_templates WHERE id = ?', [id])
  },
}

module.exports = reportTemplateDal
