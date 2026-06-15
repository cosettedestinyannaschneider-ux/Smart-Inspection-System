/**
 * 统一响应格式工具
 * 格式：{ code, msg, success, ...业务字段 }
 * 业务字段平铺在顶层以保证前端兼容性（旧代码直接取 data.result 等字段）
 *
 * @created 2026-05-18
 */
const { ErrorCode } = require('./ErrorCode')

/**
 * 成功响应
 * @param {*}    data — 业务数据（对象则平铺到顶层，非对象则放在 data 字段）
 * @param {string} [msg] — 可选消息
 * @returns {{ code: 0, msg: string, success: true }}
 */
const success = (data, msg = 'ok') => {
  const base = { code: ErrorCode.SUCCESS, msg, success: true }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return { ...base, ...data }
  }
  return { ...base, data }
}

/**
 * 失败响应
 * @param {number} code    — 错误码
 * @param {string} [msg]   — 错误消息
 * @param {*}      [data]  — 可选附带数据
 * @returns {{ code: number, msg: string, success: false, data?: * }}
 */
const fail = (code, msg, data = null) => ({
  code,
  msg: msg || '服务器错误',
  success: false,
  data,
})

/**
 * Express 中间件：挂载 res.success / res.fail
 */
const responseMiddleware = (req, res, next) => {
  res.success = (data, msg) => res.json(success(data, msg))
  res.fail = (code, msg, data) => res.json(fail(code, msg, data))
  next()
}

module.exports = { success, fail, responseMiddleware }
