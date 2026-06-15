<template>
  <view v-if="visible" class="modal-mask" catchtouchmove="true" @click="$emit('close')">
    <view class="modal-panel" :class="{ wide }" @click.stop="">
      <view class="modal-header">
        <view>
          <text class="modal-title">{{ title }}</text>
          <text v-if="description" class="modal-description">{{ description }}</text>
        </view>
        <text class="modal-close" @click="$emit('close')">×</text>
      </view>
      <scroll-view scroll-y class="modal-body">
        <slot></slot>
      </scroll-view>
      <view v-if="$slots.footer" class="modal-footer">
        <slot name="footer"></slot>
      </view>
    </view>
  </view>
</template>

<script setup>
/** 响应式弹窗参数 */
defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  wide: { type: Boolean, default: false }
})

/** 向业务页面发送关闭事件 */
defineEmits(['close'])
</script>

<style scoped>
/* 桌面端居中弹窗 */
.modal-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 9999; padding: 24px; display: flex; align-items: center; justify-content: center; background: rgba(15,28,50,.46); box-sizing: border-box; }
.modal-panel { width: 560px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; background: #fff; border-radius: 18px; box-shadow: 0 24px 70px rgba(18,40,73,.24); }
.modal-panel.wide { width: 760px; }
.modal-header { padding: 22px 26px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #edf1f7; }
.modal-title { display: block; color: #172541; font-size: 21px; font-weight: 700; }
.modal-description { display: block; margin-top: 5px; color: #909daf; font-size: 13px; }
.modal-close { color: #91a0b5; font-size: 26px; line-height: 1; }
.modal-body { flex: 1; max-height: 66vh; padding: 24px 26px; box-sizing: border-box; }
.modal-footer { padding: 16px 26px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #edf1f7; }

/* 微信小程序与小屏 H5 使用底部抽屉 */
@media screen and (max-width: 900px) {
  .modal-mask { padding: 0; align-items: flex-end; }
  .modal-panel, .modal-panel.wide { width: 100%; max-height: 82vh; border-radius: 28rpx 28rpx 0 0; }
  .modal-header { padding: 24rpx 30rpx; }
  .modal-title { font-size: 31rpx; }
  .modal-description { margin-top: 5rpx; font-size: 21rpx; }
  .modal-close { font-size: 44rpx; }
  .modal-body { max-height: 60vh; padding: 24rpx 30rpx; }
  .modal-footer { padding: 18rpx 30rpx 24rpx; gap: 14rpx; background: #fff; }
}
</style>
