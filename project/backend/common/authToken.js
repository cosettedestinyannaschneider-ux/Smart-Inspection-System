const jwt = require('jsonwebtoken')
const C = require('./Constants')

/** 开发环境兜底密钥，仅用于未配置环境变量时避免本地完全无法启动 */
const DEFAULT_JWT_ACCESS_SECRET = 'dev-jwt-access-secret-change-me'

/** 读取 Access Token 密钥，生产或演示环境必须通过环境变量覆盖 */
const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || DEFAULT_JWT_ACCESS_SECRET

/** 读取 Access Token 过期时间配置 */
const getAccessExpiresIn = () => process.env.JWT_ACCESS_EXPIRES_IN || C.JWT_ACCESS_EXPIRES_IN_DEFAULT

/** 签发 Access Token */
const signAccessToken = (payload) => jwt.sign(payload, getAccessSecret(), {
  algorithm: 'HS256',
  expiresIn: getAccessExpiresIn(),
})

/** 校验 Access Token */
const verifyAccessToken = (token) => jwt.verify(token, getAccessSecret(), {
  algorithms: ['HS256'],
})

module.exports = {
  signAccessToken,
  verifyAccessToken,
  getAccessExpiresIn,
}
