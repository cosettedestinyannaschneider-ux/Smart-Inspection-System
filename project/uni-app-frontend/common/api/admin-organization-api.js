import { apiUrl, request, unwrapResponse } from '../api-config'

/**
 * 创建用户与组织管理 API 客户端
 */
export const createAdminOrganizationApi = () => {
  /** 调用管理员接口，统一使用 Bearer Token 承载管理员身份 */
  const postAdmin = (path, payload = {}) => new Promise((resolve, reject) => {
    request({
      url: apiUrl(path),
      method: 'POST',
      data: payload,
    }).then((response) => {
      const result = unwrapResponse(response)
      if (!result.ok) {
        reject(new Error(result.msg || '请求失败'))
        return
      }
      resolve(result.raw)
    }).catch(() => reject(new Error('无法连接后端服务')))
  })

  return { postAdmin }
}
