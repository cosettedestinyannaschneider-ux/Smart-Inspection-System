<template>
  <view class="container">
    <view class="card">
      <text class="section-title">服务器设置</text>

      <view class="form-item">
        <text class="label">服务器地址</text>
        <input class="input" v-model="host" placeholder="例如：192.168.1.10 或 api.example.com" />
      </view>

      <view class="form-item">
        <text class="label">端口</text>
        <input class="input" v-model="port" type="number" placeholder="3000" />
      </view>

      <view class="btn-row">
        <button class="btn secondary" @click="testConnection" :loading="testing">测试连接</button>
        <button class="btn primary" @click="saveConfig">保存</button>
      </view>

      <view class="hint">
        <text class="hint-text">
          小程序真机环境需要配置 HTTPS 合法域名；开发联调可使用局域网 IP。
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiUrl, getServerConfig, setServerConfig } from '../../common/api-config'

const host = ref('')
const port = ref('3000')
const testing = ref(false)

onMounted(() => {
  const cfg = getServerConfig()
  host.value = cfg.host
  port.value = String(cfg.port || 3000)
})

/**
 * 保存服务器配置到本地缓存
 * 用于小程序/APP 环境直连后端服务
 */
const saveConfig = () => {
  const nextHost = String(host.value || '').trim()
  const nextPort = Number(port.value || 3000) || 3000
  if (!nextHost) return uni.showToast({ title: '请输入服务器地址', icon: 'none' })
  setServerConfig({ host: nextHost, port: nextPort })
  uni.showToast({ title: '已保存', icon: 'success' })
}

/**
 * 测试与后端的连通性
 * 通过调用 /api/health 判断服务是否可用
 */
const testConnection = () => {
  testing.value = true
  uni.request({
    url: apiUrl('/api/health'),
    method: 'GET',
    success: (res) => {
      if (res?.data?.success) {
        uni.showToast({ title: '连接正常', icon: 'success' })
      } else {
        uni.showToast({ title: '服务未响应', icon: 'none' })
      }
    },
    fail: () => {
      uni.showToast({ title: '连接失败，请检查地址/域名配置', icon: 'none' })
    },
    complete: () => {
      testing.value = false
    }
  })
}
</script>

<style scoped>
.form-item {
  margin-top: 16px;
}
.label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.input {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  background-color: #f8f9fa;
  border: 1px solid #eee;
  box-sizing: border-box;
}
.btn-row {
  margin-top: 18px;
  display: flex;
  gap: 10px;
}
.btn {
  flex: 1;
  height: 44px;
  line-height: 44px;
  border-radius: 10px;
  font-size: 14px;
}
.primary {
  background: #0d6efd;
  color: #fff;
}
.secondary {
  background: #f1f3f5;
  color: #111;
}
.hint {
  margin-top: 14px;
}
.hint-text {
  color: #666;
  font-size: 12px;
}
</style>
