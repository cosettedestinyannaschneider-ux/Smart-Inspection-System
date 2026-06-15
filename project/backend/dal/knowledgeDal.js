const db = require('./db')

const knowledgeDal = {
  /**
   * 创建知识条目
   * @param {string} title
   * @param {string} filePath
   * @param {string} description
   * @param {number|null} categoryId
   * @param {object} [opts]
   * @param {number} [opts.fileSize]
   * @param {string} [opts.fileType]
   */
  async create(title, filePath, description, categoryId = null, opts = {}) {
    const [res] = await db.execute(
      'INSERT INTO knowledge (title, file_path, description, category_id, file_size, file_type) VALUES (?, ?, ?, ?, ?, ?)',
      [title, filePath, description, categoryId ? Number(categoryId) : null, opts.fileSize || null, opts.fileType || null]
    )
    return res.insertId
  },

  async findAll() {
    const [rows] = await db.execute(`
      SELECT k.*, c.name AS category_name
      FROM knowledge k
      LEFT JOIN knowledge_categories c ON c.id = k.category_id
      WHERE k.status = 'active'
      ORDER BY k.updated_at DESC
    `)
    return rows
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM knowledge WHERE id = ?', [id])
    return rows[0]
  },

  async update(id, title, description, filePath = null, categoryId = null) {
    if (filePath) {
      await db.execute(
        `UPDATE knowledge
         SET title = ?, description = ?, file_path = ?, category_id = ?
         WHERE id = ?`,
        [title, description, filePath, categoryId ? Number(categoryId) : null, id]
      )
    } else {
      await db.execute(
        `UPDATE knowledge
         SET title = ?, description = ?, category_id = ?
         WHERE id = ?`,
        [title, description, categoryId ? Number(categoryId) : null, id]
      )
    }
  },

  /** 软删除（改为 archived 状态） */
  async delete(id) {
    await db.execute("UPDATE knowledge SET status = 'archived' WHERE id = ?", [id])
  },
}

module.exports = knowledgeDal
