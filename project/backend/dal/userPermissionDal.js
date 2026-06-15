const db = require('./db')

/** 将权限行转换为前端使用的权限对象 */
const toPermissionObject = (rows) => {
  const permissions = {}
  rows.forEach((row) => {
    permissions[row.permission_key] = true
  })
  return permissions
}

const userPermissionDal = {
  /** 查询全部用户权限，并按用户 ID 分组 */
  async findAllGrouped() {
    const [rows] = await db.execute(
      'SELECT user_id, permission_key FROM user_permissions ORDER BY user_id, permission_key'
    )
    return rows.reduce((grouped, row) => {
      grouped[row.user_id] = grouped[row.user_id] || {}
      grouped[row.user_id][row.permission_key] = true
      return grouped
    }, {})
  },

  /** 查询单个用户权限 */
  async findByUserId(userId, executor = db) {
    const [rows] = await executor.execute(
      'SELECT permission_key FROM user_permissions WHERE user_id = ? ORDER BY permission_key',
      [userId]
    )
    return toPermissionObject(rows)
  },

  /** 在同一事务中完整替换用户权限集合 */
  async replaceForUser(userId, permissionKeys, executor) {
    await executor.execute('DELETE FROM user_permissions WHERE user_id = ?', [userId])
    for (const permissionKey of permissionKeys) {
      await executor.execute(
        'INSERT INTO user_permissions (user_id, permission_key) VALUES (?, ?)',
        [userId, permissionKey]
      )
    }
  },
}

module.exports = userPermissionDal
