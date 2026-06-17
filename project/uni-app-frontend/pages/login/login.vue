<template>
  <view class="container login-container">
    <view class="login-shell">
      <view class="brand-panel">
        <view class="brand-mark">智检</view>
        <text class="brand-title">安全生产社会化服务智检系统</text>
        <text class="brand-copy">企业档案、隐患图片、AI 分析和报告生成统一入口</text>
        <view class="brand-points">
          <text>检查员工作台</text>
          <text>管理员后台</text>
          <text>报告生成</text>
        </view>
      </view>
      <view class="card login-card">
        <view class="login-heading">
          <view class="brand-logo">智</view>
          <view>
            <text class="brand-name">登录系统</text>
            <text class="brand-slogan">使用分配的检查员或管理员账号进入</text>
          </view>
        </view>

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
          <button class="submit-btn" type="primary" :loading="loading" @click="handleLogin">{{ loading ? '正在登录...' : '登录系统' }}</button>
          <view class="login-tip">
            <text>连接不上？</text>
            <text class="link-text" @click="goToSettings">服务器设置</text>
          </view>
          <view class="security-note">
            <text>数据库密码和模型 API Key 均由本地环境配置或后端加密保存，不会在页面明文展示。</text>
          </view>
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
    uni.showToast({ title: '请输入账号和密码', icon: 'none' })
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
      uni.showToast({ title: result.msg || '登录失败', icon: 'none' })
      return
    }

    const payload = result.raw || {}
    const nextUser = normalizeUser(result.user || payload.user || payload.data?.user)
    const accessToken = payload.access_token || payload.data?.access_token
    const expiresAt = payload.expires_at || payload.data?.expires_at
    if (!nextUser?.id || !nextUser?.role || !accessToken) {
      uni.showToast({ title: '登录信息异常，请重试', icon: 'none' })
      return
    }

    storeLoginSession({
      user: nextUser,
      accessToken,
      expiresAt,
    })
    uni.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(() => {
      if (nextUser.role === 'admin') {
        uni.reLaunch({ url: '/pages/workbench/workbench' })
      } else {
        uni.reLaunch({ url: '/pages/process/process' })
      }
    }, 1000)
  }).catch((err) => {
    console.error('Login Fail:', err)
    uni.showToast({ title: '网络错误，请检查服务器设置/合法域名', icon: 'none' })
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
  min-height: 100vh;
  padding: 32px;
  background: #f3f6fa;
  box-sizing: border-box;
}
.login-shell {
  width: 100%;
  max-width: 960px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  align-items: stretch;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 18px 48px rgba(15, 28, 50, .08);
}
.brand-panel {
  padding: 52px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: #182333;
  color: #fff;
}
.brand-mark {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 12px;
  background: #1677ff;
  font-size: 17px;
  font-weight: 700;
  box-sizing: border-box;
}
.brand-title {
  display: block;
  margin-top: 26px;
  max-width: 360px;
  font-size: 29px;
  font-weight: 700;
  line-height: 1.35;
}
.brand-copy {
  display: block;
  margin-top: 14px;
  max-width: 360px;
  color: #b8c2d2;
  font-size: 14px;
  line-height: 1.8;
}
.brand-points {
  margin-top: 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.brand-points text {
  padding: 7px 10px;
  border-radius: 8px;
  background: rgba(255,255,255,.08);
  color: #d6e1ee;
  font-size: 12px;
}
.login-card {
  width: auto;
  max-width: none;
  padding: 48px 38px;
  text-align: left;
  box-shadow: none;
  border: 0;
}
.login-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 34px;
}
.brand-logo {
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #1677ff;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}
.brand-name {
  font-size: 24px;
  font-weight: bold;
  display: block;
  color: #172541;
}
.brand-slogan {
  margin-top: 5px;
  font-size: 13px;
  color: #8b98aa;
  display: block;
}
.form-item {
  text-align: left;
  margin-bottom: 20px;
}
.label {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 10px;
  display: block;
  color: #39465c;
}
.input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border-radius: 9px;
  background-color: #f8fafc;
  border: 1px solid #dde5ef;
  box-sizing: border-box;
  font-size: 14px;
  color: #24334e;
}
.submit-btn {
  height: 48px;
  line-height: 48px;
  border-radius: 9px;
  background: #1677ff;
  font-size: 16px;
  font-weight: 600;
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
.login-tip {
  margin-top: 20px;
  display: flex;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  color: #69778c;
}
.link-text {
  color: #1677ff;
  font-weight: bold;
}
.security-note {
  margin-top: 18px;
  padding: 11px 12px;
  border-radius: 9px;
  background: #f7fafc;
  border: 1px solid #e7edf5;
  color: #758398;
  font-size: 12px;
  line-height: 1.6;
}
@media screen and (max-width: 760px) {
  .login-container {
    align-items: stretch;
    padding: 18px;
  }
  .login-shell {
    display: block;
    border-radius: 12px;
  }
  .brand-panel {
    padding: 26px;
  }
  .brand-title {
    margin-top: 18px;
    font-size: 24px;
  }
  .brand-copy {
    font-size: 13px;
  }
  .login-card {
    padding: 28px 22px;
  }
  .login-heading {
    margin-bottom: 26px;
  }
}
</style>
