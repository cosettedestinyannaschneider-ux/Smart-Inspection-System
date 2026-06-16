/**
 * 统一错误码体系。
 * 0 为成功，1xxx 为认证授权，2xxx 为参数校验，3xxx 为业务逻辑，
 * 4xxx 为资源不存在，5xxx 为服务端内部错误。
 */
const ErrorCode = {
  // 成功
  SUCCESS: 0,

  // ---- 认证/授权 1xxx ----
  UNAUTHORIZED: 1001,
  LOGIN_FAILED: 1002,
  ACCOUNT_LOCKED: 1003,
  ACCOUNT_DISABLED: 1004,
  PERMISSION_DENIED: 1005,
  ADMIN_REQUIRED: 1006,

  // ---- 参数校验 2xxx ----
  PARAM_MISSING: 2001,
  PARAM_INVALID: 2002,
  USERNAME_EXISTS: 2003,
  FILE_REQUIRED: 2004,
  FILE_FORMAT_INVALID: 2005,

  // ---- 业务逻辑 3xxx ----
  AI_SERVICE_ERROR: 3001,
  REPORT_GENERATE_FAILED: 3002,
  IMAGE_PROCESS_FAILED: 3003,
  SESSION_EXPIRED: 3004,
  AUTH_SESSION_REVOKED: 3005,

  // ---- 资源 4xxx ----
  NOT_FOUND: 4001,
  USER_NOT_FOUND: 4002,
  IMAGE_NOT_FOUND: 4003,
  RECORD_NOT_FOUND: 4004,

  // ---- 服务端 5xxx ----
  INTERNAL_ERROR: 5001,
  DATABASE_ERROR: 5002,
  FILE_SYSTEM_ERROR: 5003,
}

/** 错误码到用户可读提示的映射 */
const ErrorMessage = {
  [ErrorCode.SUCCESS]: 'ok',

  [ErrorCode.UNAUTHORIZED]: '未登录或登录已失效',
  [ErrorCode.LOGIN_FAILED]: '用户名或密码错误',
  [ErrorCode.ACCOUNT_LOCKED]: '账户已被锁定，请稍后再试',
  [ErrorCode.ACCOUNT_DISABLED]: '账户已被禁用',
  [ErrorCode.PERMISSION_DENIED]: '权限不足',
  [ErrorCode.ADMIN_REQUIRED]: '仅限管理员操作',

  [ErrorCode.PARAM_MISSING]: '缺少必要参数',
  [ErrorCode.PARAM_INVALID]: '参数格式不正确',
  [ErrorCode.USERNAME_EXISTS]: '用户名已存在',
  [ErrorCode.FILE_REQUIRED]: '请上传文件',
  [ErrorCode.FILE_FORMAT_INVALID]: '文件格式不支持',

  [ErrorCode.AI_SERVICE_ERROR]: 'AI 服务暂时不可用',
  [ErrorCode.REPORT_GENERATE_FAILED]: '报告生成失败',
  [ErrorCode.IMAGE_PROCESS_FAILED]: '图片处理失败',
  [ErrorCode.SESSION_EXPIRED]: '登录状态已过期',
  [ErrorCode.AUTH_SESSION_REVOKED]: '登录已退出或已被禁用',

  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.USER_NOT_FOUND]: '用户不存在',
  [ErrorCode.IMAGE_NOT_FOUND]: '未找到可用的隐患照片',
  [ErrorCode.RECORD_NOT_FOUND]: '记录不存在',

  [ErrorCode.INTERNAL_ERROR]: '服务器内部错误',
  [ErrorCode.DATABASE_ERROR]: '数据库操作失败',
  [ErrorCode.FILE_SYSTEM_ERROR]: '文件系统操作失败',
}

module.exports = { ErrorCode, ErrorMessage }
