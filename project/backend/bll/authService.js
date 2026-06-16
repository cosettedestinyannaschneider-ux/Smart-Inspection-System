const crypto = require('crypto')
const authSessionDal = require('../dal/authSessionDal')
const userDal = require('../dal/userDal')
const userPermissionDal = require('../dal/userPermissionDal')
const { signAccessToken, verifyAccessToken } = require('../common/authToken')
const C = require('../common/Constants')

/** 认证异常工厂 */
const authError = (message, code = 'UNAUTHORIZED') => {
  const error = new Error(message)
  error.authCode = code
  return error
}

/** 从 JWT 载荷中解析用户 ID */
const parseUserId = (payload) => {
  const userId = Number(payload?.sub)
  if (!Number.isFinite(userId) || userId <= 0) throw authError('登录信息无效', 'TOKEN_INVALID')
  return userId
}

/** 读取当前用户最新权限，保证权限变更能立即生效 */
const loadCurrentPermissions = async (user) => {
  if (user.role === C.ROLE_ADMIN) return {}
  return await userPermissionDal.findByUserId(user.id)
}

/** 构建认证返回给前端的用户对象 */
const buildAuthUser = async (user) => ({
  id: user.id,
  username: user.username,
  role: user.role,
  department_id: user.department_id,
  status: user.status,
  permissions: await loadCurrentPermissions(user),
})

const authService = {
  /** 创建新的登录认证会话并签发 Access Token */
  async createLoginSession({ userId, ipAddress = null, userAgent = null }) {
    const user = await userDal.findById(userId)
    if (!user || user.status !== C.STATUS_ACTIVE) {
      throw authError('账号状态异常，请重新登录', 'ACCOUNT_INVALID')
    }

    const jti = crypto.randomUUID()
    const accessToken = signAccessToken({
      sub: String(user.id),
      role: user.role,
      jti,
    })
    const decoded = verifyAccessToken(accessToken)
    const expiresAt = new Date(Number(decoded.exp) * 1000)

    await authSessionDal.create({
      jti,
      userId: user.id,
      roleSnapshot: user.role,
      expiresAt,
      lastSeenAt: new Date(),
      lastIp: ipAddress,
      userAgent,
    })

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_at: expiresAt.toISOString(),
      user: await buildAuthUser(user),
    }
  },

  /** 校验请求中的 Bearer Token 并返回最新用户态 */
  async authenticateAccessToken(token, { ipAddress = null, userAgent = null } = {}) {
    let payload
    try {
      payload = verifyAccessToken(token)
    } catch (error) {
      if (error?.name === 'TokenExpiredError') {
        throw authError('登录状态已过期，请重新登录', 'TOKEN_EXPIRED')
      }
      throw authError('登录信息无效，请重新登录', 'TOKEN_INVALID')
    }

    if (!payload?.jti) throw authError('登录信息无效，请重新登录', 'TOKEN_INVALID')

    const session = await authSessionDal.findByJti(payload.jti)
    if (!session) throw authError('登录会话不存在，请重新登录', 'SESSION_NOT_FOUND')
    if (session.status === 'revoked') throw authError('当前登录已退出，请重新登录', 'SESSION_REVOKED')
    if (session.status === 'expired') throw authError('登录状态已过期，请重新登录', 'TOKEN_EXPIRED')

    const now = new Date()
    if (session.expires_at && new Date(session.expires_at) <= now) {
      await authSessionDal.markExpiredByJti(payload.jti)
      throw authError('登录状态已过期，请重新登录', 'TOKEN_EXPIRED')
    }

    const userId = parseUserId(payload)
    const user = await userDal.findById(userId)
    if (!user) {
      await authSessionDal.revokeByJti(payload.jti)
      throw authError('用户不存在，请重新登录', 'USER_NOT_FOUND')
    }
    if (user.status !== C.STATUS_ACTIVE) {
      await authSessionDal.revokeActiveByUserId(user.id)
      throw authError('账号已停用，请联系管理员', 'ACCOUNT_DISABLED')
    }

    await authSessionDal.touchByJti(payload.jti, ipAddress, userAgent)

    return {
      jti: payload.jti,
      userId: user.id,
      token,
      user: await buildAuthUser(user),
      permissions: await loadCurrentPermissions(user),
    }
  },

  /** 获取当前登录用户信息 */
  async getCurrentAuthUser(userId) {
    const user = await userDal.findById(userId)
    if (!user || user.status !== C.STATUS_ACTIVE) return null
    return await buildAuthUser(user)
  },

  /** 注销当前登录会话 */
  async logoutByJti(jti) {
    if (!jti) return
    await authSessionDal.revokeByJti(jti)
  },
}

module.exports = authService
