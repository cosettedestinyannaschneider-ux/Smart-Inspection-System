const crypto = require('crypto')
const authSessionDal = require('../dal/authSessionDal')
const userDal = require('../dal/userDal')
const userPermissionDal = require('../dal/userPermissionDal')
const {
  signAccessToken,
  verifyAccessToken,
  signFileAccessToken,
  verifyFileAccessToken,
} = require('../common/authToken')
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

/** 复用会话、账号状态与权限校验逻辑 */
const validateSessionUserContext = async (payload, { ipAddress = null, userAgent = null, touchSession = true } = {}) => {
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

  if (touchSession) {
    await authSessionDal.touchByJti(payload.jti, ipAddress, userAgent)
  }

  return {
    jti: payload.jti,
    userId: user.id,
    user: await buildAuthUser(user),
    permissions: await loadCurrentPermissions(user),
  }
}

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
      typ: 'access',
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

    if (payload?.typ && payload.typ !== 'access') {
      throw authError('登录信息无效，请重新登录', 'TOKEN_INVALID')
    }

    const context = await validateSessionUserContext(payload, {
      ipAddress,
      userAgent,
      touchSession: true,
    })
    return {
      ...context,
      token,
    }
  },

  /** 创建用于 H5 图片/下载链接的短时文件访问票据 */
  createFileAccessToken({ userId, jti, resourceType, resourceId, format = null }) {
    return signFileAccessToken({
      sub: String(userId),
      jti,
      typ: 'file',
      resource_type: resourceType,
      resource_id: String(resourceId),
      format: format || undefined,
    })
  },

  /** 校验文件访问票据并复用会话状态校验 */
  async authenticateFileAccessToken(token, expected = {}) {
    let payload
    try {
      payload = verifyFileAccessToken(token)
    } catch (error) {
      if (error?.name === 'TokenExpiredError') {
        throw authError('文件访问链接已过期，请刷新后重试', 'TOKEN_EXPIRED')
      }
      throw authError('文件访问链接无效，请刷新后重试', 'TOKEN_INVALID')
    }

    if (payload?.typ !== 'file') throw authError('文件访问链接无效，请刷新后重试', 'TOKEN_INVALID')
    if (expected.resourceType && payload.resource_type !== expected.resourceType) {
      throw authError('文件访问链接无效，请刷新后重试', 'TOKEN_INVALID')
    }
    if (expected.resourceId && String(payload.resource_id) !== String(expected.resourceId)) {
      throw authError('文件访问链接无效，请刷新后重试', 'TOKEN_INVALID')
    }
    if (expected.format && String(payload.format || '') !== String(expected.format)) {
      throw authError('文件访问链接无效，请刷新后重试', 'TOKEN_INVALID')
    }

    return {
      ...(await validateSessionUserContext(payload, { touchSession: false })),
      token,
      fileGrant: {
        resourceType: payload.resource_type,
        resourceId: payload.resource_id,
        format: payload.format || null,
      },
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
