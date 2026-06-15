const db = require('./db')

const hazardImageDal = {
  /**
   * 批量创建隐患图片记录
   * @param {number} userId
   * @param {Array<{filePath: string, originalName?: string, fileSize?: number, enterpriseId?: number}>} files
   */
  async createMany(userId, files) {
    const created = []
    for (const f of files) {
      const [res] = await db.execute(
        'INSERT INTO hazard_images (user_id, file_path, original_name, file_size, enterprise_id) VALUES (?, ?, ?, ?, ?)',
        [userId, f.filePath, f.originalName || null, f.fileSize || null, f.enterpriseId || null]
      )
      created.push({
        id: res.insertId,
        user_id: userId,
        file_path: f.filePath,
        original_name: f.originalName || null,
        file_size: f.fileSize || null,
        enterprise_id: f.enterpriseId || null
      })
    }
    return created
  },

  async listByUserId(userId) {
    const [rows] = await db.execute(
      "SELECT * FROM hazard_images WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC",
      [userId]
    )
    return rows
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM hazard_images WHERE id = ?', [id])
    return rows[0]
  },

  /**
   * 批量查询用户的隐患图片（用于 9.6 多图隐患分析）
   */
  async findByIds(userId, ids) {
    const validIds = (ids || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
    if (!validIds.length) return []
    const placeholders = validIds.map(() => '?').join(',')
    const [rows] = await db.execute(
      `SELECT * FROM hazard_images WHERE user_id = ? AND id IN (${placeholders}) ORDER BY created_at DESC`,
      [userId, ...validIds]
    )
    return rows
  },

  async findByEnterpriseId(enterpriseId) {
    const [rows] = await db.execute(
      "SELECT * FROM hazard_images WHERE enterprise_id = ? AND status = 'active' ORDER BY created_at DESC",
      [enterpriseId]
    )
    return rows
  },

  /** 硬删除（保持旧接口兼容） */
  async deleteById(id) {
    return db.execute('DELETE FROM hazard_images WHERE id = ?', [id])
  },

  /** 软删除（设为 deleted 状态） */
  async softDeleteById(id) {
    return db.execute("UPDATE hazard_images SET status = 'deleted' WHERE id = ?", [id])
  },

  async updateLabel(userId, id, label) {
    return db.execute(
      'UPDATE hazard_images SET label = ? WHERE id = ? AND user_id = ?',
      [label, id, userId]
    )
  },

  async updateStatus(userId, id, status) {
    return db.execute(
      'UPDATE hazard_images SET status = ? WHERE id = ? AND user_id = ?',
      [status, id, userId]
    )
  },
}

module.exports = hazardImageDal
