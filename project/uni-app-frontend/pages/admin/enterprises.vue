<template>
  <AdminShell active-key="enterprises" title="企业数据查询" wide @ready="handleAdminReady">
    <!-- 页面标题与导出操作 -->
    <view class="page-heading">
      <view class="heading-copy"><text class="heading-title">企业数据查询</text><text class="heading-desc">查询企业档案、检查情况、隐患整改和报告记录</text></view>
      <view class="export-btn" @click="exportExcel">导出当前结果</view>
    </view>

    <!-- 当前筛选结果统计 -->
    <view class="summary-grid">
      <view class="summary-card"><text class="summary-value">{{ filteredList.length }}</text><text class="summary-label">企业数量</text></view>
      <view class="summary-card"><text class="summary-value orange">{{ hazardTotal }}</text><text class="summary-label">隐患总数</text></view>
      <view class="summary-card"><text class="summary-value red">{{ pendingTotal }}</text><text class="summary-label">待整改隐患</text></view>
      <view class="summary-card"><text class="summary-value green">{{ rectificationRate }}%</text><text class="summary-label">整改完成率</text></view>
    </view>

    <!-- 多维度企业筛选 -->
    <view class="filter-panel">
      <input v-model="query.keyword" class="filter-input keyword-input" placeholder="搜索企业、检查员、联系人或地区" />
      <picker :range="industryOptions" @change="changeIndustry"><view class="filter-picker">{{ query.industry }}⌄</view></picker>
      <picker :range="typeOptions" @change="changeType"><view class="filter-picker">{{ query.enterprise_type }}⌄</view></picker>
      <picker :range="riskOptions" @change="changeRisk"><view class="filter-picker">{{ query.risk_level }}⌄</view></picker>
      <view class="custom-selector filter-status-selector" :class="{ expanded: dropdownState.filter }">
        <view class="filter-picker" @click.stop="toggleStatusDropdown('filter')">{{ query.status_label }}⌄</view>
        <view v-if="dropdownState.filter" class="selector-options filter-selector-options">
          <view v-for="option in statusOptions" :key="option.value" class="selector-option" :class="{ active: query.status === option.value }" @click.stop="selectFilterStatus(option)">{{ option.label }}</view>
        </view>
      </view>
      <input v-model="query.date" class="filter-input date-input" placeholder="排查月份，如 2026-06" />
      <view class="clear-btn" @click="clearFilters">清空筛选</view>
    </view>

    <!-- 按排查状态或所属区域快速分类 -->
    <view class="category-panel">
      <view class="category-mode">
        <text :class="{ active: categoryMode === 'status' }" @click="changeCategoryMode('status')">按排查状态</text>
        <text :class="{ active: categoryMode === 'region' }" @click="changeCategoryMode('region')">按所属区域</text>
      </view>
      <scroll-view scroll-x class="category-scroll">
        <view class="category-list">
          <text v-for="item in categoryOptions" :key="item" :class="{ active: activeCategory === item }" @click="activeCategory = item">{{ getCategoryLabel(item) }} {{ getCategoryCount(item) }}</text>
        </view>
      </scroll-view>
    </view>

    <!-- 排序和筛选结果提示 -->
    <view class="result-toolbar">
      <text>共找到 {{ sortedList.length }} 家企业</text>
      <view class="sort-group">
        <text class="sort-item" :class="{ active: sortBy === 'date' }" @click="sortBy = 'date'">最新排查</text>
        <text class="sort-item" :class="{ active: sortBy === 'risk' }" @click="sortBy = 'risk'">风险优先</text>
        <text class="sort-item" :class="{ active: sortBy === 'name' }" @click="sortBy = 'name'">企业名称</text>
      </view>
    </view>

    <view v-if="sortedList.length === 0" class="empty-card">暂无符合条件的企业数据</view>

    <!-- 企业档案与检查数据卡片 -->
    <view v-for="item in sortedList" :key="item.id" class="enterprise-card">
      <view class="enterprise-head" @click="toggle(item.id)">
        <view class="enterprise-main">
          <view class="name-row">
            <text class="enterprise-name">{{ normalizeDisplayText(item.name, '未命名企业') }}</text>
            <text class="status-tag" :class="{ archived: item.status === 'archived' }">{{ item.status === 'active' ? '正常' : '已归档' }}</text>
            <text class="inspection-tag">{{ getInspectionStatusLabel(item.inspection_status) }}</text>
            <text class="risk-tag" :class="{ high: item.risk_level === '高风险' }">{{ item.risk_level }}</text>
          </view>
          <text class="enterprise-meta">{{ buildEnterpriseMeta(item) }}</text>
          <text class="enterprise-address">{{ normalizeDisplayText(item.address) }}</text>
        </view>
        <view class="head-actions"><text class="edit-link" @click.stop="openEdit(item)">编辑信息</text><text class="expand-link">{{ expandedId === item.id ? '收起详情' : '查看详情' }}</text></view>
      </view>

      <!-- 企业核心检查指标 -->
      <view class="metric-grid">
        <view><text class="metric-value">{{ item.hazard_count }}</text><text class="metric-label">发现隐患</text></view>
        <view><text class="metric-value danger-value">{{ item.pending_count }}</text><text class="metric-label">待整改</text></view>
        <view><text class="metric-value success-value">{{ item.rectified_count }}</text><text class="metric-label">已整改</text></view>
        <view><text class="metric-value">{{ item.image_count }}</text><text class="metric-label">隐患图片</text></view>
        <view><text class="metric-value">{{ item.analysis_count }}</text><text class="metric-label">AI 分析</text></view>
        <view><text class="metric-value">{{ item.report_count }}</text><text class="metric-label">报告</text></view>
      </view>

      <view v-if="expandedId === item.id" class="detail-panel">
        <!-- 企业基础档案 -->
        <view class="detail-section">
          <text class="section-title">企业基础档案</text>
          <view class="detail-grid">
            <view><text class="detail-label">企业名称</text><text>{{ normalizeDisplayText(item.name, '未命名企业') }}</text></view>
            <view><text class="detail-label">企业类型</text><text>{{ normalizeDisplayText(item.enterprise_type) }}</text></view>
            <view><text class="detail-label">企业规模</text><text>{{ normalizeDisplayText(item.scale) }}</text></view>
            <view><text class="detail-label">所属行业</text><text>{{ normalizeDisplayText(item.industry) }}</text></view>
            <view class="full-row"><text class="detail-label">详细地址</text><text>{{ normalizeDisplayText(item.address) }}</text></view>
            <view class="full-row"><text class="detail-label">生产工艺</text><text>{{ normalizeDisplayText(item.production_process) }}</text></view>
          </view>
        </view>

        <!-- 联系人与检查信息 -->
        <view class="detail-section">
          <text class="section-title">联系与检查信息</text>
          <view class="detail-grid">
            <view><text class="detail-label">企业联系人</text><text>{{ normalizeDisplayText(item.contact) }}</text></view>
            <view><text class="detail-label">联系电话</text><text>{{ normalizeDisplayText(item.phone) }}</text></view>
            <view><text class="detail-label">所属检查员</text><text>{{ normalizeDisplayText(item.username) }}</text></view>
            <view><text class="detail-label">现场排查人员</text><text>{{ normalizeDisplayText(item.inspector_name) }}</text></view>
            <view><text class="detail-label">最近排查日期</text><text>{{ normalizeDisplayText(item.inspection_date) }}</text></view>
            <view><text class="detail-label">排查状态</text><text>{{ getInspectionStatusLabel(item.inspection_status) }}</text></view>
            <view><text class="detail-label">当前风险等级</text><text>{{ item.risk_level }}</text></view>
            <view><text class="detail-label">最新保存时间</text><text>{{ normalizeDisplayText(item.updated_at) }}</text></view>
          </view>
        </view>

        <!-- 隐患类型与整改进度 -->
        <view class="detail-section">
          <view class="section-heading"><text class="section-title">隐患与整改情况</text><text class="rate-text">整改率 {{ getRectificationRate(item) }}%</text></view>
          <view class="progress-track"><view class="progress-value" :style="{ width: getRectificationRate(item) + '%' }"></view></view>
          <view class="hazard-tags"><text v-for="hazard in item.main_hazards" :key="hazard">{{ hazard }}</text></view>
        </view>

        <!-- 与企业自动关联的专属隐患排查档案 -->
        <view class="detail-section">
          <text class="section-title">专属隐患排查档案</text>
          <view class="archive-grid">
            <view><text class="archive-title">关联隐患图片</text><text v-for="image in normalizeList(item.recent_images, '暂无关联图片')" :key="'image-' + image" class="archive-item">{{ image }}</text></view>
            <view><text class="archive-title">关联分析结果</text><text v-for="analysis in normalizeList(item.recent_analyses, '暂无关联分析')" :key="'analysis-' + analysis" class="archive-item">{{ analysis }}</text></view>
          </view>
        </view>

        <!-- 企业关联报告记录 -->
        <view class="detail-section">
          <text class="section-title">报告记录</text>
          <view v-if="!item.reports || item.reports.length === 0" class="no-report">暂无报告记录</view>
          <view v-for="report in item.reports || []" :key="report.id" class="report-row">
            <view class="report-info">
              <text class="report-name">{{ normalizeDisplayText(report.title, '未命名报告') }}</text>
              <text class="report-date">{{ normalizeDisplayText(report.created_at, '时间未知') }}</text>
              <text class="report-ref-count">{{ Number(report.knowledge_ref_count || 0) > 0 ? `已关联 ${report.knowledge_ref_count} 条依据` : '暂无本地依据关联' }}</text>
              <view v-if="report.knowledge_refs && report.knowledge_refs.length" class="report-ref-list">
                <text v-for="(ref, refIndex) in report.knowledge_refs" :key="`${report.id}-ref-${refIndex}`" class="report-ref-item">{{ formatReportRef(ref) }}</text>
              </view>
            </view>
            <view><text class="download-link" @click="downloadReport(report, 'word')">Word</text><text class="download-link" @click="downloadReport(report, 'pdf')">PDF</text></view>
          </view>
        </view>
      </view>
    </view>

    <!-- 企业信息编辑弹窗，保存后更新当前最新数据 -->
    <view v-if="showEditModal" class="modal-mask" @click="closeEdit">
      <view class="modal-panel" @click.stop="">
        <view class="modal-header"><view><text class="modal-title">编辑企业信息</text><text class="modal-desc">管理员维护的是全局企业档案，保存后会影响关联检查员和报告展示</text></view><text class="modal-close" @click="closeEdit">×</text></view>
        <scroll-view scroll-y class="modal-body">
          <view class="edit-grid">
            <view class="form-item full"><text class="form-label">企业名称</text><input v-model="editForm.name" class="form-input" /></view>
            <view class="form-item"><text class="form-label">所属区域</text><input v-model="editForm.region" class="form-input" /></view>
            <view class="form-item"><text class="form-label">所属行业</text><input v-model="editForm.industry" class="form-input" /></view>
            <view class="form-item"><text class="form-label">企业类型</text><input v-model="editForm.enterprise_type" class="form-input" /></view>
            <view class="form-item"><text class="form-label">企业规模</text><input v-model="editForm.scale" class="form-input" /></view>
            <view class="form-item"><text class="form-label">联系人</text><input v-model="editForm.contact" class="form-input" /></view>
            <view class="form-item"><text class="form-label">联系电话</text><input v-model="editForm.phone" class="form-input" /></view>
            <view class="form-item"><text class="form-label">现场排查人员</text><input v-model="editForm.inspector_name" class="form-input" /></view>
            <view class="form-item"><text class="form-label">排查日期</text><input v-model="editForm.inspection_date" class="form-input" /></view>
            <view class="form-item custom-selector" :class="{ expanded: dropdownState.inspection }"><text class="form-label">排查状态</text><view class="form-picker" @click.stop="toggleStatusDropdown('inspection')">{{ getInspectionStatusLabel(editForm.inspection_status) }}⌄</view><view v-if="dropdownState.inspection" class="selector-options"><view v-for="option in inspectionStatusOptions" :key="option.value" class="selector-option" :class="{ active: editForm.inspection_status === option.value }" @click.stop="selectEditInspectionStatus(option)">{{ option.label }}</view></view></view>
            <view class="form-item custom-selector" :class="{ expanded: dropdownState.archive }"><text class="form-label">档案状态</text><view class="form-picker" @click.stop="toggleStatusDropdown('archive')">{{ getArchiveStatusLabel(editForm.status) }}⌄</view><view v-if="dropdownState.archive" class="selector-options"><view v-for="option in editStatusOptions" :key="option.value" class="selector-option" :class="{ active: editForm.status === option.value }" @click.stop="selectEditArchiveStatus(option)">{{ option.label }}</view></view></view>
            <view class="form-item full"><text class="form-label">详细地址</text><input v-model="editForm.address" class="form-input" /></view>
            <view class="form-item full"><text class="form-label">生产工艺</text><textarea v-model="editForm.production_process" class="form-textarea" /></view>
          </view>
        </scroll-view>
        <view class="modal-footer"><view class="cancel-btn" @click="closeEdit">取消</view><view class="save-btn" @click="saveEnterprise">保存最新数据</view></view>
      </view>
    </view>

  </AdminShell>
</template>

<script setup>
import { ref, computed } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { apiUrl, assetUrl, downloadFile, getAccessToken, request, unwrapResponse } from '../../common/api-config'

/** 当前管理员信息 */
const user = ref({})
/** 企业查询原始列表 */
const list = ref([])
/** 当前展开企业 ID */
const expandedId = ref(null)
/** 当前排序字段 */
const sortBy = ref('date')
/** 当前分类方式 */
const categoryMode = ref('status')
/** 当前分类值 */
const activeCategory = ref('全部')
/** 企业编辑弹窗状态 */
const showEditModal = ref(false)
/** 当前企业编辑表单 */
const editForm = ref({})
/** 三个状态下拉框的展开状态 */
const dropdownState = ref({ filter: false, inspection: false, archive: false })
/** 企业多维度查询条件 */
const query = ref({ keyword: '', industry: '全部行业', enterprise_type: '全部类型', risk_level: '全部风险', status: 'all', status_label: '全部状态', date: '' })
/** 行业筛选选项 */
const industryOptions = ['全部行业', '建筑施工', '危险化学品', '煤矿安全']
/** 企业类型筛选选项 */
const typeOptions = ['全部类型', '有限责任公司', '股份有限公司', '国有企业']
/** 风险等级筛选选项 */
const riskOptions = ['全部风险', '高风险', '中风险', '低风险']
/** 企业状态筛选选项 */
const statusOptions = [{ label: '全部状态', value: 'all' }, { label: '正常企业', value: 'active' }, { label: '已归档', value: 'archived' }]
/** 排查状态选项 */
const inspectionStatusOptions = [
  { label: '待排查', value: 'pending' },
  { label: '排查中', value: 'inspecting' },
  { label: '整改中', value: 'rectification' },
  { label: '已完成', value: 'completed' }
]
/** 企业编辑档案状态选项 */
const editStatusOptions = [{ label: '正常', value: 'active' }, { label: '已归档', value: 'archived' }]
/** 当前分类模式对应的分类选项 */
const categoryOptions = computed(() => ['全部', ...new Set(list.value.map(item => categoryMode.value === 'status' ? item.inspection_status : item.region))])

/** 调用阶段 C 管理员接口，统一通过 Bearer Token 识别管理员身份 */
const postAdmin = (path, payload = {}) => new Promise((resolve, reject) => {
  request({
    url: apiUrl(path),
    method: 'POST',
    data: payload,
  }).then((response) => {
    const result = unwrapResponse(response)
    if (!result.ok) { reject(new Error(result.msg || '请求失败')); return }
    resolve(result.raw)
  }).catch(() => reject(new Error('无法连接后端服务')))
})

/** 展示接口错误提示 */
const showRequestError = (error) => {
  uni.showToast({ title: error?.message || '操作失败', icon: 'none' })
}

/** 前端兜底展示文本，避免空值、问号占位或明显乱码影响演示观感 */
const normalizeDisplayText = (value, fallback = '未填写') => {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  if (!text) return fallback
  const compact = text.replace(/\s+/g, '')
  if (!compact) return fallback
  if (/^[?？]+$/.test(compact)) return fallback
  const suspiciousCount = (text.match(/[?？�]/g) || []).length
  if (suspiciousCount >= 2 && suspiciousCount / text.length >= 0.3) return fallback
  return text
}

/** 格式化企业报告中的引用依据摘要 */
const formatReportRef = (ref = {}) => {
  const title = ref.source_title ? `《${ref.source_title}》` : '未命名依据'
  const code = ref.source_code ? `（${ref.source_code}）` : ''
  const clause = ref.clause_no || ''
  const content = ref.content ? `：${String(ref.content).slice(0, 80)}` : ''
  return `${title}${code}${clause}${content}`
}

/** 企业头部副标题：仅展示可读字段，全部缺失时统一兜底 */
const buildEnterpriseMeta = (item) => {
  const parts = [
    normalizeDisplayText(item.region, ''),
    normalizeDisplayText(item.industry, ''),
    normalizeDisplayText(item.enterprise_type, ''),
    normalizeDisplayText(item.scale, '')
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : '未填写'
}

/** 列表型字段统一兜底，避免空数组时面板留白 */
const normalizeList = (values, fallback = '暂无记录') => {
  const list = Array.isArray(values)
    ? values.map((item) => normalizeDisplayText(item, '')).filter(Boolean)
    : []
  return list.length ? list : [fallback]
}

/** 根据全部查询条件筛选企业 */
const filteredList = computed(() => {
  const text = query.value.keyword.trim().toLowerCase()
  return list.value.filter(item => {
    const textMatched = !text || [item.name, item.username, item.contact, item.region, item.address].some(value => String(value || '').toLowerCase().includes(text))
    return textMatched
      && (activeCategory.value === '全部' || (categoryMode.value === 'status' ? item.inspection_status : item.region) === activeCategory.value)
      && (query.value.industry === '全部行业' || item.industry === query.value.industry)
      && (query.value.enterprise_type === '全部类型' || item.enterprise_type === query.value.enterprise_type)
      && (query.value.risk_level === '全部风险' || item.risk_level === query.value.risk_level)
      && (query.value.status === 'all' || item.status === query.value.status)
      && (!query.value.date || (item.inspection_date || '').includes(query.value.date))
  })
})

/** 根据当前排序规则生成结果列表 */
const sortedList = computed(() => [...filteredList.value].sort((a, b) => {
  if (sortBy.value === 'name') return (a.name || '').localeCompare(b.name || '')
  if (sortBy.value === 'risk') return (b.pending_count || 0) - (a.pending_count || 0)
  return (b.inspection_date || '').localeCompare(a.inspection_date || '')
}))
/** 当前筛选结果隐患总数 */
const hazardTotal = computed(() => filteredList.value.reduce((total, item) => total + (item.hazard_count || 0), 0))
/** 当前筛选结果待整改隐患数 */
const pendingTotal = computed(() => filteredList.value.reduce((total, item) => total + (item.pending_count || 0), 0))
/** 当前筛选结果总体整改率 */
const rectificationRate = computed(() => hazardTotal.value ? Math.round((hazardTotal.value - pendingTotal.value) / hazardTotal.value * 100) : 0)

/** 公共框架鉴权完成后加载企业综合查询数据 */
const handleAdminReady = async (admin) => {
  user.value = admin
  await fetchEnterpriseQuery()
}

/** 调用后端企业综合查询接口 */
const fetchEnterpriseQuery = async () => {
  try {
    const response = await postAdmin('/api/admin/enterprises/query', buildQueryFilters())
    list.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    showRequestError(error)
  }
}

/** 构建服务端筛选参数，前端"全部"类选项不传值 */
const buildQueryFilters = () => {
  const filters = { sort_by: sortBy.value }
  if (query.value.keyword) filters.keyword = query.value.keyword
  if (query.value.industry !== '全部行业') filters.industry = query.value.industry
  if (query.value.enterprise_type !== '全部类型') filters.enterprise_type = query.value.enterprise_type
  if (query.value.risk_level !== '全部风险') filters.risk_level = query.value.risk_level
  if (query.value.status !== 'all') filters.status = query.value.status
  if (query.value.date) filters.inspection_date = query.value.date
  return filters
}

/** 切换企业分类模式 */
const changeCategoryMode = mode => { categoryMode.value = mode; activeCategory.value = '全部' }
/** 获取指定分类企业数量 */
const getCategoryCount = category => category === '全部' ? list.value.length : list.value.filter(item => (categoryMode.value === 'status' ? item.inspection_status : item.region) === category).length
/** 获取分类显示名称，排查状态保持英文值筛选并统一显示中文 */
const getCategoryLabel = category => categoryMode.value === 'status' && category !== '全部' ? getInspectionStatusLabel(category) : category
/** 获取排查状态中文名称，未知历史值保留原值便于排查 */
const getInspectionStatusLabel = value => inspectionStatusOptions.find(option => option.value === value)?.label || value || '待排查'
/** 获取企业档案状态中文名称 */
const getArchiveStatusLabel = value => editStatusOptions.find(option => option.value === value)?.label || '正常'
/** 切换行业筛选 */
const changeIndustry = event => { query.value.industry = industryOptions[event.detail.value] || '全部行业' }
/** 切换企业类型筛选 */
const changeType = event => { query.value.enterprise_type = typeOptions[event.detail.value] || '全部类型' }
/** 切换风险等级筛选 */
const changeRisk = event => { query.value.risk_level = riskOptions[event.detail.value] || '全部风险' }
/** 切换指定状态下拉框，同时关闭其他状态下拉框 */
const toggleStatusDropdown = type => {
  const nextVisible = !dropdownState.value[type]
  dropdownState.value = { filter: false, inspection: false, archive: false, [type]: nextVisible }
}
/** 关闭全部状态下拉框 */
const closeStatusDropdowns = () => { dropdownState.value = { filter: false, inspection: false, archive: false } }
/** 选择企业档案筛选状态 */
const selectFilterStatus = option => {
  query.value.status = option.value
  query.value.status_label = option.label
  closeStatusDropdowns()
}
/** 选择编辑表单排查状态，接口仍提交英文枚举值 */
const selectEditInspectionStatus = option => { editForm.value.inspection_status = option.value; closeStatusDropdowns() }
/** 选择编辑表单档案状态，接口仍提交英文枚举值 */
const selectEditArchiveStatus = option => { editForm.value.status = option.value; closeStatusDropdowns() }
/** 清空全部查询条件并重新查询 */
const clearFilters = () => { closeStatusDropdowns(); query.value = { keyword: '', industry: '全部行业', enterprise_type: '全部类型', risk_level: '全部风险', status: 'all', status_label: '全部状态', date: '' }; fetchEnterpriseQuery() }
/** 展开或收起企业详情 */
const toggle = id => { expandedId.value = expandedId.value === id ? null : id }
/** 计算单个企业整改完成率 */
const getRectificationRate = item => item.hazard_count ? Math.round((item.rectified_count || 0) / item.hazard_count * 100) : 0
/** 打开企业编辑弹窗 */
const openEdit = item => { closeStatusDropdowns(); editForm.value = { ...item }; showEditModal.value = true }
/** 关闭企业编辑弹窗 */
const closeEdit = () => { showEditModal.value = false; closeStatusDropdowns() }

/** 调用后端接口保存企业完整档案 */
const saveEnterprise = async () => {
  if (!String(editForm.value.name || '').trim()) return uni.showToast({ title: '请输入企业名称', icon: 'none' })
  uni.showModal({
    title: '确认保存企业档案',
    content: '本次修改会更新企业全局基础档案，并影响关联检查员、历史报告展示和后续统计。确定继续保存吗？',
    success: async (result) => {
      if (!result.confirm) return
      await submitEnterpriseUpdate()
    }
  })
}

/** 真正提交企业档案更新，供二次确认后调用 */
const submitEnterpriseUpdate = async () => {
  try {
    await postAdmin('/api/admin/enterprises/update', {
      id: editForm.value.id,
      name: editForm.value.name,
      region: editForm.value.region,
      address: editForm.value.address,
      industry: editForm.value.industry,
      enterprise_type: editForm.value.enterprise_type,
      scale: editForm.value.scale,
      contact: editForm.value.contact,
      phone: editForm.value.phone,
      inspector_name: editForm.value.inspector_name,
      inspection_date: editForm.value.inspection_date,
      inspection_status: editForm.value.inspection_status,
      status: editForm.value.status,
      production_process: editForm.value.production_process
    })
    showEditModal.value = false
    await fetchEnterpriseQuery()
    uni.showToast({ title: '企业档案已更新', icon: 'success' })
  } catch (error) {
    showRequestError(error)
  }
}

/** 调用后端导出当前筛选结果为 CSV 文件并触发下载 */
const exportExcel = async () => {
  try {
    uni.showLoading({ title: '正在生成导出文件...' })
    const response = await postAdmin('/api/admin/enterprises/export', buildQueryFilters())
    uni.hideLoading()
    const downloadUrl = assetUrl(response.file_path || response.data?.file_path)
    // #ifdef H5
    window.open(apiUrl(downloadUrl))
    // #endif
    // #ifndef H5
    uni.downloadFile({
      url: downloadUrl,
      success: (res) => {
        uni.openDocument({ filePath: res.tempFilePath })
      }
    })
    // #endif
    uni.showToast({ title: `已导出 ${filteredList.value.length} 家企业`, icon: 'success' })
  } catch (error) {
    uni.hideLoading()
    showRequestError(error)
  }
}

/** 下载 Word 或 PDF 报告 */
const downloadReport = async (report, format) => {
  const legacyPath = format === 'word' ? report.word_path : report.pdf_path
  if (!report?.id && !legacyPath) return uni.showToast({ title: '报告文件不存在', icon: 'none' })
  const url = report?.id ? apiUrl(`/api/files/reports/${report.id}/${format}`) : assetUrl(legacyPath)
  // #ifdef H5
  try {
    const response = await fetch(url, {
      headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
    })
    if (!response.ok) throw new Error('下载失败')
    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.msg || payload?.message || '报告下载失败')
    }
    const blob = await response.blob()
    if (String(blob.type || '').includes('application/json')) {
      const payload = JSON.parse(await blob.text().catch(() => '{}'))
      throw new Error(payload?.msg || payload?.message || '报告下载失败')
    }
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `${report.title || 'inspection-report'}.${format === 'word' ? 'docx' : 'pdf'}`
    link.click()
    URL.revokeObjectURL(objectUrl)
  } catch (error) {
    uni.showToast({ title: error?.message || '报告下载失败，请刷新后重试', icon: 'none' })
  }
  // #endif
  // #ifndef H5
  downloadFile({
    url,
    success: (res) => {
      uni.openDocument({ filePath: res.tempFilePath })
    },
    fail: () => uni.showToast({ title: '下载失败', icon: 'none' })
  })
  // #endif
}
</script>

<style scoped>
.page-heading { margin-bottom: 22px; display: flex; align-items: center; justify-content: space-between; }.heading-title { display: block; color: #172541; font-size: 28px; font-weight: 700; }.heading-desc { display: block; margin-top: 6px; color: #8b98aa; font-size: 14px; }.export-btn,.clear-btn { height: 40px; padding: 0 16px; display: flex; align-items: center; justify-content: center; border-radius: 9px; font-size: 13px; }.export-btn { background: #18a66c; color: #fff; }.clear-btn { background: #f1f4f8; color: #69778c; }
.summary-grid { margin-bottom: 18px; display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }.summary-card { padding: 17px 19px; display: flex; flex-direction: column; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }.summary-value { color: #1677ff; font-size: 24px; font-weight: 700; }.summary-value.orange { color: #ff922b; }.summary-value.red { color: #f05252; }.summary-value.green { color: #18a66c; }.summary-label { margin-top: 5px; color: #8b98aa; font-size: 11px; }
.filter-panel { padding: 14px; display: flex; flex-wrap: wrap; gap: 10px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }.filter-input,.filter-picker { height: 40px; padding: 0 12px; border: 1px solid #e2e9f2; border-radius: 9px; background: #f9fbfd; box-sizing: border-box; font-size: 12px; }.keyword-input { flex: 1; min-width: 300px; }.date-input { width: 190px; }.filter-picker { min-width: 130px; display: flex; align-items: center; color: #59677d; }
.category-panel { margin-top: 12px; padding: 12px 14px; display: flex; align-items: center; gap: 16px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }.category-mode { display: flex; flex-shrink: 0; gap: 5px; }.category-mode text,.category-list text { padding: 6px 10px; border-radius: 20px; color: #7c899b; font-size: 11px; }.category-mode text.active,.category-list text.active { background: #eaf3ff; color: #1677ff; }.category-scroll { flex: 1; white-space: nowrap; }.category-list { display: inline-flex; gap: 6px; }
.result-toolbar { margin: 14px 0; display: flex; align-items: center; justify-content: space-between; color: #8b98aa; font-size: 12px; }.sort-group { display: flex; gap: 8px; }.sort-item { padding: 6px 11px; border-radius: 20px; background: #fff; color: #69778c; }.sort-item.active { background: #eaf3ff; color: #1677ff; }
.enterprise-card { margin-bottom: 13px; padding: 18px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }.enterprise-head { display: flex; justify-content: space-between; align-items: center; }.enterprise-main { min-width: 0; }.name-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }.enterprise-name { color: #24334e; font-size: 15px; font-weight: 700; }.status-tag,.inspection-tag,.risk-tag { padding: 3px 8px; border-radius: 20px; font-size: 10px; }.status-tag { background: #eaf8f1; color: #18a66c; }.status-tag.archived { background: #f1f3f6; color: #8995a7; }.inspection-tag { background: #eaf3ff; color: #1677ff; }.risk-tag { background: #fff6e6; color: #e78a00; }.risk-tag.high { background: #fff0f1; color: #e84d56; }.enterprise-meta,.enterprise-address { display: block; margin-top: 5px; color: #96a2b3; font-size: 11px; }.head-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }.edit-link,.expand-link,.download-link { color: #1677ff; font-size: 12px; }.edit-link { color: #18a66c; }
.metric-grid { margin-top: 16px; padding: 13px 0; display: grid; grid-template-columns: repeat(6,1fr); border-top: 1px solid #edf1f7; }.metric-grid>view { display: flex; flex-direction: column; }.metric-value { color: #263651; font-size: 18px; font-weight: 700; }.danger-value { color: #f05252; }.success-value { color: #18a66c; }.metric-label { margin-top: 3px; color: #9aa6b7; font-size: 10px; }
.detail-panel { padding-top: 2px; border-top: 1px solid #edf1f7; }.detail-section { padding: 16px 0; border-bottom: 1px solid #edf1f7; }.detail-section:last-child { border-bottom: 0; padding-bottom: 0; }.section-title { color: #31405a; font-size: 13px; font-weight: 700; }.section-heading { display: flex; justify-content: space-between; }.rate-text { color: #18a66c; font-size: 11px; }.detail-grid { margin-top: 11px; display: grid; grid-template-columns: repeat(2,1fr); gap: 9px 24px; color: #526078; font-size: 11px; }.detail-grid>view { display: flex; }.detail-grid .full-row { grid-column: 1 / -1; }.detail-label { width: 78px; flex-shrink: 0; color: #9aa6b7; }
.progress-track { height: 7px; margin-top: 11px; overflow: hidden; border-radius: 10px; background: #edf1f7; }.progress-value { height: 100%; border-radius: 10px; background: linear-gradient(90deg,#24bf7a,#54d99b); }.hazard-tags { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 7px; }.hazard-tags text { padding: 5px 9px; border-radius: 20px; background: #fff4e8; color: #d77b16; font-size: 10px; }.report-row { padding: 11px 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-top: 1px solid #f0f3f7; }.report-info { min-width: 0; display: flex; flex-direction: column; }.report-name { color: #526078; font-size: 11px; }.report-date,.no-report { margin-top: 3px; color: #a1adbc; font-size: 10px; }.report-ref-count { margin-top: 5px; color: #69778c; font-size: 10px; }.report-ref-list { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }.report-ref-item { color: #6d7b90; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }.download-link { margin-left: 13px; }.empty-card { padding: 70px; background: #fff; border: 1px dashed #dce5f0; border-radius: 14px; color: #9aa6b6; text-align: center; }
.archive-grid { margin-top: 11px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.archive-grid>view { padding: 11px; border-radius: 9px; background: #f8fafe; }.archive-title,.archive-item { display: block; }.archive-title { margin-bottom: 7px; color: #526078; font-size: 11px; font-weight: 700; }.archive-item { margin-top: 4px; color: #8491a4; font-size: 10px; }
.modal-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 5000; padding: 24px; display: flex; align-items: center; justify-content: center; background: rgba(15,28,50,.46); box-sizing: border-box; }.modal-panel { width: 760px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; background: #fff; border-radius: 18px; }.modal-header { padding: 22px 26px; display: flex; justify-content: space-between; border-bottom: 1px solid #edf1f7; }.modal-title { display: block; color: #172541; font-size: 21px; font-weight: 700; }.modal-desc { display: block; margin-top: 5px; color: #909daf; font-size: 13px; }.modal-close { color: #91a0b5; font-size: 26px; }.modal-body { flex: 1; max-height: 66vh; padding: 24px 26px; box-sizing: border-box; }.modal-footer { padding: 16px 26px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #edf1f7; }.edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }.form-item.full { grid-column: 1 / -1; }.form-label { display: block; margin-bottom: 7px; color: #536179; font-size: 12px; font-weight: 600; }.form-input,.form-picker,.form-textarea { width: 100%; padding: 0 12px; border: 1px solid #e2e9f2; border-radius: 9px; background: #f9fbfd; box-sizing: border-box; font-size: 12px; }.form-input,.form-picker { height: 40px; }.form-picker { display: flex; align-items: center; }.form-textarea { height: 80px; padding-top: 11px; }.cancel-btn,.save-btn { height: 38px; padding: 0 16px; display: flex; align-items: center; justify-content: center; border-radius: 9px; font-size: 12px; }.cancel-btn { background: #f1f4f8; color: #69778c; }.save-btn { background: #1677ff; color: #fff; }
.custom-selector { position: relative; z-index: 20; }.custom-selector.expanded { z-index: 200; }.filter-status-selector { z-index: 30; }.selector-options { position: absolute; top: calc(100% + 6px); right: 0; left: 0; z-index: 100; padding: 6px 0; overflow: hidden; border: 1px solid #e2e9f2; border-radius: 9px; background: #fff; box-shadow: 0 10px 24px rgba(15,28,50,.16); }.filter-selector-options { min-width: 180px; }.selector-option { padding: 11px 13px; color: #536179; font-size: 12px; white-space: nowrap; }.selector-option.active { background: #eaf3ff; color: #1677ff; font-weight: 600; }
@media screen and (max-width:900px) {
  .page-heading { margin-bottom: 20rpx; }.heading-copy { display: none; }.export-btn,.clear-btn { height: 70rpx; padding: 0 22rpx; border-radius: 13rpx; font-size: 23rpx; }
  .summary-grid { grid-template-columns: repeat(2,1fr); gap: 12rpx; }.summary-card { padding: 20rpx; border-radius: 18rpx; }.summary-value { font-size: 34rpx; }.summary-label { font-size: 20rpx; }
  .filter-panel { padding: 18rpx; gap: 12rpx; border-radius: 19rpx; }.filter-input,.filter-picker { height: 70rpx; padding: 0 18rpx; border-radius: 13rpx; font-size: 22rpx; }.keyword-input { width: 100%; min-width: 0; flex-basis: 100%; }.date-input { flex: 1; width: auto; }.filter-picker { min-width: 220rpx; flex: 1; }.result-toolbar { font-size: 20rpx; }.sort-group { gap: 6rpx; }.sort-item { padding: 9rpx 12rpx; }
  .category-panel { margin-top: 14rpx; padding: 16rpx; display: block; border-radius: 19rpx; }.category-mode { margin-bottom: 12rpx; }.category-mode text,.category-list text { padding: 10rpx 16rpx; font-size: 20rpx; }
  .enterprise-card { margin-bottom: 16rpx; padding: 24rpx; border-radius: 20rpx; }.enterprise-head { align-items: flex-start; }.enterprise-name { font-size: 27rpx; }.status-tag,.inspection-tag,.risk-tag { font-size: 18rpx; }.enterprise-meta,.enterprise-address { font-size: 20rpx; line-height: 1.5; }.edit-link,.expand-link,.download-link { font-size: 21rpx; }.metric-grid { grid-template-columns: repeat(3,1fr); gap: 20rpx 0; }.metric-value { font-size: 30rpx; }.metric-label { font-size: 19rpx; }
  .detail-section { padding: 24rpx 0; }.section-title { font-size: 25rpx; }.rate-text { font-size: 21rpx; }.detail-grid { grid-template-columns: 1fr; gap: 15rpx; font-size: 21rpx; }.detail-grid .full-row { grid-column: auto; }.detail-label { width: 150rpx; }.progress-track { height: 12rpx; }.hazard-tags text { padding: 8rpx 14rpx; font-size: 19rpx; }.report-row { gap: 16rpx; }.report-name { font-size: 21rpx; }.report-date,.no-report,.report-ref-count,.report-ref-item { font-size: 19rpx; }
  .archive-grid { grid-template-columns: 1fr; }.archive-title { font-size: 21rpx; }.archive-item { font-size: 19rpx; }.modal-mask { padding: 0; align-items: flex-end; }.modal-panel { width: 100%; max-height: 90vh; border-radius: 28rpx 28rpx 0 0; }.modal-header { padding: 26rpx 32rpx; }.modal-title { font-size: 32rpx; }.modal-desc { font-size: 21rpx; }.modal-close { font-size: 44rpx; }.modal-body { max-height: 68vh; padding: 24rpx 32rpx; }.modal-footer { padding: 20rpx 32rpx 28rpx; }.edit-grid { grid-template-columns: 1fr; gap: 20rpx; }.form-item.full { grid-column: auto; }.form-label { font-size: 23rpx; }.form-input,.form-picker { height: 74rpx; font-size: 23rpx; }.form-textarea { height: 140rpx; font-size: 23rpx; }.cancel-btn,.save-btn { flex: 1; height: 72rpx; font-size: 24rpx; }
  .filter-status-selector { min-width: 220rpx; flex: 1; }.selector-options { top: calc(100% + 8rpx); padding: 8rpx 0; border-radius: 13rpx; }.filter-selector-options { min-width: 260rpx; }.selector-option { padding: 20rpx 22rpx; font-size: 22rpx; }
}
</style>
