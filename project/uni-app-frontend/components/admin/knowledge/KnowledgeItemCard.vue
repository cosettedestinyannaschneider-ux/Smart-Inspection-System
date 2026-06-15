<template>
  <view class="knowledge-card" :class="{ selected }">
    <view class="select-box" :class="{ checked: selected }" @click="$emit('toggle', item.id)">
      <text v-if="selected">✓</text>
    </view>
    <view class="file-icon" :class="item.file_type === 'DOCX' ? 'word-icon' : 'pdf-icon'">
      {{ item.file_type || 'PDF' }}
    </view>
    <view class="card-content">
      <view class="title-row">
        <text class="item-title">{{ item.title }}</text>
        <text class="category-tag">{{ categoryName }}</text>
      </view>
      <text class="item-description">{{ item.description || '暂无文档说明' }}</text>
      <view class="meta-row">
        <text>{{ item.file_path || '未选择文件' }}</text>
        <text>{{ item.created_at || '待上传' }}</text>
      </view>
    </view>
    <view class="card-actions">
      <text class="action-link" @click="$emit('edit', item)">编辑</text>
      <text class="action-link dangerous" @click="$emit('delete', item)">删除</text>
    </view>
  </view>
</template>

<script setup>
/** 知识条目卡片展示参数 */
defineProps({
  item: { type: Object, required: true },
  categoryName: { type: String, default: '未分类' },
  selected: { type: Boolean, default: false }
})

/** 向知识库页面发送勾选、编辑和删除事件 */
defineEmits(['toggle', 'edit', 'delete'])
</script>

<style scoped>
/* 桌面端知识条目卡片 */
.knowledge-card { padding: 18px; display: flex; align-items: center; gap: 15px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; transition: border-color .2s, box-shadow .2s; }
.knowledge-card.selected { border-color: #9bc6ff; box-shadow: 0 8px 22px rgba(22,119,255,.09); }
.select-box { width: 18px; height: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid #d5deea; border-radius: 5px; color: #fff; font-size: 11px; }
.select-box.checked { border-color: #1677ff; background: #1677ff; }
.file-icon { width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 12px; color: #fff; font-size: 10px; font-weight: 700; }
.pdf-icon { background: linear-gradient(135deg,#ff6b6b,#f04444); }.word-icon { background: linear-gradient(135deg,#45a4ff,#1677ff); }
.card-content { flex: 1; min-width: 0; }.title-row { display: flex; align-items: center; gap: 9px; }
.item-title { overflow: hidden; color: #24334e; font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.category-tag { flex-shrink: 0; padding: 3px 8px; border-radius: 20px; background: #eef6ff; color: #1677ff; font-size: 10px; }
.item-description { display: block; margin-top: 6px; color: #79879a; font-size: 12px; }
.meta-row { margin-top: 7px; display: flex; gap: 14px; color: #a0acbb; font-size: 10px; }
.card-actions { display: flex; gap: 14px; }.action-link { color: #1677ff; font-size: 12px; }.dangerous { color: #f05252; }

/* 微信小程序与小屏 H5 使用纵向信息布局 */
@media screen and (max-width: 900px) {
  .knowledge-card { padding: 24rpx; align-items: flex-start; gap: 18rpx; border-radius: 20rpx; }
  .select-box { width: 30rpx; height: 30rpx; border-radius: 7rpx; font-size: 18rpx; }
  .file-icon { width: 68rpx; height: 68rpx; border-radius: 17rpx; font-size: 17rpx; }
  .title-row { align-items: flex-start; flex-wrap: wrap; gap: 10rpx; }.item-title { max-width: 100%; font-size: 27rpx; white-space: normal; }
  .category-tag { padding: 5rpx 12rpx; font-size: 18rpx; }.item-description { margin-top: 10rpx; font-size: 22rpx; }
  .meta-row { margin-top: 12rpx; flex-direction: column; gap: 4rpx; font-size: 19rpx; }
  .card-actions { position: absolute; right: 24rpx; bottom: 22rpx; gap: 22rpx; }.action-link { font-size: 21rpx; }
  .knowledge-card { position: relative; padding-bottom: 66rpx; }
}
</style>
