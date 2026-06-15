<template>
  <!-- 组织删除确认层：避免 H5 双层业务弹窗内调用 uni.showModal 时无响应 -->
  <view v-if="state.visible" class="modal-mask confirm-modal-mask" @click="$emit('close')">
    <view class="confirm-modal" @click.stop="">
      <text class="confirm-title">确认删除</text>
      <text class="confirm-content">{{ state.content }}</text>
      <text class="confirm-warning">删除后不可恢复；存在关联数据时后端将拒绝删除。</text>
      <text v-if="state.error" class="confirm-error">{{ state.error }}</text>
      <view class="confirm-actions">
        <view class="secondary-btn" @click="$emit('close')">取消</view>
        <view class="danger-confirm-btn" @click="$emit('confirm')">确认删除</view>
      </view>
    </view>
  </view>
</template>

<script setup>
/** 组织删除确认层展示参数 */
defineProps({
  state: {
    type: Object,
    required: true
  }
})

/** 将关闭和确认操作发送给页面编排层 */
defineEmits(['close', 'confirm'])
</script>

<style scoped>
/* 企业与部门删除确认层 */
.modal-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(15,28,50,.46); box-sizing: border-box; }
.confirm-modal-mask { z-index: 5000; }
.confirm-modal { width: 420px; padding: 26px; background: #fff; border-radius: 16px; box-shadow: 0 24px 70px rgba(18,40,73,.28); box-sizing: border-box; }
.confirm-title { display: block; color: #172541; font-size: 20px; font-weight: 700; }
.confirm-content { display: block; margin-top: 16px; color: #44536b; font-size: 14px; line-height: 1.7; }
.confirm-warning { display: block; margin-top: 8px; color: #9a6b4a; font-size: 12px; line-height: 1.6; }
.confirm-error { display: block; margin-top: 12px; padding: 9px 10px; border-radius: 8px; background: #fff0f1; color: #d83b45; font-size: 12px; line-height: 1.6; }
.confirm-actions { margin-top: 24px; display: flex; justify-content: flex-end; gap: 10px; }
.secondary-btn, .danger-confirm-btn { min-width: 92px; height: 38px; display: flex; align-items: center; justify-content: center; border-radius: 9px; font-size: 13px; }
.secondary-btn { background: #f1f4f8; color: #69778c; }
.danger-confirm-btn { background: #f05252; color: #fff; }

/* 微信小程序与小屏 H5 保持居中确认层 */
@media screen and (max-width: 900px) {
  .confirm-modal-mask { padding: 30rpx; align-items: center; }
  .confirm-modal { width: 100%; padding: 34rpx; border-radius: 22rpx; }
  .confirm-title { font-size: 32rpx; }
  .confirm-content { margin-top: 22rpx; font-size: 26rpx; }
  .confirm-warning { margin-top: 12rpx; font-size: 22rpx; }
  .confirm-error { margin-top: 16rpx; padding: 14rpx 16rpx; border-radius: 12rpx; font-size: 22rpx; }
  .confirm-actions { margin-top: 30rpx; gap: 16rpx; }
  .secondary-btn, .danger-confirm-btn { flex: 1; height: 76rpx; border-radius: 14rpx; font-size: 27rpx; }
}
</style>
