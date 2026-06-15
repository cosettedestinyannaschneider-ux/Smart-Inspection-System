const userService = require('../bll/userService')
const { ErrorCode } = require('../common/ErrorCode')
const C = require('../common/Constants')

/**
 * 管理员鉴权中间件
 * 统一校验请求中的管理员 ID、角色和账号状态。
 */
const adminAuth = async (req, res, next) => {
  const adminId = req.body?.admin_id || req.query?.admin_id || req.headers?.['x-admin-id']
  if (!adminId) return res.fail(ErrorCode.ADMIN_REQUIRED)
  try {
    const admin = await userService.getUserById(adminId)
    if (!admin || admin.role !== C.ROLE_ADMIN || admin.status !== C.STATUS_ACTIVE) {
      return res.fail(ErrorCode.ADMIN_REQUIRED)
    }
    req.admin = admin
    next()
  } catch (err) {
    console.error('[adminAuth] 管理员鉴权失败:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
}

module.exports = adminAuth
