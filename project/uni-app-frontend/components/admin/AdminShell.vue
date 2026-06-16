<template>
  <view class="admin-shell">
    <view class="desktop-header">
      <view class="desktop-brand" @click="goToMenu('home')">
        <view class="brand-shield">鈼?/view>
        <text class="brand-name">鏅烘绯荤粺</text>
      </view>
      <view class="desktop-account">
        <view class="account-avatar">鈼?/view>
        <text>{{ currentUser.username || '绠＄悊鍛?' }}</text>
        <text class="account-arrow">鈱?/text>
        <text class="account-logout" @click="handleLogout">閫€鍑?/text>
      </view>
    </view>

    <view class="mobile-header">
      <text v-if="activeKey !== 'home'" class="mobile-back" @click="goBack">鈥?/text>
      <text class="mobile-title">{{ title }}</text>
      <text v-if="activeKey === 'home'" class="mobile-mark">鈱?/text>
    </view>

    <view class="admin-body">
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

const props = defineProps({
  activeKey: { type: String, default: 'home' },
  title: { type: String, default: '鏅烘绯荤粺' },
  wide: { type: Boolean, default: false }
})

const emit = defineEmits(['ready'])
const currentUser = ref({})

const menuItems = [
  { key: 'home', label: '棣栭〉', symbol: '鈱?' },
  { key: 'users', label: '鐢ㄦ埛绠＄悊', symbol: '鈾?' },
  { key: 'knowledge', label: '鐭ヨ瘑搴撶鐞?', symbol: '鈻?' },
  { key: 'model-config', label: 'AI 妯″瀷閰嶇疆', symbol: '鈼?' },
  { key: 'enterprises', label: '浼佷笟鏁版嵁鏌ヨ', symbol: '鈻?' },
  { key: 'logs', label: '鎿嶄綔鏃ュ織', symbol: '鈮?' },
  { key: 'templates', label: '鎶ュ憡妯℃澘', symbol: '鈻?' },
  { key: 'backup', label: '鏁版嵁澶囦唤', symbol: '鈻?' }
]

onMounted(() => {
  const user = getStoredUser()
  if (!user || user.role !== 'admin' || !user.id) {
    uni.reLaunch({ url: '/pages/login/login' })
    return
  }
  currentUser.value = user
  emit('ready', user)
})

const goToMenu = (key) => {
  if (key === props.activeKey) return
  if (key === 'home') {
    uni.reLaunch({ url: '/pages/workbench/workbench' })
    return
  }
  uni.redirectTo({ url: `/pages/admin/${key}` })
}

const goBack = () => {
  uni.reLaunch({ url: '/pages/workbench/workbench' })
}

const handleLogout = () => {
  uni.showModal({
    title: '閫€鍑虹櫥褰?',
    content: '纭畾閫€鍑哄綋鍓嶇鐞嗗憳璐﹀彿鍚楋紵',
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
