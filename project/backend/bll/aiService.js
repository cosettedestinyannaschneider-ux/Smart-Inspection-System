/**
 * AI 服务模块
 * 负责对接大模型（豆包/DeepSeek/千问），实现隐患智能分析与会话管理
 *
 * @created 2026-04-12
 * @updated 2026-05-18 — 多模型动态切换，解除 .env 硬编码
 */
const { OpenAI } = require('openai')
const fs = require('fs')
const pdfParse = require('pdf-parse')
const historyDal = require('../dal/historyDal')
const sessionDal = require('../dal/sessionDal')
const modelConfigService = require('./modelConfigService')
const C = require('../common/Constants')
require('dotenv').config()

/**
 * 创建 OpenAI 兼容客户端实例
 * @param {string} baseUrl — API 地址
 * @param {string} apiKey  — API 密钥
 * @returns {OpenAI}
 */
const createClient = (baseUrl, apiKey) => new OpenAI({ baseURL: baseUrl, apiKey })

const normalizeValue = (value) => String(value || '').trim()

const isPlaceholderModelName = (modelName) => {
  const normalized = normalizeValue(modelName)
  return !normalized || normalized === 'replace_with_your_model_id' || normalized === 'default'
}

const isPlaceholderApiKey = (apiKey) => {
  const normalized = normalizeValue(apiKey)
  return !normalized || normalized === 'replace_with_your_api_key'
}

const hasUsableClientConfig = ({ baseUrl, apiKey, modelName }) => (
  !!normalizeValue(baseUrl) &&
  !isPlaceholderApiKey(apiKey) &&
  !isPlaceholderModelName(modelName)
)

const getEnvClientConfig = () => ({
  baseUrl: normalizeValue(process.env.ARK_BASE_URL || C.ARK_BASE_URL),
  apiKey: normalizeValue(process.env.ARK_API_KEY || ''),
  modelName: normalizeValue(process.env.ARK_MODEL || ''),
})

/**
 * 获取当前激活的客户端（从 ai_model_configs 表读取）
 * 若无激活配置，降级使用 .env
 * @returns {Promise<{client: OpenAI, modelName: string, configId: number|null}>}
 */
const getActiveClient = async () => {
  const config = await modelConfigService.getActiveRuntimeConfig()
  if (config && hasUsableClientConfig({
    baseUrl: config.base_url,
    apiKey: config.api_key_plain,
    modelName: config.model_name,
  })) {
    return {
      client: createClient(config.base_url, config.api_key_plain),
      modelName: config.model_name,
      configId: config.id,
    }
  }
  // 降级：使用 .env
  return {
    client: createClient(getEnvClientConfig().baseUrl, getEnvClientConfig().apiKey),
    modelName: getEnvClientConfig().modelName || 'default',
    configId: null,
  }
}

/**
 * 按指定配置 ID 获取客户端
 * @param {number} modelId — ai_model_configs.id
 * @returns {Promise<{client: OpenAI, modelName: string, configId: number}>}
 */
const getClientById = async (modelId) => {
  const config = await modelConfigService.getRuntimeConfigById(modelId)
  if (!config) throw new Error('模型配置不存在')
  if (!hasUsableClientConfig({
    baseUrl: config.base_url,
    apiKey: config.api_key_plain,
    modelName: config.model_name,
  })) {
    throw new Error('当前所选模型配置无效，请检查 API 地址、API Key 和模型 ID')
  }
  return {
    client: createClient(config.base_url, config.api_key_plain),
    modelName: config.model_name,
    configId: config.id,
  }
}

/**
 * 根据文件扩展名推断图片 MIME 类型
 * @param {string} filePath — 文件路径
 * @returns {string}
 */
const inferImageMime = (filePath) => {
  const lower = String(filePath || '').toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'image/jpeg'
}

const normalizeAIResultContent = (content, preferJson = false) => {
  let text = String(content || '').trim()
  if (text.startsWith('```json')) text = text.slice(7).trim()
  else if (text.startsWith('```')) text = text.slice(3).trim()
  if (text.endsWith('```')) text = text.slice(0, -3).trim()

  if (preferJson) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch (error) {
      return text
    }
  }

  return text
}

const BUSINESS_SCOPE_REFUSAL = '抱歉，我只能协助安全生产检查、隐患图片分析、整改建议、法规标准解释、企业安全管理和报告生成。请补充现场隐患、企业安全管理、法规依据或报告生成相关的问题。'

const BUSINESS_SCOPE_KEYWORDS = [
  '安全', '隐患', '排查', '巡检', '检查', '整改', '风险', '危险源', '事故', '应急',
  '法规', '法律', '标准', '规范', '条款', '依据', 'gb', 'aq', 'jg',
  '企业', '现场', '施工', '生产', '消防', '用电', '特种设备', '危化', '粉尘',
  '报告', '档案', '图片', '知识库', '模型配置', '上传', '下载', '系统使用',
]

/**
 * 判断文本问题是否属于系统业务范围。
 * 有图片或文档上下文时默认放行，避免误拦真实隐患分析。
 * @param {string} prompt 用户输入
 * @param {boolean} hasFileContext 是否存在图片/PDF等业务上下文
 * @returns {boolean}
 */
const isLikelyBusinessPrompt = (prompt, hasFileContext = false) => {
  if (hasFileContext) return true
  const text = normalizeValue(prompt).toLowerCase()
  if (!text) return false
  return BUSINESS_SCOPE_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()))
}

/**
 * 归一化模型调用错误，避免把供应商原始异常直接暴露给前端。
 * @param {Error} apiError
 * @param {boolean} hasImageInput
 * @returns {string}
 */
const buildAIServiceErrorMessage = (apiError, hasImageInput = false) => {
  const message = String(apiError?.message || '模型接口调用失败')
  const lower = message.toLowerCase()
  if (hasImageInput && /(image|vision|multimodal|modal|content type|unsupported|不支持|图片)/i.test(message)) {
    return 'AI 服务暂时不可用：当前模型可能不支持图片输入，请在模型配置中选择支持视觉/多模态能力的模型后重试。'
  }
  if (/(api key|apikey|unauthorized|forbidden|401|403|认证|鉴权|密钥)/i.test(message)) {
    return 'AI 服务暂时不可用：模型 API Key 或访问权限异常，请管理员在模型配置中检测并修正。'
  }
  if (/(model|404|not found|模型不存在|invalid model)/i.test(message)) {
    return 'AI 服务暂时不可用：模型 ID 或 API 地址可能配置错误，请管理员在模型配置中检测并修正。'
  }
  if (/(timeout|timed out|超时|network|econnreset|enotfound)/i.test(lower)) {
    return 'AI 服务暂时不可用：模型接口网络超时或地址不可达，请稍后重试或检查 API 地址。'
  }
  return `AI 服务暂时不可用：${message}`
}

/**
 * 从 inspection_reports 表重建对话上下文
 * @param {string|null} sessionId
 * @param {number|null} userId
 * @returns {Promise<{messages: Array, sessionId: string}>}
 */
const buildMessages = async (sessionId, userId) => {
  const messages = [{ role: 'system', content: C.SYSTEM_PROMPT }]

  if (sessionId) {
    const history = await historyDal.findBySessionId(sessionId)
    for (const item of history) {
      messages.push({ role: 'user', content: [{ type: 'text', text: item.prompt || '' }] })
      messages.push({ role: 'assistant', content: item.result })
    }
  } else {
    sessionId = Date.now().toString()
    if (userId) {
      try { await sessionDal.create(sessionId, userId) } catch (e) { /* 并发冲突忽略 */ }
    }
  }

  return { messages, sessionId }
}

const aiService = {
  /**
   * AI 处理入口（通用）
   *
   * @param {string}  prompt       — 用户输入
   * @param {string}  [filePath]   — 上传文件路径
   * @param {string}  [sessionId]  — 会话 ID
   * @param {boolean} [isInspection] — 是否隐患分析模式
   * @param {number}  [modelId]    — 指定模型配置 ID（可选，不传用激活模型）
   * @returns {Promise<{result: string, sessionId: string}>}
   */
  async processAI(prompt, filePath, sessionId = null, isInspection = false, modelId = null, userId = null) {
    const actualSessionId = (sessionId && sessionId !== 'null' && sessionId !== 'undefined') ? sessionId : null
    const hasFileContext = !!filePath

    if (!isLikelyBusinessPrompt(prompt, hasFileContext)) {
      const { sessionId: resolvedSessionId } = await buildMessages(actualSessionId, userId)
      return {
        result: BUSINESS_SCOPE_REFUSAL,
        sessionId: resolvedSessionId,
        businessScopeRefusal: true,
      }
    }

    let actualPrompt = prompt
    if (isInspection) {
      actualPrompt = `${prompt || '请进行智能隐患分析'}
【系统指令】：你现在必须根据提供的描述/图片生成“安全生产隐患排查报告”可直接使用的结构化分析结果。
请只返回合法 JSON，不要返回 Markdown，不要使用代码块，不要添加 JSON 之外的说明文字。
必须使用中文填写，并严格包含以下字段：
{
  "items": [
    {
      "image_id": 1,
      "hazard_description": "隐患描述，说明现场问题、可能后果和需要复核的关键点",
      "hazard_level": "一般隐患或重大隐患",
      "basis": "排查依据，格式必须为《法规或标准名称》（标准编号，如有）第X条/第X.X.X条：具体条款内容",
      "suggestion": "具体、可执行的整改建议，并说明整改所依据的标准",
      "responsibility": "建议责任部门或责任岗位"
    }
  ],
  "reference_standards": [
    {
      "name": "法规或标准名称，不要带书名号",
      "code": "标准编号或文件号，如 GB 2894-2008；法律法规可为空",
      "clause": "条款号，如 第三十六条 或 4.5.2",
      "content": "与本次隐患直接相关的条款内容，必须是报告可引用的完整表述"
    }
  ],
  "comprehensive_opinion": {
    "improvement_directions": [
      { "title": "改进方向标题", "content": "结合本次隐患提出的管理改进建议" }
    ],
    "general_suggestions": "综合建议总结"
  }
}
单张图片分析时 items 必须只有 1 项。hazard_level 只能填写“一般隐患”或“重大隐患”。
basis 和 reference_standards 不允许只写法规名称，必须写成“《名称》（编号）第X条/第X.X.X条：条款内容”的正式报告表述。
当前请求尚未提供本地知识库条款上下文，法规依据必须采取保守策略：只有在能够高置信确认规范名称、编号、条款号和内容时才允许引用；不能确定条文时必须写“需人工复核具体条款”，reference_standards 可返回空数组或写明需复核，不得为了报告完整性随机选择或编造条款。
对同一张图片和同一段描述，应尽量保持可见事实、隐患等级和整改方向稳定一致。`
    }

    const userContent = []
    if (filePath) {
      if (filePath.toLowerCase().endsWith('.pdf')) {
        const dataBuffer = fs.readFileSync(filePath)
        const data = await pdfParse(dataBuffer)
        userContent.push({
          type: 'text',
          text: `[PDF内容开始]\n${data.text}\n[PDF内容结束]\n\n用户的问题是：${actualPrompt || '请分析这份PDF文档'}`,
        })
      } else if (C.ALLOWED_IMAGE_TYPES.test(filePath)) {
        const base64Image = fs.readFileSync(filePath, { encoding: 'base64' })
        userContent.push({ type: 'image_url', image_url: { url: `data:${inferImageMime(filePath)};base64,${base64Image}` } })
        userContent.push({ type: 'text', text: actualPrompt || '请描述这张图片的内容' })
      } else {
        userContent.push({ type: 'text', text: actualPrompt })
      }
    } else {
      userContent.push({ type: 'text', text: actualPrompt })
    }

    const { messages, sessionId: resolvedSessionId } = await buildMessages(actualSessionId, userId)
    messages.push({ role: 'user', content: userContent })

    // 多模型：按 modelId 或激活模型创建客户端
    const { client, modelName } = modelId
      ? await getClientById(modelId)
      : await getActiveClient()

    console.log(`[AIService] Using model: ${modelName}, sending request...`)
    try {
      const response = await client.chat.completions.create({
        model: modelName,
        messages,
        max_tokens: C.AI_DEFAULT_MAX_TOKENS,
        temperature: isInspection ? C.AI_INSPECTION_TEMPERATURE : C.AI_DEFAULT_TEMPERATURE,
      })
      const result = normalizeAIResultContent(response.choices[0].message.content, isInspection)
      console.log(`[AIService] Response received, length: ${result?.length}`)
      return { result, sessionId: resolvedSessionId }
    } catch (apiError) {
      console.error('[AIService] API error:', apiError)
      throw new Error(buildAIServiceErrorMessage(apiError, !!filePath))
    }
  },

  /**
   * 9.6 智能隐患分析：多图一次性分析
   *
   * @param {object} params
   * @param {string} [params.prompt]
   * @param {string} [params.sessionId]
   * @param {object} [params.enterprise]
   * @param {Array}  params.images
   * @param {number} [params.userId]
   * @param {number} [params.modelId]  — 指定模型配置 ID
   * @returns {Promise<{result: string, sessionId: string}>}
   */
  async processHazardImagesInspection(params) {
    const prompt = params?.prompt || ''
    let sessionId = (params?.sessionId && params.sessionId !== 'null' && params.sessionId !== 'undefined')
      ? params.sessionId : null
    const enterprise = params?.enterprise || null
    const images = Array.isArray(params?.images) ? params.images : []
    const userId = params?.userId || null
    const modelId = params?.modelId || null

    const { messages, sessionId: resolvedSessionId } = await buildMessages(sessionId, userId)
    sessionId = resolvedSessionId

    const userContent = []
    images.forEach((img) => {
      const absPath = img?.absPath
      if (!absPath || !fs.existsSync(absPath)) return
      const mime = inferImageMime(absPath)
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${fs.readFileSync(absPath, { encoding: 'base64' })}` },
      })
    })

    const enterpriseText = enterprise
      ? `企业信息：${enterprise.name || ''}，${enterprise.project_name ? '项目：' + enterprise.project_name + '，' : ''}${enterprise.region || ''}${enterprise.address || ''}，联系人：${enterprise.contact || ''}，电话：${enterprise.phone || ''}`
      : '企业信息：未提供'

    const imageMetaText = images.length
      ? images.map((img, idx) => `图片${idx + 1}：image_id=${idx + 1} 名称=${img.originalName || ''} 标签=${img.label || ''}`.trim()).join('\n')
      : '无图片'

    const analysisInstruction = `${prompt || '请对这些隐患照片进行一次性智能隐患分析'}
【企业信息】${enterpriseText}
【图片清单】
${imageMetaText}

【系统指令】
你是一名安全生产专家。你必须对每一张图片分别进行专业隐患分析，先识别图片中可见事实，再给出隐患判断和整改建议。返回合法的 JSON（不要带任何 Markdown 代码块，纯 JSON 字符串）。
当前版本尚未向你提供本地知识库条款上下文，法规依据必须保守处理：只有在能够高置信确认规范名称、编号、条款号和条文内容时才允许引用；不能确定时，basis 必须写“需人工复核具体条款”，reference_standards 可返回空数组或写明需复核。不要为了报告完整性随机选择条款，不要编造不存在的法规、标准编号或条文内容。
同一组图片和企业信息重复分析时，应尽量保持可见事实、隐患等级、整改方向和依据处理策略一致。

返回结构必须为：
{
  "items": [
    {
      "image_id": 1,
      "hazard_description": "现场隐患的具体描述",
      "hazard_level": "一般隐患或重大隐患",
      "basis": "排查依据，格式必须为《法规或标准名称》（标准编号，如有）第X条/第X.X.X条：具体条款内容",
      "suggestion": "整改建议（含所依据法规条款，格式：建议内容。（依据：《XX法》第X条/《GB XXXX-XXXX》第X.X节））",
      "responsibility": "责任归属单位/部门名称"
    }
  ],
  "reference_standards": [
    {
      "name": "法规或标准名称，不要带书名号",
      "code": "标准编号或文件号，如 GB 2894-2008；法律法规可为空",
      "clause": "条款号，如 第三十六条 或 4.5.2",
      "content": "与对应图片隐患直接相关、可写入正式报告的条款内容"
    }
  ],
  "comprehensive_opinion": {
    "improvement_directions": [
      { "title": "改进方向标题", "content": "具体分析和建议内容（200-400字）" }
    ],
    "general_suggestions": "综合建议总结（200-400字）"
  }
}

严格要求：
1) items 数量必须等于图片数量，顺序必须与图片清单一致，image_id 必须填写图片清单中的顺序号 1、2、3，不要填写文件名或数据库 ID
2) hazard_level 由你根据隐患严重程度自主判断，只能填"一般隐患"或"重大隐患"
3) suggestion 必须是具体的、可操作的整改措施，并在此处引用所依据的具体法规条款
4) responsibility 填写隐患问题对应的责任单位/部门
5) basis 与 reference_standards 必须对应图片隐患，写明规范名称、标准编号/文件号、条款号、具体条款内容；不要只写法规名称，不要沿用模板固定清单，不要编造不存在的法规或条款
   - basis 示例：《安全标志及其使用导则》（GB 2894-2008）第4.5.2条：安全标志应设置在与安全有关的醒目位置，便于人员观察。
   - reference_standards 必须使用对象数组，字段为 name、code、clause、content，便于报告生成时排成“1. 《名称》（编号）第X条：条款内容；”
   - 如果不能高置信确认条款，basis 写“需人工复核具体条款”，reference_standards 返回 []，不要输出看似精确但未核验的条款
6) comprehensive_opinion 必须结合本次发现的全部隐患来写，不要套用空泛模板
   - improvement_directions 给出 2-4 个安全管理改进方向，每个含标题和详细内容
   - general_suggestions 给出综合建议总结
7) 报告整体风格要求：严谨、专业、客观`

    userContent.push({ type: 'text', text: analysisInstruction })
    messages.push({ role: 'user', content: userContent })

    const { client, modelName } = modelId
      ? await getClientById(modelId)
      : await getActiveClient()

    console.log(`[AIService] Hazard inspection using model: ${modelName}`)
    try {
      const response = await client.chat.completions.create({
        model: modelName,
        messages,
        max_tokens: C.AI_DEFAULT_MAX_TOKENS,
        temperature: C.AI_INSPECTION_TEMPERATURE,
      })
      const result = normalizeAIResultContent(response.choices[0].message.content, true)
      console.log('[AIService] Hazard inspection response received.')
      return { result, sessionId }
    } catch (apiError) {
      console.error('[AIService] API error:', apiError)
      throw new Error(buildAIServiceErrorMessage(apiError, true))
    }
  },

  /**
   * 归档会话
   * @param {string} sessionId
   */
  async clearSession(sessionId) {
    if (sessionId) {
      try { await sessionDal.archive(sessionId) } catch (e) { /* 忽略 */ }
    }
  },
}

module.exports = aiService
