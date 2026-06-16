<template>
  <view class="container login-container">
    <view class="card login-card">
      <view class="brand-logo">馃洝锔?/view>
      <text class="brand-name">鏅烘绯荤粺</text>
      <text class="brand-slogan">瀹夊叏鐢熶骇绀句細鏈嶅姟骞冲彴</text>

      <view class="login-form">
        <view class="form-item">
          <text class="label">璐﹀彿</text>
          <input class="input" type="text" v-model="username" placeholder="璇疯緭鍏ョ敤鎴峰悕" />
        </view>
        <view class="form-item">
          <text class="label">瀵嗙爜</text>
          <view class="password-input-wrapper">
            <input class="input" type="text" :password="!showPassword" v-model="password" placeholder="璇疯緭鍏ュ瘑鐮?" />
            <image
              class="toggle-password-icon"
              :src="showPassword ? '/static/icons/eye-off.png' : '/static/icons/eye.png'"
              @tap="showPassword = !showPassword"
            />
          </view>
        </view>
        <button class="submit-btn" type="primary" :loading="loading" @click="handleLogin">鐧诲綍绯荤粺</button>
        <view class="register-link">
          <text class="text-muted">杩炴帴涓嶄笂锛?/text>
          <text class="link-text" @click="goToSettings">鏈嶅姟鍣ㄨ缃?/text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { apiUrl, normalizeUser, request, storeLoginSession, unwrapResponse } from '../../common/api-config'

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)

/**
 * 用户登录。
 * 登录成功后保存用户信息与 Access Token，并按角色跳转。
 */
const handleLogin = () => {
  if (!username.value || !password.value) {
    uni.showToast({ title: '璇疯緭鍏ヨ处鍙峰拰瀵嗙爜', icon: 'none' })
    return
  }

  loading.value = true
  request({
    url: apiUrl('/api/login'),
    method: 'POST',
    data: { username: username.value, password: password.value },
  }).then((res) => {
    const result = unwrapResponse(res)
    if (!result.ok) {
      uni.showToast({ title: result.msg || '鐧诲綍澶辫触', icon: 'none' })
      return
    }

    const payload = result.raw || {}
    const nextUser = normalizeUser(result.user || payload.user || payload.data?.user)
    const accessToken = payload.access_token || payload.data?.access_token
    const expiresAt = payload.expires_at || payload.data?.expires_at
    if (!nextUser?.id || !nextUser?.role || !accessToken) {
      uni.showToast({ title: '鐧诲綍淇℃伅寮傚父锛岃閲嶈瘯', icon: 'none' })
      return
    }

    storeLoginSession({
      user: nextUser,
      accessToken,
      expiresAt,
    })
    uni.showToast({ title: '鐧诲綍鎴愬姛', icon: 'success' })
    setTimeout(() => {
      if (nextUser.role === 'admin') {
        uni.reLaunch({ url: '/pages/workbench/workbench' })
      } else {
        uni.reLaunch({ url: '/pages/process/process' })
      }
    }, 1000)
  }).catch((err) => {
    console.error('Login Fail:', err)
    uni.showToast({ title: '缃戠粶閿欒锛岃妫€鏌ユ湇鍔″櫒璁剧疆/鍚堟硶鍩熷悕', icon: 'none' })
  }).finally(() => {
    loading.value = false
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
