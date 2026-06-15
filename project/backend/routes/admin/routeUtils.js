const { ErrorCode } = require('../../common/ErrorCode')

/** 将业务校验异常转换为统一接口错误响应 */
const respondServiceError = (res, err) => {
  console.error('[AdminRoute] 管理员业务请求失败:', err)
  if (err?.isBusinessError) return res.fail(ErrorCode.PARAM_INVALID, err.message)
  if (err?.code === 'ER_DUP_ENTRY') return res.fail(ErrorCode.PARAM_INVALID, '名称或账号已存在')
  return res.fail(ErrorCode.INTERNAL_ERROR, err?.message)
}

module.exports = { respondServiceError }
