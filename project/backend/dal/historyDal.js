const db = require('./db')

const historyDal = {
  /**
   * 创建排查报告记录
   * @param {number} userId
   * @param {string} prompt
   * @param {string} result
   * @param {string|null} wordPath
   * @param {string|null} pdfPath
   * @param {string|null} imagePath  兼容旧单图字段
   * @param {string|null} sessionId
   * @param {object}  [opts]         扩展参数
   * @param {number}  [opts.enterpriseId]
   * @param {string}  [opts.title]
   */
  async createHistory(userId, prompt, result, wordPath, pdfPath, imagePath = null, sessionId = null, opts = {}) {
    const [res] = await db.execute(
      `INSERT INTO inspection_reports
       (user_id, prompt, result, word_path, pdf_path, image_path, session_id, enterprise_id, title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, prompt, result, wordPath, pdfPath, imagePath, sessionId,
       opts.enterpriseId || null, opts.title || null]
    )
    return res.insertId
  },

  async findByUserId(userId) {
    const [rows] = await db.execute(
      'SELECT * FROM inspection_reports WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    )
    return rows
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM inspection_reports WHERE id = ?', [id])
    return rows[0]
  },

  async findSessionsByUserId(userId) {
    const [rows] = await db.execute(`
      SELECT
        s.id AS session_id,
        COALESCE(NULLIF(MAX(ir.prompt), ''), NULLIF(MAX(s.title), ''), '新对话') AS title,
        MAX(ir.created_at) AS created_at
      FROM sessions s
      LEFT JOIN inspection_reports ir ON ir.session_id = s.id AND ir.user_id = s.user_id
      WHERE s.user_id = ? AND s.status = 'active'
      GROUP BY s.id
      ORDER BY created_at DESC, s.updated_at DESC
    `, [userId])
    return rows
  },

  async findBySessionId(sessionId) {
    const [rows] = await db.execute(
      'SELECT * FROM inspection_reports WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    )
    return rows
  },

  async findBySessionIdForUser(sessionId, userId) {
    const [rows] = await db.execute(
      'SELECT * FROM inspection_reports WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC',
      [sessionId, userId]
    )
    return rows
  },

  async updateResult(id, result, wordPath = null, pdfPath = null) {
    return await db.execute(
      'UPDATE inspection_reports SET result = ?, word_path = ?, pdf_path = ? WHERE id = ?',
      [result, wordPath, pdfPath, id]
    )
  },

  async deleteById(userId, id) {
    return await db.execute(
      'DELETE FROM inspection_reports WHERE id = ? AND user_id = ?',
      [id, userId]
    )
  },

  async deleteBySessionId(sessionId) {
    return await db.execute(
      'DELETE FROM inspection_reports WHERE session_id = ?',
      [sessionId]
    )
  },

  async deleteBySessionIdForUser(sessionId, userId) {
    return await db.execute(
      'DELETE FROM inspection_reports WHERE session_id = ? AND user_id = ?',
      [sessionId, userId]
    )
  },

  async findAll() {
    const [rows] = await db.execute(`
      SELECT h.*, u.username
      FROM inspection_reports h
      JOIN users u ON h.user_id = u.id
      ORDER BY h.created_at DESC
    `)
    return rows
  },
}

module.exports = historyDal
