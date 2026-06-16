const db = require('./db')

/** 允许写入的数据库字段白名单，防止任意字段直接拼接 SQL */
const ALLOWED_COLUMNS = new Set([
  'name',
  'provider',
  'base_url',
  'api_key_encrypted',
  'model_name',
  'max_tokens',
  'temperature',
  'timeout_ms',
  'is_active',
])

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
    const {
      name,
      provider,
      baseUrl,
      apiKeyEncrypted,
      modelName,
      maxTokens = 4096,
      temperature = 0.7,
      timeoutMs = 60000,
      isActive = 0,
    } = params
    const [res] = await db.execute(
      `INSERT INTO ai_model_configs (name, provider, base_url, api_key_encrypted, model_name, max_tokens, temperature, timeout_ms, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, provider, baseUrl, apiKeyEncrypted, modelName, maxTokens, temperature, timeoutMs, isActive]
    )
    return res.insertId
  },

  async updateById(id, params) {
    const fields = []
    const values = []
    for (const [k, v] of Object.entries(params)) {
      const col = String(k || '').trim()
      if (!ALLOWED_COLUMNS.has(col)) continue
      fields.push(`${col} = ?`)
      values.push(v)
    }
    if (!fields.length) return
    values.push(id)
    await db.execute(`UPDATE ai_model_configs SET ${fields.join(', ')} WHERE id = ?`, values)
  },

  async setActive(id) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('UPDATE ai_model_configs SET is_active = 0')
      await connection.execute('UPDATE ai_model_configs SET is_active = 1 WHERE id = ?', [id])
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  async deleteById(id) {
    await db.execute('DELETE FROM ai_model_configs WHERE id = ?', [id])
  },
}

module.exports = aiModelConfigDal
