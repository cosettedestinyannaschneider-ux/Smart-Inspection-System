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
const knowledgeClauseDal = require('../dal/knowledgeClauseDal')
const modelConfigService = require('./modelConfigService')
const { hazardAssessmentService, mergeLowConfidenceFallback } = require('./hazardAssessmentService')
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

/** 从模型返回中提取 JSON 对象，兼容少量说明文字 */
const parseJsonFromText = (content) => {
  const normalized = normalizeAIResultContent(content, false)
  try {
    return JSON.parse(normalized)
  } catch {
    const start = normalized.indexOf('{')
    const end = normalized.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1))
    }
    throw new Error('AI 返回内容不是合法 JSON')
  }
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

/** 从业务文本中抽取用于本地知识库 LIKE 检索的候选关键词 */
const extractKnowledgeSearchKeywords = ({ prompt = '', enterprise = null, images = [] } = {}) => {
  const sourceText = [
    prompt,
    enterprise?.name,
    enterprise?.industry,
    enterprise?.enterprise_type,
    enterprise?.project_name,
    enterprise?.region,
    enterprise?.address,
    enterprise?.production_process,
    ...images.flatMap((img) => [img?.label, img?.originalName]),
  ].filter(Boolean).join(' ')

  const keywordSet = new Set()
  const normalizedText = sourceText
    .replace(/[，。；：、,.!?！？()[\]（）【】"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  normalizedText
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 30)
    .forEach((item) => keywordSet.add(item))

  const domainKeywords = [
    '消防', '用电', '临时用电', '配电箱', '高处作业', '脚手架', '安全帽', '安全带',
    '警示标志', '安全标志', '通道', '疏散', '动火', '有限空间', '危化品', '机械',
    '特种设备', '粉尘', '职业健康', '施工', '生产', '整改', '隐患', '风险',
  ]
  domainKeywords
    .filter((keyword) => sourceText.includes(keyword))
    .forEach((keyword) => keywordSet.add(keyword))

  return Array.from(keywordSet).slice(0, 16)
}

/** 将本地知识条款格式化为模型可引用的受控上下文 */
const formatKnowledgeClauseContext = (clauses = []) => {
  if (!clauses.length) {
    return '未命中本地知识库条款。法规依据必须采用保守策略：不能确定时写“需人工复核具体条款”，reference_standards 返回 []。'
  }

  const lines = clauses.map((clause, index) => {
    const title = clause.source_title || '未命名知识文档'
    const code = clause.source_code ? `（${clause.source_code}）` : ''
    const clauseNo = clause.clause_no || '未标注条款号'
    const content = String(clause.content || '').replace(/\s+/g, ' ').trim()
    return `${index + 1}. 《${title}》${code}${clauseNo}：${content}`
  })

  return [
    '以下为后端从本地知识库命中的法规/标准条款，报告中的 basis 和 reference_standards 只能引用这些条款，不得引用未出现在本列表中的具体条款。',
    ...lines,
  ].join('\n')
}

/** 将知识条款整理为可返回前端和写入报告引用表的结构 */
const mapKnowledgeRefsForClient = (clauses = []) => clauses.map((clause, index) => ({
  id: Number(clause.id),
  knowledge_clause_id: Number(clause.id),
  knowledge_id: clause.knowledge_id ? Number(clause.knowledge_id) : null,
  source_title: clause.source_title || '',
  source_code: clause.source_code || '',
  clause_no: clause.clause_no || '',
  content: clause.content || '',
  match_keyword: clause.match_keyword || '',
  sort: Number(clause.sort ?? index) || index,
}))

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
const buildMessages = async (sessionId, userId, inspectionTaskId = null) => {
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
      try { await sessionDal.create(sessionId, userId, '新对话', inspectionTaskId) } catch (e) { /* 并发冲突忽略 */ }
    }
  }

  return { messages, sessionId }
}

/**
 * 当本地规则和条文都未命中时，基于已抽取的图片事实生成低可信 AI 参考。
 * 该路径严禁编造法规编号、条款号或重大隐患正式结论。
 */
const generateLowConfidenceFallback = async ({ client, modelName, prompt = '', enterprise = null, pendingImages = [] }) => {
  if (!pendingImages.length) return { items: [], general_suggestions: '' }

  const enterpriseText = enterprise
    ? `企业信息：${enterprise.name || ''}，行业：${enterprise.industry || ''}，${enterprise.project_name ? '项目：' + enterprise.project_name + '，' : ''}${enterprise.region || ''}${enterprise.address || ''}`
    : '企业信息：未提供'

  const factLines = pendingImages.map((item) => (
    `图片${item.image_id}：可见事实=${(item.visible_facts || []).join('；') || '未提取'}；证据不足=${(item.uncertain_points || []).join('；') || '无'}；建议关键词=${(item.suggested_keywords || []).join('、') || '无'}`
  )).join('\n')

  const fallbackPrompt = `${prompt || '请根据图片可见事实给出安全生产检查低可信参考'}
【企业信息】${enterpriseText}
【待补充判断的图片事实】
${factLines}

【任务边界】
1. 当前未命中本地隐患规则和已校验法规条文，你只能输出“低可信 AI 参考”。
2. 不得编造任何法规名称、标准编号、条款号、处罚结论或检测结果。
3. 不得输出“重大隐患”或“疑似重大隐患”的正式结论，只能使用“需人工复核”。
4. 只能依据已给出的图片可见事实和用户补充要求，不能假设现场台账、审批、检测、培训或制度落实情况。
5. 输出必须稳定、克制、可复核。

【返回格式】
请只返回合法 JSON，不要 Markdown，不要代码块：
{
  "items": [
    {
      "image_id": 1,
      "hazard_description": "基于图片事实的低可信风险描述",
      "suggestion": "保守整改建议",
      "uncertain_points": ["需人工补充确认的信息"]
    }
  ],
  "general_suggestions": "整体人工复核建议"
}`

  console.log(`[AIService] Low-confidence fallback using model: ${modelName}`)
  const response = await client.chat.completions.create({
    model: modelName,
    messages: [
      { role: 'system', content: C.SYSTEM_PROMPT },
      { role: 'user', content: fallbackPrompt },
    ],
    max_tokens: C.AI_DEFAULT_MAX_TOKENS,
    temperature: C.AI_INSPECTION_TEMPERATURE,
  })
  const raw = normalizeAIResultContent(response.choices[0].message.content, false)
  const parsed = parseJsonFromText(raw)
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    general_suggestions: normalizeValue(parsed.general_suggestions || ''),
  }
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
  async processAI(prompt, filePath, sessionId = null, isInspection = false, modelId = null, userId = null, inspectionTaskId = null) {
    const actualSessionId = (sessionId && sessionId !== 'null' && sessionId !== 'undefined') ? sessionId : null
    const hasFileContext = !!filePath

    if (!isLikelyBusinessPrompt(prompt, hasFileContext)) {
      const { sessionId: resolvedSessionId } = await buildMessages(actualSessionId, userId, inspectionTaskId)
      return {
        result: BUSINESS_SCOPE_REFUSAL,
        sessionId: resolvedSessionId,
        businessScopeRefusal: true,
      }
    }

    let actualPrompt = prompt
    let knowledgeRefs = []
    if (isInspection) {
      const knowledgeKeywords = extractKnowledgeSearchKeywords({
        prompt,
        images: filePath ? [{ originalName: filePath }] : [],
      })
      const matchedKnowledgeClauses = await knowledgeClauseDal.searchActiveByKeywords(knowledgeKeywords, 8)
      knowledgeRefs = mapKnowledgeRefsForClient(matchedKnowledgeClauses)
      const knowledgeClauseContext = formatKnowledgeClauseContext(matchedKnowledgeClauses)

      actualPrompt = `${prompt || '请进行智能隐患分析'}
【本地知识库命中条款】
${knowledgeClauseContext}

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
如果【本地知识库命中条款】中存在条款，你只能从这些条款中选择和图片隐患直接相关的依据写入 basis 和 reference_standards；不得引用未提供的具体法规、标准编号或条文内容。如果没有命中条款，法规依据必须采取保守策略：不能确定条文时必须写“需人工复核具体条款”，reference_standards 返回空数组，不得为了报告完整性随机选择或编造条款。
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

    const { messages, sessionId: resolvedSessionId } = await buildMessages(actualSessionId, userId, inspectionTaskId)
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
      return { result, sessionId: resolvedSessionId, knowledgeRefs }
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
    const inspectionTaskId = params?.inspectionTask?.id || params?.inspectionTaskId || null

    const { messages, sessionId: resolvedSessionId } = await buildMessages(sessionId, userId, inspectionTaskId)
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
      ? `企业信息：${enterprise.name || ''}，行业：${enterprise.industry || ''}，${enterprise.project_name ? '项目：' + enterprise.project_name + '，' : ''}${enterprise.region || ''}${enterprise.address || ''}`
      : '企业信息：未提供'

    const imageMetaText = images.length
      ? images.map((img, idx) => `图片${idx + 1}：image_id=${idx + 1} 名称=${img.originalName || ''} 标签=${img.label || ''}`.trim()).join('\n')
      : '无图片'

    const factExtractionInstruction = `${prompt || '请对这些图片进行安全生产检查场景识别和可见事实抽取'}
【企业信息】${enterpriseText}
【图片清单】
${imageMetaText}

【任务边界】
你只负责判断图片是否属于安全生产检查场景，并抽取图片中真实可见的事实。不要直接判定“一般隐患/重大隐患”，不要编造法规条文，不要生成正式报告。
如果图片是动漫、风景、人物自拍、食品、聊天截图、纯文字无现场信息等与安全生产检查无关的内容，必须标记为 unrelated，并说明原因。

【返回格式】
请只返回合法 JSON，不要 Markdown，不要代码块：
{
  "scene_status": "related | unrelated | uncertain",
  "scene_reason": "判断图片是否属于安全生产检查场景的原因",
  "can_continue_assessment": true,
  "visible_facts": ["全局可见事实"],
  "uncertain_points": ["无法仅凭图片确认但可能影响判断的点"],
  "suggested_keywords": ["用于匹配本地规则的关键词"],
  "image_facts": [
    {
      "image_id": 1,
      "visible_facts": ["该图片中可见的客观事实"],
      "uncertain_points": ["该图片证据不足之处"],
      "suggested_keywords": ["消防通道", "安全帽", "配电箱等关键词"]
    }
  ]
}

严格要求：
1) image_facts 数量必须等于图片数量，image_id 使用图片清单中的 1、2、3。
2) visible_facts 只能写图片中能直接看到的内容，不要推测后台管理制度、台账、审批、检测结果。
3) can_continue_assessment 只有在图片与安全生产检查明显无关时为 false；现场图但证据不足时仍为 true，并把不足写入 uncertain_points。
4) 输出必须稳定、简洁、可重复。`

    userContent.push({ type: 'text', text: factExtractionInstruction })
    messages.push({ role: 'user', content: userContent })

    const { client, modelName } = modelId
      ? await getClientById(modelId)
      : await getActiveClient()

    console.log(`[AIService] Hazard scene gate using model: ${modelName}`)
    try {
      const response = await client.chat.completions.create({
        model: modelName,
        messages,
        max_tokens: C.AI_DEFAULT_MAX_TOKENS,
        temperature: C.AI_INSPECTION_TEMPERATURE,
      })
      const factExtraction = normalizeAIResultContent(response.choices[0].message.content, true)
      let assessment = await hazardAssessmentService.assess({
        factExtraction,
        imageCount: images.length,
        enterprise,
        prompt,
      })

      if (Array.isArray(assessment.pending_fallback_images) && assessment.pending_fallback_images.length) {
        try {
          const fallback = await generateLowConfidenceFallback({
            client,
            modelName,
            prompt,
            enterprise,
            pendingImages: assessment.pending_fallback_images,
          })
          assessment = mergeLowConfidenceFallback(assessment, fallback)
        } catch (fallbackError) {
          console.warn('[AIService] Low-confidence fallback degraded to local placeholder:', fallbackError.message)
          assessment = mergeLowConfidenceFallback(assessment, {
            items: [],
            general_suggestions: '低可信 AI 兜底调用失败，系统已返回基于图片可见事实的低可信占位结果，请人工复核。',
          })
        }
      }

      delete assessment.pending_fallback_images
      const result = JSON.stringify(assessment, null, 2)
      console.log('[AIService] Hazard rule assessment completed.')
      return { result, sessionId, knowledgeRefs: assessment.legal_refs || [], assessment }
    } catch (apiError) {
      console.error('[AIService] API error:', apiError)
      throw new Error(buildAIServiceErrorMessage(apiError, true))
    }
  },
  /**
   * 根据已校验法规条文生成隐患规则草稿候选。
   * AI 只输出草稿，后续仍需管理员审核通过后才进入正式规则库。
   */
  async generateHazardRuleDrafts({ clauses = [], category = null, instruction = '', modelId = null } = {}) {
    const verifiedClauses = Array.isArray(clauses) ? clauses : []
    if (!verifiedClauses.length) throw new Error('请先选择已校验且现行有效的法规条文')

    const clauseContext = verifiedClauses.map((clause, index) => {
      const title = clause.source_title || '未命名法规'
      const code = clause.source_code ? `（${clause.source_code}）` : ''
      const clauseNo = clause.clause_no || '未标注条款号'
      const content = String(clause.content || '').replace(/\s+/g, ' ').trim()
      const keywords = clause.keywords ? `；关键词：${clause.keywords}` : ''
      return `${index + 1}. clause_id=${Number(clause.id)}；分类=${clause.category_name || category?.name || ''}；《${title}》${code}${clauseNo}：${content}${keywords}`
    }).join('\n')

    const prompt = `你是安全生产法规规则整理助手。请根据管理员选择的已校验法规条文，生成“隐患判定规则草稿”。

【重要边界】
1. 只能根据下方提供的条文生成规则，不得编造法规、标准编号、条款号或条文内容。
2. 只能引用下方出现的 clause_id，不得输出不存在的 clause_id。
3. 规则只是草稿，不要写“已确认重大隐患”等最终执法结论。
4. 图片无法独立证明审批、台账、检测、检验状态时，image_evidence_supported 必须为 false，insufficient_evidence_level 应为“需人工复核”或“疑似重大隐患”。
5. 如果条文只适合做管理要求，请生成“需人工复核”或“一般隐患”规则，不要强行生成重大隐患。

【规则所属分类】
${category?.name || '未指定分类'}

【管理员补充要求】
${instruction || '无'}

【可用法规条文】
${clauseContext}

【返回格式】
请只返回合法 JSON，不要 Markdown，不要代码块，不要解释文字：
{
  "drafts": [
    {
      "name": "规则名称，简洁描述可观察隐患",
      "category_id": ${Number(category?.id || 0) || 'null'},
      "hazard_level": "一般隐患 | 疑似重大隐患 | 重大隐患 | 需人工复核",
      "visible_fact_keywords": "用于匹配图片可见事实的关键词，使用中文逗号分隔",
      "trigger_condition": "触发条件，说明看到什么事实时考虑命中该规则",
      "required_evidence": "所需证据，区分图片可见证据和需要补充的台账/检测/审批资料",
      "image_evidence_supported": true,
      "insufficient_evidence_level": "疑似隐患 | 疑似重大隐患 | 需人工复核",
      "rectification_template": "整改建议模板，要求可执行、可复查",
      "clause_ids": [1]
    }
  ]
}

建议输出 1 到 5 条高质量规则。`

    const { client, modelName } = modelId
      ? await getClientById(modelId)
      : await getActiveClient()

    console.log(`[AIService] Hazard rule draft generation using model: ${modelName}`)
    try {
      const response = await client.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: C.SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: C.AI_DEFAULT_MAX_TOKENS,
        temperature: C.AI_INSPECTION_TEMPERATURE,
      })
      const raw = normalizeAIResultContent(response.choices[0].message.content, false)
      const parsed = parseJsonFromText(raw)
      return {
        drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
        raw,
        prompt,
      }
    } catch (apiError) {
      console.error('[AIService] hazard rule draft generation error:', apiError)
      throw new Error(buildAIServiceErrorMessage(apiError, false))
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



