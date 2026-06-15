const db = require('./db')

const departmentDal = {
  /**
   * 查询部门，可按企业筛选
   * @param {number|null} enterpriseId 企业 ID
   */
  async findAll(enterpriseId = null) {
    const params = []
    let sql = 'SELECT * FROM departments'
    if (enterpriseId) {
      sql += ' WHERE enterprise_id = ?'
      params.push(enterpriseId)
    }
    sql += ' ORDER BY enterprise_id ASC, id ASC'
    const [rows] = await db.execute(sql, params)
    return rows
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM departments WHERE id = ?', [id])
    return rows[0]
  },

  /** 查询同一企业内的同名部门 */
  async findByEnterpriseAndName(enterpriseId, name) {
    const [rows] = await db.execute(
      'SELECT * FROM departments WHERE enterprise_id = ? AND name = ? LIMIT 1',
      [enterpriseId, name]
    )
    return rows[0]
  },

  async create(enterpriseId, name) {
    const [res] = await db.execute(
      'INSERT INTO departments (enterprise_id, name) VALUES (?, ?)',
      [enterpriseId, name]
    )
    return res.insertId
  },

  async updateById(id, enterpriseId, name) {
    await db.execute(
      'UPDATE departments SET enterprise_id = ?, name = ? WHERE id = ?',
      [enterpriseId, name, id]
    )
  },

  /** 统计部门已分配用户数，可按账号状态筛选 */
  async countUsers(id, statuses = null, executor = db) {
    const params = [id]
    let sql = 'SELECT COUNT(*) AS count FROM users WHERE department_id = ?'
    if (Array.isArray(statuses) && statuses.length) {
      sql += ` AND status IN (${statuses.map(() => '?').join(', ')})`
      params.push(...statuses)
    }
    const [rows] = await executor.execute(
      sql,
      params
    )
    return Number(rows[0]?.count || 0)
  },

  /** 查询部门下指定状态用户 ID，用于组织删除审计 */
  async findUserIdsByStatuses(id, statuses, executor = db) {
    const placeholders = statuses.map(() => '?').join(', ')
    const [rows] = await executor.execute(
      `SELECT id FROM users WHERE department_id = ? AND status IN (${placeholders}) ORDER BY id`,
      [id, ...statuses]
    )
    return rows.map((row) => Number(row.id))
  },

  /** 解除部门下指定状态用户的组织关联 */
  async detachUsersByStatuses(id, statuses, executor = db) {
    const placeholders = statuses.map(() => '?').join(', ')
    const [result] = await executor.execute(
      `UPDATE users SET department_id = NULL WHERE department_id = ? AND status IN (${placeholders})`,
      [id, ...statuses]
    )
    return result.affectedRows
  },

  async deleteById(id, executor = db) {
    await executor.execute('DELETE FROM departments WHERE id = ?', [id])
  },
}

module.exports = departmentDal
