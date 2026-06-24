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
        'INSERT INTO hazard_images (user_id, file_path, original_name, file_size, enterprise_id, inspection_task_id) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, f.filePath, f.originalName || null, f.fileSize || null, f.enterpriseId || null, f.inspectionTaskId || null]
      )
      created.push({
        id: res.insertId,
        user_id: userId,
        file_path: f.filePath,
        original_name: f.originalName || null,
        file_size: f.fileSize || null,
        enterprise_id: f.enterpriseId || null,
        inspection_task_id: f.inspectionTaskId || null
      })
    }
    return created
  },

  async listByUserId(userId, filters = {}) {
    const params = [userId]
    let sql = "SELECT * FROM hazard_images WHERE user_id = ? AND status = 'active'"
    if (filters.inspectionTaskId) {
      sql += ' AND inspection_task_id = ?'
      params.push(filters.inspectionTaskId)
    }
    sql += ' ORDER BY created_at DESC'
    const [rows] = await db.execute(sql, params)
    return rows
  },

  /** 管理员或任务详情使用的任务图片列表 */
  async listByTaskId(inspectionTaskId) {
    const [rows] = await db.execute(
      "SELECT * FROM hazard_images WHERE inspection_task_id = ? AND status = 'active' ORDER BY created_at DESC",
      [inspectionTaskId]
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
  async findByIds(userId, ids, opts = {}) {
    const validIds = (ids || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
    if (!validIds.length) return []
    const placeholders = validIds.map(() => '?').join(',')
    const params = [...validIds]
    let sql = `SELECT * FROM hazard_images WHERE id IN (${placeholders}) AND status = 'active'`
    if (!opts.isAdmin) {
      sql += ' AND user_id = ?'
      params.push(userId)
    }
    const [rows] = await db.execute(sql, params)
    const orderMap = new Map(validIds.map((id, index) => [id, index]))
    return rows.sort((a, b) => (orderMap.get(Number(a.id)) ?? 0) - (orderMap.get(Number(b.id)) ?? 0))
  },

  async findByEnterpriseId(enterpriseId) {
    const [rows] = await db.execute(
      "SELECT * FROM hazard_images WHERE enterprise_id = ? AND status = 'active' ORDER BY created_at DESC",
      [enterpriseId]
    )
    return rows
  },

  /** 统计已上传但尚未被任何排查报告关联的待分析图片数量 */
  async countPendingAnalysis() {
    const [rows] = await db.execute(`
      SELECT COUNT(*) AS total
      FROM hazard_images hi
      WHERE hi.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM inspection_report_images iri
          WHERE iri.image_id = hi.id
        )
    `)
    return Number(rows[0]?.total || 0)
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
