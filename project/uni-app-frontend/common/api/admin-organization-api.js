import { apiUrl, unwrapResponse } from '../api-config'

/**
 * 创建用户与组织管理 API 客户端
 * @param {Function} getAdminId 获取当前管理员 ID
 */
export const createAdminOrganizationApi = (getAdminId) => {
  /** 调用管理员接口，并统一携带当前管理员 ID */
  const postAdmin = (path, payload = {}) => new Promise((resolve, reject) => {
    uni.request({
      url: apiUrl(path),
      method: 'POST',
      data: { admin_id: getAdminId(), ...payload },
      success: (response) => {
        const result = unwrapResponse(response)
        if (!result.ok) {
          reject(new Error(result.msg || '请求失败'))
          return
        }
        resolve(result.raw)
      },
      fail: () => reject(new Error('无法连接后端服务'))
    })
  })

  return { postAdmin }
}
