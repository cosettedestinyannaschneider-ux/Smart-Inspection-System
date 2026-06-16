const { ErrorCode } = require('../common/ErrorCode')
const C = require('../common/Constants')

/** 按权限键校验当前登录用户 */
const requirePermission = (permissionKey) => (req, res, next) => {
  if (!req.auth?.user) return res.fail(ErrorCode.UNAUTHORIZED, '请先登录')
  if (req.auth.user.role === C.ROLE_ADMIN) return next()
  if (req.auth.permissions?.[permissionKey]) return next()
  return res.fail(ErrorCode.PERMISSION_DENIED, '当前账号没有此操作权限')
}

module.exports = requirePermission
