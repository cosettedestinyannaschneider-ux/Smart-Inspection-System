const STORAGE_HOST_KEY = 'apiHost'
const STORAGE_PORT_KEY = 'apiPort'
const STORAGE_USER_KEY = 'user'
const STORAGE_ACCESS_TOKEN_KEY = 'accessToken'
const STORAGE_TOKEN_EXPIRES_AT_KEY = 'accessTokenExpiresAt'

const DEFAULT_HOST = '192.168.1.66'
const DEFAULT_PORT = 3000

/** 获取服务端连接配置 */
export const getServerConfig = () => {
  const host = uni.getStorageSync(STORAGE_HOST_KEY) || DEFAULT_HOST
  const rawPort = uni.getStorageSync(STORAGE_PORT_KEY)
  const port = Number(rawPort || DEFAULT_PORT) || DEFAULT_PORT
  return { host, port }
}

/** 保存服务端连接配置 */
export const setServerConfig = ({ host, port }) => {
  const nextHost = String(host || '').trim()
  const nextPort = Number(port || DEFAULT_PORT) || DEFAULT_PORT
  if (nextHost) uni.setStorageSync(STORAGE_HOST_KEY, nextHost)
  uni.setStorageSync(STORAGE_PORT_KEY, String(nextPort))
}

/** 构建后端 Origin */
export const buildOrigin = () => {
  const { host, port } = getServerConfig()
  return `http://${host}:${port}`
}

/** 构建 API 地址 */
export const apiUrl = (path) => {
  const p = path?.startsWith('/') ? path : `/${path || ''}`
  // #ifdef H5
  return p
  // #endif
  // #ifndef H5
  return `${buildOrigin()}${p}`
  // #endif
}

/** 构建静态资源地址 */
export const assetUrl = (path) => {
  const p = path?.startsWith('/') ? path : `/${path || ''}`
  // #ifdef H5
  return p
  // #endif
  // #ifndef H5
  return `${buildOrigin()}${p}`
  // #endif
}

/** 归一化后端返回的用户对象 */
export const normalizeUser = (rawUser) => {
  if (!rawUser || typeof rawUser !== 'object') return null
  const id = rawUser.id ?? rawUser.user_id ?? rawUser.userId ?? rawUser.admin_id
  const role = typeof rawUser.role === 'string' ? rawUser.role.toLowerCase() : rawUser.role
  const permissions = rawUser.permissions && typeof rawUser.permissions === 'object' ? rawUser.permissions : {}
  return { ...rawUser, id, role, permissions }
}

/** 兼容不同后端响应格式 */
export const unwrapResponse = (res) => {
  const data = res?.data ?? res
  if (data && typeof data === 'object') {
    if (Object.prototype.hasOwnProperty.call(data, 'success')) {
      const user = data.user || (data.id && data.role ? { id: data.id, username: data.username, role: data.role, department_id: data.department_id } : null)
      return { ok: !!data.success, msg: data.msg || data.message, data: data.data, user, raw: data, code: data.code }
    }
    if (Object.prototype.hasOwnProperty.call(data, 'code')) {
      const ok = data.code === 0 || data.code === 200
      const user = data.user || data.data?.user || (data.id && data.role && !data.data ? { id: data.id, username: data.username, role: data.role } : null)
      return { ok, msg: data.msg, data: data.data, user, raw: data, code: data.code }
    }
  }
  return { ok: false, msg: '响应格式异常', data: null, user: null, raw: data, code: null }
}

/** 获取当前登录用户 */
export const getStoredUser = () => normalizeUser(uni.getStorageSync(STORAGE_USER_KEY))

/** 获取当前 Access Token */
export const getAccessToken = () => String(uni.getStorageSync(STORAGE_ACCESS_TOKEN_KEY) || '').trim()

/** 获取 Token 过期时间 */
export const getAccessTokenExpiresAt = () => String(uni.getStorageSync(STORAGE_TOKEN_EXPIRES_AT_KEY) || '').trim()

/** 判断是否已登录 */
export const hasLoginSession = () => !!getStoredUser()?.id && !!getAccessToken()

/** 保存登录信息 */
export const storeLoginSession = ({ user, accessToken, expiresAt }) => {
  const nextUser = normalizeUser(user)
  if (nextUser) uni.setStorageSync(STORAGE_USER_KEY, nextUser)
  if (accessToken) uni.setStorageSync(STORAGE_ACCESS_TOKEN_KEY, accessToken)
  if (expiresAt) uni.setStorageSync(STORAGE_TOKEN_EXPIRES_AT_KEY, expiresAt)
}

/** 清理登录信息 */
export const clearLoginSession = () => {
  uni.removeStorageSync(STORAGE_USER_KEY)
  uni.removeStorageSync(STORAGE_ACCESS_TOKEN_KEY)
  uni.removeStorageSync(STORAGE_TOKEN_EXPIRES_AT_KEY)
}

/** 注入 Authorization 头 */
export const withAuthHeader = (headers = {}) => {
  const token = getAccessToken()
  if (!token) return { ...headers }
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  }
}

/** 统一处理认证失败 */
export const handleAuthFailure = (message = '登录状态已失效，请重新登录') => {
  clearLoginSession()
  uni.showToast({ title: message, icon: 'none' })
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/login/login' })
  }, 400)
}

/** 统一封装 uni.request */
export const request = (options = {}) => new Promise((resolve, reject) => {
  uni.request({
    ...options,
    header: withAuthHeader(options.header || {}),
    success: (response) => {
      const result = unwrapResponse(response)
      if (result.code === 1001 || result.code === 3004 || result.code === 3005) {
        handleAuthFailure(result.msg || '登录状态已失效，请重新登录')
      }
      resolve(response)
    },
    fail: reject,
  })
})

/** 统一封装 uni.uploadFile */
export const uploadFile = (options = {}) => {
  return uni.uploadFile({
    ...options,
    header: withAuthHeader(options.header || {}),
  })
}

/** 统一封装 uni.downloadFile */
export const downloadFile = (options = {}) => {
  return uni.downloadFile({
    ...options,
    header: withAuthHeader(options.header || {}),
  })
}
