<template>
  <AdminShell active-key="knowledge" title="知识库管理" wide @ready="handleAdminReady">
    <view class="page-heading">
      <view class="heading-copy">
        <text class="heading-title">知识库管理</text>
        <text class="heading-description">维护安全生产法规、标准规范和知识分类，管理员侧统一走真实接口。</text>
      </view>
      <view class="page-action-row">
        <view class="secondary-btn" @click="openCategoryModal">分类管理</view>
        <view class="primary-btn" @click="openAdd">上传文档</view>
      </view>
    </view>

    <view class="summary-grid">
      <view class="summary-card">
        <text class="summary-value">{{ list.length }}</text>
        <text class="summary-label">知识文档</text>
      </view>
      <view class="summary-card">
        <text class="summary-value green">{{ categories.length }}</text>
        <text class="summary-label">知识分类</text>
      </view>
      <view class="summary-card">
        <text class="summary-value purple">{{ selectedIds.length }}</text>
        <text class="summary-label">已选文档</text>
      </view>
    </view>

    <view class="toolbar-card">
      <view class="search-box">
        <text class="search-icon">⌕</text>
        <input
          v-model="keyword"
          class="search-input"
          placeholder="搜索文档标题、说明、文件名或分类"
        />
      </view>
      <picker :range="categoryOptions" range-key="name" @change="changeCategoryFilter">
        <view class="filter-picker">{{ currentCategoryName }} ▾</view>
      </picker>
      <view v-if="selectedIds.length" class="batch-button" @click="batchDelete">
        批量归档（{{ selectedIds.length }}）
      </view>
    </view>

    <scroll-view scroll-x class="category-tabs">
      <view class="category-tab-row">
        <view
          v-for="category in categoryOptions"
          :key="category.id"
          class="category-tab"
          :class="{ active: String(activeCategoryId) === String(category.id) }"
          @click="activeCategoryId = category.id"
        >
          {{ category.name }} {{ categoryCount(category.id) }}
        </view>
      </view>
    </scroll-view>

    <view v-if="filteredList.length > 0" class="knowledge-list">
      <view
        v-for="item in filteredList"
        :key="item.id"
        class="knowledge-card"
        :class="{ selected: isSelected(item.id) }"
      >
        <view class="select-box" :class="{ checked: isSelected(item.id) }" @click="toggleSelected(item.id)">
          <text v-if="isSelected(item.id)">✓</text>
        </view>
        <view class="file-icon" :class="item.file_type === 'DOCX' || item.file_type === 'DOC' ? 'word-icon' : 'pdf-icon'">
          {{ item.file_type || 'PDF' }}
        </view>
        <view class="card-content">
          <view class="title-row">
            <text class="item-title">{{ item.title }}</text>
            <text class="category-tag">{{ getCategoryName(item.category_id) }}</text>
          </view>
          <text class="item-description">{{ item.description || '暂无文档说明' }}</text>
          <view class="meta-row">
            <text>{{ item.file_name || '未上传文件' }}</text>
            <text>{{ item.updated_at || item.created_at || '待更新' }}</text>
          </view>
        </view>
        <view class="card-actions">
          <text class="action-link" @click="openEdit(item)">编辑</text>
          <text class="action-link dangerous" @click="deleteKnowledge(item)">归档</text>
        </view>
      </view>
    </view>

    <view v-else class="empty-card">
      <text class="empty-title">没有符合条件的知识文档</text>
      <text class="empty-description">请调整筛选条件，或上传新的安全生产法规和规范文档。</text>
    </view>

    <view v-if="showKnowledgeModal" class="modal-mask" @click="closeKnowledgeModal">
      <view class="modal-panel wide-modal" @click.stop="">
        <view class="modal-header">
          <view>
            <text class="modal-title">{{ isEdit ? '编辑知识文档' : '上传知识文档' }}</text>
            <text class="modal-description">支持 PDF、DOC 和 DOCX，单个文件不超过 20MB。</text>
          </view>
          <text class="modal-close" @click="closeKnowledgeModal">×</text>
        </view>
        <scroll-view scroll-y class="modal-body">
          <view class="form-grid">
            <view class="form-item full">
              <text class="form-label">文档标题</text>
              <input v-model="form.title" class="form-input" maxlength="300" placeholder="请输入法规或规范名称" />
            </view>
            <view class="form-item full">
              <text class="form-label">文档说明</text>
              <textarea v-model="form.description" class="form-textarea" maxlength="500" placeholder="请输入版本、编号或内容说明" />
            </view>
            <view class="form-item">
              <text class="form-label">知识分类</text>
              <picker :range="categoryPickerOptions" range-key="name" @change="changeFormCategory">
                <view class="form-picker">{{ formCategoryName }} ▾</view>
              </picker>
            </view>
            <view class="form-item">
              <text class="form-label">文档文件</text>
              <view class="file-picker" @click="pickFile">
                <text class="file-name">{{ currentFileLabel }}</text>
                <text class="file-action">{{ form.selectedFileName ? '重新选择' : (isEdit ? '替换文件' : '选择文件') }}</text>
              </view>
              <text v-if="isEdit && form.existingFileName && !form.selectedFileName" class="file-hint">
                当前文件：{{ form.existingFileName }}
              </text>
            </view>
          </view>
        </scroll-view>
        <view class="modal-footer">
          <view class="secondary-btn" @click="closeKnowledgeModal">取消</view>
          <view class="save-btn" @click="saveKnowledge">{{ isEdit ? '保存修改' : '上传文档' }}</view>
        </view>
      </view>
    </view>

    <view v-if="showCategoryModal" class="modal-mask" @click="closeCategoryModal">
      <view class="modal-panel" @click.stop="">
        <view class="modal-header">
          <view>
            <text class="modal-title">知识分类管理</text>
            <text class="modal-description">分类删除前必须确认该分类下已没有可用文档。</text>
          </view>
          <text class="modal-close" @click="closeCategoryModal">×</text>
        </view>
        <scroll-view scroll-y class="modal-body">
          <view class="category-form">
            <input v-model="categoryForm.name" class="form-input" maxlength="100" placeholder="请输入分类名称" />
            <input v-model.number="categoryForm.sort" type="number" class="sort-input" placeholder="排序" />
            <view class="mini-save-btn" @click="saveCategory">{{ categoryForm.id ? '更新' : '新增' }}</view>
          </view>
          <view class="category-manage-list">
            <view v-for="category in categories" :key="category.id" class="category-row">
              <view class="category-copy" @click="editCategory(category)">
                <text class="category-name">{{ category.name }}</text>
                <text class="category-meta">排序 {{ category.sort }} · {{ categoryCount(category.id) }} 个文档</text>
              </view>
              <text class="action-link dangerous" @click="deleteCategory(category)">删除</text>
            </view>
          </view>
        </scroll-view>
        <view class="modal-footer">
          <view class="save-btn" @click="closeCategoryModal">完成</view>
        </view>
      </view>
    </view>
  </AdminShell>
</template>

<script setup>
import { computed, ref } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { apiUrl, getAccessToken, request, unwrapResponse, uploadFile } from '../../common/api-config'

const user = ref({})
const list = ref([])
const categories = ref([])
const keyword = ref('')
const activeCategoryId = ref('all')
const selectedIds = ref([])
const loading = ref(false)
const submitting = ref(false)
const categorySubmitting = ref(false)
const showKnowledgeModal = ref(false)
const showCategoryModal = ref(false)
const isEdit = ref(false)

const createKnowledgeForm = () => ({
  id: null,
  title: '',
  description: '',
  category_id: null,
  existingFileName: '',
  selectedFile: null,
  selectedFileName: '',
})

const createCategoryForm = () => ({
  id: null,
  name: '',
  sort: '',
})

const form = ref(createKnowledgeForm())
const categoryForm = ref(createCategoryForm())

const categoryOptions = computed(() => [
  { id: 'all', name: '全部分类' },
  { id: 0, name: '未分类' },
  ...categories.value,
])

const categoryPickerOptions = computed(() => [
  { id: 0, name: '未分类' },
  ...categories.value,
])

const currentCategoryName = computed(() => (
  categoryOptions.value.find((item) => String(item.id) === String(activeCategoryId.value))?.name || '全部分类'
))

const formCategoryName = computed(() => (
  categoryPickerOptions.value.find((item) => Number(item.id) === Number(form.value.category_id || 0))?.name || '未分类'
))

const currentFileLabel = computed(() => {
  if (form.value.selectedFileName) return form.value.selectedFileName
  if (form.value.existingFileName) return form.value.existingFileName
  return isEdit.value ? '点击替换知识文档' : '点击选择知识文档'
})

const filteredList = computed(() => {
  const searchText = keyword.value.trim().toLowerCase()
  return list.value.filter((item) => {
    const categoryMatched = activeCategoryId.value === 'all' || Number(item.category_id || 0) === Number(activeCategoryId.value)
    const keywordMatched = !searchText || [
      item.title,
      item.description,
      item.file_name,
      item.category_name,
    ].some((value) => String(value || '').toLowerCase().includes(searchText))
    return categoryMatched && keywordMatched
  })
})

const showMessage = (title, icon = 'none') => {
  uni.showToast({ title, icon })
}

const ensureResponse = (response, fallbackMessage) => {
  const result = unwrapResponse(response)
  if (!result.ok) throw new Error(result.msg || fallbackMessage)
  return result
}

const postAdmin = async (path, payload = {}) => {
  const response = await request({
    url: apiUrl(path),
    method: 'POST',
    data: payload,
  })
  return ensureResponse(response, '请求失败')
}

const parseUploadResponse = (response) => {
  const payload = typeof response?.data === 'string' ? JSON.parse(response.data) : (response?.data ?? response)
  return ensureResponse({ data: payload }, '上传失败')
}

const normalizeKnowledgeItem = (item = {}) => ({
  ...item,
  category_id: item.category_id ? Number(item.category_id) : null,
  file_name: String(item.file_name || item.file_path || '').trim(),
  file_type: String(item.file_type || '').toUpperCase(),
})

const normalizeCategory = (item = {}) => ({
  ...item,
  id: Number(item.id),
  sort: Number(item.sort || 0) || 0,
})

const isDocFileName = (name) => /\.(pdf|doc|docx)$/i.test(String(name || '').trim())

const applySelectedFile = (file, customName = '') => {
  const fileName = String(customName || file?.name || file?.originalFile?.name || '').trim()
  if (!fileName || !isDocFileName(fileName)) {
    showMessage('仅支持选择 PDF、DOC 或 DOCX 文件')
    return
  }
  form.value.selectedFile = file
  form.value.selectedFileName = fileName
}

const handleAdminReady = async (admin) => {
  user.value = admin
  await Promise.all([fetchKnowledge(), fetchCategories()])
}

const fetchKnowledge = async () => {
  if (loading.value) return
  loading.value = true
  try {
    const result = await postAdmin('/api/admin/knowledge/list')
    list.value = Array.isArray(result.data) ? result.data.map(normalizeKnowledgeItem) : []
    selectedIds.value = selectedIds.value.filter((id) => list.value.some((item) => item.id === id))
  } catch (error) {
    list.value = []
    showMessage(error?.message || '知识库列表加载失败')
  } finally {
    loading.value = false
  }
}

const fetchCategories = async () => {
  try {
    const result = await postAdmin('/api/admin/knowledge/categories/list')
    categories.value = Array.isArray(result.data) ? result.data.map(normalizeCategory) : []
  } catch (error) {
    categories.value = []
    showMessage(error?.message || '知识分类加载失败')
  }
}

const getCategoryName = (categoryId) => (
  categories.value.find((item) => Number(item.id) === Number(categoryId))?.name || '未分类'
)

const categoryCount = (categoryId) => (
  categoryId === 'all'
    ? list.value.length
    : list.value.filter((item) => Number(item.category_id || 0) === Number(categoryId)).length
)

const isSelected = (id) => selectedIds.value.includes(id)

const changeCategoryFilter = (event) => {
  const option = categoryOptions.value[event.detail.value]
  activeCategoryId.value = option ? option.id : 'all'
}

const toggleSelected = (id) => {
  const index = selectedIds.value.indexOf(id)
  if (index >= 0) selectedIds.value.splice(index, 1)
  else selectedIds.value.push(id)
}

const openAdd = () => {
  isEdit.value = false
  form.value = createKnowledgeForm()
  showKnowledgeModal.value = true
}

const openCategoryModal = () => {
  showCategoryModal.value = true
}

const openEdit = (item) => {
  isEdit.value = true
  form.value = {
    id: item.id,
    title: item.title,
    description: item.description || '',
    category_id: item.category_id || null,
    existingFileName: item.file_name || '',
    selectedFile: null,
    selectedFileName: '',
  }
  showKnowledgeModal.value = true
}

const closeKnowledgeModal = () => {
  if (submitting.value) return
  showKnowledgeModal.value = false
  form.value = createKnowledgeForm()
}

const closeCategoryModal = () => {
  if (categorySubmitting.value) return
  showCategoryModal.value = false
  categoryForm.value = createCategoryForm()
}

const changeFormCategory = (event) => {
  const option = categoryPickerOptions.value[event.detail.value]
  form.value.category_id = option && Number(option.id) > 0 ? Number(option.id) : null
}

const pickFile = () => {
  // #ifdef H5
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.pdf,.doc,.docx'
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
    extension: ['pdf', 'doc', 'docx'],
    success: (result) => {
      const file = result?.tempFiles?.[0]
      if (file) applySelectedFile(file, file.name)
    },
    fail: () => {
      showMessage('知识文档选择失败')
    },
  })
  // #endif
}

const buildKnowledgePayload = () => {
  const payload = {
    title: String(form.value.title || '').trim(),
    description: String(form.value.description || '').trim(),
  }
  if (form.value.category_id) payload.category_id = String(form.value.category_id)
  if (isEdit.value && form.value.id) payload.id = String(form.value.id)
  return payload
}

const uploadKnowledgeForH5 = async (path, payload, file) => {
  const body = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') body.append(key, value)
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

const uploadKnowledgeForWechat = (path, payload, file) => new Promise((resolve, reject) => {
  const filePath = String(file?.path || file?.tempFilePath || '').trim()
  if (!filePath) {
    reject(new Error('未找到可上传的知识文档'))
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
    fail: () => reject(new Error('知识文档上传失败，请检查网络后重试')),
  })
})

const submitKnowledgeUpload = async (path) => {
  const payload = buildKnowledgePayload()
  const file = form.value.selectedFile
  if (!file) throw new Error('请先选择知识文档')

  // #ifdef H5
  return await uploadKnowledgeForH5(path, payload, file)
  // #endif

  // #ifdef MP-WEIXIN
  return await uploadKnowledgeForWechat(path, payload, file)
  // #endif

  throw new Error('当前平台暂不支持知识文档上传')
}

const saveKnowledge = async () => {
  const title = String(form.value.title || '').trim()
  if (!title) {
    showMessage('请输入文档标题')
    return
  }
  if (!isEdit.value && !form.value.selectedFile) {
    showMessage('请先选择知识文档')
    return
  }

  submitting.value = true
  try {
    if (isEdit.value) {
      if (form.value.selectedFile) {
        await submitKnowledgeUpload('/api/admin/knowledge/save')
      } else {
        await postAdmin('/api/admin/knowledge/update', buildKnowledgePayload())
      }
      showMessage('知识文档已更新', 'success')
    } else {
      await submitKnowledgeUpload('/api/admin/knowledge/add')
      showMessage('知识文档已上传', 'success')
    }

    showKnowledgeModal.value = false
    form.value = createKnowledgeForm()
    await fetchKnowledge()
    await fetchCategories()
  } catch (error) {
    showMessage(error?.message || '知识文档保存失败')
  } finally {
    submitting.value = false
  }
}

const deleteKnowledge = (item) => {
  uni.showModal({
    title: '确认归档',
    content: `确定将“${item.title}”归档吗？归档后不会直接物理删除文件。`,
    success: async (result) => {
      if (!result.confirm) return
      try {
        await postAdmin('/api/admin/knowledge/delete', { id: item.id })
        selectedIds.value = selectedIds.value.filter((id) => id !== item.id)
        showMessage('知识文档已归档', 'success')
        await fetchKnowledge()
        await fetchCategories()
      } catch (error) {
        showMessage(error?.message || '知识文档归档失败')
      }
    },
  })
}

const batchDelete = () => {
  if (!selectedIds.value.length) return
  uni.showModal({
    title: '批量归档',
    content: `确定将已选的 ${selectedIds.value.length} 个知识文档归档吗？`,
    success: async (result) => {
      if (!result.confirm) return
      try {
        await postAdmin('/api/admin/knowledge/batch-delete', { ids: selectedIds.value })
        selectedIds.value = []
        showMessage('知识文档已批量归档', 'success')
        await fetchKnowledge()
        await fetchCategories()
      } catch (error) {
        showMessage(error?.message || '批量归档失败')
      }
    },
  })
}

const editCategory = (category) => {
  categoryForm.value = {
    id: category.id,
    name: category.name,
    sort: Number(category.sort || 0) || 0,
  }
}

const saveCategory = async () => {
  const name = String(categoryForm.value.name || '').trim()
  if (!name) {
    showMessage('请输入分类名称')
    return
  }

  categorySubmitting.value = true
  try {
    if (categoryForm.value.id) {
      await postAdmin('/api/admin/knowledge/categories/update', {
        id: categoryForm.value.id,
        name,
        sort: Number(categoryForm.value.sort || 0) || 0,
      })
      showMessage('知识分类已更新', 'success')
    } else {
      await postAdmin('/api/admin/knowledge/categories/add', {
        name,
        sort: Number(categoryForm.value.sort || 0) || 0,
      })
      showMessage('知识分类已新增', 'success')
    }
    categoryForm.value = createCategoryForm()
    await fetchCategories()
    await fetchKnowledge()
  } catch (error) {
    showMessage(error?.message || '知识分类保存失败')
  } finally {
    categorySubmitting.value = false
  }
}

const deleteCategory = (category) => {
  uni.showModal({
    title: '确认删除',
    content: `确定删除分类“${category.name}”吗？若该分类下仍有文档，后端会拒绝删除。`,
    success: async (result) => {
      if (!result.confirm) return
      try {
        await postAdmin('/api/admin/knowledge/categories/delete', { id: category.id })
        if (Number(activeCategoryId.value) === Number(category.id)) {
          activeCategoryId.value = 'all'
        }
        showMessage('知识分类已删除', 'success')
        await fetchCategories()
        await fetchKnowledge()
      } catch (error) {
        showMessage(error?.message || '知识分类删除失败')
      }
    },
  })
}
</script>

<style scoped>
.page-heading {
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
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

.page-action-row {
  display: flex;
  gap: 10px;
}

.primary-btn,
.secondary-btn,
.save-btn,
.mini-save-btn,
.batch-button {
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
.save-btn,
.mini-save-btn {
  background: #1677ff;
  color: #fff;
}

.secondary-btn {
  background: #f1f4f8;
  color: #69778c;
}

.batch-button {
  background: #fff1f0;
  color: #e54848;
}

.summary-grid {
  margin-bottom: 18px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.summary-card {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #edf1f7;
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

.summary-value.purple {
  color: #7650e8;
}

.summary-label {
  margin-top: 5px;
  color: #8b98aa;
  font-size: 12px;
}

.toolbar-card {
  margin-bottom: 14px;
  padding: 14px;
  display: flex;
  gap: 12px;
  background: #fff;
  border: 1px solid #edf1f7;
  border-radius: 14px;
}

.search-box {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  background: #f7f9fc;
  border-radius: 9px;
}

.search-icon {
  margin-right: 8px;
  color: #8f9bad;
}

.search-input {
  flex: 1;
  font-size: 13px;
}

.filter-picker {
  height: 40px;
  min-width: 125px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #e2e9f2;
  border-radius: 9px;
  color: #59677d;
  font-size: 12px;
  box-sizing: border-box;
}

.category-tabs {
  margin-bottom: 14px;
  white-space: nowrap;
}

.category-tab-row {
  display: flex;
  gap: 8px;
}

.category-tab {
  padding: 8px 13px;
  border: 1px solid #e7edf5;
  border-radius: 20px;
  background: #fff;
  color: #7d899a;
  font-size: 11px;
}

.category-tab.active {
  border-color: #b9d8ff;
  background: #eaf4ff;
  color: #1677ff;
}

.knowledge-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.knowledge-card {
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 15px;
  background: #fff;
  border: 1px solid #edf1f7;
  border-radius: 14px;
}

.knowledge-card.selected {
  border-color: #9bc6ff;
}

.select-box {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d5deea;
  border-radius: 5px;
  color: #fff;
  font-size: 11px;
}

.select-box.checked {
  border-color: #1677ff;
  background: #1677ff;
}

.file-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.pdf-icon {
  background: linear-gradient(135deg, #ff6b6b, #f04444);
}

.word-icon {
  background: linear-gradient(135deg, #45a4ff, #1677ff);
}

.card-content {
  flex: 1;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 9px;
}

.item-title {
  overflow: hidden;
  color: #24334e;
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-tag {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 20px;
  background: #eef6ff;
  color: #1677ff;
  font-size: 10px;
}

.item-description {
  display: block;
  margin-top: 6px;
  color: #79879a;
  font-size: 12px;
  line-height: 1.6;
}

.meta-row {
  margin-top: 7px;
  display: flex;
  gap: 14px;
  color: #a0acbb;
  font-size: 10px;
}

.card-actions {
  display: flex;
  gap: 14px;
}

.action-link {
  color: #1677ff;
  font-size: 12px;
}

.action-link.dangerous {
  color: #f05252;
}

.empty-card {
  padding: 65px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #fff;
  border: 1px dashed #dce5f0;
  border-radius: 14px;
}

.empty-title {
  color: #526078;
  font-size: 15px;
  font-weight: 700;
}

.empty-description {
  margin-top: 7px;
  color: #9aa6b6;
  font-size: 12px;
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
  width: 560px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border-radius: 18px;
}

.wide-modal {
  width: 760px;
}

.modal-header {
  padding: 22px 26px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid #edf1f7;
}

.modal-title {
  display: block;
  color: #172541;
  font-size: 21px;
  font-weight: 700;
}

.modal-description {
  display: block;
  margin-top: 5px;
  color: #909daf;
  font-size: 13px;
  line-height: 1.6;
}

.modal-close {
  color: #91a0b5;
  font-size: 26px;
  line-height: 1;
}

.modal-body {
  flex: 1;
  max-height: 66vh;
  padding: 24px 26px;
  box-sizing: border-box;
}

.modal-footer {
  padding: 16px 26px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #edf1f7;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.form-item.full {
  grid-column: 1 / -1;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  color: #536179;
  font-size: 13px;
  font-weight: 600;
}

.form-input,
.sort-input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid #e2e9f2;
  border-radius: 9px;
  background: #f9fbfd;
  box-sizing: border-box;
  font-size: 13px;
}

.form-textarea {
  width: 100%;
  height: 95px;
  padding: 12px;
  border: 1px solid #e2e9f2;
  border-radius: 9px;
  background: #f9fbfd;
  box-sizing: border-box;
  font-size: 13px;
}

.form-picker,
.file-picker {
  height: 42px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e2e9f2;
  border-radius: 9px;
  background: #f9fbfd;
  color: #647288;
  font-size: 12px;
  box-sizing: border-box;
}

.file-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.category-form {
  margin-bottom: 16px;
  display: grid;
  grid-template-columns: 1fr 85px 72px;
  gap: 9px;
}

.category-manage-list {
  border-top: 1px solid #edf1f7;
}

.category-row {
  padding: 13px 2px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #edf1f7;
}

.category-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.category-name {
  color: #31405a;
  font-size: 13px;
  font-weight: 700;
}

.category-meta {
  margin-top: 4px;
  color: #9ba7b6;
  font-size: 10px;
}

@media screen and (max-width: 900px) {
  .page-heading {
    margin-bottom: 20rpx;
    display: block;
  }

  .heading-copy {
    display: none;
  }

  .page-action-row {
    width: 100%;
    gap: 12rpx;
  }

  .page-action-row .primary-btn,
  .page-action-row .secondary-btn,
  .modal-footer .secondary-btn,
  .modal-footer .save-btn {
    flex: 1;
  }

  .primary-btn,
  .secondary-btn,
  .save-btn,
  .mini-save-btn,
  .batch-button {
    height: 70rpx;
    padding: 0 22rpx;
    border-radius: 13rpx;
    font-size: 23rpx;
  }

  .summary-grid {
    gap: 12rpx;
  }

  .summary-card {
    padding: 20rpx 14rpx;
    border-radius: 18rpx;
  }

  .summary-value {
    font-size: 34rpx;
  }

  .summary-label {
    font-size: 20rpx;
  }

  .toolbar-card {
    padding: 18rpx;
    flex-wrap: wrap;
    gap: 14rpx;
    border-radius: 19rpx;
  }

  .search-box {
    width: 100%;
    flex-basis: 100%;
    height: 70rpx;
    padding: 0 18rpx;
  }

  .search-input {
    font-size: 23rpx;
  }

  .filter-picker {
    height: 70rpx;
    min-width: 210rpx;
    padding: 0 20rpx;
    border-radius: 13rpx;
    font-size: 22rpx;
  }

  .category-tabs {
    margin-bottom: 18rpx;
  }

  .category-tab-row {
    gap: 12rpx;
  }

  .category-tab {
    padding: 12rpx 20rpx;
    font-size: 20rpx;
  }

  .knowledge-list {
    grid-template-columns: 1fr;
    gap: 16rpx;
  }

  .knowledge-card {
    position: relative;
    padding: 24rpx 24rpx 66rpx;
    align-items: flex-start;
    gap: 18rpx;
    border-radius: 20rpx;
  }

  .select-box {
    width: 30rpx;
    height: 30rpx;
    border-radius: 7rpx;
    font-size: 18rpx;
  }

  .file-icon {
    width: 68rpx;
    height: 68rpx;
    border-radius: 17rpx;
    font-size: 17rpx;
  }

  .title-row {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 10rpx;
  }

  .item-title {
    max-width: 100%;
    font-size: 27rpx;
    white-space: normal;
  }

  .category-tag {
    padding: 5rpx 12rpx;
    font-size: 18rpx;
  }

  .item-description {
    margin-top: 10rpx;
    font-size: 22rpx;
  }

  .meta-row {
    margin-top: 12rpx;
    flex-direction: column;
    gap: 4rpx;
    font-size: 19rpx;
  }

  .card-actions {
    position: absolute;
    right: 24rpx;
    bottom: 22rpx;
    gap: 22rpx;
  }

  .action-link {
    font-size: 22rpx;
  }

  .empty-card {
    padding: 90rpx 24rpx;
    border-radius: 20rpx;
  }

  .empty-title {
    font-size: 27rpx;
  }

  .empty-description {
    font-size: 21rpx;
  }

  .form-grid {
    grid-template-columns: 1fr;
    gap: 24rpx;
  }

  .form-label {
    font-size: 24rpx;
  }

  .form-input,
  .sort-input {
    height: 76rpx;
    padding: 0 20rpx;
    border-radius: 13rpx;
    font-size: 24rpx;
  }

  .form-textarea {
    height: 160rpx;
    padding: 20rpx;
    border-radius: 13rpx;
    font-size: 24rpx;
  }

  .form-picker,
  .file-picker {
    height: 76rpx;
    padding: 0 20rpx;
    border-radius: 13rpx;
    font-size: 22rpx;
  }

  .file-name,
  .file-action,
  .file-hint {
    font-size: 22rpx;
  }

  .category-form {
    grid-template-columns: 1fr 130rpx;
    gap: 12rpx;
  }

  .category-form .mini-save-btn {
    grid-column: 1 / -1;
  }

  .category-row {
    padding: 22rpx 2rpx;
  }

  .category-name {
    font-size: 25rpx;
  }

  .category-meta {
    font-size: 19rpx;
  }

  .modal-mask {
    padding: 0;
    align-items: flex-end;
  }

  .modal-panel,
  .wide-modal {
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

  .modal-description {
    margin-top: 5rpx;
    font-size: 21rpx;
  }

  .modal-close {
    font-size: 44rpx;
  }

  .modal-body {
    max-height: 62vh;
    padding: 24rpx 32rpx;
  }

  .modal-footer {
    padding: 20rpx 32rpx 28rpx;
    gap: 14rpx;
  }
}
</style>
