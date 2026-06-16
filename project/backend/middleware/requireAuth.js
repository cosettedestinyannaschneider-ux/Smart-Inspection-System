const authService = require('../bll/authService')
const { ErrorCode } = require('../common/ErrorCode')

/** 提取客户端真实 IP */
const getRequestIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || req.ip || req.socket?.remoteAddress || null
}

/** Bearer Token 鉴权中间件 */
const requireAuth = async (req, res, next) => {
  const authorization = String(req.headers.authorization || '').trim()
  if (!authorization.startsWith('Bearer ')) {
    return res.fail(ErrorCode.UNAUTHORIZED, '请先登录')
  }

  const token = authorization.slice('Bearer '.length).trim()
  if (!token) return res.fail(ErrorCode.UNAUTHORIZED, '请先登录')

  try {
    req.auth = await authService.authenticateAccessToken(token, {
      ipAddress: getRequestIp(req),
      userAgent: req.headers['user-agent'] || null,
    })
    next()
  } catch (error) {
    const code = error.authCode === 'TOKEN_EXPIRED' ? ErrorCode.SESSION_EXPIRED : ErrorCode.UNAUTHORIZED
    res.fail(code, error.message || '登录校验失败')
  }
}

module.exports = requireAuth
