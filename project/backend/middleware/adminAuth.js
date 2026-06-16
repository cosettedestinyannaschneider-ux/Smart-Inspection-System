const requireAuth = require('./requireAuth')
const requireAdmin = require('./requireAdmin')

/**
 * 管理员鉴权中间件。
 * Phase 1 开始统一走 Bearer Token，会保留原模块名以减少路由侧改动。
 */
const adminAuth = async (req, res, next) => {
  return requireAuth(req, res, () => {
    req.admin = req.auth?.user || null
    requireAdmin(req, res, next)
  })
}

module.exports = adminAuth
