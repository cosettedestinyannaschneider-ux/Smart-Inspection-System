const db = require('./db')

/**
 * 企业-检查员分配数据访问层。
 * 用于限制检查员只能选择管理员分配给自己的客户企业。
 */
const enterpriseAssignmentDal = {
  /** 查询检查员可访问的正常企业 */
  async listAssignedEnterprises(inspectorId, keyword = '', limit = 100) {
    const kw = `%${String(keyword || '').trim()}%`
    const safeLimit = Math.min(Math.max(Number(limit || 100), 1), 200)
    const [rows] = await db.execute(
      `SELECT DISTINCT
         e.id, e.name, e.region, e.address, e.contact, e.phone,
         e.industry, e.enterprise_type, e.scale, e.production_process,
         e.inspector_name, e.inspection_date, e.project_name,
         e.inspection_status, e.status, e.updated_at
       FROM enterprise_inspector_assignments a
       INNER JOIN enterprises e ON e.id = a.enterprise_id
       WHERE a.inspector_id = ?
         AND a.status = 'active'
         AND e.status = 'active'
         AND (? = '%%' OR e.name LIKE ? OR e.region LIKE ? OR e.address LIKE ? OR e.contact LIKE ? OR e.industry LIKE ?)
       ORDER BY e.updated_at DESC, e.id DESC
       LIMIT ${safeLimit}`,
      [inspectorId, kw, kw, kw, kw, kw, kw]
    )
    return rows
  },

  /** 判断检查员是否有权访问指定企业 */
  async canAccessEnterprise(inspectorId, enterpriseId) {
    const [rows] = await db.execute(
      `SELECT a.id
       FROM enterprise_inspector_assignments a
       INNER JOIN enterprises e ON e.id = a.enterprise_id
       WHERE a.inspector_id = ?
         AND a.enterprise_id = ?
         AND a.status = 'active'
         AND e.status = 'active'
       LIMIT 1`,
      [inspectorId, enterpriseId]
    )
    return rows.length > 0
  },


  /** 查询某个检查员已分配的客户企业，用于管理员用户列表展示负责范围 */
  async listByInspectorId(inspectorId) {
    const [rows] = await db.execute(
      `SELECT a.enterprise_id, a.status, e.name, e.industry, e.region
       FROM enterprise_inspector_assignments a
       INNER JOIN enterprises e ON e.id = a.enterprise_id
       WHERE a.inspector_id = ? AND a.status = 'active'
       ORDER BY e.name ASC`,
      [inspectorId]
    )
    return rows
  },
  /** 查询企业已分配检查员 */
  async listByEnterpriseId(enterpriseId) {
    const [rows] = await db.execute(
      `SELECT a.*, u.username, u.status AS user_status
       FROM enterprise_inspector_assignments a
       INNER JOIN users u ON u.id = a.inspector_id
       WHERE a.enterprise_id = ?
       ORDER BY a.status ASC, u.username ASC`,
      [enterpriseId]
    )
    return rows
  },

  /** 覆盖保存企业的检查员分配关系 */
  async saveForEnterprise(enterpriseId, inspectorIds = [], adminId = null) {
    const ids = [...new Set((inspectorIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      await conn.execute(
        "UPDATE enterprise_inspector_assignments SET status = 'archived' WHERE enterprise_id = ?",
        [enterpriseId]
      )
      for (const inspectorId of ids) {
        await conn.execute(
          `INSERT INTO enterprise_inspector_assignments (enterprise_id, inspector_id, status, assigned_by)
           VALUES (?, ?, 'active', ?)
           ON DUPLICATE KEY UPDATE status = 'active', assigned_by = VALUES(assigned_by), updated_at = CURRENT_TIMESTAMP`,
          [enterpriseId, inspectorId, adminId || null]
        )
      }
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
    return this.listByEnterpriseId(enterpriseId)
  },
}

module.exports = enterpriseAssignmentDal
