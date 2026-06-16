const aiModelConfigDal = require('../dal/aiModelConfigDal')
const C = require('../common/Constants')
const {
  hasModelConfigSecret,
  isEncryptedPayload,
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
} = require('./modelConfigCryptoService')

/** 允许写入数据库的模型配置字段白名单 */
const MODEL_CONFIG_UPDATE_FIELD_MAP = {
  name: 'name',
  provider: 'provider',
  base_url: 'base_url',
  model_name: 'model_name',
  max_tokens: 'max_tokens',
  temperature: 'temperature',
  timeout_ms: 'timeout_ms',
  api_key_encrypted: 'api_key_encrypted',
}

/** 统一整理数值与文本字段，避免把非法空值落库 */
const normalizeBasePayload = (payload = {}) => ({
  name: String(payload.name || '').trim(),
  provider: String(payload.provider || '').trim(),
  base_url: String(payload.base_url || '').trim(),
  model_name: String(payload.model_name || '').trim(),
  max_tokens: Number(payload.max_tokens || C.AI_DEFAULT_MAX_TOKENS) || C.AI_DEFAULT_MAX_TOKENS,
  temperature: Number(payload.temperature ?? C.AI_DEFAULT_TEMPERATURE),
  timeout_ms: Number(payload.timeout_ms || C.AI_TIMEOUT_MS) || C.AI_TIMEOUT_MS,
})

/** 后端返回给前端时统一脱敏 API Key，禁止外泄原始密钥 */
const toClientModelConfig = (record, plainApiKey = null) => {
  if (!record) return null
  const resolvedKey = plainApiKey ?? String(record.api_key_encrypted || '')
  return {
    id: record.id,
    name: record.name,
    provider: record.provider,
    base_url: record.base_url,
    model_name: record.model_name,
    max_tokens: Number(record.max_tokens || C.AI_DEFAULT_MAX_TOKENS),
    temperature: Number(record.temperature ?? C.AI_DEFAULT_TEMPERATURE),
    timeout_ms: Number(record.timeout_ms || C.AI_TIMEOUT_MS),
    is_active: !!record.is_active,
    created_at: record.created_at,
    updated_at: record.updated_at,
    api_key_masked: maskApiKey(resolvedKey),
  }
}

/** 检查基础字段是否合法 */
const assertRequiredFields = ({ name, provider, base_url, model_name }) => {
  if (!name || !provider || !base_url || !model_name) {
    throw new Error('请填写完整的模型配置基础信息')
  }
}

const modelConfigService = {
  /** 获取当前启用配置，返回脱敏字段 */
  async getActiveForClient() {
    const config = await aiModelConfigDal.findActive()
    if (!config) return {}
    const normalized = await this.ensureEncryptedStorage(config)
    return toClientModelConfig(normalized.record, normalized.plainApiKey)
  },

  /** 获取全部配置列表，自动把历史明文记录迁移为密文 */
  async listForClient() {
    const configs = await aiModelConfigDal.findAll()
    const result = []
    for (const config of configs) {
      const normalized = await this.ensureEncryptedStorage(config)
      result.push(toClientModelConfig(normalized.record, normalized.plainApiKey))
    }
    return result
  },

  /** 新增模型配置，入库前强制加密 API Key */
  async create(payload = {}) {
    const normalized = normalizeBasePayload(payload)
    const plainApiKey = String(payload.api_key || '').trim()
    assertRequiredFields(normalized)
    if (!plainApiKey) throw new Error('API Key 不能为空')

    const encryptedKey = encryptApiKey(plainApiKey)
    const id = await aiModelConfigDal.create({
      name: normalized.name,
      provider: normalized.provider,
      baseUrl: normalized.base_url,
      apiKeyEncrypted: encryptedKey,
      modelName: normalized.model_name,
      maxTokens: normalized.max_tokens,
      temperature: normalized.temperature,
      timeoutMs: normalized.timeout_ms,
      isActive: payload.is_active ? 1 : 0,
    })
    return { id }
  },

  /** 更新模型配置，仅允许白名单字段；空 api_key 代表保持原值 */
  async update(payload = {}) {
    const id = Number(payload.id || 0)
    if (!id) throw new Error('缺少模型配置 ID')

    const existing = await aiModelConfigDal.findById(id)
    if (!existing) throw new Error('模型配置不存在')
    const normalizedExisting = await this.ensureEncryptedStorage(existing)

    const updates = {}
    for (const [inputKey, column] of Object.entries(MODEL_CONFIG_UPDATE_FIELD_MAP)) {
      if (inputKey === 'api_key_encrypted') continue
      if (payload[inputKey] === undefined) continue
      updates[column] = payload[inputKey]
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'name')) updates.name = String(updates.name || '').trim()
    if (Object.prototype.hasOwnProperty.call(updates, 'provider')) updates.provider = String(updates.provider || '').trim()
    if (Object.prototype.hasOwnProperty.call(updates, 'base_url')) updates.base_url = String(updates.base_url || '').trim()
    if (Object.prototype.hasOwnProperty.call(updates, 'model_name')) updates.model_name = String(updates.model_name || '').trim()
    if (Object.prototype.hasOwnProperty.call(updates, 'max_tokens')) {
      updates.max_tokens = Number(updates.max_tokens || C.AI_DEFAULT_MAX_TOKENS) || C.AI_DEFAULT_MAX_TOKENS
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'temperature')) {
      updates.temperature = Number(updates.temperature ?? C.AI_DEFAULT_TEMPERATURE)
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'timeout_ms')) {
      updates.timeout_ms = Number(updates.timeout_ms || C.AI_TIMEOUT_MS) || C.AI_TIMEOUT_MS
    }

    const nextPlainApiKey = String(payload.api_key || '').trim()
    if (nextPlainApiKey) {
      updates.api_key_encrypted = encryptApiKey(nextPlainApiKey)
    }

    const name = Object.prototype.hasOwnProperty.call(updates, 'name') ? updates.name : normalizedExisting.record.name
    const provider = Object.prototype.hasOwnProperty.call(updates, 'provider') ? updates.provider : normalizedExisting.record.provider
    const baseUrl = Object.prototype.hasOwnProperty.call(updates, 'base_url') ? updates.base_url : normalizedExisting.record.base_url
    const modelName = Object.prototype.hasOwnProperty.call(updates, 'model_name') ? updates.model_name : normalizedExisting.record.model_name
    assertRequiredFields({ name, provider, base_url: baseUrl, model_name: modelName })

    await aiModelConfigDal.updateById(id, updates)
  },

  /** 事务切换激活模型，保证任一时刻只有一个启用配置 */
  async activate(id) {
    const targetId = Number(id || 0)
    if (!targetId) throw new Error('缺少模型配置 ID')
    const existing = await aiModelConfigDal.findById(targetId)
    if (!existing) throw new Error('模型配置不存在')
    await aiModelConfigDal.setActive(targetId)
  },

  /** 禁止删除当前启用模型 */
  async delete(id) {
    const targetId = Number(id || 0)
    if (!targetId) throw new Error('缺少模型配置 ID')
    const existing = await aiModelConfigDal.findById(targetId)
    if (!existing) throw new Error('模型配置不存在')
    if (existing.is_active) throw new Error('当前启用模型禁止删除')
    await aiModelConfigDal.deleteById(targetId)
  },

  /** 供 AIService 使用：读取可直接调用的真实配置，并对旧明文自动迁移 */
  async getRuntimeConfigById(id) {
    const record = await aiModelConfigDal.findById(id)
    if (!record) return null
    const normalized = await this.ensureEncryptedStorage(record)
    return {
      ...normalized.record,
      api_key_plain: normalized.plainApiKey,
    }
  },

  /** 供 AIService 使用：获取当前激活模型的真实配置 */
  async getActiveRuntimeConfig() {
    const record = await aiModelConfigDal.findActive()
    if (!record) return null
    const normalized = await this.ensureEncryptedStorage(record)
    return {
      ...normalized.record,
      api_key_plain: normalized.plainApiKey,
    }
  },

  /**
   * 读取历史记录时识别是否为明文；若是明文，则在读取时迁移为密文。
   * 这样既兼容旧数据，也避免额外写一次手工迁移脚本。
   */
  async ensureEncryptedStorage(record) {
    if (!record) return { record: null, plainApiKey: '' }
    if (isEncryptedPayload(record.api_key_encrypted) && !hasModelConfigSecret()) {
      throw new Error('缺少 MODEL_CONFIG_SECRET，无法读取已加密的模型配置')
    }
    const plainApiKey = decryptApiKey(record.api_key_encrypted)
    if (!plainApiKey) return { record, plainApiKey: '' }

    if (!isEncryptedPayload(record.api_key_encrypted)) {
      if (!hasModelConfigSecret()) {
        return { record, plainApiKey }
      }
      const encryptedKey = encryptApiKey(plainApiKey)
      await aiModelConfigDal.updateById(record.id, { api_key_encrypted: encryptedKey })
      return {
        record: {
          ...record,
          api_key_encrypted: encryptedKey,
        },
        plainApiKey,
      }
    }

    return { record, plainApiKey }
  },
}

module.exports = modelConfigService
