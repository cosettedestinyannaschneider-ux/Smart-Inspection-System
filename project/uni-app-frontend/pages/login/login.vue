<template>
  <view class="container login-container">
    <view class="card login-card">
      <view class="brand-logo">🛡️</view>
      <text class="brand-name">智检系统</text>
      <text class="brand-slogan">安全生产社会服务平台</text>

      <view class="login-form">
        <view class="form-item">
          <text class="label">账号</text>
          <input class="input" type="text" v-model="username" placeholder="请输入用户名" />
        </view>
        <view class="form-item">
          <text class="label">密码</text>
          <view class="password-input-wrapper">
            <input class="input" type="text" :password="!showPassword" v-model="password" placeholder="请输入密码" />
            <image
              class="toggle-password-icon"
              :src="showPassword ? '/static/icons/eye-off.png' : '/static/icons/eye.png'"
              @tap="showPassword = !showPassword"
            />
          </view>
        </view>
        <button class="submit-btn" type="primary" :loading="loading" @click="handleLogin">登录系统</button>
        <view class="register-link">
          <text class="text-muted">连接不上？</text>
          <text class="link-text" @click="goToSettings">服务器设置</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { apiUrl, normalizeUser, unwrapResponse } from '../../common/api-config'

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)

/**
 * 用户登录
 * 登录成功后按角色跳转：管理员进入管理端，普通用户进入智检页
 */
const handleLogin = () => {
  if (!username.value || !password.value) {
    uni.showToast({ title: '请输入账号和密码', icon: 'none' })
    return
  }

  loading.value = true
  uni.request({
    url: apiUrl('/api/login'),
    method: 'POST',
    data: { username: username.value, password: password.value },
    success: (res) => {
      const result = unwrapResponse(res)
      if (result.ok) {
        const nextUser = normalizeUser(result.user || result.data?.user || result.data)
        if (!nextUser?.id || !nextUser?.role) {
          uni.showToast({ title: '登录信息异常，请重试', icon: 'none' })
          return
        }
        uni.setStorageSync('user', nextUser)
        uni.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => {
          if (nextUser.role === 'admin') {
            uni.reLaunch({ url: '/pages/workbench/workbench' })
          } else {
            uni.reLaunch({ url: '/pages/process/process' })
          }
        }, 1000)
      } else {
        uni.showToast({ title: result.msg || '登录失败', icon: 'none' })
      }
    },
    fail: (err) => {
      console.error('Login Fail:', err)
      uni.showToast({ title: '网络错误，请检查服务器设置/合法域名', icon: 'none' })
    },
    complete: () => {
      loading.value = false
    }
  })
}

const goToSettings = () => {
  uni.navigateTo({ url: '/pages/settings/settings' })
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
}
.login-card {
  width: 90%;
  max-width: 400px;
  text-align: center;
  padding: 40px 20px;
}
.brand-logo {
  font-size: 48px;
  margin-bottom: 10px;
}
.brand-name {
  font-size: 24px;
  font-weight: bold;
  display: block;
}
.brand-slogan {
  font-size: 14px;
  color: #999;
  margin-bottom: 30px;
  display: block;
}
.form-item {
  text-align: left;
  margin-bottom: 20px;
}
.label {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 10px;
  display: block;
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
.password-input-wrapper {
  position: relative;
}
.password-input-wrapper .input {
  padding-right: 44px;
}
.toggle-password-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  width: 22px;
  height: 22px;
  transform: translateY(-50%);
  z-index: 2;
}
.register-link {
  margin-top: 20px;
  font-size: 14px;
}
.link-text {
  color: #0d6efd;
  font-weight: bold;
  margin-left: 5px;
}
</style>
