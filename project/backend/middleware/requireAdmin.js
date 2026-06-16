const { ErrorCode } = require('../common/ErrorCode')
const C = require('../common/Constants')

/** 管理员角色校验中间件 */
const requireAdmin = (req, res, next) => {
  if (!req.auth?.user) return res.fail(ErrorCode.UNAUTHORIZED, '请先登录')
  if (req.auth.user.role !== C.ROLE_ADMIN) {
    return res.fail(ErrorCode.ADMIN_REQUIRED, '仅限管理员操作')
  }
  next()
}

module.exports = requireAdmin
