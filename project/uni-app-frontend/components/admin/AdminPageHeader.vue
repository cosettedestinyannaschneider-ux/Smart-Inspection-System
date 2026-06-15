<template>
  <view class="page-header">
    <view class="header-copy">
      <text class="header-title">{{ title }}</text>
      <text class="header-description">{{ description }}</text>
    </view>
    <view class="header-actions">
      <slot></slot>
    </view>
  </view>
</template>

<script setup>
/** 页面标题组件参数 */
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' }
})
</script>

<style scoped>
/* 管理员业务页面统一标题区域 */
.page-header { margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.header-copy { min-width: 0; }
.header-title { display: block; color: #172541; font-size: 28px; font-weight: 700; }
.header-description { display: block; margin-top: 6px; color: #8b98aa; font-size: 14px; }
.header-actions { display: flex; align-items: center; gap: 10px; }

@media screen and (max-width: 900px) {
  /* 移动端顶部导航已经展示页面名称，此处仅保留紧凑操作区 */
  .page-header { margin-bottom: 20rpx; display: block; }
  .header-copy { display: none; }
  .header-actions { width: 100%; display: flex; gap: 12rpx; }
}
</style>
