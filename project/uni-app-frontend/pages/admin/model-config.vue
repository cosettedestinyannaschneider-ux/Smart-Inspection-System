<template>
  <AdminShell active-key="model-config" title="AI 模型配置" wide @ready="handleAdminReady">
    <!-- 操作按钮直接放在业务页面中，保证微信小程序点击事件正常 -->
    <view class="page-heading">
      <view class="heading-copy">
        <text class="heading-title">AI 模型配置</text>
        <text class="heading-description">管理大模型接口、调用参数和当前启用配置</text>
      </view>
      <view class="model-page-actions"><view class="primary-btn" @click="openAdd">＋ 添加模型</view></view>
    </view>

    <!-- 模型配置概览 -->
    <view class="summary-grid">
      <view class="summary-card">
        <text class="summary-value">{{ list.length }}</text>
        <text class="summary-label">模型配置</text>
      </view>
      <view class="summary-card">
        <text class="summary-value success">{{ serviceStatusText }}</text>
        <text class="summary-label">当前服务状态</text>
      </view>
      <view class="summary-card active-summary">
        <text class="summary-value active-name">{{ currentModelName }}</text>
        <text class="summary-label">当前启用模型</text>
      </view>
    </view>

    <!-- 当前启用模型 -->
    <view v-if="activeModel" class="active-panel">
      <view class="active-icon">◇</view>
      <view class="active-content">
        <view class="active-title-row">
          <text class="active-title">{{ activeModel.name }}</text>
          <text class="active-tag">当前使用</text>
        </view>
        <text class="active-model-id">{{ activeModel.model_name }}</text>
        <text class="active-address">{{ activeModel.base_url }}</text>
      </view>
      <view class="active-params">
        <view class="param-item"><text class="param-value">{{ activeModel.max_tokens }}</text><text class="param-label">Token 上限</text></view>
        <view class="param-item"><text class="param-value">{{ activeModel.temperature }}</text><text class="param-label">温度</text></view>
        <view class="param-item"><text class="param-value">{{ activeModel.timeout_ms / 1000 }}s</text><text class="param-label">超时</text></view>
      </view>
    </view>
    <view v-else-if="envDefault?.available" class="active-panel env-active-panel">
      <view class="active-icon">◇</view>
      <view class="active-content">
        <view class="active-title-row">
          <text class="active-title">{{ envDefault.name }}</text>
          <text class="active-tag">环境兜底</text>
        </view>
        <text class="active-model-id">{{ envDefault.model_name }}</text>
        <text class="active-address">{{ envDefault.base_url }}</text>
      </view>
      <view class="active-params">
        <view class="param-item"><text class="param-value">{{ envDefault.max_tokens }}</text><text class="param-label">Token 上限</text></view>
        <view class="param-item"><text class="param-value">{{ envDefault.temperature }}</text><text class="param-label">温度</text></view>
        <view class="param-item"><text class="param-value">{{ envDefault.timeout_ms / 1000 }}s</text><text class="param-label">超时</text></view>
      </view>
    </view>

    <!-- 环境变量兜底模型：只读展示，不进入数据库配置列表 -->
    <view v-if="envDefault" class="env-default-card">
      <view class="model-card-head">
        <view class="provider-icon env-icon">ENV</view>
        <view class="model-title-copy">
          <text class="model-name">{{ envDefault.name }}</text>
          <text class="provider-name">{{ envDefault.usage_note }}</text>
        </view>
        <text class="mini-active-tag" :class="{ 'env-disabled': !envDefault.available }">{{ envDefault.status_text }}</text>
      </view>
      <view class="model-detail"><text class="detail-label">模型 ID</text><text class="detail-value">{{ envDefault.model_name }}</text></view>
      <view class="model-detail"><text class="detail-label">API Key</text><text class="detail-value">{{ envDefault.api_key_masked || '未配置' }}</text></view>
      <view class="model-detail"><text class="detail-label">接口地址</text><text class="detail-value address-value">{{ envDefault.base_url || '未配置' }}</text></view>
      <view class="env-note">该配置来自本地 .env，不会上传到 Git；如需修改，请在服务器环境变量中调整后重启后端。</view>
    </view>

    <!-- 全部模型配置 -->
    <view class="section-heading">
      <text class="section-title">全部配置</text>
      <text class="section-description">API Key 仅展示脱敏内容；可手动检测接口连通性</text>
    </view>
    <view class="model-grid">
      <view v-for="model in list" :key="model.id" class="model-card" :class="{ active: model.is_active }">
        <view class="model-card-head">
          <view class="provider-icon" :class="model.is_active ? 'provider-active' : ''">◇</view>
          <view class="model-title-copy">
            <text class="model-name">{{ model.name }}</text>
            <text class="provider-name">{{ model.provider }}</text>
          </view>
          <text v-if="model.is_active" class="mini-active-tag">已启用</text>
        </view>
        <view class="model-detail"><text class="detail-label">模型 ID</text><text class="detail-value">{{ model.model_name }}</text></view>
        <view class="model-detail"><text class="detail-label">API Key</text><text class="detail-value">{{ model.api_key_masked }}</text></view>
        <view class="model-detail"><text class="detail-label">接口地址</text><text class="detail-value address-value">{{ model.base_url }}</text></view>
        <view v-if="modelCheckState[model.id]" class="check-result" :class="{ ok: modelCheckState[model.id].ok, failed: !modelCheckState[model.id].ok }">
          {{ modelCheckState[model.id].message }}
        </view>
        <view class="model-actions">
          <text v-if="!model.is_active" class="action-link success-link" @click="activate(model)">启用</text>
          <text class="action-link" @click="testModel(model)">{{ checkingModelId === model.id ? '检测中' : '检测' }}</text>
          <text class="action-link" @click="openEdit(model)">编辑</text>
          <text class="action-link dangerous" @click="deleteModel(model)">删除</text>
        </view>
      </view>
    </view>

    <!-- 模型配置弹窗直接渲染，沿用微信端已验证的固定定位结构 -->
    <view v-if="showModal" class="modal-mask" @click="closeModal">
      <view class="modal-panel" @click.stop="">
        <view class="modal-header">
          <view>
            <text class="modal-title">{{ isEdit ? '编辑模型配置' : '添加模型配置' }}</text>
            <text class="modal-description">API Key 将由后端加密保存</text>
          </view>
          <text class="modal-close" @click="closeModal">×</text>
        </view>
        <scroll-view scroll-y class="modal-body">
          <view class="form-grid">
            <view class="form-item"><text class="form-label">配置名称</text><input v-model="form.name" class="form-input" placeholder="例如：豆包视觉模型" /></view>
            <view class="form-item"><text class="form-label">服务商</text><input v-model="form.provider" class="form-input" placeholder="例如：豆包" /></view>
            <view class="form-item full"><text class="form-label">API 地址</text><input v-model="form.base_url" class="form-input" placeholder="请输入兼容接口地址" /></view>
            <view class="form-item"><text class="form-label">模型 ID</text><input v-model="form.model_name" class="form-input" placeholder="请输入模型 ID" /></view>
            <view class="form-item">
              <text class="form-label">API Key</text>
              <view class="password-wrap">
                <input v-model="form.api_key" class="form-input password-input" :password="!showKey" :placeholder="isEdit ? '留空表示不修改' : '请输入 API Key'" />
                <text class="password-toggle" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</text>
              </view>
            </view>
            <view class="form-item"><text class="form-label">最大 Token</text><input v-model.number="form.max_tokens" type="number" class="form-input" /></view>
            <view class="form-item"><text class="form-label">温度（0-2）</text><input v-model.number="form.temperature" type="digit" class="form-input" /></view>
            <view class="form-item"><text class="form-label">超时毫秒</text><input v-model.number="form.timeout_ms" type="number" class="form-input" /></view>
          </view>
        </scroll-view>
        <view class="modal-footer">
          <view class="secondary-btn" @click="closeModal">取消</view>
          <view class="save-btn" @click="saveModel">保存配置</view>
        </view>
      </view>
    </view>
  </AdminShell>
</template>

<script setup>
import { ref, computed } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { apiUrl, request, unwrapResponse } from '../../common/api-config'

/** 当前管理员 */
const user = ref({})
/** 模型配置列表 */
const list = ref([])
/** 环境变量兜底模型，仅用于只读展示 */
const envDefault = ref(null)
/** 模型编辑弹窗状态 */
const showModal = ref(false)
/** 当前是否编辑模式 */
const isEdit = ref(false)
/** API Key 可见状态 */
const showKey = ref(false)
/** 是否正在提交或刷新 */
const loading = ref(false)
/** 当前正在检测的模型 ID */
const checkingModelId = ref(null)
/** 模型连通性检测结果，仅保存脱敏后的后端提示 */
const modelCheckState = ref({})

/** 创建空白模型配置表单 */
const createForm = () => ({ id: null, name: '', provider: '', base_url: '', api_key: '', model_name: '', max_tokens: 4096, temperature: 0.7, timeout_ms: 60000 })
/** 当前模型配置表单 */
const form = ref(createForm())
/** 当前启用模型 */
const activeModel = computed(() => list.value.find(item => item.is_active) || null)
/** 当前实际服务状态文案 */
const serviceStatusText = computed(() => {
  if (activeModel.value) return '正常'
  if (envDefault.value?.available) return '兜底可用'
  return '未配置'
})
/** 当前实际使用模型名称 */
const currentModelName = computed(() => activeModel.value?.name || (envDefault.value?.available ? envDefault.value.name : '暂无启用模型'))
/** 请求模型配置接口 */
const postModelConfig = (path, payload = {}) => request({
  url: apiUrl(path),
  method: 'POST',
  data: payload,
}).then((response) => {
  const result = unwrapResponse(response)
  if (!result.ok) throw new Error(result.msg || '请求失败')
  return result.raw
})

/** 公共框架鉴权完成后加载模型配置 */
const handleAdminReady = async (admin) => {
  user.value = admin
  await fetchModels()
}

/** 加载模型列表 */
const fetchModels = async () => {
  loading.value = true
  try {
    const [response, envResponse] = await Promise.all([
      postModelConfig('/api/admin/config/ai/list'),
      postModelConfig('/api/admin/config/ai/env-default'),
    ])
    list.value = Array.isArray(response.data) ? response.data : []
    envDefault.value = envResponse.data || null
  } catch (error) {
    uni.showToast({ title: error?.message || '模型配置加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

/** 打开新增模型弹窗 */
const openAdd = () => {
  isEdit.value = false
  showKey.value = false
  form.value = createForm()
  showModal.value = true
}

/** 打开编辑模型弹窗 */
const openEdit = (model) => {
  isEdit.value = true
  showKey.value = false
  form.value = { ...model, api_key: '' }
  showModal.value = true
}

/** 关闭模型弹窗 */
const closeModal = () => {
  showModal.value = false
  form.value = createForm()
  showKey.value = false
}

/** 保存模型配置 */
const saveModel = async () => {
  if (!form.value.name || !form.value.provider || !form.value.base_url || !form.value.model_name) {
    uni.showToast({ title: '请填写完整模型信息', icon: 'none' })
    return
  }
  if (!isEdit.value && !form.value.api_key) {
    uni.showToast({ title: '请输入 API Key', icon: 'none' })
    return
  }
  const payload = {
    id: form.value.id,
    name: form.value.name,
    provider: form.value.provider,
    base_url: form.value.base_url,
    model_name: form.value.model_name,
    api_key: form.value.api_key,
    max_tokens: Number(form.value.max_tokens || 4096) || 4096,
    temperature: Number(form.value.temperature ?? 0.7),
    timeout_ms: Number(form.value.timeout_ms || 60000) || 60000,
  }
  try {
    loading.value = true
    await postModelConfig(
      isEdit.value ? '/api/admin/config/ai/update' : '/api/admin/config/ai/add',
      isEdit.value ? payload : { ...payload, id: undefined }
    )
    uni.showToast({ title: isEdit.value ? '配置已更新' : '配置已添加', icon: 'success' })
    closeModal()
    await fetchModels()
  } catch (error) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

/** 激活指定模型配置 */
const activate = (model) => {
  uni.showModal({
    title: '切换模型',
    content: `确定启用「${model.name}」吗？`,
    success: async (result) => {
      if (!result.confirm) return
      try {
        loading.value = true
        await postModelConfig('/api/admin/config/ai/activate', { id: model.id })
        uni.showToast({ title: '当前模型已切换', icon: 'success' })
        await fetchModels()
      } catch (error) {
        uni.showToast({ title: error?.message || '切换失败', icon: 'none' })
      } finally {
        loading.value = false
      }
    }
  })
}

/** 删除指定模型配置 */
const deleteModel = (model) => {
  if (model.is_active) {
    uni.showToast({ title: '当前启用模型不能删除', icon: 'none' })
    return
  }
  uni.showModal({
    title: '确认删除',
    content: `确定删除「${model.name}」吗？`,
    success: async (result) => {
      if (!result.confirm) return
      try {
        loading.value = true
        await postModelConfig('/api/admin/config/ai/delete', { id: model.id })
        uni.showToast({ title: '配置已删除', icon: 'success' })
        await fetchModels()
      } catch (error) {
        uni.showToast({ title: error?.message || '删除失败', icon: 'none' })
      } finally {
        loading.value = false
      }
    }
  })
}

/** 手动检测模型接口连通性，不暴露 API Key 或原始响应 */
const testModel = async (model) => {
  if (!model?.id || checkingModelId.value) return
  checkingModelId.value = model.id
  try {
    const response = await postModelConfig('/api/admin/config/ai/test', { id: model.id })
    const result = response.data || response
    modelCheckState.value = {
      ...modelCheckState.value,
      [model.id]: {
        ok: !!result.ok,
        message: result.message || (result.ok ? '模型接口连通正常' : '模型接口检测失败'),
      },
    }
    uni.showToast({ title: result.ok ? '检测通过' : '检测异常', icon: result.ok ? 'success' : 'none' })
  } catch (error) {
    modelCheckState.value = {
      ...modelCheckState.value,
      [model.id]: { ok: false, message: error?.message || '模型接口检测失败' },
    }
    uni.showToast({ title: '检测失败', icon: 'none' })
  } finally {
    checkingModelId.value = null
  }
}
</script>

<style scoped>
/* 页面标题与操作区域 */
.page-heading { margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.heading-title { display: block; color: #172541; font-size: 28px; font-weight: 700; }.heading-description { display: block; margin-top: 6px; color: #8b98aa; font-size: 14px; }
.model-page-actions { display: flex; }
.primary-btn, .secondary-btn, .save-btn { height: 40px; padding: 0 16px; display: flex; align-items: center; justify-content: center; border-radius: 9px; font-size: 13px; }
.primary-btn, .save-btn { background: #1677ff; color: #fff; }
.secondary-btn { background: #f1f4f8; color: #69778c; }
.summary-grid { margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 14px; }
.summary-card { padding: 18px 20px; display: flex; flex-direction: column; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }
.summary-value { color: #172541; font-size: 25px; font-weight: 700; }
.summary-value.success { color: #18a66c; }.summary-value.active-name { font-size: 18px; }
.summary-label { margin-top: 6px; color: #8b98aa; font-size: 12px; }
.active-panel { margin-bottom: 26px; padding: 22px; display: flex; align-items: center; gap: 18px; background: linear-gradient(135deg,#1677ff,#4f9cff); border-radius: 16px; color: #fff; box-shadow: 0 10px 25px rgba(22,119,255,.2); }
.env-active-panel { background: linear-gradient(135deg,#465668,#6d7d90); box-shadow: 0 10px 25px rgba(70,86,104,.18); }
.active-icon { width: 54px; height: 54px; display: flex; align-items: center; justify-content: center; border-radius: 15px; background: rgba(255,255,255,.18); font-size: 28px; }
.active-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }.active-title-row { display: flex; align-items: center; gap: 10px; }
.active-title { font-size: 19px; font-weight: 700; }.active-tag { padding: 3px 9px; border-radius: 20px; background: rgba(255,255,255,.2); font-size: 11px; }
.active-model-id { margin-top: 6px; font-size: 13px; }.active-address { margin-top: 3px; color: rgba(255,255,255,.75); font-size: 11px; }
.active-params { display: flex; gap: 22px; }.param-item { display: flex; flex-direction: column; align-items: center; }.param-value { font-size: 18px; font-weight: 700; }.param-label { margin-top: 4px; color: rgba(255,255,255,.75); font-size: 10px; }
.section-heading { margin-bottom: 14px; display: flex; justify-content: space-between; }.section-title { color: #24334e; font-size: 17px; font-weight: 700; }.section-description { color: #96a2b3; font-size: 12px; }
.env-default-card { margin-bottom: 20px; padding: 18px; background: #fff; border: 1px dashed #c8d2df; border-radius: 14px; }
.env-icon { width: 46px; color: #526078; font-size: 11px; font-weight: 700; background: #edf2f7; }
.env-disabled { color: #d77b16; }
.env-note { margin-top: 12px; padding: 9px 11px; border-radius: 8px; background: #f7f9fc; color: #69778c; font-size: 11px; line-height: 1.5; }
.model-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }.model-card { padding: 18px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }.model-card.active { border-color: #a9ceff; }
.model-card-head { margin-bottom: 16px; display: flex; align-items: center; }.provider-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 11px; background: #f1ebff; color: #7650e8; font-size: 21px; }.provider-active { background: #eaf3ff; color: #1677ff; }
.model-title-copy { flex: 1; margin-left: 11px; display: flex; flex-direction: column; }.model-name { color: #22314c; font-size: 14px; font-weight: 700; }.provider-name { margin-top: 3px; color: #96a2b3; font-size: 11px; }.mini-active-tag { color: #18a66c; font-size: 11px; }
.model-detail { margin-top: 9px; display: flex; justify-content: space-between; gap: 12px; }.detail-label { flex-shrink: 0; color: #9aa6b7; font-size: 11px; }.detail-value { color: #59677d; font-size: 11px; text-align: right; }.address-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-actions { margin-top: 16px; padding-top: 13px; display: flex; justify-content: flex-end; gap: 15px; border-top: 1px solid #edf1f7; }.action-link { color: #1677ff; font-size: 12px; }.success-link { color: #18a66c; }.dangerous { color: #f05252; }
.check-result { margin-top: 12px; padding: 9px 11px; border-radius: 8px; font-size: 11px; line-height: 1.5; }
.check-result.ok { background: #eaf8f1; color: #168a57; }
.check-result.failed { background: #fff4e8; color: #b76a00; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }.form-item.full { grid-column: 1 / -1; }.form-label { display: block; margin-bottom: 8px; color: #536179; font-size: 13px; font-weight: 600; }.form-input { width: 100%; height: 42px; padding: 0 12px; border: 1px solid #e2e9f2; border-radius: 9px; background: #f9fbfd; box-sizing: border-box; font-size: 13px; }.password-wrap { position: relative; }.password-input { padding-right: 60px; }.password-toggle { position: absolute; right: 12px; top: 13px; color: #1677ff; font-size: 12px; }
/* 模型配置弹窗 */
.modal-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 5000; padding: 24px; display: flex; align-items: center; justify-content: center; background: rgba(15,28,50,.46); box-sizing: border-box; }.modal-panel { width: 760px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; background: #fff; border-radius: 18px; }.modal-header { padding: 22px 26px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #edf1f7; }.modal-title { display: block; color: #172541; font-size: 21px; font-weight: 700; }.modal-description { display: block; margin-top: 5px; color: #909daf; font-size: 13px; }.modal-close { color: #91a0b5; font-size: 26px; line-height: 1; }.modal-body { flex: 1; max-height: 66vh; padding: 24px 26px; box-sizing: border-box; }.modal-footer { padding: 16px 26px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #edf1f7; }
@media screen and (max-width: 900px) {
  .page-heading { margin-bottom: 20rpx; display: block; }.heading-copy { display: none; }
  .model-page-actions,.model-page-actions .primary-btn { width: 100%; }
  .primary-btn,.secondary-btn,.save-btn { height: 70rpx; padding: 0 22rpx; border-radius: 13rpx; font-size: 24rpx; }
  .summary-grid { grid-template-columns: 1fr 1fr; gap: 14rpx; }.active-summary { grid-column: 1 / -1; }.summary-card { padding: 22rpx; border-radius: 18rpx; }.summary-value { font-size: 34rpx; }.summary-value.active-name { font-size: 28rpx; }.summary-label { font-size: 21rpx; }
  .active-panel { padding: 24rpx; display: block; border-radius: 22rpx; }.active-icon { width: 66rpx; height: 66rpx; border-radius: 18rpx; font-size: 34rpx; }.active-content { margin-top: 18rpx; }.active-title { font-size: 30rpx; }.active-tag { font-size: 20rpx; }.active-model-id { font-size: 23rpx; }.active-address { font-size: 20rpx; }.active-params { margin-top: 22rpx; justify-content: space-around; }.param-value { font-size: 29rpx; }.param-label { font-size: 19rpx; }
  .section-title { font-size: 29rpx; }.section-description { font-size: 21rpx; }.model-grid { grid-template-columns: 1fr; gap: 18rpx; }.model-card { padding: 26rpx; border-radius: 20rpx; }.provider-icon { width: 66rpx; height: 66rpx; border-radius: 17rpx; font-size: 34rpx; }.model-name { font-size: 27rpx; }.provider-name,.mini-active-tag,.detail-label,.detail-value,.action-link { font-size: 21rpx; }.model-actions { gap: 26rpx; }
  .env-default-card { margin-bottom: 22rpx; padding: 26rpx; border-radius: 20rpx; }.env-icon { width: 74rpx; font-size: 19rpx; }.env-note { font-size: 20rpx; }
  .check-result { font-size: 21rpx; }
  .form-grid { grid-template-columns: 1fr; gap: 24rpx; }.form-label { font-size: 25rpx; }.form-input { height: 78rpx; padding: 0 20rpx; border-radius: 13rpx; font-size: 25rpx; }.password-toggle { right: 20rpx; top: 25rpx; font-size: 22rpx; }
  .modal-mask { padding: 0; align-items: flex-end; }.modal-panel { width: 100%; max-height: 86vh; border-radius: 28rpx 28rpx 0 0; }.modal-header { padding: 26rpx 32rpx; }.modal-title { font-size: 32rpx; }.modal-description { margin-top: 5rpx; font-size: 21rpx; }.modal-close { font-size: 44rpx; }.modal-body { max-height: 62vh; padding: 24rpx 32rpx; }.modal-footer { padding: 20rpx 32rpx 28rpx; gap: 14rpx; }.modal-footer .secondary-btn,.modal-footer .save-btn { flex: 1; }
}
</style>
