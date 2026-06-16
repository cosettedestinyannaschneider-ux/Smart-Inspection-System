<template>
  <AdminShell active-key="home" title="智检系统" @ready="handleAdminReady">
    <!-- 工作台统计卡片 -->
    <view class="stats-grid">
      <view v-for="item in statisticCards" :key="item.key" class="stat-card">
        <view class="stat-main">
          <view class="stat-icon-box" :class="`theme-${item.theme}`">
            <text class="stat-icon">{{ item.symbol }}</text>
          </view>
          <text class="stat-value mobile-stat-value">{{ stats[item.valueKey] }}</text>
        </view>
        <view class="stat-info">
          <text class="stat-label">{{ item.label }}</text>
          <text class="stat-value desktop-stat-value">{{ stats[item.valueKey] }}</text>
        </view>
      </view>
    </view>

    <!-- 系统管理入口 -->
    <view class="management-panel">
      <text class="panel-title">系统管理</text>
      <view class="management-list">
        <view v-for="item in managementMenus" :key="item.key" class="management-row" @click="goTo(item.page)">
          <view class="management-icon" :class="`theme-${item.theme}`">
            <text class="management-symbol">{{ item.symbol }}</text>
          </view>
          <view class="management-info">
            <text class="management-name">{{ item.label }}</text>
            <text class="management-desc">{{ item.description }}</text>
          </view>
          <text class="management-arrow">›</text>
        </view>
      </view>
    </view>
  </AdminShell>
</template>

<script setup>
import { ref } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { apiUrl, request, unwrapResponse } from '../../common/api-config'

/** 工作台统计数据 */
const stats = ref({
  enterpriseCount: 0,
  pendingImageCount: 0,
  reportCount: 0,
  todayReportCount: 0,
})

/** 统计卡片展示配置 */
const statisticCards = [
  { key: 'enterprise', label: '企业总数', valueKey: 'enterpriseCount', symbol: '▦', theme: 'blue' },
  { key: 'pending-image', label: '待分析图片', valueKey: 'pendingImageCount', symbol: '◔', theme: 'purple' },
  { key: 'report', label: '报告总数', valueKey: 'reportCount', symbol: '▤', theme: 'cyan' },
  { key: 'today-report', label: '今日新增报告', valueKey: 'todayReportCount', symbol: '▣', theme: 'orange' },
]

/** 统一的工作台请求封装 */
const postAdmin = (path, payload = {}) => new Promise((resolve, reject) => {
  request({
    url: apiUrl(path),
    method: 'POST',
    data: payload,
  }).then((response) => {
    const result = unwrapResponse(response)
    if (!result.ok) {
      reject(new Error(result.msg || '请求失败'))
      return
    }
    resolve(result.data || {})
  }).catch(() => reject(new Error('无法连接后端服务')))
})

/** 展示请求错误 */
const showRequestError = (error) => {
  uni.showToast({ title: error?.message || '加载统计失败', icon: 'none' })
}

/** 系统管理入口配置 */
const managementMenus = [
  { key: 'users', label: '用户管理', description: '管理检查员账号与权限', symbol: '♙', theme: 'blue', page: 'users' },
  { key: 'knowledge', label: '知识库管理', description: '上传与维护安全生产法规', symbol: '▤', theme: 'green', page: 'knowledge' },
  { key: 'model-config', label: 'AI 模型配置', description: '对接大模型接口与参数', symbol: '◇', theme: 'purple', page: 'model-config' },
  { key: 'enterprises', label: '企业数据查询', description: '多维度检索与 Excel 导出', symbol: '▥', theme: 'orange', page: 'enterprises' },
  { key: 'logs', label: '操作日志', description: '全量用户操作记录', symbol: '≡', theme: 'blue', page: 'logs' },
  { key: 'templates', label: '报告模板', description: '管理 .docx 报告模板', symbol: '▧', theme: 'cyan', page: 'templates' },
  { key: 'backup', label: '数据备份', description: '手动或自动备份数据库', symbol: '▣', theme: 'orange', page: 'backup' }
]

/** 接收公共框架完成校验后的管理员信息 */
const handleAdminReady = () => {
  loadWorkbenchStats()
}

/** 加载工作台真实统计数据 */
const loadWorkbenchStats = async () => {
  try {
    const data = await postAdmin('/api/admin/workbench/stats')
    stats.value = {
      enterpriseCount: Number(data.enterprise_count || 0),
      pendingImageCount: Number(data.pending_image_count || 0),
      reportCount: Number(data.report_count || 0),
      todayReportCount: Number(data.today_report_count || 0),
    }
  } catch (error) {
    stats.value = {
      enterpriseCount: 0,
      pendingImageCount: 0,
      reportCount: 0,
      todayReportCount: 0,
    }
    showRequestError(error)
  }
}

/** 跳转到指定管理员功能页面 */
const goTo = (page) => {
  uni.navigateTo({ url: `/pages/admin/${page}` })
}
</script>

<style scoped>
.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.stat-card {
  min-width: 0; min-height: 154px; padding: 28px 24px; display: flex; align-items: center; gap: 22px;
  background: #fff; border: 1px solid #edf1f7; border-radius: 14px; box-shadow: 0 5px 18px rgba(31,67,115,.05); box-sizing: border-box;
}
.stat-main { display: flex; align-items: center; gap: 22px; }
.mobile-stat-value { display: none; }
.stat-icon-box { width: 72px; height: 72px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 22px; }
.stat-icon { color: #fff; font-size: 36px; font-weight: 700; }
.stat-info { display: flex; flex-direction: column; min-width: 0; }
.stat-label { font-size: 16px; color: #25334f; font-weight: 600; }
.stat-value { margin-top: 6px; font-size: 38px; line-height: 1; color: #101d39; font-weight: 700; }
.management-panel { margin-top: 24px; padding: 18px 15px 25px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; box-shadow: 0 5px 18px rgba(31,67,115,.04); }
.panel-title { display: block; margin: 0 0 15px 1px; font-size: 20px; color: #172541; font-weight: 700; }
.management-list { display: flex; flex-direction: column; gap: 9px; }
.management-row { min-height: 70px; padding: 12px 14px; display: flex; align-items: center; background: #fff; border: 1px solid #edf1f7; border-radius: 12px; box-sizing: border-box; }
.management-icon { width: 42px; height: 42px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 11px; }
.management-symbol { color: #fff; font-size: 23px; font-weight: 700; }
.management-info { flex: 1; min-width: 0; margin-left: 16px; display: flex; flex-direction: column; }
.management-name { color: #182641; font-size: 16px; font-weight: 700; }
.management-desc { margin-top: 3px; color: #929eaf; font-size: 14px; }
.management-arrow { color: #98a5b6; font-size: 30px; }
.theme-blue { background: linear-gradient(145deg, #4d91ff, #2468ed); box-shadow: 0 5rpx 14rpx rgba(45,113,242,.22); }
.theme-purple { background: linear-gradient(145deg, #a276ff, #7249ee); box-shadow: 0 5rpx 14rpx rgba(121,76,238,.2); }
.theme-green { background: linear-gradient(145deg, #55d98d, #28bd6d); box-shadow: 0 5rpx 14rpx rgba(43,190,111,.2); }
.theme-orange { background: linear-gradient(145deg, #ffbd4f, #ff922e); box-shadow: 0 5rpx 14rpx rgba(255,153,48,.2); }
.theme-cyan { background: linear-gradient(145deg, #48dacf, #18bdb7); box-shadow: 0 5rpx 14rpx rgba(30,193,184,.2); }

@media screen and (max-width: 900px) {
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16rpx; }
  .stat-card { min-height: 260rpx; padding: 30rpx 8rpx 24rpx; flex-direction: column; gap: 14rpx; border-radius: 24rpx; }
  .stat-main { width: 100%; justify-content: center; gap: 22rpx; }
  .mobile-stat-value { display: block; }
  .desktop-stat-value { display: none; }
  .stat-icon-box { width: 70rpx; height: 70rpx; border-radius: 22rpx; }
  .stat-icon { font-size: 36rpx; }
  .stat-info { width: 100%; align-items: center; }
  .stat-label { font-size: 27rpx; color: #7f8b9c; font-weight: 500; }
  .stat-value { margin-top: 0; font-size: 43rpx; }
  .management-panel { margin: 34rpx -24rpx 0; padding: 28rpx 26rpx 34rpx; border: none; border-radius: 24rpx 24rpx 0 0; }
  .panel-title { margin: 0 0 32rpx; font-size: 32rpx; }
  .management-list { gap: 18rpx; }
  .management-row { min-height: 132rpx; padding: 22rpx 26rpx; border-radius: 22rpx; }
  .management-icon { width: 72rpx; height: 72rpx; border-radius: 18rpx; }
  .management-symbol { font-size: 38rpx; }
  .management-info { margin-left: 26rpx; }
  .management-name { font-size: 30rpx; }
  .management-desc { margin-top: 7rpx; font-size: 25rpx; }
  .management-arrow { margin-left: 12rpx; font-size: 42rpx; }
}
</style>
