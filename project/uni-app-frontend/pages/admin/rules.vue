<template>
  <AdminShell active-key="rules" title="隐患规则库" wide @ready="handleAdminReady">
    <view class="page-heading">
      <view>
        <text class="heading-title">隐患规则库</text>
        <text class="heading-description">维护“法规条文 → 隐患等级 → 整改建议”的人工规则，后续 AI 只在启用规则内做受控匹配。</text>
      </view>
      <view class="page-action-row">
        <view class="secondary-btn" @click="importSeedRules">导入种子规则</view>
        <view class="primary-btn" @click="openCreate">新增规则</view>
      </view>
    </view>

    <view class="summary-grid">
      <view class="summary-card">
        <text class="summary-value">{{ rules.length }}</text>
        <text class="summary-label">规则总数</text>
      </view>
      <view class="summary-card">
        <text class="summary-value green">{{ activeCount }}</text>
        <text class="summary-label">已启用</text>
      </view>
      <view class="summary-card">
        <text class="summary-value orange">{{ strictCount }}</text>
        <text class="summary-label">重大/疑似重大</text>
      </view>
      <view class="summary-card">
        <text class="summary-value blue">{{ referencedCount }}</text>
        <text class="summary-label">已有依据</text>
      </view>
    </view>

    <view class="toolbar-card">
      <input v-model="filters.keyword" class="search-input" placeholder="搜索规则名称、关键词、触发条件" @confirm="fetchRules" />
      <picker :range="categoryOptions" range-key="name" @change="changeFilterCategory">
        <view class="filter-picker">{{ currentFilterCategoryName }} ▾</view>
      </picker>
      <picker :range="hazardFilterOptions" range-key="name" @change="changeFilterLevel">
        <view class="filter-picker">{{ currentFilterLevelName }} ▾</view>
      </picker>
      <view class="secondary-btn" @click="fetchRules">刷新</view>
    </view>

    <view v-if="rules.length" class="rule-list">
      <view v-for="rule in rules" :key="rule.id" class="rule-card">
        <view class="rule-main">
          <view class="rule-title-row">
            <text class="rule-title">{{ rule.name }}</text>
            <text class="level-tag" :class="levelClass(rule.hazard_level)">{{ rule.hazard_level }}</text>
            <text class="state-tag" :class="{ active: rule.is_active }">{{ rule.is_active ? '启用' : '草稿' }}</text>
          </view>
          <view class="rule-meta">
            <text>{{ rule.category_name || getCategoryName(rule.category_id) }}</text>
            <text>{{ rule.image_evidence_supported ? '图片可独立判断' : '需补充资料' }}</text>
            <text>依据 {{ rule.clause_ref_count || rule.clause_refs.length }} 条</text>
          </view>
          <text class="rule-condition">{{ rule.trigger_condition }}</text>
          <view v-if="rule.clause_refs.length" class="clause-preview">
            <text
              v-for="ref in rule.clause_refs.slice(0, 2)"
              :key="ref.clause_id"
              class="clause-chip"
            >
              {{ ref.source_title }} {{ ref.clause_no || '' }}
            </text>
          </view>
        </view>
        <view class="rule-actions">
          <text class="action-link" @click="openEdit(rule)">编辑</text>
          <text class="action-link" @click="toggleRule(rule)">{{ rule.is_active ? '停用' : '启用' }}</text>
          <text class="action-link danger" @click="archiveRule(rule)">归档</text>
        </view>
      </view>
    </view>

    <view v-else class="empty-card">
      <text class="empty-title">暂无隐患规则</text>
      <text class="empty-description">请先导入正式法规条文并完成校验，再新增规则或导入种子规则。</text>
    </view>

    <view v-if="showModal" class="modal-mask" @click="closeModal">
      <view class="modal-panel" @click.stop="">
        <view class="modal-header">
          <view>
            <text class="modal-title">{{ form.id ? '编辑规则' : '新增规则' }}</text>
            <text class="modal-description">启用规则必须关联已校验且现行有效的正式条文；未启用规则可作为草稿暂存。</text>
          </view>
          <text class="modal-close" @click="closeModal">×</text>
        </view>

        <scroll-view scroll-y class="modal-body">
          <view class="form-grid">
            <view class="form-item full">
              <text class="form-label">规则名称</text>
              <input v-model="form.name" class="form-input" maxlength="200" placeholder="例如：消防通道堵塞" />
            </view>
            <view class="form-item">
              <text class="form-label">所属分类</text>
              <picker :range="categoryPickerOptions" range-key="name" @change="changeFormCategory">
                <view class="form-picker">{{ formCategoryName }} ▾</view>
              </picker>
            </view>
            <view class="form-item">
              <text class="form-label">隐患等级</text>
              <picker :range="hazardLevelOptions" range-key="name" @change="changeFormLevel">
                <view class="form-picker">{{ form.hazard_level || '请选择' }} ▾</view>
              </picker>
            </view>
            <view class="form-item">
              <text class="form-label">图片是否可独立判断</text>
              <switch :checked="form.image_evidence_supported" @change="changeImageEvidence" />
            </view>
            <view class="form-item">
              <text class="form-label">启用规则</text>
              <switch :checked="form.is_active" @change="changeActive" />
            </view>
            <view class="form-item full">
              <text class="form-label">可见事实关键词</text>
              <input v-model="form.visible_fact_keywords" class="form-input" maxlength="500" placeholder="多个关键词用逗号分隔" />
            </view>
            <view class="form-item full">
              <text class="form-label">触发条件</text>
              <textarea v-model="form.trigger_condition" class="form-textarea" maxlength="2000" placeholder="描述规则何时触发" />
            </view>
            <view class="form-item full">
              <text class="form-label">所需证据</text>
              <textarea v-model="form.required_evidence" class="form-textarea" maxlength="2000" placeholder="描述需要图片、台账或现场记录证明的内容" />
            </view>
            <view class="form-item">
              <text class="form-label">证据不足默认结论</text>
              <picker :range="insufficientOptions" range-key="name" @change="changeInsufficientLevel">
                <view class="form-picker">{{ form.insufficient_evidence_level }} ▾</view>
              </picker>
            </view>
            <view class="form-item full">
              <text class="form-label">整改建议模板</text>
              <textarea v-model="form.rectification_template" class="form-textarea" maxlength="2000" placeholder="用于报告中的整改建议草稿" />
            </view>
          </view>

          <view class="clause-section">
            <view class="section-head">
              <view>
                <text class="section-title">关联法规条文</text>
                <text class="section-desc">只能关联已校验、现行有效的正式条文。</text>
              </view>
              <view class="mini-btn" @click="searchClauses">搜索条文</view>
            </view>
            <view class="clause-search-row">
              <input v-model="clauseKeyword" class="form-input" placeholder="输入法规名称、条款号或关键词" @confirm="searchClauses" />
            </view>
            <view v-if="selectedClauses.length" class="selected-clause-list">
              <view v-for="clause in selectedClauses" :key="clause.clause_id || clause.id" class="selected-clause">
                <view>
                  <text class="selected-title">{{ clause.source_title }}</text>
                  <text class="selected-meta">{{ clause.source_code || '未标注文号' }} · {{ clause.clause_no || '未标注条款号' }}</text>
                </view>
                <text class="remove-link" @click="removeClause(clause)">移除</text>
              </view>
            </view>
            <view v-if="clauseResults.length" class="clause-result-list">
              <view v-for="clause in clauseResults" :key="clause.id" class="clause-result" @click="addClause(clause)">
                <text class="selected-title">{{ clause.source_title }}</text>
                <text class="selected-meta">{{ clause.source_code || '未标注文号' }} · {{ clause.clause_no || '未标注条款号' }}</text>
                <text class="clause-content">{{ clause.content }}</text>
              </view>
            </view>
          </view>
        </scroll-view>

        <view class="modal-footer">
          <view class="secondary-btn" @click="closeModal">取消</view>
          <view class="save-btn" @click="saveRule">{{ form.id ? '保存修改' : '新增规则' }}</view>
        </view>
      </view>
    </view>
  </AdminShell>
</template>

<script setup>
import { computed, ref } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { apiUrl, request, unwrapResponse } from '../../common/api-config'

const rules = ref([])
const categories = ref([])
const filters = ref({ keyword: '', category_id: 'all', hazard_level: 'all' })
const showModal = ref(false)
const form = ref(createForm())
const clauseKeyword = ref('')
const clauseResults = ref([])
const selectedClauses = ref([])

const hazardLevelOptions = [
  { key: '一般隐患', name: '一般隐患' },
  { key: '疑似重大隐患', name: '疑似重大隐患' },
  { key: '重大隐患', name: '重大隐患' },
  { key: '需人工复核', name: '需人工复核' },
  { key: '未发现明显隐患', name: '未发现明显隐患' },
]
const insufficientOptions = [
  { key: '需人工复核', name: '需人工复核' },
  { key: '疑似隐患', name: '疑似隐患' },
  { key: '疑似重大隐患', name: '疑似重大隐患' },
]

const categoryOptions = computed(() => [{ id: 'all', name: '全部分类' }, ...categories.value])
const categoryPickerOptions = computed(() => categories.value)
const hazardFilterOptions = computed(() => [{ key: 'all', name: '全部等级' }, ...hazardLevelOptions])

const activeCount = computed(() => rules.value.filter((item) => item.is_active).length)
const strictCount = computed(() => rules.value.filter((item) => ['重大隐患', '疑似重大隐患'].includes(item.hazard_level)).length)
const referencedCount = computed(() => rules.value.filter((item) => Number(item.clause_ref_count || 0) > 0).length)

const currentFilterCategoryName = computed(() => (
  categoryOptions.value.find((item) => String(item.id) === String(filters.value.category_id))?.name || '全部分类'
))
const currentFilterLevelName = computed(() => (
  hazardFilterOptions.value.find((item) => item.key === filters.value.hazard_level)?.name || '全部等级'
))
const formCategoryName = computed(() => (
  categoryPickerOptions.value.find((item) => Number(item.id) === Number(form.value.category_id || 0))?.name || '请选择'
))

function createForm() {
  return {
    id: null,
    name: '',
    category_id: null,
    hazard_level: '一般隐患',
    visible_fact_keywords: '',
    trigger_condition: '',
    required_evidence: '',
    image_evidence_supported: true,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '',
    is_active: false,
  }
}

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

const handleAdminReady = async () => {
  await Promise.all([fetchCategories(), fetchRules()])
}

const fetchCategories = async () => {
  try {
    const result = await postAdmin('/api/admin/knowledge/categories/list')
    categories.value = Array.isArray(result.data) ? result.data.map((item) => ({
      ...item,
      id: Number(item.id),
      sort: Number(item.sort || 0) || 0,
    })) : []
  } catch (error) {
    categories.value = []
    showMessage(error?.message || '分类加载失败')
  }
}

const fetchRules = async () => {
  try {
    const payload = {
      keyword: filters.value.keyword,
      status: 'active',
    }
    if (filters.value.category_id !== 'all') payload.category_id = Number(filters.value.category_id)
    if (filters.value.hazard_level !== 'all') payload.hazard_level = filters.value.hazard_level
    const result = await postAdmin('/api/admin/knowledge/rules/list', payload)
    rules.value = Array.isArray(result.data) ? result.data.map(normalizeRule) : []
  } catch (error) {
    rules.value = []
    showMessage(error?.message || '规则加载失败')
  }
}

const normalizeRule = (item = {}) => ({
  ...item,
  id: Number(item.id),
  category_id: item.category_id ? Number(item.category_id) : null,
  image_evidence_supported: !!item.image_evidence_supported,
  is_active: !!item.is_active,
  clause_refs: Array.isArray(item.clause_refs) ? item.clause_refs : [],
  clause_ids: Array.isArray(item.clause_ids) ? item.clause_ids.map(Number) : [],
  clause_ref_count: Number(item.clause_ref_count || item.clause_refs?.length || 0) || 0,
})

const changeFilterCategory = (event) => {
  const option = categoryOptions.value[event.detail.value]
  filters.value.category_id = option ? option.id : 'all'
  fetchRules()
}

const changeFilterLevel = (event) => {
  const option = hazardFilterOptions.value[event.detail.value]
  filters.value.hazard_level = option ? option.key : 'all'
  fetchRules()
}

const changeFormCategory = (event) => {
  const option = categoryPickerOptions.value[event.detail.value]
  form.value.category_id = option ? Number(option.id) : null
}

const changeFormLevel = (event) => {
  form.value.hazard_level = hazardLevelOptions[event.detail.value]?.key || '一般隐患'
}

const changeInsufficientLevel = (event) => {
  form.value.insufficient_evidence_level = insufficientOptions[event.detail.value]?.key || '需人工复核'
}

const changeImageEvidence = (event) => {
  form.value.image_evidence_supported = !!event.detail.value
}

const changeActive = (event) => {
  form.value.is_active = !!event.detail.value
}

const getCategoryName = (categoryId) => (
  categories.value.find((item) => Number(item.id) === Number(categoryId))?.name || '未分类'
)

const levelClass = (level) => {
  if (level === '重大隐患' || level === '疑似重大隐患') return 'level-major'
  if (level === '需人工复核') return 'level-review'
  return 'level-normal'
}

const openCreate = () => {
  form.value = createForm()
  selectedClauses.value = []
  clauseResults.value = []
  clauseKeyword.value = ''
  showModal.value = true
}

const openEdit = (rule) => {
  form.value = {
    id: rule.id,
    name: rule.name,
    category_id: rule.category_id,
    hazard_level: rule.hazard_level,
    visible_fact_keywords: rule.visible_fact_keywords || '',
    trigger_condition: rule.trigger_condition || '',
    required_evidence: rule.required_evidence || '',
    image_evidence_supported: !!rule.image_evidence_supported,
    insufficient_evidence_level: rule.insufficient_evidence_level || '需人工复核',
    rectification_template: rule.rectification_template || '',
    is_active: !!rule.is_active,
  }
  selectedClauses.value = rule.clause_refs.map((item) => ({ ...item, id: Number(item.clause_id) }))
  clauseResults.value = []
  clauseKeyword.value = ''
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  form.value = createForm()
  selectedClauses.value = []
  clauseResults.value = []
  clauseKeyword.value = ''
}

const buildRulePayload = () => ({
  ...form.value,
  clause_ids: selectedClauses.value.map((item) => Number(item.id || item.clause_id)).filter(Boolean),
})

const saveRule = async () => {
  try {
    const path = form.value.id ? '/api/admin/knowledge/rules/update' : '/api/admin/knowledge/rules/create'
    await postAdmin(path, buildRulePayload())
    showMessage(form.value.id ? '规则已更新' : '规则已新增', 'success')
    closeModal()
    await fetchRules()
  } catch (error) {
    showMessage(error?.message || '规则保存失败')
  }
}

const toggleRule = (rule) => {
  uni.showModal({
    title: rule.is_active ? '停用规则' : '启用规则',
    content: rule.is_active ? '停用后该规则不会进入后续 AI 判定候选。' : '启用规则必须已关联已校验法规条文。',
    success: async (result) => {
      if (!result.confirm) return
      try {
        await postAdmin('/api/admin/knowledge/rules/toggle', {
          id: rule.id,
          is_active: !rule.is_active,
        })
        showMessage(rule.is_active ? '规则已停用' : '规则已启用', 'success')
        await fetchRules()
      } catch (error) {
        showMessage(error?.message || '规则状态更新失败')
      }
    },
  })
}

const archiveRule = (rule) => {
  uni.showModal({
    title: '归档规则',
    content: `确定归档“${rule.name}”吗？归档后不会参与后续判定。`,
    success: async (result) => {
      if (!result.confirm) return
      try {
        await postAdmin('/api/admin/knowledge/rules/archive', { id: rule.id })
        showMessage('规则已归档', 'success')
        await fetchRules()
      } catch (error) {
        showMessage(error?.message || '规则归档失败')
      }
    },
  })
}

const importSeedRules = () => {
  uni.showModal({
    title: '导入种子规则',
    content: '系统会按本地已校验条文匹配依据；找不到依据的种子规则会跳过，不会强行启用。',
    success: async (result) => {
      if (!result.confirm) return
      try {
        const response = await postAdmin('/api/admin/knowledge/rules/import-seed')
        const data = response.data || {}
        uni.showModal({
          title: '导入完成',
          content: `新增 ${data.created_rules || 0} 条，更新 ${data.updated_rules || 0} 条，跳过 ${data.skipped_without_clause || 0} 条。`,
          showCancel: false,
        })
        await fetchRules()
      } catch (error) {
        showMessage(error?.message || '种子规则导入失败')
      }
    },
  })
}

const searchClauses = async () => {
  try {
    const payload = { keyword: clauseKeyword.value, limit: 20 }
    if (form.value.category_id) payload.category_id = Number(form.value.category_id)
    const response = await postAdmin('/api/admin/knowledge/rules/search-clauses', payload)
    clauseResults.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    clauseResults.value = []
    showMessage(error?.message || '条文搜索失败')
  }
}

const addClause = (clause) => {
  if (selectedClauses.value.some((item) => Number(item.id || item.clause_id) === Number(clause.id))) {
    showMessage('该条文已关联')
    return
  }
  selectedClauses.value.push(clause)
}

const removeClause = (clause) => {
  const id = Number(clause.id || clause.clause_id)
  selectedClauses.value = selectedClauses.value.filter((item) => Number(item.id || item.clause_id) !== id)
}
</script>

<style scoped>
.page-heading {
  margin-bottom: 20px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.heading-title { display: block; color: #172541; font-size: 26px; font-weight: 700; }
.heading-description { display: block; margin-top: 6px; color: #718096; font-size: 13px; line-height: 1.6; }
.page-action-row { display: flex; gap: 10px; flex-wrap: wrap; }
.primary-btn, .secondary-btn, .save-btn, .mini-btn {
  height: 38px;
  padding: 0 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 13px;
  box-sizing: border-box;
}
.primary-btn, .save-btn { background: #1677ff; color: #fff; }
.secondary-btn, .mini-btn { background: #f1f4f8; color: #506070; }
.summary-grid { margin-bottom: 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.summary-card { padding: 16px; background: #fff; border: 1px solid #edf1f7; border-radius: 10px; }
.summary-value { display: block; color: #1677ff; font-size: 24px; font-weight: 700; }
.summary-value.green { color: #18a66c; }
.summary-value.orange { color: #d97706; }
.summary-value.blue { color: #2563eb; }
.summary-label { display: block; margin-top: 5px; color: #8b98aa; font-size: 12px; }
.toolbar-card {
  margin-bottom: 14px;
  padding: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
  background: #fff;
  border: 1px solid #edf1f7;
  border-radius: 10px;
}
.search-input, .form-input {
  height: 38px;
  padding: 0 12px;
  background: #f7f9fc;
  border-radius: 8px;
  font-size: 13px;
  box-sizing: border-box;
}
.search-input { flex: 1; }
.filter-picker, .form-picker {
  min-width: 140px;
  height: 38px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  background: #f7f9fc;
  border-radius: 8px;
  color: #334155;
  font-size: 13px;
  box-sizing: border-box;
}
.rule-list { display: flex; flex-direction: column; gap: 10px; }
.rule-card {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  background: #fff;
  border: 1px solid #edf1f7;
  border-radius: 10px;
}
.rule-main { flex: 1; min-width: 0; }
.rule-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rule-title { color: #172541; font-size: 15px; font-weight: 700; }
.level-tag, .state-tag {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.level-normal { background: #eaf7ef; color: #17835b; }
.level-major { background: #fff1f0; color: #d93025; }
.level-review { background: #fff8e6; color: #b7791f; }
.state-tag { background: #eef2f7; color: #64748b; }
.state-tag.active { background: #e8f2ff; color: #1677ff; }
.rule-meta { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 10px; color: #718096; font-size: 12px; }
.rule-condition { display: block; margin-top: 9px; color: #334155; font-size: 13px; line-height: 1.6; }
.clause-preview { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
.clause-chip { padding: 4px 8px; background: #f5f7fb; border-radius: 8px; color: #64748b; font-size: 11px; }
.rule-actions { display: flex; align-items: flex-start; gap: 12px; flex-shrink: 0; }
.action-link { color: #1677ff; font-size: 13px; cursor: pointer; }
.action-link.danger { color: #d93025; }
.empty-card {
  padding: 36px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #fff;
  border: 1px solid #edf1f7;
  border-radius: 10px;
}
.empty-title { color: #172541; font-size: 16px; font-weight: 700; }
.empty-description { margin-top: 8px; color: #718096; font-size: 13px; }
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 99;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, .45);
}
.modal-panel {
  width: min(920px, 92vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
}
.modal-header, .modal-footer {
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #edf1f7;
}
.modal-footer { border-top: 1px solid #edf1f7; border-bottom: 0; justify-content: flex-end; gap: 10px; }
.modal-title { display: block; color: #172541; font-size: 18px; font-weight: 700; }
.modal-description { display: block; margin-top: 5px; color: #718096; font-size: 12px; }
.modal-close { color: #64748b; font-size: 24px; cursor: pointer; }
.modal-body { max-height: calc(88vh - 132px); padding: 18px; box-sizing: border-box; }
.form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.form-item { display: flex; flex-direction: column; gap: 7px; }
.form-item.full { grid-column: 1 / -1; }
.form-label { color: #334155; font-size: 12px; font-weight: 700; }
.form-textarea {
  min-height: 86px;
  padding: 10px 12px;
  background: #f7f9fc;
  border-radius: 8px;
  color: #1f2937;
  font-size: 13px;
  line-height: 1.6;
  box-sizing: border-box;
}
.clause-section { margin-top: 18px; padding-top: 16px; border-top: 1px solid #edf1f7; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-title { display: block; color: #172541; font-size: 15px; font-weight: 700; }
.section-desc { display: block; margin-top: 4px; color: #718096; font-size: 12px; }
.clause-search-row { margin-top: 12px; }
.selected-clause-list, .clause-result-list { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.selected-clause, .clause-result {
  padding: 11px 12px;
  background: #f8fafc;
  border: 1px solid #edf1f7;
  border-radius: 8px;
}
.selected-clause { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.selected-title { display: block; color: #1f2d45; font-size: 13px; font-weight: 700; }
.selected-meta { display: block; margin-top: 4px; color: #718096; font-size: 12px; }
.remove-link { color: #d93025; font-size: 12px; }
.clause-result { cursor: pointer; }
.clause-content {
  display: block;
  margin-top: 6px;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}
@media screen and (max-width: 900px) {
  .page-heading, .toolbar-card, .rule-card { flex-direction: column; align-items: stretch; }
  .summary-grid, .form-grid { grid-template-columns: 1fr; }
  .rule-actions { justify-content: flex-end; }
  .modal-panel { width: 94vw; }
}
</style>
