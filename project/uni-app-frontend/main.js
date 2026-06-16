import { createSSRApp } from 'vue'
import App from './App.vue'
import { withAuthHeader } from './common/api-config'

/** 统一为请求类 API 注入 Bearer Token，减少页面侧重复改动。 */
const patchUniNetworkApis = () => {
  const rawRequest = uni.request
  const rawUploadFile = uni.uploadFile
  const rawDownloadFile = uni.downloadFile

  uni.request = (options = {}) => rawRequest({
    ...options,
    header: withAuthHeader(options.header || {}),
  })

  uni.uploadFile = (options = {}) => rawUploadFile({
    ...options,
    header: withAuthHeader(options.header || {}),
  })

  uni.downloadFile = (options = {}) => rawDownloadFile({
    ...options,
    header: withAuthHeader(options.header || {}),
  })
}

export function createApp() {
  patchUniNetworkApis()
  const app = createSSRApp(App)
  return {
    app
  }
}
