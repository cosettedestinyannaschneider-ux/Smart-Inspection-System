<template>
  <AdminShell active-key="templates" title="报告模板" wide @ready="handleAdminReady">
    <view class="page-heading">
      <view class="heading-copy">
        <text class="heading-title">报告模板</text>
        <text class="heading-description">上传、切换和下载报告模板，默认模板会直接参与新的 Word 报告生成。</text>
      </view>
      <view class="page-actions">
        <view class="secondary-btn" @click="fetchTemplates">刷新列表</view>
        <view class="primary-btn" @click="openAdd">上传模板</view>
      </view>
    </view>

    <view class="summary-grid">
      <view class="summary-card">
        <text class="summary-value">{{ list.length }}</text>
        <text class="summary-label">模板总数</text>
      </view>
      <view class="summary-card">
        <text class="summary-value green">{{ availableTemplateCount }}</text>
        <text class="summary-label">可用模板</text>
      </view>
      <view class="summary-card active-summary">
        <text class="summary-value active-name">{{ defaultTemplate?.name || '未设置默认模板' }}</text>
        <text class="summary-label">当前默认模板</text>
      </view>
    </view>

    <view class="notice-card" :class="{ warning: defaultTemplate && !defaultTemplate.has_file }">
      <text class="notice-title">
        {{ defaultTemplate ? '报告生成模板状态' : '当前尚未上传报告模板' }}
      </text>
      <text class="notice-desc">
        {{
          defaultTemplate
            ? (defaultTemplate.has_file
              ? '新的排查报告会优先使用当前默认模板；若模板异常，系统仍会回退到内置模板。'
              : '当前默认模板缺少可用文件，系统会回退到内置模板，建议尽快补传 DOCX 文件。')
            : '上传首个 DOCX 模板后，系统会自动将其设为默认模板。'
        }}
      </text>
    </view>

    <view v-if="list.length === 0" class="empty-card">
      <text class="empty-title">暂无报告模板</text>
      <text class="empty-desc">请上传 DOCX 模板文件，后端会在生成报告时优先使用默认模板。</text>
    </view>

    <view v-else class="template-grid">
      <view v-for="item in list" :key="item.id" class="template-card" :class="{ active: item.is_default }">
        <view class="template-head">
          <view class="file-icon">DOCX</view>
          <view class="template-copy">
            <view class="title-row">
              <text class="template-name">{{ item.name }}</text>
              <text v-if="item.is_default" class="default-tag">默认模板</text>
            </view>
            <text class="template-desc">{{ item.description || '暂无模板说明' }}</text>
          </view>
        </view>

        <view class="meta-list">
          <view class="meta-row">
            <text class="meta-label">文件状态</text>
            <text class="meta-value" :class="{ danger: !item.has_file }">{{ item.has_file ? '已上传' : '未上传' }}</text>
          </view>
          <view class="meta-row">
            <text class="meta-label">文件名称</text>
            <text class="meta-value ellipsis">{{ item.file_name || '暂无文件' }}</text>
          </view>
          <view class="meta-row">
            <text class="meta-label">更新时间</text>
            <text class="meta-value">{{ item.updated_at || '-' }}</text>
          </view>
        </view>

        <view class="card-actions">
          <text v-if="item.has_file" class="action-link" @click="downloadTemplate(item)">下载</text>
          <text v-if="!item.is_default" class="action-link success-link" @click="activateTemplate(item)">设为默认</text>
          <text class="action-link" @click="openEdit(item)">编辑</text>
          <text class="action-link dangerous" @click="deleteTemplate(item)">删除</text>
        </view>
      </view>
    </view>

    <view v-if="showModal" class="modal-mask" @click="closeModal">
      <view class="modal-panel" @click.stop="">
        <view class="modal-header">
          <view>
            <text class="modal-title">{{ isEdit ? '编辑报告模板' : '上传报告模板' }}</text>
            <text class="modal-desc">仅支持 DOCX 文件；默认模板会直接参与新的 Word 报告生成。</text>
          </view>
          <text class="modal-close" @click="closeModal">×</text>
        </view>

        <scroll-view scroll-y class="modal-body">
          <view class="form-item">
            <text class="form-label">模板名称</text>
            <input v-model="form.name" class="form-input" maxlength="100" placeholder="请输入模板名称" />
          </view>

          <view class="form-item">
            <text class="form-label">模板说明</text>
            <textarea v-model="form.description" class="form-textarea" maxlength="300" placeholder="请输入模板适用场景或版本说明" />
          </view>

          <view class="form-item">
            <text class="form-label">模板文件</text>
            <view class="file-picker" @click="pickFile">
              <text class="file-name">{{ currentFileLabel }}</text>
              <text class="file-action">{{ form.selectedFileName ? '重新选择' : (isEdit ? '更换文件' : '选择文件') }}</text>
            </view>
            <text v-if="isEdit && form.existingFileName && !form.selectedFileName" class="file-hint">
              当前文件：{{ form.existingFileName }}
            </text>
          </view>
        </scroll-view>

        <view class="modal-footer">
          <view class="secondary-btn" @click="closeModal">取消</view>
          <view class="save-btn" @click="saveTemplate">{{ isEdit ? '保存修改' : '上传模板' }}</view>
        </view>
      </view>
    </view>
  </AdminShell>
</template>

<script setup>
import { computed, ref } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { apiUrl, fileUrl, getAccessToken, request, unwrapResponse, uploadFile } from '../../common/api-config'

/** 当前管理员信息 */
const user = ref({})
/** 报告模板列表 */
const list = ref([])
/** 列表加载状态 */
const loading = ref(false)
/** 表单提交状态 */
const submitting = ref(false)
/** 模板弹窗显示状态 */
const showModal = ref(false)
/** 当前是否处于编辑模式 */
const isEdit = ref(false)

/** 创建空白模板表单 */
const createForm = () => ({
  id: null,
  name: '',
  description: '',
  existingFileName: '',
  selectedFile: null,
  selectedFileName: '',
})

/** 当前模板表单 */
const form = ref(createForm())
/** 当前默认模板 */
const defaultTemplate = computed(() => list.value.find((item) => item.is_default) || null)
/** 当前可用模板数量 */
const availableTemplateCount = computed(() => list.value.filter((item) => item.has_file).length)
/** 当前文件选择提示 */
const currentFileLabel = computed(() => {
  if (form.value.selectedFileName) return form.value.selectedFileName
  if (form.value.existingFileName) return form.value.existingFileName
  return isEdit.value ? '点击更换 DOCX 模板文件' : '点击选择 DOCX 模板文件'
})

/** 统一显示提示 */
const showMessage = (title, icon = 'none') => {
  uni.showToast({ title, icon })
}

/** 判断文件名是否为 DOCX */
const isDocxName = (name) => /\.docx$/i.test(String(name || '').trim())

/** 统一处理后端 JSON 响应 */
const ensureResponse = (response, fallbackMessage) => {
  const result = unwrapResponse(response)
  if (!result.ok) throw new Error(result.msg || fallbackMessage)
  return result
}

/** 通用管理员 JSON 请求 */
const postAdmin = async (path, payload = {}) => {
  const response = await request({
    url: apiUrl(path),
    method: 'POST',
    data: payload,
  })
  return ensureResponse(response, '请求失败')
}

/** 解析上传接口响应 */
const parseUploadResponse = (response) => {
  const payload = typeof response?.data === 'string' ? JSON.parse(response.data) : (response?.data ?? response)
  return ensureResponse({ data: payload }, '上传失败')
}

/** 构建模板上传表单字段 */
const buildTemplatePayload = () => {
  const payload = {
    name: String(form.value.name || '').trim(),
    description: String(form.value.description || '').trim(),
  }
  if (isEdit.value && form.value.id) payload.id = String(form.value.id)
  return payload
}

/** 统一保存已选择的模板文件 */
const applySelectedFile = (file, customName = '') => {
  const fileName = String(customName || file?.name || file?.originalFile?.name || '').trim()
  if (!fileName || !isDocxName(fileName)) {
    showMessage('仅支持选择 DOCX 模板文件')
    return
  }
  form.value.selectedFile = file
  form.value.selectedFileName = fileName
}

/** 公共框架鉴权完成后加载模板列表 */
const handleAdminReady = async (admin) => {
  user.value = admin
  await fetchTemplates()
}

/** 加载模板列表 */
const fetchTemplates = async () => {
  if (loading.value) return
  loading.value = true
  try {
    const result = await postAdmin('/api/admin/templates/list')
    list.value = Array.isArray(result.data) ? result.data : []
  } catch (error) {
    list.value = []
    showMessage(error?.message || '模板列表加载失败')
  } finally {
    loading.value = false
  }
}

/** 打开新增模板弹窗 */
const openAdd = () => {
  isEdit.value = false
  form.value = createForm()
  showModal.value = true
}

/** 打开编辑模板弹窗 */
const openEdit = (item) => {
  isEdit.value = true
  form.value = {
    id: item.id,
    name: item.name,
    description: item.description || '',
    existingFileName: item.file_name || item.file_path || '',
    selectedFile: null,
    selectedFileName: '',
  }
  showModal.value = true
}

/** 关闭模板弹窗 */
const closeModal = () => {
  if (submitting.value) return
  showModal.value = false
  form.value = createForm()
}

/** 提交成功后强制关闭模板弹窗 */
const closeModalAfterSubmit = () => {
  showModal.value = false
  form.value = createForm()
}

/** 选择 DOCX 模板文件 */
const pickFile = () => {
  // #ifdef H5
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.docx'
  input.onchange = (event) => {
    const file = event?.target?.files?.[0]
    if (file) applySelectedFile(file, file.name)
  }
  input.click()
  // #endif

  // #ifdef MP-WEIXIN
  wx.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['docx'],
    success: (result) => {
      const file = result?.tempFiles?.[0]
      if (file) applySelectedFile(file, file.name)
    },
    fail: () => {
      showMessage('模板文件选择失败')
    },
  })
  // #endif
}

/** 通过 H5 fetch 上传模板文件 */
const uploadTemplateForH5 = async (path, payload, file) => {
  const body = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) body.append(key, value)
  })
  body.append('file', file)

  const headers = {}
  const accessToken = getAccessToken()
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers,
    body,
  })

  const payloadData = await response.json().catch(() => null)
  return parseUploadResponse({ data: payloadData })
}

/** 通过微信端上传模板文件 */
const uploadTemplateForWechat = (path, payload, file) => new Promise((resolve, reject) => {
  const filePath = String(file?.path || file?.tempFilePath || '').trim()
  if (!filePath) {
    reject(new Error('未找到可上传的模板文件'))
    return
  }
  uploadFile({
    url: apiUrl(path),
    filePath,
    name: 'file',
    formData: payload,
    success: (response) => {
      try {
        resolve(parseUploadResponse(response))
      } catch (error) {
        reject(error)
      }
    },
    fail: () => reject(new Error('模板上传失败，请检查网络后重试')),
  })
})

/** 统一提交带文件的模板请求 */
const submitTemplateUpload = async (path) => {
  const payload = buildTemplatePayload()
  const file = form.value.selectedFile
  if (!file) throw new Error('请选择 DOCX 模板文件')

  // #ifdef H5
  return await uploadTemplateForH5(path, payload, file)
  // #endif

  // #ifdef MP-WEIXIN
  return await uploadTemplateForWechat(path, payload, file)
  // #endif

  throw new Error('当前平台暂不支持模板上传')
}

/** 保存模板 */
const saveTemplate = async () => {
  const name = String(form.value.name || '').trim()
  if (!name) {
    showMessage('请输入模板名称')
    return
  }
  if (!isEdit.value && !form.value.selectedFile) {
    showMessage('请先选择 DOCX 模板文件')
    return
  }

  submitting.value = true
  try {
    if (isEdit.value) {
      if (form.value.selectedFile) {
        await submitTemplateUpload('/api/admin/templates/save')
      } else {
        await postAdmin('/api/admin/templates/save', buildTemplatePayload())
      }
      showMessage('模板已更新', 'success')
    } else {
      await submitTemplateUpload('/api/admin/templates/create')
      showMessage('模板已上传', 'success')
    }
    closeModalAfterSubmit()
    await fetchTemplates()
  } catch (error) {
    showMessage(error?.message || '模板保存失败')
  } finally {
    submitting.value = false
  }
}

/** 设置默认模板 */
const activateTemplate = (item) => {
  uni.showModal({
    title: '设为默认模板',
    content: `确认将“${item.name}”设为默认模板吗？后续新生成的报告会优先使用它。`,
    success: async (result) => {
      if (!result.confirm) return
      try {
        await postAdmin('/api/admin/templates/activate', { id: item.id })
        showMessage('默认模板已更新', 'success')
        await fetchTemplates()
      } catch (error) {
        showMessage(error?.message || '默认模板切换失败')
      }
    },
  })
}

/** 删除模板 */
const deleteTemplate = (item) => {
  if (item.is_default) {
    showMessage('默认模板不能删除，请先切换其他默认模板')
    return
  }
  uni.showModal({
    title: '确认删除',
    content: `确认删除“${item.name}”吗？已删除的模板文件无法恢复。`,
    success: async (result) => {
      if (!result.confirm) return
      try {
        await postAdmin('/api/admin/templates/remove', { id: item.id })
        showMessage('模板已删除', 'success')
        await fetchTemplates()
      } catch (error) {
        showMessage(error?.message || '模板删除失败')
      }
    },
  })
}

/** 下载模板文件 */
const downloadTemplate = (item) => {
  if (!item.download_url) {
    showMessage('当前模板没有可下载文件')
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
        showMessage('模板下载失败')
        return
      }
      uni.openDocument({
        filePath: response.tempFilePath,
        fileType: 'docx',
        showMenu: true,
        fail: () => showMessage('模板打开失败'),
      })
    },
    fail: () => showMessage('模板下载失败'),
    complete: () => uni.hideLoading(),
  })
  // #endif
}
</script>

<style scoped>
.page-heading {
  margin-bottom: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.heading-copy {
  display: flex;
  flex-direction: column;
}

.heading-title {
  display: block;
  color: #172541;
  font-size: 28px;
  font-weight: 700;
}

.heading-description {
  display: block;
  margin-top: 6px;
  color: #8b98aa;
  font-size: 14px;
}

.page-actions,
.modal-footer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.primary-btn,
.secondary-btn,
.save-btn {
  height: 40px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  font-size: 13px;
  box-sizing: border-box;
}

.primary-btn,
.save-btn {
  background: #1677ff;
  color: #fff;
}

.secondary-btn {
  background: #f1f4f8;
  color: #69778c;
}

.summary-grid {
  margin-bottom: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.summary-card,
.notice-card,
.template-card {
  background: #fff;
  border: 1px solid #edf1f7;
}

.summary-card {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
}

.summary-value {
  color: #1677ff;
  font-size: 25px;
  font-weight: 700;
}

.summary-value.green {
  color: #18a66c;
}

.summary-value.active-name {
  color: #24334e;
  font-size: 18px;
  line-height: 1.4;
}

.summary-label {
  margin-top: 5px;
  color: #8b98aa;
  font-size: 12px;
}

.notice-card {
  margin-bottom: 18px;
  padding: 16px 18px;
  border-radius: 14px;
}

.notice-card.warning {
  border-color: #ffd8a8;
  background: #fff9ef;
}

.notice-title {
  display: block;
  color: #24334e;
  font-size: 14px;
  font-weight: 700;
}

.notice-desc {
  display: block;
  margin-top: 6px;
  color: #6d7a8e;
  font-size: 12px;
  line-height: 1.6;
}

.empty-card {
  padding: 76px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px dashed #dce5f0;
  border-radius: 14px;
  background: #fff;
}

.empty-title {
  color: #24334e;
  font-size: 16px;
  font-weight: 700;
}

.empty-desc {
  margin-top: 8px;
  color: #8f9caf;
  font-size: 13px;
  text-align: center;
  line-height: 1.7;
}

.template-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.template-card {
  padding: 18px;
  border-radius: 14px;
}

.template-card.active {
  border-color: #a9ceff;
  box-shadow: 0 10px 24px rgba(22, 119, 255, 0.08);
}

.template-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.file-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 12px;
  background: #eaf3ff;
  color: #1677ff;
  font-size: 10px;
  font-weight: 700;
}

.template-copy {
  min-width: 0;
  flex: 1;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.template-name {
  color: #24334e;
  font-size: 15px;
  font-weight: 700;
}

.template-desc {
  display: block;
  margin-top: 6px;
  color: #8f9caf;
  font-size: 12px;
  line-height: 1.6;
}

.default-tag {
  padding: 4px 8px;
  border-radius: 999px;
  background: #eaf8f1;
  color: #18a66c;
  font-size: 10px;
  line-height: 1;
}

.meta-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.meta-label {
  color: #8f9caf;
  font-size: 12px;
}

.meta-value {
  flex: 1;
  color: #4b5a71;
  font-size: 12px;
  text-align: right;
}

.meta-value.danger {
  color: #d65b27;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-actions {
  margin-top: 16px;
  padding-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  border-top: 1px solid #edf1f7;
}

.action-link {
  color: #1677ff;
  font-size: 12px;
}

.action-link.success-link {
  color: #18a66c;
}

.action-link.dangerous {
  color: #f05252;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 5000;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 28, 50, 0.46);
  box-sizing: border-box;
}

.modal-panel {
  width: 620px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border-radius: 18px;
}

.modal-header {
  padding: 22px 26px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #edf1f7;
}

.modal-title {
  display: block;
  color: #172541;
  font-size: 21px;
  font-weight: 700;
}

.modal-desc {
  display: block;
  margin-top: 5px;
  color: #909daf;
  font-size: 13px;
  line-height: 1.6;
}

.modal-close {
  color: #91a0b5;
  font-size: 26px;
}

.modal-body {
  max-height: 60vh;
  padding: 24px 26px;
  box-sizing: border-box;
}

.form-item + .form-item {
  margin-top: 18px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  color: #536179;
  font-size: 13px;
  font-weight: 600;
}

.form-input,
.form-textarea,
.file-picker {
  width: 100%;
  border: 1px solid #e2e9f2;
  border-radius: 9px;
  background: #f9fbfd;
  box-sizing: border-box;
  font-size: 13px;
}

.form-input {
  height: 42px;
  padding: 0 12px;
}

.form-textarea {
  height: 96px;
  padding: 12px;
}

.file-picker {
  padding: 14px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.file-name {
  min-width: 0;
  flex: 1;
  color: #30405b;
  line-height: 1.6;
  word-break: break-all;
}

.file-action {
  color: #1677ff;
  flex-shrink: 0;
}

.file-hint {
  display: block;
  margin-top: 8px;
  color: #8f9caf;
  font-size: 12px;
}

.modal-footer {
  padding: 16px 26px;
  justify-content: flex-end;
  border-top: 1px solid #edf1f7;
}

@media screen and (max-width: 900px) {
  .page-heading {
    margin-bottom: 20rpx;
    align-items: stretch;
    flex-direction: column;
    gap: 16rpx;
  }

  .heading-copy {
    display: none;
  }

  .page-actions {
    width: 100%;
    gap: 12rpx;
  }

  .page-actions .secondary-btn,
  .page-actions .primary-btn,
  .modal-footer .secondary-btn,
  .modal-footer .save-btn {
    flex: 1;
  }

  .primary-btn,
  .secondary-btn,
  .save-btn {
    height: 70rpx;
    padding: 0 22rpx;
    border-radius: 13rpx;
    font-size: 23rpx;
  }

  .summary-grid {
    grid-template-columns: 1fr;
    gap: 12rpx;
  }

  .summary-card {
    padding: 20rpx 16rpx;
    border-radius: 18rpx;
  }

  .summary-value {
    font-size: 34rpx;
  }

  .summary-value.active-name {
    font-size: 28rpx;
  }

  .summary-label,
  .notice-title,
  .notice-desc,
  .empty-title,
  .empty-desc,
  .template-desc,
  .meta-label,
  .meta-value,
  .action-link,
  .file-hint {
    font-size: 22rpx;
  }

  .notice-card,
  .empty-card,
  .template-card {
    border-radius: 20rpx;
  }

  .notice-card,
  .template-card {
    padding: 24rpx;
  }

  .empty-card {
    padding: 84rpx 32rpx;
  }

  .template-grid {
    grid-template-columns: 1fr;
    gap: 16rpx;
  }

  .file-icon {
    width: 68rpx;
    height: 68rpx;
    border-radius: 18rpx;
    font-size: 16rpx;
  }

  .template-name {
    font-size: 28rpx;
  }

  .default-tag {
    font-size: 18rpx;
  }

  .card-actions {
    gap: 18rpx;
  }

  .modal-mask {
    padding: 0;
    align-items: flex-end;
  }

  .modal-panel {
    width: 100%;
    max-height: 86vh;
    border-radius: 28rpx 28rpx 0 0;
  }

  .modal-header {
    padding: 26rpx 32rpx;
  }

  .modal-title {
    font-size: 32rpx;
  }

  .modal-desc {
    font-size: 21rpx;
  }

  .modal-close {
    font-size: 44rpx;
  }

  .modal-body {
    max-height: 62vh;
    padding: 24rpx 32rpx;
  }

  .form-label,
  .form-input,
  .form-textarea,
  .file-picker,
  .file-name,
  .file-action {
    font-size: 24rpx;
  }

  .form-input {
    height: 76rpx;
  }

  .form-textarea {
    height: 160rpx;
  }

  .modal-footer {
    padding: 20rpx 32rpx 28rpx;
  }
}
</style>
