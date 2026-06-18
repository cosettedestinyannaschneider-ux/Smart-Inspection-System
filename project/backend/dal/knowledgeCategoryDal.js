const db = require('./db')

const knowledgeCategoryDal = {
  /** 查询全部知识分类 */
  async findAll() {
    const [rows] = await db.execute(
      `SELECT *
       FROM knowledge_categories
       WHERE name <> '安全生产隐患排查报告'
       ORDER BY sort ASC, id ASC`
    )
    return rows
  },

  /** 按 ID 查询知识分类 */
  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM knowledge_categories WHERE id = ? LIMIT 1', [id])
    return rows[0] || null
  },

  /** 按名称查询知识分类 */
  async findByName(name) {
    const [rows] = await db.execute('SELECT * FROM knowledge_categories WHERE name = ? LIMIT 1', [name])
    return rows[0] || null
  },

  /** 新增知识分类 */
  async create(name, sort = 0) {
    const [res] = await db.execute(
      'INSERT INTO knowledge_categories (name, sort) VALUES (?, ?)',
      [name, Number(sort) || 0]
    )
    return res.insertId
  },

  /** 删除知识分类 */
  async deleteById(id) {
    await db.execute('DELETE FROM knowledge_categories WHERE id = ?', [id])
  },

  /** 更新知识分类 */
  async updateById(id, name, sort = 0) {
    await db.execute(
      'UPDATE knowledge_categories SET name = ?, sort = ? WHERE id = ?',
      [name, Number(sort) || 0, id]
    )
  },
}

module.exports = knowledgeCategoryDal
