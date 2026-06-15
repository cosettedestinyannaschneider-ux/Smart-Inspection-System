const db = require('./db')

const aiModelConfigDal = {
  async findActive() {
    const [rows] = await db.execute(
      'SELECT * FROM ai_model_configs WHERE is_active = 1 LIMIT 1'
    )
    return rows[0] || null
  },

  async findAll() {
    const [rows] = await db.execute('SELECT * FROM ai_model_configs ORDER BY is_active DESC, id ASC')
    return rows
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM ai_model_configs WHERE id = ?', [id])
    return rows[0]
  },

  async create(params) {
    const { name, baseUrl, apiKeyEncrypted, modelName, maxTokens = 4096, temperature = 0.7, timeoutMs = 60000, isActive = 0 } = params
    const [res] = await db.execute(
      `INSERT INTO ai_model_configs (name, base_url, api_key_encrypted, model_name, max_tokens, temperature, timeout_ms, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, baseUrl, apiKeyEncrypted, modelName, maxTokens, temperature, timeoutMs, isActive]
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
    await db.execute(`UPDATE ai_model_configs SET ${fields.join(', ')} WHERE id = ?`, values)
  },

  async setActive(id) {
    await db.execute('UPDATE ai_model_configs SET is_active = 0')
    await db.execute('UPDATE ai_model_configs SET is_active = 1 WHERE id = ?', [id])
  },

  async deleteById(id) {
    await db.execute('DELETE FROM ai_model_configs WHERE id = ?', [id])
  },
}

module.exports = aiModelConfigDal
