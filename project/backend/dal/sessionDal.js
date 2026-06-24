const db = require('./db')

const sessionDal = {
  async create(id, userId, title = '新对话', inspectionTaskId = null) {
    await db.execute(
      'INSERT INTO sessions (id, user_id, title, inspection_task_id) VALUES (?, ?, ?, ?)',
      [id, userId, title, inspectionTaskId || null]
    )
    return id
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM sessions WHERE id = ?', [id])
    return rows[0]
  },

  async findByUserId(userId, filters = {}) {
    const params = [userId, 'active']
    let sql = 'SELECT * FROM sessions WHERE user_id = ? AND status = ?'
    if (filters.inspectionTaskId) {
      sql += ' AND inspection_task_id = ?'
      params.push(filters.inspectionTaskId)
    }
    sql += ' ORDER BY updated_at DESC'
    const [rows] = await db.execute(sql, params)
    return rows
  },

  async updateTitle(id, title) {
    await db.execute('UPDATE sessions SET title = ? WHERE id = ?', [title, id])
  },

  async bindTask(id, inspectionTaskId) {
    await db.execute('UPDATE sessions SET inspection_task_id = ? WHERE id = ?', [inspectionTaskId || null, id])
  },

  async archive(id) {
    await db.execute("UPDATE sessions SET status = 'archived' WHERE id = ?", [id])
  },

  async deleteById(id) {
    await db.execute('DELETE FROM sessions WHERE id = ?', [id])
  },
}

module.exports = sessionDal
