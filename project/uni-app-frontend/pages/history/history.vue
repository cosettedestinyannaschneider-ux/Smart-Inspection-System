<template>
  <view class="container">
    <view class="card">
      <text class="section-title">鍘嗗彶鍒嗘瀽璁板綍</text>
      <view v-if="historyList.length === 0" class="no-data">鏆傛棤璁板綍</view>
      <view v-else class="history-list">
        <view v-for="item in historyList" :key="item.id" class="history-item card">
          <view class="item-header">
            <text class="item-time">{{ formatDate(item.created_at) }}</text>
            <view class="item-badge" :class="item.image_path ? 'badge-image' : 'badge-text'">
              {{ item.image_path ? '鍥炬枃' : '绾枃鏈?' }}
            </view>
          </view>
          <text class="item-prompt">鎻愮ず锛歿{ item.prompt }}</text>
          <view class="item-result-preview">
            <text class="item-result">{{ item.result.substring(0, 100) }}...</text>
          </view>
          <view class="item-actions">
            <button class="mini-btn dl-btn" @click="handleDownload(item.word_path)">Word</button>
            <button class="mini-btn dl-btn" @click="handleDownload(item.pdf_path)">PDF</button>
            <button class="mini-btn view-btn" @click="handleViewDetail(item)">鏌ョ湅鍏ㄦ枃</button>
            <button class="mini-btn delete-btn" @click="handleDelete(item)">鍒犻櫎</button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiUrl, assetUrl, clearLoginSession, downloadFile, getStoredUser, request } from '../../common/api-config'

const historyList = ref([])
const user = ref({})

onMounted(() => {
  const storedUser = getStoredUser()
  if (storedUser && storedUser.id) {
    user.value = storedUser
    fetchHistory()
  } else {
    clearLoginSession()
    uni.reLaunch({ url: '/pages/login/login' })
  }
})

const fetchHistory = () => {
  request({
    url: apiUrl(`/api/history/${user.value.id}`),
    method: 'GET',
  }).then((res) => {
    const data = res.data
    if (data.success) historyList.value = data.data
  }).catch(() => {
    uni.showToast({ title: '鍔犺浇澶辫触', icon: 'none' })
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
  downloadFile({
    url,
    success: (res) => {
      if (res.statusCode === 200) {
        uni.openDocument({
          filePath: res.tempFilePath,
          success: () => console.log('鎵撳紑鎴愬姛'),
          fail: () => uni.showToast({ title: '鎵撳紑澶辫触', icon: 'none' })
        })
      }
    }
  })
  // #endif
}

const handleViewDetail = (item) => {
  uni.showModal({
    title: '鍒嗘瀽缁撴灉鍏ㄦ枃',
    content: item.result,
    showCancel: false
  })
}

const handleDelete = (item) => {
  if (!item?.id) return
  uni.showModal({
    title: '纭鍒犻櫎',
    content: '鍒犻櫎鍚庢棤娉曟仮澶嶏紝涓斾細鍚屾椂鍒犻櫎鐢熸垚鐨?Word/PDF 鎶ュ憡鏂囦欢',
    success: (res) => {
      if (!res.confirm) return
      request({
        url: apiUrl('/api/history/delete'),
        method: 'POST',
        data: { user_id: user.value.id, id: item.id },
      }).then((response) => {
        if (response.data?.success) {
          uni.showToast({ title: '宸插垹闄?' })
          fetchHistory()
        } else {
          uni.showToast({ title: response.data?.message || '鍒犻櫎澶辫触', icon: 'none' })
        }
      }).catch(() => {
        uni.showToast({ title: '缃戠粶閿欒锛岃绋嶅悗閲嶈瘯', icon: 'none' })
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
