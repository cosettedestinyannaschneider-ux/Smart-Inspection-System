<template>
  <view class="admin-shell">
    <!-- H5 宽屏顶部导航 -->
    <view class="desktop-header">
      <view class="desktop-brand" @click="goToMenu('home')">
        <view class="brand-shield">◇</view>
        <text class="brand-name">智检系统</text>
      </view>
      <view class="desktop-account">
        <view class="account-avatar">●</view>
        <text>{{ currentUser.username || '管理员' }}</text>
        <text class="account-arrow">⌄</text>
        <text class="account-logout" @click="handleLogout">退出</text>
      </view>
    </view>

    <!-- 微信小程序与小屏 H5 顶部导航 -->
    <view class="mobile-header">
      <text v-if="activeKey !== 'home'" class="mobile-back" @click="goBack">‹</text>
      <text class="mobile-title">{{ title }}</text>
      <text v-if="activeKey === 'home'" class="mobile-mark">⌗</text>
    </view>

    <view class="admin-body">
      <!-- H5 宽屏左侧导航 -->
      <view class="desktop-sidebar">
        <view class="sidebar-menu">
          <view
            v-for="item in menuItems"
            :key="item.key"
            class="sidebar-row"
            :class="{ active: activeKey === item.key }"
            @click="goToMenu(item.key)"
          >
            <text class="sidebar-icon">{{ item.symbol }}</text>
            <text class="sidebar-label">{{ item.label }}</text>
          </view>
        </view>
      </view>

      <!-- 页面业务内容 -->
      <scroll-view scroll-y class="admin-content">
        <view class="admin-content-inner" :class="{ 'wide-content': wide }">
          <slot></slot>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiUrl, clearLoginSession, getStoredUser, request } from '../../common/api-config'

/** 页面参数 */
const props = defineProps({
  activeKey: { type: String, default: 'home' },
  title: { type: String, default: '智检系统' },
  wide: { type: Boolean, default: false }
})

/** 向业务页面返回已校验的管理员信息 */
const emit = defineEmits(['ready'])

/** 当前已登录管理员 */
const currentUser = ref({})

/** 管理员端统一导航配置 */
const menuItems = [
  { key: 'home', label: '首页', symbol: '⌂' },
  { key: 'users', label: '用户管理', symbol: '♙' },
  { key: 'knowledge', label: '知识库管理', symbol: '▤' },
  { key: 'model-config', label: 'AI 模型配置', symbol: '◇' },
  { key: 'enterprises', label: '企业数据查询', symbol: '▥' },
  { key: 'logs', label: '操作日志', symbol: '≡' },
  { key: 'templates', label: '报告模板', symbol: '▧' },
  { key: 'backup', label: '数据备份', symbol: '▣' }
]

/** 初始化时统一校验管理员身份 */
onMounted(async () => {
  /** 本地存储中的当前登录用户 */
  const user = getStoredUser()
  if (!user || user.role !== 'admin' || !user.id) {
    uni.reLaunch({ url: '/pages/login/login' })
    return
  }
  currentUser.value = user

  try {
    /** 通过后端会话接口确认当前管理员登录态仍然有效 */
    const response = await request({
      url: apiUrl('/api/auth/me'),
      method: 'GET',
    })
    const result = response?.data || response
    const authUser = result?.data?.user
    if (!result?.success || !authUser || authUser.role !== 'admin') {
      throw new Error(result?.msg || '当前管理员登录状态无效')
    }
    currentUser.value = authUser
    emit('ready', authUser)
  } catch (error) {
    clearLoginSession()
    uni.showToast({ title: '管理员登录已失效，请重新登录', icon: 'none' })
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/login/login' })
    }, 400)
  }
})

/** 跳转到管理员菜单页面 */
const goToMenu = (key) => {
  if (key === props.activeKey) return
  if (key === 'home') {
    uni.reLaunch({ url: '/pages/workbench/workbench' })
    return
  }
  uni.redirectTo({ url: `/pages/admin/${key}` })
}

/** 移动端返回管理员工作台 */
const goBack = () => {
  uni.reLaunch({ url: '/pages/workbench/workbench' })
}

/** 退出当前管理员账号 */
const handleLogout = () => {
  uni.showModal({
    title: '退出登录',
    content: '确定退出当前管理员账号吗？',
    success: (result) => {
      if (!result.confirm) return
      request({
        url: apiUrl('/api/logout'),
        method: 'POST',
      }).finally(() => {
        clearLoginSession()
        uni.reLaunch({ url: '/pages/login/login' })
      })
    }
  })
}
</script>

<style scoped>
/* 管理员公共页面框架 */
.admin-shell { height: 100vh; overflow: hidden; background: #f7f9fc; color: #152342; }
.desktop-header {
  height: 54px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(135deg, #258cff 0%, #086cf0 100%); color: #fff; box-sizing: border-box;
}
.desktop-brand, .desktop-account { display: flex; align-items: center; }
.desktop-brand { gap: 9px; cursor: pointer; }
.brand-shield {
  width: 22px; height: 26px; display: flex; align-items: center; justify-content: center;
  border: 2px solid #fff; border-radius: 5px 5px 8px 8px; font-size: 12px; font-weight: 700; box-sizing: border-box;
}
.brand-name { font-size: 20px; font-weight: 700; letter-spacing: 1px; }
.desktop-account { gap: 7px; font-size: 14px; }
.account-avatar {
  width: 25px; height: 25px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: #fff; color: #237ff4; font-size: 12px;
}
.account-arrow { margin-right: 24px; }
.account-logout { color: rgba(255,255,255,.9); cursor: pointer; }
.mobile-header { display: none; }
.admin-body { height: calc(100vh - 54px); display: flex; }
.desktop-sidebar { width: 198px; flex-shrink: 0; background: #fff; border-right: 1px solid #edf1f7; box-sizing: border-box; }
.sidebar-menu { padding-top: 18px; }
.sidebar-row {
  height: 48px; margin: 0 16px 7px; padding: 0 14px; display: flex; align-items: center;
  gap: 14px; border-radius: 8px; color: #52627b; cursor: pointer; box-sizing: border-box;
}
.sidebar-row.active { background: #edf5ff; color: #1677ff; }
.sidebar-icon { width: 22px; font-size: 19px; text-align: center; font-weight: 700; }
.sidebar-label { font-size: 15px; }
.admin-content { flex: 1; height: 100%; min-width: 0; }
.admin-content-inner { max-width: 930px; min-height: 100%; margin: 0 auto; padding: 32px 24px 32px; box-sizing: border-box; }
.admin-content-inner.wide-content { max-width: 1180px; }

/* 微信小程序与小屏 H5 使用移动端页面框架 */
@media screen and (max-width: 900px) {
  .desktop-header, .desktop-sidebar { display: none; }
  .mobile-header {
    height: 120rpx; padding: 28rpx 32rpx 0; display: flex; align-items: center; justify-content: center;
    position: relative; background: linear-gradient(135deg, #258cff 0%, #0875f5 100%); color: #fff; box-sizing: border-box;
  }
  .mobile-title { font-size: 36rpx; font-weight: 700; letter-spacing: 2rpx; }
  .mobile-back { position: absolute; left: 30rpx; bottom: 18rpx; font-size: 58rpx; line-height: 1; }
  .mobile-mark { position: absolute; right: 34rpx; bottom: 25rpx; font-size: 36rpx; }
  .admin-body { height: calc(100vh - 120rpx); display: block; }
  .admin-content { height: 100%; }
  .admin-content-inner, .admin-content-inner.wide-content { width: 100%; min-height: 100%; padding: 28rpx 24rpx 40rpx; }
}
</style>
