const STORAGE_HOST_KEY = 'apiHost'
const STORAGE_PORT_KEY = 'apiPort'

const DEFAULT_HOST = '192.168.1.66'
const DEFAULT_PORT = 3000

/**
 * 获取服务端连接配置（用于小程序/APP 直连后端）
 * H5 环境下仍建议通过 Vite/Nginx 代理访问 `/api`，避免跨域问题。
 */
export const getServerConfig = () => {
  const host = uni.getStorageSync(STORAGE_HOST_KEY) || DEFAULT_HOST
  const rawPort = uni.getStorageSync(STORAGE_PORT_KEY)
  const port = Number(rawPort || DEFAULT_PORT) || DEFAULT_PORT
  return { host, port }
}

/**
 * 保存服务端连接配置
 * @param {{ host: string, port: number|string }} param0 host 支持域名或 IP
 */
export const setServerConfig = ({ host, port }) => {
  const nextHost = String(host || '').trim()
  const nextPort = Number(port || DEFAULT_PORT) || DEFAULT_PORT
  if (nextHost) uni.setStorageSync(STORAGE_HOST_KEY, nextHost)
  uni.setStorageSync(STORAGE_PORT_KEY, String(nextPort))
}

/**
 * 构建后端 Origin（例如：http://192.168.1.10:3000）
 */
export const buildOrigin = () => {
  const { host, port } = getServerConfig()
  return `http://${host}:${port}`
}

/**
 * 构建 API 请求地址
 * - H5：返回相对路径，交由代理处理（例如：/api/login）
 * - 非 H5：返回完整 URL（例如：http://host:3000/api/login）
 */
export const apiUrl = (path) => {
  const p = path?.startsWith('/') ? path : `/${path || ''}`
  // #ifdef H5
  return p
  // #endif
  // #ifndef H5
  return `${buildOrigin()}${p}`
  // #endif
}

/**
 * 构建静态资源地址（例如上传的文件 /uploads/...）
 */
export const assetUrl = (path) => {
  const p = path?.startsWith('/') ? path : `/${path || ''}`
  // #ifdef H5
  return p
  // #endif
  // #ifndef H5
  return `${buildOrigin()}${p}`
  // #endif
}

/**
 * 归一化后端返回的 user 对象字段
 * @param {any} rawUser 允许多种字段命名（id/user_id/userId/admin_id）
 */
export const normalizeUser = (rawUser) => {
  if (!rawUser || typeof rawUser !== 'object') return null
  const id = rawUser.id ?? rawUser.user_id ?? rawUser.userId ?? rawUser.admin_id
  const role = typeof rawUser.role === 'string' ? rawUser.role.toLowerCase() : rawUser.role
  return { ...rawUser, id, role }
}

/**
 * 兼容不同后端返回格式：{success,message,data} 或 {code,msg,data}
 */
export const unwrapResponse = (res) => {
  const data = res?.data ?? res
  if (data && typeof data === 'object') {
    if (Object.prototype.hasOwnProperty.call(data, 'success')) {
      // 兼容 Result.js 平铺格式：仅当存在 role 字段时才视为用户身份数据
      const user = data.user || (data.id && data.role ? { id: data.id, username: data.username, role: data.role, department_id: data.department_id } : null)
      return { ok: !!data.success, msg: data.msg || data.message, data: data.data, user, raw: data }
    }
    if (Object.prototype.hasOwnProperty.call(data, 'code')) {
      const ok = data.code === 0 || data.code === 200
      // 同样兼容平铺格式，避免将企业/部门 id 误判为 user
      const user = data.user || (data.data?.user) || (data.id && data.role && !data.data ? { id: data.id, username: data.username, role: data.role } : null)
      return { ok, msg: data.msg, data: data.data, user, raw: data }
    }
  }
  return { ok: false, msg: '响应格式异常', data: null, user: null, raw: data }
}
