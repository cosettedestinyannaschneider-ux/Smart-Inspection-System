const db = require('./db')

const authSessionDal = {
  /** 创建认证会话 */
  async create(session, executor = db) {
    const [result] = await executor.execute(
      `INSERT INTO auth_sessions
       (jti, user_id, role_snapshot, status, expires_at, revoked_at, last_seen_at, last_ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.jti,
        session.userId,
        session.roleSnapshot,
        session.status || 'active',
        session.expiresAt,
        session.revokedAt || null,
        session.lastSeenAt || null,
        session.lastIp || null,
        session.userAgent || null,
      ]
    )
    return result.insertId
  },

  /** 按 JTI 查询认证会话 */
  async findByJti(jti) {
    const [rows] = await db.execute(
      'SELECT * FROM auth_sessions WHERE jti = ? LIMIT 1',
      [jti]
    )
    return rows[0] || null
  },

  /** 更新认证会话最近活动信息 */
  async touchByJti(jti, lastIp = null, userAgent = null, executor = db) {
    await executor.execute(
      `UPDATE auth_sessions
       SET last_seen_at = NOW(), last_ip = ?, user_agent = ?
       WHERE jti = ?`,
      [lastIp, userAgent, jti]
    )
  },

  /** 撤销单个认证会话 */
  async revokeByJti(jti, executor = db) {
    await executor.execute(
      `UPDATE auth_sessions
       SET status = 'revoked', revoked_at = NOW()
       WHERE jti = ? AND status = 'active'`,
      [jti]
    )
  },

  /** 批量撤销指定用户的全部活动认证会话 */
  async revokeActiveByUserId(userId, executor = db) {
    await executor.execute(
      `UPDATE auth_sessions
       SET status = 'revoked', revoked_at = NOW()
       WHERE user_id = ? AND status = 'active'`,
      [userId]
    )
  },

  /** 将已超时的认证会话标记为 expired */
  async markExpiredByJti(jti, executor = db) {
    await executor.execute(
      `UPDATE auth_sessions
       SET status = 'expired'
       WHERE jti = ? AND status = 'active'`,
      [jti]
    )
  },
}

module.exports = authSessionDal
