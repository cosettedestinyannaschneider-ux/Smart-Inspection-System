<template>
  <view class="container">
    <view class="card">
      <text class="section-title">历史分析记录</text>
      <view v-if="historyList.length === 0" class="no-data">暂无记录</view>
      <view v-else class="history-list">
        <view v-for="item in historyList" :key="item.id" class="history-item card">
          <view class="item-header">
            <text class="item-time">{{ formatDate(item.created_at) }}</text>
            <view class="item-badge" :class="item.image_path ? 'badge-image' : 'badge-text'">
              {{ item.image_path ? '图文' : '纯文本' }}
            </view>
          </view>
          <text class="item-prompt">提示：{{ item.prompt }}</text>
          <view class="item-result-preview">
            <text class="item-result">{{ item.result.substring(0, 100) }}...</text>
          </view>
          <view class="item-actions">
            <button class="mini-btn dl-btn" @click="handleDownload(item.word_path)">Word</button>
            <button class="mini-btn dl-btn" @click="handleDownload(item.pdf_path)">PDF</button>
            <button class="mini-btn view-btn" @click="handleViewDetail(item)">查看全文</button>
            <button class="mini-btn delete-btn" @click="handleDelete(item)">删除</button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiUrl, assetUrl, normalizeUser } from '../../common/api-config'

const historyList = ref([])
const user = ref({})

onMounted(() => {
  const storedUser = normalizeUser(uni.getStorageSync('user'))
  if (storedUser && storedUser.id) {
    user.value = storedUser
    fetchHistory()
  } else {
    uni.removeStorageSync('user')
    uni.reLaunch({ url: '/pages/login/login' })
  }
})

const fetchHistory = () => {
  uni.request({
    url: apiUrl(`/api/history/${user.value.id}`),
    method: 'GET',
    success: (res) => {
      const data = res.data
      if (data.success) {
        historyList.value = data.data
      }
    },
    fail: () => {
      uni.showToast({ title: '加载失败', icon: 'none' })
    }
  })
}

const formatDate = (dateStr) => {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

const handleDownload = (path) => {
  if (!path) return
  const url = assetUrl(path)
  
  // #ifdef H5
  window.open(url)
  // #endif
  
  // #ifndef H5
  uni.downloadFile({
    url: url,
    success: (res) => {
      if (res.statusCode === 200) {
        uni.openDocument({
          filePath: res.tempFilePath,
          success: () => console.log('打开成功'),
          fail: () => uni.showToast({ title: '打开失败', icon: 'none' })
        })
      }
    }
  })
  // #endif
}

const handleViewDetail = (item) => {
  uni.showModal({
    title: '分析结果全文',
    content: item.result,
    showCancel: false
  })
}

/**
 * 9.7 报告管理：删除单条记录（同时清理生成的报告文件）
 * @param {{id:number}} item
 */
const handleDelete = (item) => {
  if (!item?.id) return
  uni.showModal({
    title: '确认删除',
    content: '删除后无法恢复，且会同时删除生成的 Word/PDF 报告文件',
    success: (res) => {
      if (!res.confirm) return
      uni.request({
        url: apiUrl('/api/history/delete'),
        method: 'POST',
        data: { user_id: user.value.id, id: item.id },
        success: (res) => {
          if (res.data?.success) {
            uni.showToast({ title: '已删除' })
            fetchHistory()
          } else {
            uni.showToast({ title: res.data?.message || '删除失败', icon: 'none' })
          }
        },
        fail: () => uni.showToast({ title: '网络错误，请稍后重试', icon: 'none' })
      })
    }
  })
}
</script>

<style scoped>
.no-data {
  text-align: center;
  color: #999;
  padding: 40px 0;
}
.history-item {
  padding: 15px;
  margin-bottom: 15px;
  border-left: 5px solid #0d6efd;
}
.item-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}
.item-time {
  font-size: 12px;
  color: #999;
}
.item-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  color: white;
}
.badge-image { background-color: #ffc107; }
.badge-text { background-color: #17a2b8; }
.item-prompt {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 8px;
  display: block;
}
.item-result-preview {
  background-color: #f8f9fa;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 15px;
}
.item-result {
  font-size: 12px;
  color: #666;
  line-height: 1.5;
}
.item-actions {
  display: flex;
  justify-content: flex-end;
}
.dl-btn {
  background-color: #28a745;
  color: white;
  margin-left: 10px;
}
.view-btn {
  background-color: #0d6efd;
  color: white;
  margin-left: 10px;
}
.delete-btn {
  background-color: #dc3545;
  color: white;
  margin-left: 10px;
}
</style>
