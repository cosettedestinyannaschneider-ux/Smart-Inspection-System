const db = require('./db')

const knowledgeCategoryDal = {
  async findAll() {
    const [rows] = await db.execute('SELECT * FROM knowledge_categories ORDER BY sort ASC, id ASC')
    return rows
  },

  async create(name, sort = 0) {
    const [res] = await db.execute(
      'INSERT INTO knowledge_categories (name, sort) VALUES (?, ?)',
      [name, Number(sort) || 0]
    )
    return res.insertId
  },

  async deleteById(id) {
    await db.execute('DELETE FROM knowledge_categories WHERE id = ?', [id])
  },

  async updateById(id, name, sort = 0) {
    await db.execute(
      'UPDATE knowledge_categories SET name = ?, sort = ? WHERE id = ?',
      [name, Number(sort) || 0, id]
    )
  },
}

module.exports = knowledgeCategoryDal
