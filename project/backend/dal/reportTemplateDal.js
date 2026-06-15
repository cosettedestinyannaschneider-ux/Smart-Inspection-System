const db = require('./db')

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

  async create(name, filePath = null, description = null, isDefault = 0) {
    if (isDefault) {
      await db.execute('UPDATE report_templates SET is_default = 0')
    }
    const [res] = await db.execute(
      'INSERT INTO report_templates (name, file_path, description, is_default) VALUES (?, ?, ?, ?)',
      [name, filePath, description, isDefault]
    )
    return res.insertId
  },

  async updateById(id, params) {
    const fields = []
    const values = []
    for (const [k, v] of Object.entries(params)) {
      const col = k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
      fields.push(`${col} = ?`)
      values.push(v)
    }
    if (!fields.length) return
    values.push(id)
    await db.execute(`UPDATE report_templates SET ${fields.join(', ')} WHERE id = ?`, values)
  },

  async setDefault(id) {
    await db.execute('UPDATE report_templates SET is_default = 0')
    await db.execute('UPDATE report_templates SET is_default = 1 WHERE id = ?', [id])
  },

  async deleteById(id) {
    await db.execute('DELETE FROM report_templates WHERE id = ?', [id])
  },
}

module.exports = reportTemplateDal
