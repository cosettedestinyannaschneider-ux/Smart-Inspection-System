const db = require('./db')

const sessionDal = {
  async create(id, userId, title = '新对话') {
    await db.execute(
      'INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)',
      [id, userId, title]
    )
    return id
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM sessions WHERE id = ?', [id])
    return rows[0]
  },

  async findByUserId(userId) {
    const [rows] = await db.execute(
      'SELECT * FROM sessions WHERE user_id = ? AND status = ? ORDER BY updated_at DESC',
      [userId, 'active']
    )
    return rows
  },

  async updateTitle(id, title) {
    await db.execute('UPDATE sessions SET title = ? WHERE id = ?', [title, id])
  },

  async archive(id) {
    await db.execute("UPDATE sessions SET status = 'archived' WHERE id = ?", [id])
  },

  async deleteById(id) {
    await db.execute('DELETE FROM sessions WHERE id = ?', [id])
  },
}

module.exports = sessionDal
