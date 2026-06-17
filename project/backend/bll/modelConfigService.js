const aiModelConfigDal = require('../dal/aiModelConfigDal')
const { OpenAI } = require('openai')
const C = require('../common/Constants')
const {
  hasModelConfigSecret,
  isEncryptedPayload,
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
} = require('./modelConfigCryptoService')

/** 统一清理模型配置中的字符串值，避免空格影响可用性判断 */
const normalizeValue = (value) => String(value || '').trim()

/** 判断模型 ID 是否仍是占位值，避免误以为默认配置可用 */
const isPlaceholderModelName = (modelName) => {
  const normalized = normalizeValue(modelName)
  return !normalized || normalized === 'replace_with_your_model_id' || normalized === 'default'
}

/** 判断 API Key 是否仍是占位值，避免泄露或调用无效配置 */
const isPlaceholderApiKey = (apiKey) => {
  const normalized = normalizeValue(apiKey)
  return !normalized || normalized === 'replace_with_your_api_key'
}

/** 判断 OpenAI 兼容客户端配置是否具备真实调用条件 */
const hasUsableClientConfig = ({ baseUrl, apiKey, modelName }) => (
  !!normalizeValue(baseUrl) &&
  !isPlaceholderApiKey(apiKey) &&
  !isPlaceholderModelName(modelName)
)

/** 读取 .env 中的兜底模型配置，仅服务端内部使用明文 Key */
const getEnvClientConfig = () => ({
  baseUrl: normalizeValue(process.env.ARK_BASE_URL || C.ARK_BASE_URL),
  apiKey: normalizeValue(process.env.ARK_API_KEY || ''),
  modelName: normalizeValue(process.env.ARK_MODEL || ''),
})

/** 将模型检测错误归一化为管理员可读但不泄露密钥的提示 */
const normalizeTestError = (error) => {
  const status = error?.status || error?.response?.status || error?.code || ''
  const rawMessage = String(error?.message || '')
  if (status === 401 || status === 403 || /unauthorized|forbidden|api key|authentication/i.test(rawMessage)) {
    return '鉴权失败，请检查 API Key 是否正确或是否有模型访问权限'
  }
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|network|timeout|ETIMEDOUT/i.test(rawMessage)) {
    return '接口地址无法连接或请求超时，请检查 API 地址和网络'
  }
  if (status === 404 || /not found/i.test(rawMessage)) {
    return '接口地址不存在，请检查 Base URL 是否为 OpenAI 兼容地址'
  }
  return '模型接口检测失败，请检查服务商地址、模型 ID 和账号权限'
}

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
  /** 获取环境变量兜底模型的只读展示信息，不暴露原始 API Key */
  getEnvDefaultForClient() {
    const config = getEnvClientConfig()
    const available = hasUsableClientConfig({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
    })
    return {
      id: null,
      name: '环境兜底模型',
      provider: '环境变量',
      base_url: config.baseUrl,
      model_name: config.modelName || '未配置',
      max_tokens: C.AI_DEFAULT_MAX_TOKENS,
      temperature: C.AI_DEFAULT_TEMPERATURE,
      timeout_ms: C.AI_TIMEOUT_MS,
      is_env: true,
      is_active: false,
      available,
      api_key_masked: maskApiKey(config.apiKey),
      status_text: available
        ? '可作为兜底配置使用'
        : '未完整配置，仅用于提示',
      usage_note: '仅当数据库中没有可用的启用模型时，后端才会降级使用该环境配置。',
    }
  },

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

  /** 管理员手动检测模型接口连通性，不返回原始响应或密钥 */
  async testConnection(id) {
    const targetId = Number(id || 0)
    if (!targetId) throw new Error('缺少模型配置 ID')
    const runtimeConfig = await this.getRuntimeConfigById(targetId)
    if (!runtimeConfig) throw new Error('模型配置不存在')
    if (!hasUsableClientConfig({
      baseUrl: runtimeConfig.base_url,
      apiKey: runtimeConfig.api_key_plain,
      modelName: runtimeConfig.model_name,
    })) {
      return {
        ok: false,
        message: '模型配置不完整，请检查 API 地址、API Key 和模型 ID',
      }
    }

    try {
      const client = new OpenAI({
        baseURL: runtimeConfig.base_url,
        apiKey: runtimeConfig.api_key_plain,
        timeout: Math.min(Number(runtimeConfig.timeout_ms || 10000), 15000),
      })
      await client.chat.completions.create({
        model: runtimeConfig.model_name,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        temperature: 0,
      })
      return {
        ok: true,
        message: '模型接口连通正常，API 地址、API Key 与模型 ID 可用',
        checked_at: new Date().toISOString(),
      }
    } catch (error) {
      return {
        ok: false,
        message: normalizeTestError(error),
        checked_at: new Date().toISOString(),
      }
    }
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
