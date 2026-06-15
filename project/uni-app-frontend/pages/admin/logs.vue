<template>
  <AdminShell active-key="logs" title="操作日志" wide @ready="handleAdminReady">
    <view class="page-heading"><view><text class="heading-title">操作日志</text><text class="heading-desc">查看系统关键操作与访问记录</text></view><view class="refresh-btn" @click="fetchList">刷新日志</view></view>
    <view class="summary-grid">
      <view class="summary-card"><text class="summary-value">{{ list.length }}</text><text class="summary-label">日志总数</text></view>
      <view class="summary-card"><text class="summary-value green">{{ todayCount }}</text><text class="summary-label">今日日志</text></view>
      <view class="summary-card"><text class="summary-value purple">{{ adminCount }}</text><text class="summary-label">管理员操作</text></view>
    </view>
    <view class="filter-panel">
      <view class="search-box"><text class="search-icon">⌕</text><input v-model="keyword" class="search-input" placeholder="搜索用户、操作或详情" /></view>
      <picker :range="moduleOptions" @change="changeModule"><view class="filter-picker">{{ activeModule }}⌄</view></picker>
      <view class="clear-btn" @click="clearFilters">清空筛选</view>
    </view>
    <view v-if="filteredList.length === 0" class="empty-card">暂无符合条件的操作日志</view>
    <view v-else class="log-list">
      <view v-for="log in filteredList" :key="log.id" class="log-card">
        <view class="log-head"><view class="user-avatar">{{ log.username.slice(0, 1) }}</view><view class="log-title-copy"><text class="log-action">{{ log.action }}</text><text class="log-user">{{ log.username }} · {{ log.role }}</text></view><text class="module-tag">{{ log.module }}</text></view>
        <text class="log-detail">{{ log.details || '暂无操作详情' }}</text>
        <view class="log-meta"><text>IP：{{ log.ip_address || '-' }}</text><text>{{ log.created_at }}</text></view>
      </view>
    </view>
  </AdminShell>
</template>

<script setup>
import { ref, computed } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { createActionLogs } from '../../common/admin-mock-data'

/** 当前管理员信息 */
const user = ref({})
/** 操作日志列表 */
const list = ref([])
/** 日志搜索关键词 */
const keyword = ref('')
/** 当前模块筛选条件 */
const activeModule = ref('全部模块')
/** 日志模块筛选选项 */
const moduleOptions = ['全部模块', '认证', '隐患图片', 'AI 分析', '系统管理']
/** 今日操作日志数量 */
const todayCount = computed(() => list.value.filter(item => item.created_at.startsWith('2026-06-09')).length)
/** 管理员操作日志数量 */
const adminCount = computed(() => list.value.filter(item => item.role === '管理员').length)
/** 根据关键词和模块筛选日志 */
const filteredList = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  return list.value.filter(item => (activeModule.value === '全部模块' || item.module === activeModule.value) && (!text || [item.username, item.action, item.details].some(value => String(value || '').toLowerCase().includes(text))))
})
/** 公共框架鉴权完成后加载日志 */
const handleAdminReady = (admin) => { user.value = admin; fetchList() }
/** 加载日志，后续对接 POST /api/admin/logs/list */
const fetchList = () => { list.value = createActionLogs() }
/** 切换模块筛选 */
const changeModule = (event) => { activeModule.value = moduleOptions[event.detail.value] || '全部模块' }
/** 清空全部筛选条件 */
const clearFilters = () => { keyword.value = ''; activeModule.value = '全部模块' }
</script>

<style scoped>
.page-heading { margin-bottom: 22px; display: flex; align-items: center; justify-content: space-between; }.heading-title { display: block; color: #172541; font-size: 28px; font-weight: 700; }.heading-desc { display: block; margin-top: 6px; color: #8b98aa; font-size: 14px; }.refresh-btn,.clear-btn { height: 40px; padding: 0 16px; display: flex; align-items: center; justify-content: center; border-radius: 9px; font-size: 13px; }.refresh-btn { background: #1677ff; color: #fff; }.clear-btn { background: #f1f4f8; color: #69778c; }
.summary-grid { margin-bottom: 18px; display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }.summary-card { padding: 18px 20px; display: flex; flex-direction: column; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }.summary-value { color: #1677ff; font-size: 25px; font-weight: 700; }.summary-value.green { color: #18a66c; }.summary-value.purple { color: #7650e8; }.summary-label { margin-top: 5px; color: #8b98aa; font-size: 12px; }
.filter-panel { margin-bottom: 16px; padding: 14px; display: flex; gap: 12px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }.search-box { flex: 1; height: 40px; padding: 0 12px; display: flex; align-items: center; background: #f7f9fc; border-radius: 9px; }.search-icon { margin-right: 8px; color: #8f9bad; }.search-input { flex: 1; font-size: 13px; }.filter-picker { height: 40px; min-width: 120px; padding: 0 14px; display: flex; align-items: center; border: 1px solid #e2e9f2; border-radius: 9px; color: #59677d; font-size: 12px; box-sizing: border-box; }
.log-list { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.log-card { padding: 18px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }.log-head { display: flex; align-items: center; }.user-avatar { width: 39px; height: 39px; display: flex; align-items: center; justify-content: center; border-radius: 11px; background: #eaf3ff; color: #1677ff; font-weight: 700; }.log-title-copy { flex: 1; margin-left: 11px; display: flex; flex-direction: column; }.log-action { color: #24334e; font-size: 14px; font-weight: 700; }.log-user { margin-top: 3px; color: #96a2b3; font-size: 11px; }.module-tag { padding: 4px 9px; border-radius: 20px; background: #eef9f4; color: #18a66c; font-size: 10px; }.log-detail { display: block; margin-top: 14px; padding: 10px 12px; border-radius: 8px; background: #f7f9fc; color: #657389; font-size: 12px; }.log-meta { margin-top: 11px; display: flex; justify-content: space-between; color: #a1adbc; font-size: 10px; }.empty-card { padding: 70px 20px; border: 1px dashed #dce5f0; border-radius: 14px; background: #fff; color: #9aa6b6; text-align: center; font-size: 13px; }
@media screen and (max-width:900px) {
  .page-heading { margin-bottom: 20rpx; }.page-heading>view:first-child { display: none; }.refresh-btn,.clear-btn { height: 70rpx; padding: 0 22rpx; border-radius: 13rpx; font-size: 23rpx; }
  .summary-grid { gap: 12rpx; }.summary-card { padding: 20rpx 14rpx; border-radius: 18rpx; }.summary-value { font-size: 34rpx; }.summary-label { font-size: 20rpx; }
  .filter-panel { padding: 18rpx; flex-wrap: wrap; gap: 14rpx; border-radius: 19rpx; }.search-box { width: 100%; flex-basis: 100%; height: 70rpx; }.search-input { font-size: 23rpx; }.filter-picker { height: 70rpx; min-width: 210rpx; font-size: 22rpx; }.log-list { grid-template-columns: 1fr; gap: 16rpx; }.log-card { padding: 24rpx; border-radius: 20rpx; }.user-avatar { width: 66rpx; height: 66rpx; border-radius: 17rpx; }.log-action { font-size: 27rpx; }.log-user,.module-tag { font-size: 20rpx; }.log-detail { font-size: 22rpx; }.log-meta { font-size: 19rpx; }
}
</style>
