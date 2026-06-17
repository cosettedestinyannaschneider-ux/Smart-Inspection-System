<template>
  <AdminShell active-key="backup" title="数据备份" wide @ready="handleAdminReady">
    <view class="page-heading">
      <view class="heading-copy">
        <text class="heading-title">数据备份</text>
        <text class="heading-desc">创建真实 MySQL 手动备份，查看执行记录并下载备份文件。</text>
      </view>
      <view class="page-actions">
        <view class="secondary-btn" @click="loadBackupData">刷新</view>
        <view class="primary-btn" :class="{ disabled: backingUp || !backupStatus.available }" @click="manualBackup">
          {{ backingUp ? '备份中...' : '立即备份' }}
        </view>
      </view>
    </view>

    <view class="status-panel" :class="{ unavailable: !backupStatus.available }">
      <view class="status-icon">{{ backupStatus.available ? 'OK' : '!' }}</view>
      <view class="status-copy">
        <text class="status-title">{{ backupStatus.available ? '手动备份可用' : '手动备份不可用' }}</text>
        <text class="status-desc">{{ statusDescription }}</text>
      </view>
      <view class="status-stats">
        <view>
          <text>{{ records.length }}</text>
          <text>备份记录</text>
        </view>
        <view>
          <text>{{ completedCount }}</text>
          <text>可下载</text>
        </view>
      </view>
    </view>

    <view class="backup-grid">
      <view class="config-card">
        <text class="card-title">自动备份策略</text>
        <text class="card-desc">自动调度本阶段尚未实现，页面只展示规划状态，避免把未完成能力伪装成可用功能。</text>
        <view class="planning-box">
          <text class="planning-title">规划中</text>
          <text class="planning-desc">后续可基于同一套备份服务增加定时任务、保留策略和失败告警。</text>
        </view>
      </view>

      <view class="config-card">
        <text class="card-title">备份安全说明</text>
        <view class="notice-row">
          <text>存储位置</text>
          <text>{{ backupStatus.backup_dir || 'uploads/backups' }}</text>
        </view>
        <view class="notice-row">
          <text>备份内容</text>
          <text>当前 MySQL 数据库完整 SQL</text>
        </view>
        <view class="notice-row">
          <text>运行依赖</text>
          <text>MYSQLDUMP_BIN</text>
        </view>
        <view class="warning-box">备份文件含业务数据，只能通过管理员鉴权接口下载，不进入 Git 仓库。</view>
      </view>
    </view>

    <view class="record-panel">
      <view class="record-heading">
        <text>备份记录</text>
        <text>{{ records.length }} 条</text>
      </view>

      <view v-if="loading" class="empty-card">正在加载备份记录...</view>
      <view v-else-if="records.length === 0" class="empty-card">暂无备份记录</view>
      <view v-else>
        <view v-for="item in records" :key="item.id" class="record-row">
          <view class="record-icon">DB</view>
          <view class="record-copy">
            <text class="record-name">{{ item.file_name }}</text>
            <text class="record-meta">
              {{ backupTypeLabel(item.backup_type) }} · {{ formatFileSize(item.file_size) }} · {{ item.created_at || '-' }}
            </text>
            <text v-if="item.error_message" class="record-error">{{ item.error_message }}</text>
          </view>
          <view class="record-actions">
            <text class="status-tag" :class="item.status">{{ statusLabel(item.status) }}</text>
            <text v-if="item.download_url" class="download-link" @click="downloadBackup(item)">下载</text>
          </view>
        </view>
      </view>
    </view>
  </AdminShell>
</template>

<script setup>
import { computed, ref } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { apiUrl, fileUrl, request, unwrapResponse } from '../../common/api-config'

/** 当前管理员信息 */
const user = ref({})
/** 备份能力状态 */
const backupStatus = ref({ available: false, reason: '', backup_dir: 'uploads/backups' })
/** 备份记录列表 */
const records = ref([])
/** 页面加载状态 */
const loading = ref(false)
/** 手动备份执行状态 */
const backingUp = ref(false)

/** 成功完成且可下载的备份数量 */
const completedCount = computed(() => records.value.filter((item) => item.status === 'completed' && item.download_url).length)

/** 顶部状态说明 */
const statusDescription = computed(() => {
  if (!backupStatus.value.available) return backupStatus.value.reason || '当前环境尚未配置真实备份依赖'
  const latest = records.value[0]
  if (!latest) return '当前尚未创建备份，可点击立即备份生成第一份 SQL 文件'
  return `最近记录：${latest.created_at || '-'} · ${latest.file_name || '-'}`
})

/** 统一处理后端响应 */
const ensureResponse = (response, fallbackMessage) => {
  const result = unwrapResponse(response)
  if (!result.ok) throw new Error(result.msg || fallbackMessage)
  return result
}

/** 管理员 JSON 请求 */
const postAdmin = async (path, payload = {}) => {
  const response = await request({
    url: apiUrl(path),
    method: 'POST',
    data: payload,
  })
  return ensureResponse(response, '请求失败')
}

/** 显示提示 */
const showMessage = (title, icon = 'none') => {
  uni.showToast({ title, icon })
}

/** 公共框架鉴权完成后加载备份数据 */
const handleAdminReady = async (admin) => {
  user.value = admin
  await loadBackupData()
}

/** 同时刷新备份能力状态和备份记录 */
const loadBackupData = async () => {
  if (loading.value) return
  loading.value = true
  try {
    const [statusResult, recordsResult] = await Promise.all([
      postAdmin('/api/admin/backup/status'),
      postAdmin('/api/admin/backup/records'),
    ])
    backupStatus.value = statusResult.data || {}
    records.value = Array.isArray(recordsResult.data) ? recordsResult.data : []
  } catch (error) {
    records.value = []
    showMessage(error?.message || '备份数据加载失败')
  } finally {
    loading.value = false
  }
}

/** 创建真实手动备份 */
const manualBackup = () => {
  if (backingUp.value) return
  if (!backupStatus.value.available) {
    showMessage(backupStatus.value.reason || '当前环境不可创建备份')
    return
  }

  uni.showModal({
    title: '创建手动备份',
    content: '确认立即创建当前数据库的 SQL 备份吗？执行期间请勿关闭后端服务。',
    success: async (result) => {
      if (!result.confirm) return
      backingUp.value = true
      uni.showLoading({ title: '正在备份', mask: true })
      try {
        const created = await postAdmin('/api/admin/backup/create')
        showMessage('备份已完成', 'success')
        if (created.data) {
          records.value = [created.data, ...records.value.filter((item) => item.id !== created.data.id)]
        } else {
          await loadBackupData()
        }
      } catch (error) {
        showMessage(error?.message || '备份创建失败')
        await loadBackupData()
      } finally {
        backingUp.value = false
        uni.hideLoading()
      }
    },
  })
}

/** 下载备份文件 */
const downloadBackup = (item) => {
  if (!item.download_url) {
    showMessage('当前备份没有可下载文件')
    return
  }
  const url = fileUrl(item.download_url)

  // #ifdef H5
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // #endif

  // #ifdef MP-WEIXIN
  uni.showLoading({ title: '下载中', mask: true })
  uni.downloadFile({
    url,
    success: (response) => {
      if (response.statusCode !== 200 || !response.tempFilePath) {
        showMessage('备份下载失败')
        return
      }
      uni.openDocument({
        filePath: response.tempFilePath,
        fileType: 'sql',
        showMenu: true,
        fail: () => showMessage('备份文件打开失败'),
      })
    },
    fail: () => showMessage('备份下载失败'),
    complete: () => uni.hideLoading(),
  })
  // #endif
}

/** 备份类型显示 */
const backupTypeLabel = (type) => (type === 'automatic' ? '自动备份' : '手动备份')

/** 状态显示 */
const statusLabel = (status) => {
  const map = {
    pending: '等待中',
    running: '执行中',
    completed: '成功',
    failed: '失败',
  }
  return map[status] || status || '-'
}

/** 文件大小格式化 */
const formatFileSize = (size) => {
  const value = Number(size || 0)
  if (!value) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style scoped>
.page-heading{margin-bottom:22px;display:flex;align-items:center;justify-content:space-between;gap:16px}.heading-copy{display:flex;flex-direction:column}.heading-title{display:block;color:#172541;font-size:28px;font-weight:700}.heading-desc{display:block;margin-top:6px;color:#8b98aa;font-size:14px}.page-actions{display:flex;align-items:center;gap:10px}.primary-btn,.secondary-btn{height:40px;padding:0 16px;display:flex;align-items:center;justify-content:center;border-radius:9px;font-size:13px;box-sizing:border-box}.primary-btn{background:#1677ff;color:#fff}.primary-btn.disabled{opacity:.55}.secondary-btn{background:#f1f4f8;color:#69778c}
.status-panel{margin-bottom:16px;padding:20px;display:flex;align-items:center;gap:15px;border-radius:15px;background:linear-gradient(135deg,#1677ff,#4d9cff);color:#fff}.status-panel.unavailable{background:linear-gradient(135deg,#8c98a8,#697386)}.status-icon{width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:rgba(255,255,255,.2);font-size:16px;font-weight:700}.status-copy{flex:1;min-width:0;display:flex;flex-direction:column}.status-title{font-size:17px;font-weight:700}.status-desc{margin-top:5px;color:rgba(255,255,255,.78);font-size:12px;line-height:1.5;word-break:break-word}.status-stats{display:flex;gap:28px}.status-stats>view{display:flex;flex-direction:column;align-items:center}.status-stats text:first-child{font-size:18px;font-weight:700}.status-stats text:last-child{margin-top:4px;color:rgba(255,255,255,.75);font-size:10px}
.backup-grid{margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px}.config-card,.record-panel{padding:20px;background:#fff;border:1px solid #edf1f7;border-radius:14px}.card-title{display:block;color:#24334e;font-size:16px;font-weight:700}.card-desc{display:block;margin:7px 0 18px;color:#7f8ca1;font-size:12px;line-height:1.7}.planning-box{padding:14px;border-radius:10px;background:#f7f9fc;border:1px dashed #d7e0eb}.planning-title{display:block;color:#24334e;font-size:14px;font-weight:700}.planning-desc{display:block;margin-top:6px;color:#7f8ca1;font-size:12px;line-height:1.6}.notice-row{padding:10px 0;display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid #edf1f7;color:#657389;font-size:12px}.notice-row text:last-child{text-align:right;word-break:break-word}.warning-box{margin-top:14px;padding:11px;border-radius:8px;background:#fff7e8;color:#a76b00;font-size:11px;line-height:1.6}
.record-heading{margin-bottom:12px;display:flex;justify-content:space-between;color:#24334e;font-size:15px;font-weight:700}.record-heading text:last-child{color:#9aa6b7;font-size:11px;font-weight:400}.record-row{padding:13px 0;display:flex;align-items:center;border-top:1px solid #edf1f7}.record-icon{width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:10px;background:#eaf3ff;color:#1677ff;font-size:10px;font-weight:700}.record-copy{flex:1;min-width:0;margin-left:11px;display:flex;flex-direction:column}.record-name{color:#33425b;font-size:12px;font-weight:600;word-break:break-all}.record-meta{margin-top:4px;color:#9aa6b7;font-size:10px}.record-error{margin-top:5px;color:#d65b27;font-size:10px;line-height:1.5}.record-actions{display:flex;align-items:center;gap:12px}.status-tag{padding:4px 9px;border-radius:20px;background:#eef2f7;color:#657389;font-size:10px}.status-tag.completed{background:#eaf8f1;color:#18a66c}.status-tag.failed{background:#fff0ed;color:#d65b27}.status-tag.running{background:#eaf3ff;color:#1677ff}.download-link{color:#1677ff;font-size:12px}.empty-card{padding:50px;color:#9aa6b7;text-align:center}
@media screen and (max-width:900px){.page-heading{margin-bottom:20rpx;align-items:stretch;flex-direction:column;gap:16rpx}.heading-copy{display:none}.page-actions{width:100%;gap:12rpx}.primary-btn,.secondary-btn{height:70rpx;padding:0 22rpx;flex:1;border-radius:13rpx;font-size:23rpx}.status-panel{padding:24rpx;display:block;border-radius:22rpx}.status-icon{width:66rpx;height:66rpx;border-radius:18rpx;font-size:22rpx}.status-copy{margin-top:16rpx}.status-title{font-size:29rpx}.status-desc{font-size:20rpx}.status-stats{margin-top:22rpx;justify-content:space-around}.status-stats text:first-child{font-size:30rpx}.status-stats text:last-child{font-size:19rpx}.backup-grid{grid-template-columns:1fr;gap:16rpx}.config-card,.record-panel{padding:24rpx;border-radius:20rpx}.card-title{font-size:28rpx}.card-desc,.planning-desc,.notice-row{font-size:21rpx}.planning-title{font-size:24rpx}.warning-box{font-size:19rpx}.record-heading{font-size:27rpx}.record-heading text:last-child{font-size:20rpx}.record-row{padding:20rpx 0;align-items:flex-start}.record-icon{width:62rpx;height:62rpx;border-radius:16rpx;font-size:17rpx}.record-name{font-size:22rpx}.record-meta,.record-error,.status-tag,.download-link{font-size:19rpx}.record-actions{flex-direction:column;align-items:flex-end;gap:10rpx}}
</style>
