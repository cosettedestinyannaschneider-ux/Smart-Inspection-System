const db = require('./db')

const logDal = {
  async logAction(userId, action, details, ipAddress = null, executor = db) {
    const [res] = await executor.execute(
      'INSERT INTO action_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId, action, JSON.stringify(details), ipAddress]
    )
    return res.insertId
  },

  async findAll() {
    const [rows] = await db.execute(`
      SELECT l.*, u.username
      FROM action_logs l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.created_at DESC
      LIMIT 500
    `)
    return rows
  },

  async findByUserId(userId) {
    const [rows] = await db.execute(`
      SELECT l.*, u.username
      FROM action_logs l
      JOIN users u ON l.user_id = u.id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
    `, [userId])
    return rows
  },
}

module.exports = logDal
