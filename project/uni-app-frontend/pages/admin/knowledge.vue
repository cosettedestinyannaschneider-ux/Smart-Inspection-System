<template>
  <AdminShell active-key="knowledge" title="知识库管理" wide @ready="handleAdminReady">
    <!-- 页面操作直接放在业务页面中，避免微信小程序插槽内点击事件失效 -->
    <view class="page-heading">
      <view class="heading-copy">
        <text class="heading-title">知识库管理</text>
        <text class="heading-description">维护安全生产法规、标准规范和知识分类</text>
      </view>
      <view class="page-action-row">
        <view class="secondary-btn" @click="openCategoryModal">分类管理</view>
        <view class="primary-btn" @click="openAdd">＋ 上传文档</view>
      </view>
    </view>

    <!-- 知识库统计概览 -->
    <view class="summary-grid">
      <view class="summary-card"><text class="summary-value">{{ list.length }}</text><text class="summary-label">知识文档</text></view>
      <view class="summary-card"><text class="summary-value green">{{ categories.length }}</text><text class="summary-label">知识分类</text></view>
      <view class="summary-card"><text class="summary-value purple">{{ selectedIds.length }}</text><text class="summary-label">已选择文档</text></view>
    </view>

    <!-- 搜索、分类筛选和批量操作工具栏 -->
    <view class="toolbar-card">
      <view class="search-box"><text class="search-icon">⌕</text><input v-model="keyword" class="search-input" placeholder="搜索文档名称、说明或文件名" /></view>
      <picker :range="categoryOptions" range-key="name" @change="changeCategoryFilter">
        <view class="filter-picker">{{ currentCategoryName }}⌄</view>
      </picker>
      <view v-if="selectedIds.length" class="batch-button" @click="batchDelete">删除已选（{{ selectedIds.length }}）</view>
    </view>

    <!-- 分类快捷筛选标签 -->
    <scroll-view scroll-x class="category-tabs">
      <view class="category-tab-row">
        <view v-for="category in categoryOptions" :key="category.id" class="category-tab" :class="{ active: String(activeCategoryId) === String(category.id) }" @click="activeCategoryId = category.id">
          {{ category.name }} {{ categoryCount(category.id) }}
        </view>
      </view>
    </scroll-view>

    <!-- 知识条目列表 -->
    <view v-if="filteredList.length > 0" class="knowledge-list">
      <!-- 条目直接渲染，避免微信小程序多层自定义组件插槽导致列表不显示 -->
      <view v-for="item in filteredList" :key="item.id" class="knowledge-card" :class="{ selected: isSelected(item.id) }">
        <view class="select-box" :class="{ checked: isSelected(item.id) }" @click="toggleSelected(item.id)">
          <text v-if="isSelected(item.id)">✓</text>
        </view>
        <view class="file-icon" :class="item.file_type === 'DOCX' ? 'word-icon' : 'pdf-icon'">{{ item.file_type || 'PDF' }}</view>
        <view class="card-content">
          <view class="title-row">
            <text class="item-title">{{ item.title }}</text>
            <text class="category-tag">{{ getCategoryName(item.category_id) }}</text>
          </view>
          <text class="item-description">{{ item.description || '暂无文档说明' }}</text>
          <view class="meta-row">
            <text>{{ item.file_path || '未选择文件' }}</text>
            <text>{{ item.created_at || '待上传' }}</text>
          </view>
        </view>
        <view class="card-actions">
          <text class="action-link" @click="openEdit(item)">编辑</text>
          <text class="action-link dangerous" @click="deleteKnowledge(item)">删除</text>
        </view>
      </view>
    </view>
    <view v-else class="empty-card">
      <text class="empty-title">没有符合条件的知识文档</text>
      <text class="empty-description">请调整筛选条件，或上传新的安全生产规范。</text>
    </view>

    <!-- 文档弹窗直接渲染在业务页面，沿用用户管理页已验证的微信端实现 -->
    <view v-if="showKnowledgeModal" class="modal-mask" @click="closeKnowledgeModal">
      <view class="modal-panel wide-modal" @click.stop="">
        <view class="modal-header">
          <view>
            <text class="modal-title">{{ isEdit ? '编辑知识文档' : '上传知识文档' }}</text>
            <text class="modal-description">支持 PDF、DOC 和 DOCX 格式</text>
          </view>
          <text class="modal-close" @click="closeKnowledgeModal">×</text>
        </view>
        <scroll-view scroll-y class="modal-body">
          <view class="form-grid">
            <view class="form-item full"><text class="form-label">文档标题</text><input v-model="form.title" class="form-input" placeholder="请输入法规或规范名称" /></view>
            <view class="form-item full"><text class="form-label">文档说明</text><textarea v-model="form.description" class="form-textarea" placeholder="请输入版本、编号或内容说明" /></view>
            <view class="form-item">
              <text class="form-label">知识分类</text>
              <picker :range="categoryPickerOptions" range-key="name" @change="changeFormCategory">
                <view class="form-picker">{{ formCategoryName }}⌄</view>
              </picker>
            </view>
            <view class="form-item">
              <text class="form-label">文档文件</text>
              <view class="file-picker" @click="pickFile"><text class="file-name">{{ form.fileName || (isEdit ? '点击更换文档文件' : '点击选择文档文件') }}</text></view>
            </view>
          </view>
        </scroll-view>
        <view class="modal-footer">
          <view class="secondary-btn" @click="closeKnowledgeModal">取消</view>
          <view class="save-btn" @click="saveKnowledge">保存文档</view>
        </view>
      </view>
    </view>

    <!-- 分类管理弹窗直接渲染，保证微信端点击和表单事件可用 -->
    <view v-if="showCategoryModal" class="modal-mask" @click="closeCategoryModal">
      <view class="modal-panel" @click.stop="">
        <view class="modal-header">
          <view>
            <text class="modal-title">知识分类管理</text>
            <text class="modal-description">分类删除前必须确保没有关联文档</text>
          </view>
          <text class="modal-close" @click="closeCategoryModal">×</text>
        </view>
        <scroll-view scroll-y class="modal-body">
          <view class="category-form">
            <input v-model="categoryForm.name" class="form-input" placeholder="请输入分类名称" />
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
        <view class="modal-footer"><view class="save-btn" @click="closeCategoryModal">完成</view></view>
      </view>
    </view>
  </AdminShell>
</template>

<script setup>
import { ref, computed } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { createKnowledgeCategories, createKnowledgeItems } from '../../common/admin-mock-data'

/** 当前管理员信息 */
const user = ref({})
/** 知识文档列表 */
const list = ref([])
/** 知识分类列表 */
const categories = ref([])
/** 搜索关键词 */
const keyword = ref('')
/** 当前筛选分类 */
const activeCategoryId = ref('all')
/** 已勾选文档 ID */
const selectedIds = ref([])
/** 文档表单弹窗状态 */
const showKnowledgeModal = ref(false)
/** 分类管理弹窗状态 */
const showCategoryModal = ref(false)
/** 当前是否为编辑文档模式 */
const isEdit = ref(false)

/** 创建空白文档表单 */
const createKnowledgeForm = () => ({ id: null, title: '', description: '', category_id: null, fileName: '', fileObj: null })
/** 当前文档表单 */
const form = ref(createKnowledgeForm())
/** 当前分类表单 */
const categoryForm = ref({ id: null, name: '', sort: '' })

/** 分类筛选选项 */
const categoryOptions = computed(() => [{ id: 'all', name: '全部分类' }, { id: 0, name: '未分类' }, ...categories.value])
/** 文档表单分类选项 */
const categoryPickerOptions = computed(() => [{ id: 0, name: '未分类' }, ...categories.value])
/** 当前筛选分类名称 */
const currentCategoryName = computed(() => categoryOptions.value.find(item => String(item.id) === String(activeCategoryId.value))?.name || '全部分类')
/** 当前表单分类名称 */
const formCategoryName = computed(() => categoryPickerOptions.value.find(item => Number(item.id) === Number(form.value.category_id || 0))?.name || '未分类')
/** 根据关键词与分类得到可见文档 */
const filteredList = computed(() => {
  const searchText = keyword.value.trim().toLowerCase()
  return list.value.filter((item) => {
    const categoryMatched = activeCategoryId.value === 'all' || Number(item.category_id || 0) === Number(activeCategoryId.value)
    const keywordMatched = !searchText || [item.title, item.description, item.file_path].some(value => String(value || '').toLowerCase().includes(searchText))
    return categoryMatched && keywordMatched
  })
})

/** 公共框架鉴权完成后加载知识库模拟数据 */
const handleAdminReady = (admin) => {
  user.value = admin
  fetchKnowledge()
  fetchCategories()
}

/** 加载知识文档，后续对接 POST /api/admin/knowledge/list */
const fetchKnowledge = () => { list.value = createKnowledgeItems() }
/** 加载知识分类，后续对接 POST /api/admin/knowledge/categories/list */
const fetchCategories = () => { categories.value = createKnowledgeCategories() }
/** 获取指定分类名称 */
const getCategoryName = (categoryId) => categories.value.find(item => Number(item.id) === Number(categoryId))?.name || '未分类'
/** 获取指定分类文档数量 */
const categoryCount = (categoryId) => categoryId === 'all' ? list.value.length : list.value.filter(item => Number(item.category_id || 0) === Number(categoryId)).length
/** 判断指定文档是否已勾选 */
const isSelected = (id) => selectedIds.value.indexOf(id) >= 0

/** 通过选择器切换分类筛选 */
const changeCategoryFilter = (event) => {
  const option = categoryOptions.value[event.detail.value]
  activeCategoryId.value = option ? option.id : 'all'
}

/** 切换文档勾选状态 */
const toggleSelected = (id) => {
  const index = selectedIds.value.indexOf(id)
  if (index >= 0) selectedIds.value.splice(index, 1)
  else selectedIds.value.push(id)
}

/** 打开新增文档弹窗 */
const openAdd = () => {
  isEdit.value = false
  form.value = createKnowledgeForm()
  showKnowledgeModal.value = true
}

/** 打开分类管理弹窗 */
const openCategoryModal = () => { showCategoryModal.value = true }

/** 打开编辑文档弹窗 */
const openEdit = (item) => {
  isEdit.value = true
  form.value = { id: item.id, title: item.title, description: item.description, category_id: item.category_id, fileName: item.file_path, fileObj: null }
  showKnowledgeModal.value = true
}

/** 关闭文档弹窗 */
const closeKnowledgeModal = () => { showKnowledgeModal.value = false }
/** 关闭分类弹窗并清空分类表单 */
const closeCategoryModal = () => {
  showCategoryModal.value = false
  categoryForm.value = { id: null, name: '', sort: '' }
}

/** 切换文档表单分类 */
const changeFormCategory = (event) => {
  const option = categoryPickerOptions.value[event.detail.value]
  form.value.category_id = option && Number(option.id) > 0 ? Number(option.id) : null
}

/** 选择文档文件，H5 与微信小程序分别调用对应能力 */
const pickFile = () => {
  // #ifdef H5
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.pdf,.doc,.docx'
  input.onchange = (event) => {
    const file = event.target.files[0]
    if (file) { form.value.fileObj = file; form.value.fileName = file.name }
  }
  input.click()
  // #endif
  // #ifndef H5
  wx.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['pdf', 'doc', 'docx'],
    success: (result) => {
      const file = result.tempFiles[0]
      if (file) { form.value.fileObj = file; form.value.fileName = file.name }
    }
  })
  // #endif
}

/** 保存文档，后续根据编辑状态对接新增或更新接口 */
const saveKnowledge = () => {
  if (!form.value.title.trim()) return uni.showToast({ title: '请输入文档标题', icon: 'none' })
  if (!isEdit.value && !form.value.fileName) return uni.showToast({ title: '请选择文档文件', icon: 'none' })
  if (isEdit.value) {
    const index = list.value.findIndex(item => item.id === form.value.id)
    if (index >= 0) list.value[index] = { ...list.value[index], title: form.value.title, description: form.value.description, category_id: form.value.category_id, file_path: form.value.fileName }
  } else {
    const extension = form.value.fileName.split('.').pop()?.toUpperCase() || 'PDF'
    list.value.unshift({ id: Date.now(), title: form.value.title, description: form.value.description, category_id: form.value.category_id, file_path: form.value.fileName, file_type: extension, status: 'active', created_at: new Date().toISOString().slice(0, 10) })
  }
  uni.showToast({ title: isEdit.value ? '文档已更新' : '文档已上传', icon: 'success' })
  closeKnowledgeModal()
}

/** 删除单个文档 */
const deleteKnowledge = (item) => {
  uni.showModal({ title: '确认删除', content: `确定删除“${item.title}”吗？`, success: (result) => {
    if (!result.confirm) return
    list.value = list.value.filter(row => row.id !== item.id)
    selectedIds.value = selectedIds.value.filter(id => id !== item.id)
    uni.showToast({ title: '文档已删除', icon: 'success' })
  } })
}

/** 批量删除已选择文档 */
const batchDelete = () => {
  uni.showModal({ title: '批量删除', content: `确定删除已选的 ${selectedIds.value.length} 个文档吗？`, success: (result) => {
    if (!result.confirm) return
    list.value = list.value.filter(item => !selectedIds.value.includes(item.id))
    selectedIds.value = []
    uni.showToast({ title: '文档已批量删除', icon: 'success' })
  } })
}

/** 将分类载入编辑表单 */
const editCategory = (category) => { categoryForm.value = { id: category.id, name: category.name, sort: category.sort } }

/** 保存分类，后续根据编辑状态对接分类新增或更新接口 */
const saveCategory = () => {
  if (!categoryForm.value.name.trim()) return uni.showToast({ title: '请输入分类名称', icon: 'none' })
  const duplicate = categories.value.some(item => item.name === categoryForm.value.name.trim() && item.id !== categoryForm.value.id)
  if (duplicate) return uni.showToast({ title: '分类名称不能重复', icon: 'none' })
  if (categoryForm.value.id) {
    const category = categories.value.find(item => item.id === categoryForm.value.id)
    if (category) Object.assign(category, { name: categoryForm.value.name.trim(), sort: Number(categoryForm.value.sort) || 0 })
  } else {
    categories.value.push({ id: Date.now(), name: categoryForm.value.name.trim(), sort: Number(categoryForm.value.sort) || categories.value.length + 1 })
  }
  categories.value.sort((a, b) => a.sort - b.sort)
  categoryForm.value = { id: null, name: '', sort: '' }
  uni.showToast({ title: '分类已保存', icon: 'success' })
}

/** 删除无关联文档的分类 */
const deleteCategory = (category) => {
  if (categoryCount(category.id) > 0) return uni.showToast({ title: '请先处理该分类下的文档', icon: 'none' })
  uni.showModal({ title: '确认删除', content: `确定删除分类“${category.name}”吗？`, success: (result) => {
    if (!result.confirm) return
    categories.value = categories.value.filter(item => item.id !== category.id)
    uni.showToast({ title: '分类已删除', icon: 'success' })
  } })
}
</script>

<style scoped>
/* 页面标题与公共按钮 */
.page-heading { margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.heading-title { display: block; color: #172541; font-size: 28px; font-weight: 700; }.heading-description { display: block; margin-top: 6px; color: #8b98aa; font-size: 14px; }
.page-action-row { display: flex; gap: 10px; }
.primary-btn,.secondary-btn,.save-btn,.mini-save-btn,.batch-button { height: 40px; padding: 0 16px; display: flex; align-items: center; justify-content: center; border-radius: 9px; font-size: 13px; }
.primary-btn,.save-btn,.mini-save-btn { background: #1677ff; color: #fff; }.secondary-btn { background: #f1f4f8; color: #69778c; }.batch-button { background: #fff1f0; color: #e54848; }
/* 知识库概览 */
.summary-grid { margin-bottom: 18px; display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }.summary-card { padding: 18px 20px; display: flex; flex-direction: column; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }
.summary-value { color: #1677ff; font-size: 25px; font-weight: 700; }.summary-value.green { color: #18a66c; }.summary-value.purple { color: #7650e8; }.summary-label { margin-top: 5px; color: #8b98aa; font-size: 12px; }
/* 搜索筛选工具栏 */
.toolbar-card { margin-bottom: 14px; padding: 14px; display: flex; gap: 12px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }.search-box { flex: 1; height: 40px; padding: 0 12px; display: flex; align-items: center; background: #f7f9fc; border-radius: 9px; }.search-icon { margin-right: 8px; color: #8f9bad; }.search-input { flex: 1; font-size: 13px; }.filter-picker { height: 40px; min-width: 125px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; border: 1px solid #e2e9f2; border-radius: 9px; color: #59677d; font-size: 12px; box-sizing: border-box; }
.category-tabs { margin-bottom: 14px; white-space: nowrap; }.category-tab-row { display: flex; gap: 8px; }.category-tab { padding: 8px 13px; border: 1px solid #e7edf5; border-radius: 20px; background: #fff; color: #7d899a; font-size: 11px; }.category-tab.active { border-color: #b9d8ff; background: #eaf4ff; color: #1677ff; }
.knowledge-list { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.empty-card { padding: 65px 20px; display: flex; flex-direction: column; align-items: center; background: #fff; border: 1px dashed #dce5f0; border-radius: 14px; }.empty-title { color: #526078; font-size: 15px; font-weight: 700; }.empty-description { margin-top: 7px; color: #9aa6b6; font-size: 12px; }
/* 知识文档卡片直接放在页面内，确保微信端稳定渲染 */
.knowledge-card { padding: 18px; display: flex; align-items: center; gap: 15px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }.knowledge-card.selected { border-color: #9bc6ff; }.select-box { width: 18px; height: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid #d5deea; border-radius: 5px; color: #fff; font-size: 11px; }.select-box.checked { border-color: #1677ff; background: #1677ff; }
.file-icon { width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 12px; color: #fff; font-size: 10px; font-weight: 700; }.pdf-icon { background: linear-gradient(135deg,#ff6b6b,#f04444); }.word-icon { background: linear-gradient(135deg,#45a4ff,#1677ff); }.card-content { flex: 1; min-width: 0; }.title-row { display: flex; align-items: center; gap: 9px; }.item-title { overflow: hidden; color: #24334e; font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }.category-tag { flex-shrink: 0; padding: 3px 8px; border-radius: 20px; background: #eef6ff; color: #1677ff; font-size: 10px; }.item-description { display: block; margin-top: 6px; color: #79879a; font-size: 12px; }.meta-row { margin-top: 7px; display: flex; gap: 14px; color: #a0acbb; font-size: 10px; }.card-actions { display: flex; gap: 14px; }
/* 业务弹窗沿用用户管理页中已验证的固定定位结构 */
.modal-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 5000; padding: 24px; display: flex; align-items: center; justify-content: center; background: rgba(15,28,50,.46); box-sizing: border-box; }.modal-panel { width: 560px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; background: #fff; border-radius: 18px; }.wide-modal { width: 760px; }.modal-header { padding: 22px 26px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #edf1f7; }.modal-title { display: block; color: #172541; font-size: 21px; font-weight: 700; }.modal-description { display: block; margin-top: 5px; color: #909daf; font-size: 13px; }.modal-close { color: #91a0b5; font-size: 26px; line-height: 1; }.modal-body { flex: 1; max-height: 66vh; padding: 24px 26px; box-sizing: border-box; }.modal-footer { padding: 16px 26px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #edf1f7; }
/* 文档与分类表单 */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }.form-item.full { grid-column: 1 / -1; }.form-label { display: block; margin-bottom: 8px; color: #536179; font-size: 13px; font-weight: 600; }.form-input,.sort-input { width: 100%; height: 42px; padding: 0 12px; border: 1px solid #e2e9f2; border-radius: 9px; background: #f9fbfd; box-sizing: border-box; font-size: 13px; }.form-textarea { width: 100%; height: 95px; padding: 12px; border: 1px solid #e2e9f2; border-radius: 9px; background: #f9fbfd; box-sizing: border-box; font-size: 13px; }.form-picker,.file-picker { height: 42px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; border: 1px solid #e2e9f2; border-radius: 9px; background: #f9fbfd; color: #647288; font-size: 12px; box-sizing: border-box; }.file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.category-form { margin-bottom: 16px; display: grid; grid-template-columns: 1fr 85px 72px; gap: 9px; }.category-manage-list { border-top: 1px solid #edf1f7; }.category-row { padding: 13px 2px; display: flex; align-items: center; border-bottom: 1px solid #edf1f7; }.category-copy { flex: 1; display: flex; flex-direction: column; }.category-name { color: #31405a; font-size: 13px; font-weight: 700; }.category-meta { margin-top: 4px; color: #9ba7b6; font-size: 10px; }.action-link { color: #1677ff; font-size: 12px; }.dangerous { color: #f05252; }
/* 微信小程序与小屏 H5 响应式布局 */
@media screen and (max-width: 900px) {
  .page-heading { margin-bottom: 20rpx; display: block; }.heading-copy { display: none; }
  .page-action-row { width: 100%; gap: 12rpx; }.page-action-row .primary-btn,.page-action-row .secondary-btn { flex: 1; }
  .primary-btn,.secondary-btn,.save-btn,.mini-save-btn,.batch-button { height: 70rpx; padding: 0 22rpx; border-radius: 13rpx; font-size: 23rpx; }
  .summary-grid { gap: 12rpx; }.summary-card { padding: 20rpx 14rpx; border-radius: 18rpx; }.summary-value { font-size: 34rpx; }.summary-label { font-size: 20rpx; }
  .toolbar-card { padding: 18rpx; flex-wrap: wrap; gap: 14rpx; border-radius: 19rpx; }.search-box { width: 100%; flex-basis: 100%; height: 70rpx; padding: 0 18rpx; }.search-input { font-size: 23rpx; }.filter-picker { height: 70rpx; min-width: 210rpx; padding: 0 20rpx; border-radius: 13rpx; font-size: 22rpx; }
  .category-tabs { margin-bottom: 18rpx; }.category-tab-row { gap: 12rpx; }.category-tab { padding: 12rpx 20rpx; font-size: 20rpx; }.knowledge-list { grid-template-columns: 1fr; gap: 16rpx; }
  .knowledge-card { position: relative; padding: 24rpx 24rpx 66rpx; align-items: flex-start; gap: 18rpx; border-radius: 20rpx; }.select-box { width: 30rpx; height: 30rpx; border-radius: 7rpx; font-size: 18rpx; }.file-icon { width: 68rpx; height: 68rpx; border-radius: 17rpx; font-size: 17rpx; }.title-row { align-items: flex-start; flex-wrap: wrap; gap: 10rpx; }.item-title { max-width: 100%; font-size: 27rpx; white-space: normal; }.category-tag { padding: 5rpx 12rpx; font-size: 18rpx; }.item-description { margin-top: 10rpx; font-size: 22rpx; }.meta-row { margin-top: 12rpx; flex-direction: column; gap: 4rpx; font-size: 19rpx; }.card-actions { position: absolute; right: 24rpx; bottom: 22rpx; gap: 22rpx; }
  .empty-card { padding: 90rpx 24rpx; border-radius: 20rpx; }.empty-title { font-size: 27rpx; }.empty-description { font-size: 21rpx; }
  .form-grid { grid-template-columns: 1fr; gap: 24rpx; }.form-label { font-size: 24rpx; }.form-input,.sort-input { height: 76rpx; padding: 0 20rpx; border-radius: 13rpx; font-size: 24rpx; }.form-textarea { height: 160rpx; padding: 20rpx; border-radius: 13rpx; font-size: 24rpx; }.form-picker,.file-picker { height: 76rpx; padding: 0 20rpx; border-radius: 13rpx; font-size: 22rpx; }
  .category-form { grid-template-columns: 1fr 130rpx; gap: 12rpx; }.category-form .mini-save-btn { grid-column: 1 / -1; }.category-row { padding: 22rpx 2rpx; }.category-name { font-size: 25rpx; }.category-meta { font-size: 19rpx; }.action-link { font-size: 22rpx; }
  .modal-mask { padding: 0; align-items: flex-end; }.modal-panel,.wide-modal { width: 100%; max-height: 86vh; border-radius: 28rpx 28rpx 0 0; }.modal-header { padding: 26rpx 32rpx; }.modal-title { font-size: 32rpx; }.modal-description { margin-top: 5rpx; font-size: 21rpx; }.modal-close { font-size: 44rpx; }.modal-body { max-height: 62vh; padding: 24rpx 32rpx; }.modal-footer { padding: 20rpx 32rpx 28rpx; gap: 14rpx; }.modal-footer .secondary-btn,.modal-footer .save-btn { flex: 1; }
}
</style>
