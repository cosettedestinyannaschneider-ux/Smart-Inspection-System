<template>
  <view class="app-container">
    <!-- 侧边栏：PC端显示，移动端可切换 -->
    <view class="sidebar" :class="{ 'sidebar-active': showSidebar }">
      <view class="new-chat-btn" @click="startNewChat">
        <text class="icon">+</text>
        <text>开启新对话</text>
      </view>
      
      <scroll-view scroll-y class="history-list">
        <view 
          v-for="session in sessionList" 
          :key="session.session_id" 
          class="history-item" 
          :class="{ 'item-active': currentSessionId === session.session_id }"
          @click="loadSession(session.session_id)"
        >
          <text class="history-title">{{ session.title }}</text>
          <text class="delete-icon" @click.stop="deleteSession(session.session_id)">×</text>
        </view>
      </scroll-view>

      <view class="sidebar-footer">
        <view class="footer-btns">
          <view v-if="user.role !== 'admin'" class="footer-btn action-btn" @click="showEnterpriseModal = true">
            <text class="icon">🏢</text>
            <text>企业信息管理</text>
          </view>
          <view v-if="user.role !== 'admin'" class="footer-btn action-btn" @click="openHazardImageModal">
            <text class="icon">📷</text>
            <text>隐患图片</text>
          </view>
        </view>
        <view class="user-info" @click="toggleUserMenu">
          <view class="avatar">{{ user.username?.substring(0,1).toUpperCase() }}</view>
          <text class="username">{{ user.username }}</text>
        </view>
      </view>
    </view>

    <!-- 主内容区 -->
    <view class="main-content">
      <!-- 顶部状态栏 -->
      <view class="header">
        <view class="menu-toggle" @click="showSidebar = !showSidebar">☰</view>
        <text class="header-title">{{ currentSessionTitle || '智检助手' }}</text>
        <view class="header-btns">
          <button class="mini-btn admin-btn" v-if="user.role === 'admin'" @click="goToAdmin">系统管理</button>
          <button class="mini-btn logout-btn" @click="handleLogout">退出</button>
        </view>
      </view>

      <!-- 聊天流 -->
      <view class="chat-flow-container">
        <scroll-view 
          scroll-y 
          class="chat-flow" 
          :scroll-into-view="lastMessageId" 
          scroll-with-animation
        >
          <view v-if="messages.length === 0" class="welcome-guide">
            <text class="welcome-title">您好，我是智检助手。请上传现场隐患图片或输入描述，我将为您进行安全检查分析。</text>
            <view class="guide-cards">
              <view class="guide-card" @click="prompt = '请根据最新的安全生产标准，结合已选隐患照片进行分析'">
                <text>🔍 智能隐患排查</text>
              </view>
              <view class="guide-card" @click="prompt = '请解释安全生产法中关于企业主体责任的相关规定'">
                <text>📄 查阅安全规范</text>
              </view>
            </view>
          </view>

          <view v-for="(msg, index) in messages" :key="index" :id="'msg-' + index" class="message-wrapper">
            <!-- 用户消息 -->
            <view v-if="msg.role === 'user'" class="message-user">
              <view class="message-bubble">
                <image v-if="msg.image" :src="msg.image" mode="aspectFit" class="message-image" @click="previewImage(msg.image)" />
                <text class="message-text">{{ msg.content }}</text>
              </view>
            </view>
            <!-- AI 消息 -->
            <view v-else class="message-ai">
              <view class="ai-avatar">🤖</view>
              <view class="message-bubble">
                <!-- 9.6 结构化输出渲染与编辑 -->
                <view v-if="parseStructuredData(msg.content)" class="structured-result">
                  <view v-if="!msg.isEditing">
                     <view v-if="parseStructuredData(msg.content).mode === 'single'">
                       <view class="struct-item">
                         <text class="struct-label">隐患描述：</text>
                         <text class="struct-value">{{ parseStructuredData(msg.content).hazard_description }}</text>
                       </view>
                       <view class="struct-item">
                         <text class="struct-label">排查依据：</text>
                         <text class="struct-value">{{ parseStructuredData(msg.content).basis }}</text>
                       </view>
                       <view class="struct-item">
                         <text class="struct-label">整改建议：</text>
                         <text class="struct-value">{{ parseStructuredData(msg.content).suggestion }}</text>
                       </view>
                     </view>
                     <view v-else>
                       <view v-for="(item, idx) in parseStructuredData(msg.content).items" :key="idx" class="struct-item">
                         <text class="struct-label">隐患分析（{{ idx + 1 }}） image_id={{ item.image_id }}</text>
                         <text class="struct-label">隐患描述：</text>
                         <text class="struct-value">{{ item.hazard_description }}</text>
                         <text class="struct-label">排查依据：</text>
                         <text class="struct-value">{{ item.basis }}</text>
                         <text class="struct-label">整改建议：</text>
                         <text class="struct-value">{{ item.suggestion }}</text>
                       </view>
                     </view>
                    <view class="struct-actions">
                      <button class="mini-btn edit-btn" @click="startEditResult(msg)">编辑修改</button>
                    </view>
                  </view>
                  <view v-else class="struct-edit-form">
                     <view v-if="msg.editData.mode === 'single'">
                       <view class="struct-item">
                         <text class="struct-label">隐患描述：</text>
                         <textarea class="struct-textarea" v-model="msg.editData.hazard_description" auto-height></textarea>
                       </view>
                       <view class="struct-item">
                         <text class="struct-label">排查依据：</text>
                         <textarea class="struct-textarea" v-model="msg.editData.basis" auto-height></textarea>
                       </view>
                       <view class="struct-item">
                         <text class="struct-label">整改建议：</text>
                         <textarea class="struct-textarea" v-model="msg.editData.suggestion" auto-height></textarea>
                       </view>
                     </view>
                     <view v-else>
                       <view v-for="(item, idx) in msg.editData.items" :key="idx" class="struct-item">
                         <text class="struct-label">隐患分析（{{ idx + 1 }}） image_id={{ item.image_id }}</text>
                         <text class="struct-label">隐患描述：</text>
                         <textarea class="struct-textarea" v-model="item.hazard_description" auto-height></textarea>
                         <text class="struct-label">排查依据：</text>
                         <textarea class="struct-textarea" v-model="item.basis" auto-height></textarea>
                         <text class="struct-label">整改建议：</text>
                         <textarea class="struct-textarea" v-model="item.suggestion" auto-height></textarea>
                       </view>
                     </view>
                    <view class="struct-actions">
                      <button class="mini-btn cancel-btn" @click="cancelEditResult(msg)">取消</button>
                      <button class="mini-btn save-btn" :disabled="savingResult" @click="saveEditResult(msg)">保存</button>
                    </view>
                  </view>
                </view>
                <text v-else class="message-text" selectable>{{ msg.content }}</text>
                
                <view v-if="msg.wordPath || msg.pdfPath" class="file-links">
                  <text class="file-link" @click="handleDownload(msg.wordPath)">📎 Word 报告</text>
                  <text class="file-link" @click="handleDownload(msg.pdfPath)">📎 PDF 报告</text>
                </view>
              </view>
            </view>
          </view>
          <view id="bottom-anchor" style="height: 20px;"></view>
        </scroll-view>
      </view>

      <!-- 底部输入区 -->
      <view class="input-container">
        <view class="input-wrapper">
          <view class="attachment-btn" @click="handlePickImage">
            <text class="icon">{{ imagePath ? '🖼️' : '➕' }}</text>
          </view>
          <!-- 模型选择 -->
          <picker class="model-picker" :range="modelList" range-key="label" :value="selectedModelIndex" @change="onModelChange">
            <view class="model-selector">
              <text class="model-label">{{ modelList[selectedModelIndex]?.label || '默认模型' }}</text>
              <text class="model-arrow">▼</text>
            </view>
          </picker>
          <view v-if="selectedHazardIds.length" class="selected-hazard-tip">
            <text>已选隐患照片 {{ selectedHazardIds.length }} 张</text>
            <text class="clear-link" @click="clearSelectedHazards">清空</text>
          </view>
          <textarea 
            class="chat-input" 
            v-model="prompt" 
            placeholder="输入隐患描述或点击左侧上传图片..." 
            auto-height 
            :maxlength="1000"
            @confirm="handleSend"
            fixed
          />
          <view class="send-actions">
            <button
              class="send-btn"
              :disabled="!loading && (!prompt && !imagePath && selectedHazardIds.length === 0)"
              @click="loading ? stopCurrentRequest() : handleSend()"
            >
              {{ loading ? '停止' : '发送' }}
            </button>
          </view>
        </view>
      </view>
    </view>

    <!-- 企业信息弹窗：重构为专业表单风格 -->
    <view v-if="showEnterpriseModal && user.role !== 'admin'" class="form-modal-mask">
      <view class="form-modal-content">
        <!-- 弹窗头部：带返回按钮 -->
        <view class="form-header">
          <text class="cancel-btn" @click="showEnterpriseModal = false">❮</text>
          <text class="header-title">添加企业信息</text>
        </view>

        <!-- 表单主体：滚动区域 -->
        <scroll-view scroll-y class="form-body">
          <view class="form-section">
            <!-- 企业名称 -->
            <view class="form-item">
              <view class="item-label">
                <text class="required">*</text>
                <text>企业名称</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.name" placeholder="请输入企业全称" placeholder-class="placeholder" />
            </view>

            <!-- 所在地区 (滑动选择) -->
            <view class="form-item">
              <view class="item-label">
                <text class="required">*</text>
                <text>所在地区</text>
              </view>
              <!-- #ifndef H5 -->
              <picker class="picker-container" mode="region" @change="onRegionChange" :value="enterpriseForm.region?.split('-')">
                <view class="picker-value" :class="{ 'placeholder': !enterpriseForm.region }">
                  {{ enterpriseForm.region || '请选择省/市/区' }}
                  <text class="arrow">></text>
                </view>
              </picker>
              <!-- #endif -->
              <!-- #ifdef H5 -->
              <input class="item-input" v-model="enterpriseForm.region" placeholder="请输入省-市-区（例如：陕西省-西安市-雁塔区）" placeholder-class="placeholder" />
              <!-- #endif -->
            </view>

            <!-- 详细地址 -->
            <view class="form-item">
              <view class="item-label">
                <text class="required">*</text>
                <text>详细地址</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.address" placeholder="请输入街道/门牌号等" placeholder-class="placeholder" />
            </view>

            <!-- 项目名称 -->
            <view class="form-item border-none">
              <view class="item-label">
                <text>项目名称</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.project_name" placeholder="请输入项目名称（选填）" placeholder-class="placeholder" />
            </view>
          </view>

          <view class="form-section">
            <!-- 联系人 -->
            <view class="form-item">
              <view class="item-label">
                <text class="required">*</text>
                <text>联系人</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.contact" placeholder="请输入负责人姓名" placeholder-class="placeholder" />
            </view>

            <!-- 联系电话 -->
            <view class="form-item border-none">
              <view class="item-label">
                <text class="required">*</text>
                <text>联系电话</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.phone" placeholder="请输入联系方式" type="number" placeholder-class="placeholder" />
            </view>
          </view>
        </scroll-view>

        <!-- 底部操作区：提交与保存 -->
        <view class="form-footer">
          <button class="footer-action-btn primary-btn" @click="saveEnterpriseInfo">提交信息</button>
          <button class="footer-action-btn secondary-btn" @click="showEnterpriseModal = false">保存草稿</button>
        </view>
      </view>
    </view>

    <!-- 隐患图片弹窗：上传/查看/删除 -->
    <view v-if="showHazardImageModal && user.role !== 'admin'" class="form-modal-mask">
      <view class="form-modal-content">
        <view class="form-header">
          <text class="cancel-btn" @click="showHazardImageModal = false">❮</text>
          <text class="header-title">隐患图片上传</text>
        </view>

        <view class="hazard-toolbar">
          <button class="footer-action-btn primary-btn" :disabled="hazardUploading" @click="pickHazardImages">
            {{ hazardUploading ? '上传中...' : '选择图片上传' }}
          </button>
          <button v-if="hazardFailedPaths.length" class="footer-action-btn primary-btn" :disabled="hazardUploading" @click="retryFailedUploads">
            重试失败({{ hazardFailedPaths.length }})
          </button>
          <button class="footer-action-btn secondary-btn" @click="fetchHazardImages">刷新</button>
          <view v-if="selectedHazardIds.length" class="hazard-selected-info">
            <text>已选 {{ selectedHazardIds.length }} 张</text>
            <text class="hazard-clear" @click="clearSelectedHazards">清空</text>
          </view>
        </view>

        <scroll-view scroll-y class="hazard-body">
          <view v-if="hazardImageList.length === 0" class="empty-tip">暂无图片，请先上传</view>
          <view v-else class="hazard-grid">
            <view v-for="img in hazardImageList" :key="img.id" class="hazard-item">
              <image class="hazard-thumb" :src="assetUrl(img.file_path)" mode="aspectFill" @click="previewImage(assetUrl(img.file_path))" />
              <view
                class="hazard-select"
                :class="{ active: selectedHazardIds.includes(img.id) }"
                @click.stop="toggleHazardSelect(img)"
              >
                <text v-if="selectedHazardIds.includes(img.id)" class="hazard-select-icon">✓</text>
              </view>
              <view class="hazard-meta">
                <text class="hazard-name">{{ img.original_name || ('图片 #' + img.id) }}</text>
                <button class="hazard-del" @click.stop="deleteHazardImage(img)">删除</button>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 删除确认弹窗：H5 下避免 uni.showModal 被遮罩层盖住 -->
    <view v-if="showHazardDeleteConfirm" class="confirm-mask" @click="showHazardDeleteConfirm = false">
      <view class="confirm-card" @click.stop="">
        <text class="confirm-title">确认删除</text>
        <text class="confirm-content">删除后无法恢复，且可能影响关联分析/报告</text>
        <view class="confirm-actions">
          <button class="confirm-btn cancel" @click="showHazardDeleteConfirm = false">取消</button>
          <button class="confirm-btn danger" :disabled="hazardDeleting" @click="confirmDeleteHazardImage">删除</button>
        </view>
      </view>
    </view>

    <!-- 移动端侧边栏遮罩 -->
    <view v-if="showSidebar" class="sidebar-mask" @click="showSidebar = false"></view>
  </view>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { apiUrl, assetUrl, clearLoginSession, getStoredUser, request } from '../../common/api-config'

const user = ref({})
const prompt = ref('')
const imagePath = ref('')
const messages = ref([])
const loading = ref(false)
const currentSessionId = ref(null)
const currentSessionTitle = ref('新对话')
const sessionList = ref([])
const showSidebar = ref(false)
const lastMessageId = ref('')
const showEnterpriseModal = ref(false)
const enterpriseForm = ref({ name: '', region: '', address: '', contact: '', phone: '', project_name: '', industry: '', inspector_name: '' })
const showHazardImageModal = ref(false)
const hazardImageList = ref([])
const hazardUploading = ref(false)
const hazardFailedPaths = ref([])
const showHazardDeleteConfirm = ref(false)
const hazardDeleting = ref(false)
const pendingHazardDelete = ref(null)
const savingResult = ref(false)
const selectedHazardIds = ref([])
const currentRequestTask = ref(null)
const modelList = ref([])
const selectedModelId = ref(null)
const selectedModelIndex = ref(0)

// 尝试解析结构化数据 (9.6 智能隐患分析模块)
const parseStructuredData = (content) => {
  if (!content) return null
  try {
    let text = content.trim()
    if (text.startsWith('```json')) {
      text = text.substring(7)
    } else if (text.startsWith('```')) {
      text = text.substring(3)
    }
    if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3)
    }
    const data = JSON.parse(text)
    // 兼容两种结构：
    // 1) 单条结构化：{ hazard_description, basis, suggestion }
    // 2) 多图结构化：{ items: [{ image_id, hazard_description, basis, suggestion }] }
    if (data && typeof data === 'object') {
      if (Array.isArray(data.items)) {
        return {
          mode: 'multi',
          items: data.items
        }
      }
      if (data.hazard_description) {
        return {
          mode: 'single',
          hazard_description: data.hazard_description,
          basis: data.basis || '',
          suggestion: data.suggestion || ''
        }
      }
    }
  } catch (e) {
    // 解析失败则视为普通文本
  }
  return null
}

// 开始编辑结果
const startEditResult = (msg) => {
  const data = parseStructuredData(msg.content)
  if (data) {
    msg.isEditing = true
    msg.editData = JSON.parse(JSON.stringify(data))
  }
}

// 取消编辑结果
const cancelEditResult = (msg) => {
  msg.isEditing = false
  msg.editData = null
}

// 保存编辑结果
const saveEditResult = (msg) => {
  if (!msg.id) return uni.showToast({ title: '无法保存，缺少记录ID', icon: 'none' })
  savingResult.value = true
  const payload = msg.editData?.mode === 'multi'
    ? { items: msg.editData.items }
    : { hazard_description: msg.editData.hazard_description, basis: msg.editData.basis, suggestion: msg.editData.suggestion }
  const newContent = JSON.stringify(payload, null, 2)
  uni.request({
    url: apiUrl('/api/history/update-result'),
    method: 'POST',
    data: {
      id: msg.id,
      user_id: user.value.id,
      result: newContent
    },
    success: (res) => {
      if (res.data.success) {
        msg.content = newContent
        msg.isEditing = false
        msg.editData = null
        if (res.data.wordPath) msg.wordPath = res.data.wordPath
        if (res.data.pdfPath) msg.pdfPath = res.data.pdfPath
        uni.showToast({ title: '保存成功', icon: 'success' })
      } else {
        uni.showToast({ title: res.data.message || '保存失败', icon: 'none' })
      }
    },
    fail: () => uni.showToast({ title: '网络错误，请稍后重试', icon: 'none' }),
    complete: () => savingResult.value = false
  })
}

onMounted(() => {
  const storedUser = getStoredUser()
  if (storedUser && storedUser.id) {
    user.value = storedUser
    fetchModelList()
    fetchSessions()
    fetchEnterpriseInfo()
    fetchHazardImages()
  } else {
    clearLoginSession()
    uni.reLaunch({ url: '/pages/login/login' })
  }
})

/**
 * 打开隐患图片弹窗
 * 弹窗内支持上传、预览、删除与刷新列表
 */
const openHazardImageModal = () => {
  showHazardImageModal.value = true
  fetchHazardImages()
}

/**
 * 获取隐患图片列表
 * @returns {void}
 */
const fetchHazardImages = () => {
  if (!user.value?.id) return
  uni.request({
    url: apiUrl(`/api/hazard/images/list/${user.value.id}`),
    method: 'GET',
    success: (res) => {
      if (res.data?.success) hazardImageList.value = res.data.data || []
    }
  })
}

/**
 * 选择图片并上传（支持多选）
 * @returns {void}
 */
const pickHazardImages = () => {
  if (hazardUploading.value) return
  uni.chooseImage({
    count: 9,
    success: async (res) => {
      const files = res.tempFilePaths || []
      if (!files.length) return
      hazardFailedPaths.value = []
      await uploadHazardImages(files)
    }
  })
}

/**
 * 逐个上传图片，提供明确的加载反馈与失败提示（9.5 性能/交互要求）
 * @param {string[]} filePaths
 * @returns {Promise<void>}
 */
const uploadHazardImages = async (filePaths) => {
  hazardUploading.value = true
  uni.showLoading({ title: '上传中...' })
  const uploadedIds = []

  try {
    for (const fp of filePaths) {
      const ok = await new Promise((resolve) => {
        const task = uni.uploadFile({
          url: apiUrl('/api/hazard/images/upload'),
          filePath: fp,
          name: 'files',
          formData: { user_id: user.value.id, enterprise_id: currentEnterpriseId.value || '' },
          success: (res) => {
            let data
            try {
              data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            } catch (e) {
              data = null
            }
            if (res.statusCode >= 200 && res.statusCode < 300 && data && data.success) {
              const created = Array.isArray(data.data) ? data.data : []
              created.forEach((item) => {
                if (item?.id) uploadedIds.push(Number(item.id))
              })
              resolve(true)
            } else {
              resolve(false)
            }
          },
          fail: () => resolve(false)
        })
      })
      if (!ok) hazardFailedPaths.value.push(fp)
    }
    fetchHazardImages()
    if (hazardFailedPaths.value.length) {
      uni.showToast({ title: `部分失败：${hazardFailedPaths.value.length} 张`, icon: 'none' })
    } else {
      uni.showToast({ title: '上传完成', icon: 'success' })
    }
  } finally {
    uni.hideLoading()
    hazardUploading.value = false
  }

  return uploadedIds
}

/**
 * 重试失败的上传任务
 * @returns {Promise<void>}
 */
const retryFailedUploads = async () => {
  const pending = hazardFailedPaths.value.slice()
  if (!pending.length) return
  hazardFailedPaths.value = []
  await uploadHazardImages(pending)
}

/**
 * 删除隐患图片（包含二次确认）
 * @param {{id:number, file_path:string}} img
 * @returns {void}
 */
const deleteHazardImage = (img) => {
  pendingHazardDelete.value = img
  showHazardDeleteConfirm.value = true
}

/**
 * 确认删除隐患图片
 * @returns {void}
 */
const confirmDeleteHazardImage = () => {
  const img = pendingHazardDelete.value
  if (!img?.id || hazardDeleting.value) return
  hazardDeleting.value = true

  uni.request({
    url: apiUrl('/api/hazard/images/delete'),
    method: 'POST',
    data: { user_id: user.value.id, id: img.id },
    success: (res) => {
      if (res.data?.success) {
        uni.showToast({ title: '已删除' })
        fetchHazardImages()
        showHazardDeleteConfirm.value = false
        pendingHazardDelete.value = null
      } else {
        uni.showToast({ title: res.data?.message || '删除失败', icon: 'none' })
      }
    },
    fail: () => uni.showToast({ title: '网络错误，请稍后重试', icon: 'none' }),
    complete: () => {
      hazardDeleting.value = false
    }
  })
}

/**
 * 处理省市区滑动选择
 * 将选择的数组拼接为 陕西省-西安市-雁塔区 格式存储
 */
const onRegionChange = (e) => {
  enterpriseForm.value.region = e.detail.value.join('-')
}

/**
 * 获取企业基础信息
 * 检查员登录后自动调用，用于在侧边栏和报告生成中回显
 */
// 获取可用模型列表
const fetchModelList = () => {
  uni.request({
    url: apiUrl('/api/models/list'),
    method: 'GET',
    success: (res) => {
      const data = res.data?.data || res.data || []
      if (Array.isArray(data) && data.length) {
        modelList.value = [
          { id: null, label: '默认模型' },
          ...data.map((m) => ({ id: m.id, label: m.name + ' (' + m.model_name + ')' })),
        ]
      } else {
        modelList.value = [{ id: null, label: '默认模型' }]
      }
    },
    fail: () => {
      modelList.value = [{ id: null, label: '默认模型' }]
    },
  })
}

// 模型切换
const onModelChange = (e) => {
  selectedModelIndex.value = e.detail.value
  selectedModelId.value = modelList.value[e.detail.value]?.id || null
}

/** 当前用户所属企业 ID，用于隐患图片上传和 AI 分析时自动关联 */
const currentEnterpriseId = ref(null)

const fetchEnterpriseInfo = () => {
  uni.request({
    url: apiUrl('/api/enterprise/get'),
    method: 'POST',
    data: { user_id: user.value.id },
    success: (res) => {
      if (res.data.success) {
        const d = res.data
        enterpriseForm.value = d.data && typeof d.data === 'object' && Object.keys(d.data).length
          ? d.data
          : { name: d.name || '', region: d.region || '', address: d.address || '', contact: d.contact || '', phone: d.phone || '', project_name: d.project_name || '', industry: d.industry || '', inspector_name: d.inspector_name || '' }
        /** 保存企业 ID 用于后续上传和分析时自动关联 */
        currentEnterpriseId.value = d.id || null
      }
    }
  })
}

/**
 * 保存或更新企业信息
 * 包含表单校验和持久化存储，并记录操作日志
 */
const saveEnterpriseInfo = () => {
  // 基础表单校验
  if (!enterpriseForm.value.name) return uni.showToast({ title: '请输入企业名称', icon: 'none' })
  if (!enterpriseForm.value.region) return uni.showToast({ title: '请选择所在地区', icon: 'none' })
  if (!enterpriseForm.value.address) return uni.showToast({ title: '请输入详细地址', icon: 'none' })
  if (!enterpriseForm.value.contact) return uni.showToast({ title: '请输入联系人', icon: 'none' })
  if (!enterpriseForm.value.phone) return uni.showToast({ title: '请输入联系电话', icon: 'none' })

  uni.showLoading({ title: '保存中...' })
  uni.request({
    url: apiUrl('/api/enterprise/update'),
    method: 'POST',
    data: { user_id: user.value.id, ...enterpriseForm.value },
    success: (res) => {
      uni.hideLoading()
      if (res.data.success) {
        uni.showToast({ title: '已更新企业信息' })
        showEnterpriseModal.value = false // 保存成功后关闭弹窗
      }
    },
    fail: () => {
      uni.hideLoading()
      uni.showToast({ title: '网络请求失败，请稍后重试', icon: 'none' })
    }
  })
}

// 获取会话列表
const fetchSessions = () => {
  uni.request({
    url: apiUrl(`/api/sessions/${user.value.id}`),
    success: (res) => {
      if (res.data.success) {
        sessionList.value = res.data.data
      }
    }
  })
}

// 加载特定会话
const loadSession = (sessionId) => {
  currentSessionId.value = sessionId
  const session = sessionList.value.find(s => s.session_id === sessionId)
  currentSessionTitle.value = session ? session.title : '对话详情'
  
  uni.request({
    url: apiUrl(`/api/session/${sessionId}`),
    success: (res) => {
      if (res.data.success) {
        messages.value = res.data.data.map(item => [
          { role: 'user', content: item.prompt, image: item.image_path ? assetUrl(item.image_path) : null },
          { 
            id: item.id,
            role: 'assistant', 
            content: item.result, 
            wordPath: item.word_path, 
            pdfPath: item.pdf_path,
            isEditing: false,
            editData: null
          }
        ]).flat()
        scrollToBottom()
      }
    }
  })
  if (uni.getSystemInfoSync().windowWidth < 768) showSidebar.value = false
}

// 开启新对话
const startNewChat = () => {
  currentSessionId.value = null
  currentSessionTitle.value = '新对话'
  messages.value = []
  prompt.value = ''
  imagePath.value = ''
  if (uni.getSystemInfoSync().windowWidth < 768) showSidebar.value = false
}

// 删除会话
const deleteSession = (sessionId) => {
  uni.showModal({
    title: '确认删除',
    content: '删除后无法找回对话内容',
    success: (res) => {
      if (res.confirm) {
        uni.request({
          url: apiUrl('/api/session/delete'),
          method: 'POST',
          data: { session_id: sessionId },
          success: () => {
            fetchSessions()
            if (currentSessionId.value === sessionId) startNewChat()
          }
        })
      }
    }
  })
}

// 处理 AI 对话
// 发送/分析入口（9.5+9.6：支持单图/多图隐患分析，且可手动停止请求）
const handleSend = () => {
  if (loading.value) return
  if (!prompt.value && !imagePath.value && selectedHazardIds.value.length === 0) return

  const suffix = selectedHazardIds.value.length ? `\n（已选择隐患照片：${selectedHazardIds.value.length} 张）` : ''
  const userMsg = { role: 'user', content: `${prompt.value || ''}${suffix}`.trim(), image: imagePath.value }
  messages.value.push(userMsg)
  const currentPrompt = prompt.value
  const currentImage = imagePath.value
  const selectedIds = selectedHazardIds.value.slice()
  
  prompt.value = ''
  imagePath.value = ''
  loading.value = true
  scrollToBottom()

  currentRequestTask.value = null

  if (currentImage) {
    // 单图即时分析：沿用 /api/process（上传图片）
    const uploadTask = uni.uploadFile({
      url: apiUrl('/api/process'),
      filePath: currentImage,
      name: 'file',
      formData: {
        user_id: user.value.id,
        prompt: currentPrompt,
        session_id: currentSessionId.value,
        model_id: selectedModelId.value || '',
      },
      success: (res) => handleResponse(JSON.parse(res.data)),
      fail: () => handleError(),
      complete: () => {
        currentRequestTask.value = null
        loading.value = false
      }
    })
    currentRequestTask.value = uploadTask
    return
  }

  if (selectedIds.length) {
    // 多图隐患分析（9.5 + 9.6）：使用已上传的隐患照片进行一次性分析
    const reqTask = uni.request({
      url: apiUrl('/api/hazard/analyze'),
      method: 'POST',
      data: {
        user_id: user.value.id,
        prompt: currentPrompt,
        session_id: currentSessionId.value,
        image_ids: selectedIds,
        enterprise_id: currentEnterpriseId.value || null,
        model_id: selectedModelId.value || '',
      },
      success: (res) => handleResponse(res.data),
      fail: () => handleError(),
      complete: () => {
        currentRequestTask.value = null
        loading.value = false
      }
    })
    currentRequestTask.value = reqTask
    return
  }

  // 纯文本对话：沿用 /api/process
  const reqTask = uni.request({
    url: apiUrl('/api/process'),
    method: 'POST',
    data: {
      user_id: user.value.id,
      prompt: currentPrompt,
      session_id: currentSessionId.value,
      model_id: selectedModelId.value || '',
    },
    success: (res) => handleResponse(res.data),
    fail: () => handleError(),
    complete: () => {
      currentRequestTask.value = null
      loading.value = false
    }
  })
  currentRequestTask.value = reqTask
}

const handleResponse = (data) => {
  if (!data) {
    uni.showToast({ title: '服务器返回异常', icon: 'none' })
    return
  }
  
  if (data.success) {
    messages.value.push({
      id: data.id,
      role: 'assistant',
      content: data.result,
      wordPath: data.wordPath,
      pdfPath: data.pdfPath,
      isEditing: false,
      editData: null
    })
    currentSessionId.value = data.sessionId
    fetchSessions()
    scrollToBottom()
  } else {
    uni.showToast({ title: data.msg || data.message || '处理失败', icon: 'none' })
  }
}

const handleError = (err) => {
  console.error('Request Error:', err)
  uni.showToast({ title: '网络连接超时或错误', icon: 'none' })
}

// 手动停止本次请求（模拟豆包的“停止生成/停止分析”体验）
const stopCurrentRequest = () => {
  if (!loading.value) return
  try {
    currentRequestTask.value?.abort?.()
  } catch (e) {}
  currentRequestTask.value = null
  loading.value = false
  uni.showToast({ title: '已停止', icon: 'none' })
}

// 多图分析选择：切换选中状态
const toggleHazardSelect = (img) => {
  if (!img?.id) return
  const id = Number(img.id)
  const idx = selectedHazardIds.value.indexOf(id)
  if (idx >= 0) selectedHazardIds.value.splice(idx, 1)
  else selectedHazardIds.value.push(id)
}

// 清空多图分析选择
const clearSelectedHazards = () => {
  selectedHazardIds.value = []
}

const scrollToBottom = () => {
  nextTick(() => {
    // 强制触发重绘以确保滚动生效
    lastMessageId.value = ''
    setTimeout(() => {
      lastMessageId.value = 'bottom-anchor'
    }, 50)
  })
}

const handlePickImage = () => {
  uni.chooseImage({
    count: 9,
    success: async (res) => {
      const files = res.tempFilePaths || []
      if (!files.length) return
      hazardFailedPaths.value = []
      const uploadedIds = await uploadHazardImages(files)
      if (uploadedIds.length) {
        selectedHazardIds.value = Array.from(new Set([
          ...selectedHazardIds.value,
          ...uploadedIds,
        ]))
        imagePath.value = ''
      }
    }
  })
}

const previewImage = (url) => {
  uni.previewImage({ urls: [url] })
}

const handleDownload = (path) => {
  if (!path) return
  const url = assetUrl(path)
  // #ifdef H5
  window.open(url)
  // #endif
  // #ifndef H5
  uni.downloadFile({
    url,
    success: (res) => {
      uni.openDocument({ filePath: res.tempFilePath })
    }
  })
  // #endif
}

const handleLogout = () => {
  request({
    url: apiUrl('/api/logout'),
    method: 'POST',
  }).finally(() => {
    clearLoginSession()
    uni.reLaunch({ url: '/pages/login/login' })
  })
}

const toggleUserMenu = () => {
  // 可以在这里实现用户菜单弹出逻辑，或者暂时留空
  console.log('Toggle user menu')
}

const goToAdmin = () => {
  uni.showActionSheet({
    itemList: ['用户管理', '知识库管理', 'AI模型配置', '操作日志', '企业数据查询', '报告模板', '数据备份'],
    success: (res) => {
      const pages = ['users', 'knowledge', 'model-config', 'logs', 'enterprises', 'templates', 'backup']
      const page = pages[res.tapIndex]
      if (page) uni.navigateTo({ url: `/pages/admin/${page}` })
    }
  })
}
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  background-color: #f7f7f8;
  overflow: hidden;
}

/* 侧边栏样式 */
.sidebar {
  width: 260px;
  background-color: #202123;
  color: white;
  display: flex;
  flex-direction: column;
  padding: 10px;
  transition: transform 0.3s;
  z-index: 100;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    height: 100%;
    transform: translateX(-100%);
  }
  .sidebar-active {
    transform: translateX(0);
  }
}

.new-chat-btn {
  display: flex;
  align-items: center;
  padding: 12px;
  border: 1px solid #4d4d4f;
  border-radius: 5px;
  margin-bottom: 15px;
  cursor: pointer;
  transition: background 0.2s;
}

.new-chat-btn:hover {
  background-color: #2b2c2f;
}

.new-chat-btn .icon {
  margin-right: 10px;
  font-size: 20px;
}

.history-list {
  flex: 1;
}

.history-item {
  padding: 10px 12px;
  margin-bottom: 5px;
  border-radius: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.history-item:hover {
  background-color: #2b2c2f;
}

.item-active {
  background-color: #343541;
}

.history-title {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.delete-icon {
  padding: 0 5px;
  color: #8e8ea0;
  opacity: 0;
  transition: opacity 0.2s;
}

.history-item:hover .delete-icon {
  opacity: 1;
}

.sidebar-footer {
  padding-top: 10px;
  border-top: 1px solid #4d4d4f;
  margin-top: auto; /* 确保它贴紧底部 */
}

.user-info {
  display: flex;
  align-items: center;
  padding: 12px;
  margin-top: 5px;
  border-radius: 6px;
  transition: background 0.2s;
}
.user-info:hover { background-color: #2b2c2f; }

.avatar {
  width: 32px;
  height: 32px;
  background-color: #0d6efd;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
}

.footer-btns {
  margin-bottom: 5px;
}
.footer-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  color: #ececf1;
  font-size: 14px;
  transition: background 0.2s;
}
.action-btn {
  background-color: #343541; /* 给予它一定的背景色区别于侧边栏 */
  margin-bottom: 8px;
}
.footer-btn:hover { 
  background-color: #3e3f4b; 
}

/* -----------------------------------------------------------
   企业信息管理专业表单样式 (高度还原移动端请假表单风格)
----------------------------------------------------------- */
.form-modal-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: #f5f6f8; /* 浅灰色背景，类似页面背景 */
  z-index: 3000;
  display: flex;
  flex-direction: column;
}

.form-modal-content {
  background: transparent;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 弹窗头部：带返回按钮 */
.form-header {
  height: 56px;
  background: #ffffff;
  display: flex;
  align-items: center;
  padding: 0 15px;
  position: relative;
  flex-shrink: 0;
}

.header-title {
  font-size: 18px;
  font-weight: 500;
  color: #333333;
  flex: 1;
  text-align: center;
}

.cancel-btn {
  position: absolute;
  left: 15px;
  font-size: 24px;
  color: #333;
  padding: 5px 10px 5px 0;
}

/* 表单主体 */
.form-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* 分组块样式 (白色卡片) */
.form-section {
  background: #ffffff;
  border-radius: 8px;
  padding: 0 15px;
  margin-bottom: 12px;
}

/* 单个表单项 */
.form-item {
  display: flex;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
}

.border-none {
  border-bottom: none;
}

.item-label {
  width: 110px;
  font-size: 15px;
  color: #333333;
  display: flex;
  align-items: center;
}

.required {
  color: #4c83f3; /* 蓝色星号 */
  margin-right: 4px;
  font-size: 16px;
}

.item-input {
  flex: 1;
  font-size: 15px;
  color: #333333;
  text-align: right;
}

.placeholder {
  color: #bbbbbb;
  font-size: 15px;
}

/* 地区选择器展示样式 */
.picker-container {
  flex: 1;
  display: flex;
  justify-content: flex-end;
}

.picker-value {
  font-size: 15px;
  color: #333333;
  display: flex;
  align-items: center;
}

.picker-value.placeholder {
  color: #bbbbbb;
}

.arrow {
  margin-left: 6px;
  color: #cccccc;
  font-size: 16px;
}

/* 多行文本输入区 */
.form-item-vertical {
  display: flex;
  flex-direction: column;
  padding: 16px 0;
}

.form-item-vertical .item-label {
  width: 100%;
  margin-bottom: 10px;
}

.textarea-wrapper {
  background: #f8f9fb;
  border-radius: 6px;
  padding: 12px;
  position: relative;
}

.item-textarea {
  width: 100%;
  height: 80px;
  font-size: 14px;
  color: #333;
  line-height: 1.5;
}

.word-count {
  position: absolute;
  bottom: 10px;
  right: 12px;
  font-size: 12px;
  color: #999;
}

/* 底部操作区 */
.form-footer {
  padding: 15px 20px 25px;
  background: #f5f6f8;
  display: flex;
  gap: 15px;
}

.footer-action-btn {
  flex: 1;
  height: 44px;
  line-height: 44px;
  border-radius: 6px;
  font-size: 16px;
  text-align: center;
  border: none;
}

.primary-btn {
  background: #4c83f3;
  color: #ffffff;
}

.secondary-btn {
  background: #ffffff;
  color: #4c83f3;
  border: 1px solid #4c83f3;
}

.primary-btn:active, .secondary-btn:active {
  opacity: 0.8;
}

.hazard-toolbar {
  padding: 12px;
  background: #f5f6f8;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.hazard-body {
  flex: 1;
  padding: 12px;
}

.empty-tip {
  text-align: center;
  color: #999;
  padding: 30px 0;
  font-size: 14px;
}

.hazard-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.hazard-item {
  width: calc(50% - 6px);
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.hazard-thumb {
  width: 100%;
  height: 120px;
  background: #eee;
}

.hazard-meta {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.hazard-name {
  flex: 1;
  font-size: 12px;
  color: #333;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hazard-del {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 12px;
  color: #ff4d4f;
}

.confirm-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 3200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.confirm-card {
  width: 100%;
  max-width: 320px;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
}

.confirm-title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #111;
  margin-bottom: 8px;
  text-align: center;
}

.confirm-content {
  display: block;
  font-size: 13px;
  color: #666;
  line-height: 1.6;
  margin-bottom: 14px;
}

.confirm-actions {
  display: flex;
  gap: 12px;
}

.confirm-btn {
  flex: 1;
  height: 40px;
  line-height: 40px;
  border-radius: 10px;
  font-size: 14px;
  border: none;
}

.confirm-btn.cancel {
  background: #f1f3f5;
  color: #111;
}

.confirm-btn.danger {
  background: #ff4d4f;
  color: #fff;
}

/* --- 原有主内容样式 --- */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden; /* 防止主区域溢出 */
}

.header {
  height: 50px;
  display: flex;
  align-items: center;
  padding: 0 15px;
  background-color: #fff;
  border-bottom: 1px solid #eee;
  flex-shrink: 0; /* 禁止头部压缩 */
}

.menu-toggle {
  font-size: 20px;
  margin-right: 15px;
  cursor: pointer;
}

.header-title {
  flex: 1;
  font-weight: bold;
  text-align: center;
}

.chat-flow-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.chat-flow {
  height: 100%;
}

.welcome-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 10vh;
}

.welcome-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 30px;
}

.guide-cards {
  display: flex;
  gap: 15px;
}

.guide-card {
  padding: 15px 20px;
  background-color: white;
  border: 1px solid #eee;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s;
}

.guide-card:hover {
  background-color: #f7f7f8;
}

.message-wrapper {
  padding: 20px 15%;
  width: 100%;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .message-wrapper {
    padding: 15px 5%;
  }
}

.message-user {
  display: flex;
  justify-content: flex-end;
}

.message-ai {
  display: flex;
}

.ai-avatar {
  width: 30px;
  height: 30px;
  background-color: #10a37f;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15px;
}

.message-bubble {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 15px;
  line-height: 1.6;
}

.message-user .message-bubble {
  background-color: #0d6efd;
  color: white;
}

.message-ai .message-bubble {
  background-color: #f7f7f8;
  border: 1px solid #eee;
}

.message-image {
  max-width: 200px;
  max-height: 200px;
  display: block;
  margin-bottom: 10px;
  border-radius: 5px;
}

.file-links {
  margin-top: 10px;
  display: flex;
  gap: 15px;
}

.file-link {
  color: #0d6efd;
  font-size: 12px;
  cursor: pointer;
}

/* 输入框样式 */
.input-container {
  padding: 10px 15% 30px; /* 增加底部间距 */
  background: #f7f7f8;
  flex-shrink: 0; /* 禁止输入框压缩 */
}

@media (max-width: 768px) {
  .input-container {
    padding: 10px 5% 20px;
  }
}

.input-wrapper {
  background: white;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 8px 12px;
  display: flex;
  align-items: flex-end;
  box-shadow: 0 5px 15px rgba(0,0,0,0.05);
}

.attachment-btn {
  padding: 8px;
  cursor: pointer;
  color: #8e8ea0;
}

.chat-input {
  flex: 1;
  padding: 8px;
  min-height: 24px;
  max-height: 200px;
  font-size: 15px;
}

.selected-hazard-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
  font-size: 12px;
  color: #555;
}

.clear-link {
  color: #0d6efd;
}

.send-btn {
  width: 52px;
  height: 32px;
  background-color: #0d6efd;
  color: white;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.2s;
  font-size: 13px;
}

.btn-disabled {
  background-color: #acacbe;
  cursor: not-allowed;
}

.footer-tip {
  display: block;
  text-align: center;
  font-size: 11px;
  color: #8e8ea0;
  margin-top: 10px;
}

.sidebar-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 90;
}

/* 9.6 结构化输出样式 */
.structured-result {
  background: #ffffff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.struct-item {
  margin-bottom: 12px;
}

.struct-label {
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 4px;
}

.struct-value {
  color: #555;
  line-height: 1.5;
  word-break: break-all;
}

.struct-textarea {
  width: 100%;
  min-height: 60px;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #f9f9f9;
  font-size: 14px;
  color: #333;
  box-sizing: border-box;
}

.struct-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 15px;
}

.mini-btn {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  border: none;
}

.edit-btn {
  background: #f0f0f0;
  color: #333;
}

.cancel-btn {
  background: #ffebeb;
  color: #e53935;
}

.save-btn {
  background: #0d6efd;
  color: white;
}

.send-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-left: 10px;
}

/* 9.5 多图选择：隐患图片选中态展示 */
.hazard-selected-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
  font-size: 12px;
  color: #555;
}

.hazard-clear {
  color: #0d6efd;
}

.hazard-item {
  position: relative;
}

.hazard-select {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.9);
  background: rgba(0,0,0,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hazard-select.active {
  background: rgba(16,163,127,0.85);
  border-color: rgba(16,163,127,1);
}

.hazard-select-icon {
  color: #fff;
  font-size: 14px;
  line-height: 1;
}
</style>
