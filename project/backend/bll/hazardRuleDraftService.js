const hazardRuleDraftDal = require('../dal/hazardRuleDraftDal')
const knowledgeClauseDal = require('../dal/knowledgeClauseDal')
const knowledgeCategoryDal = require('../dal/knowledgeCategoryDal')
const aiService = require('./aiService')
const { hazardRuleService, HAZARD_LEVELS } = require('./hazardRuleService')

const INSUFFICIENT_LEVELS = new Set(['疑似隐患', '疑似重大隐患', '需人工复核'])
const DRAFT_REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected'])
const NON_ACTIONABLE_CLAUSE_PATTERNS = [
  /为了.*制定/,
  /适用.*规定/,
  /本法所称/,
  /本标准规定/,
  /术语和定义/,
  /坚持.*方针/,
  /工作.*原则/,
]

/** 创建规则草稿业务异常，供路由层统一转换错误码 */
const draftError = (message) => {
  const error = new Error(message)
  error.isHazardRuleDraftError = true
  return error
}

/** 统一裁剪可选文本 */
const normalizeOptionalText = (value, maxLength = 1000) => {
  const text = String(value || '').trim()
  return text ? text.slice(0, maxLength) : null
}

/** 统一解析布尔值，兼容表单字符串 */
const normalizeBoolean = (value) => (
  value === true || value === 1 || value === '1' || value === 'true'
)

/** 统一解析条款 ID 数组 */
const normalizeClauseIds = (value) => {
  if (value === undefined || value === null || value === '') return []
  let raw = value
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    try {
      raw = JSON.parse(text)
    } catch {
      raw = text.split(',')
    }
  }
  const items = Array.isArray(raw) ? raw : [raw]
  return Array.from(new Set(
    items.map((item) => Number(item || 0)).filter((item) => item > 0)
  ))
}

/** 统一解析草稿 ID */
const normalizeDraftId = (value) => {
  const id = Number(value || 0)
  if (!id) throw draftError('缺少规则草稿 ID')
  return id
}

/** 只允许草稿引用本地已校验、现行有效条文 */
const ensureVerifiedClauses = async (clauseIds = []) => {
  const ids = normalizeClauseIds(clauseIds)
  if (!ids.length) throw draftError('请选择用于生成规则草稿的法规条文')

  const clauses = await knowledgeClauseDal.findVerifiedActiveByIds(ids)
  const foundIds = new Set(clauses.map((item) => Number(item.id)))
  const missingIds = ids.filter((id) => !foundIds.has(id))
  if (missingIds.length) {
    throw draftError(`只能使用已校验且现行有效的正式条文生成规则草稿，异常条款 ID：${missingIds.join(', ')}`)
  }
  return clauses
}

/** 校验分类是否存在 */
const ensureCategoryExists = async (categoryId) => {
  const id = Number(categoryId || 0)
  if (!id) throw draftError('请选择规则所属分类')
  const category = await knowledgeCategoryDal.findById(id)
  if (!category) throw draftError('规则所属分类不存在')
  return category
}

/** 从条文中推断默认分类，减少管理员重复选择 */
const resolveDefaultCategoryId = (clauses = [], explicitCategoryId = null) => {
  const provided = Number(explicitCategoryId || 0)
  if (provided) return provided
  const ids = Array.from(new Set(
    clauses.map((item) => Number(item.category_id || 0)).filter((item) => item > 0)
  ))
  return ids.length === 1 ? ids[0] : Number(clauses[0]?.category_id || 0) || null
}

/** 将模型返回的 clause_ids 限制在管理员已选择的条文范围内 */
const normalizeDraftClauseIds = (value, selectedIds = []) => {
  const allowed = new Set(selectedIds.map(Number))
  const ids = normalizeClauseIds(value).filter((id) => allowed.has(Number(id)))
  return ids.length ? ids : selectedIds
}

/** 判断所选条文是否明显偏总则/术语，避免 AI 被迫生成无法落地的图片规则 */
const ensureActionableClauses = (clauses = []) => {
  const actionable = clauses.filter((clause) => {
    const text = `${clause.clause_no || ''} ${clause.content || ''}`
    return !NON_ACTIONABLE_CLAUSE_PATTERNS.some((pattern) => pattern.test(text))
  })
  if (!actionable.length) {
    throw draftError('所选条文偏原则性，不适合生成图片可见隐患规则，请选择具体检查要求、禁止行为、技术指标或判定条款。')
  }
}

/** 归一化单条规则草稿，保证进入草稿池前字段完整 */
const normalizeDraftPayload = async (payload = {}, { partial = false, selectedClauseIds = [] } = {}) => {
  const normalized = {}

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'name')) {
    normalized.name = String(payload.name || '').trim()
    if (!normalized.name) throw draftError('请输入规则名称')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'category_id')) {
    normalized.category_id = Number(payload.category_id || 0)
    await ensureCategoryExists(normalized.category_id)
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'hazard_level')) {
    normalized.hazard_level = String(payload.hazard_level || '').trim()
    if (!HAZARD_LEVELS.has(normalized.hazard_level)) throw draftError('隐患等级无效')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'visible_fact_keywords')) {
    normalized.visible_fact_keywords = normalizeOptionalText(payload.visible_fact_keywords, 500)
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'trigger_condition')) {
    normalized.trigger_condition = String(payload.trigger_condition || '').trim()
    if (!normalized.trigger_condition) throw draftError('请输入触发条件')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'required_evidence')) {
    normalized.required_evidence = String(payload.required_evidence || '').trim()
    if (!normalized.required_evidence) throw draftError('请输入所需证据')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'image_evidence_supported')) {
    normalized.image_evidence_supported = normalizeBoolean(payload.image_evidence_supported)
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'insufficient_evidence_level')) {
    normalized.insufficient_evidence_level = String(payload.insufficient_evidence_level || '需人工复核').trim()
    if (!INSUFFICIENT_LEVELS.has(normalized.insufficient_evidence_level)) throw draftError('证据不足默认结论无效')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'rectification_template')) {
    normalized.rectification_template = String(payload.rectification_template || '').trim()
    if (!normalized.rectification_template) throw draftError('请输入整改建议模板')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'clause_ids') || Object.prototype.hasOwnProperty.call(payload, 'clauseIds')) {
    const clauseIds = selectedClauseIds.length
      ? normalizeDraftClauseIds(payload.clause_ids ?? payload.clauseIds, selectedClauseIds)
      : normalizeClauseIds(payload.clause_ids ?? payload.clauseIds)
    await ensureVerifiedClauses(clauseIds)
    normalized.clause_ids_json = JSON.stringify(clauseIds)
  }

  return normalized
}

/** 将草稿对象转换为前端展示结构 */
const toClientDraft = (draft = {}) => ({
  ...draft,
  clause_ids: Array.isArray(draft.clause_ids) ? draft.clause_ids.map(Number).filter(Boolean) : [],
  clause_refs: Array.isArray(draft.clause_refs) ? draft.clause_refs : [],
})

/** 给草稿补充条文快照，方便管理员审核时直接看依据 */
const attachClauseRefs = async (drafts = []) => {
  const allClauseIds = Array.from(new Set(
    drafts.flatMap((draft) => Array.isArray(draft.clause_ids) ? draft.clause_ids : [])
      .map((item) => Number(item || 0))
      .filter((item) => item > 0)
  ))
  if (!allClauseIds.length) return drafts.map(toClientDraft)

  const clauses = await knowledgeClauseDal.findVerifiedActiveByIds(allClauseIds)
  const clauseMap = new Map(clauses.map((item) => [Number(item.id), item]))
  return drafts.map((draft) => {
    const clauseRefs = (draft.clause_ids || [])
      .map((id) => clauseMap.get(Number(id)))
      .filter(Boolean)
      .map((clause) => ({
        clause_id: Number(clause.id),
        knowledge_id: clause.knowledge_id ? Number(clause.knowledge_id) : null,
        category_id: clause.category_id ? Number(clause.category_id) : null,
        category_name: clause.category_name || '',
        source_title: clause.source_title || '',
        source_code: clause.source_code || '',
        clause_no: clause.clause_no || '',
        content: clause.content || '',
        keywords: clause.keywords || '',
      }))
    return toClientDraft({ ...draft, clause_refs: clauseRefs })
  })
}

/** 将草稿转换成正式规则载荷，审批后默认不启用 */
const buildOfficialRulePayload = (draft = {}) => ({
  name: draft.name,
  category_id: draft.category_id,
  hazard_level: draft.hazard_level,
  visible_fact_keywords: draft.visible_fact_keywords,
  trigger_condition: draft.trigger_condition,
  required_evidence: draft.required_evidence,
  image_evidence_supported: draft.image_evidence_supported,
  insufficient_evidence_level: draft.insufficient_evidence_level,
  rectification_template: draft.rectification_template,
  is_active: false,
  clause_ids: draft.clause_ids,
})

/** 隐患规则草稿业务服务 */
const hazardRuleDraftService = {
  /** 查询规则草稿列表 */
  async list(payload = {}) {
    const drafts = await hazardRuleDraftDal.findAll({
      keyword: payload.keyword,
      review_status: payload.review_status || payload.reviewStatus || 'pending',
      category_id: Number(payload.category_id || 0) || null,
      limit: payload.limit,
    })
    return await attachClauseRefs(drafts)
  },

  /** 使用 AI 根据已校验条文生成候选规则草稿 */
  async generate(payload = {}, adminId = null) {
    const clauses = await ensureVerifiedClauses(payload.clause_ids ?? payload.clauseIds)
    ensureActionableClauses(clauses)
    const selectedClauseIds = clauses.map((item) => Number(item.id))
    const categoryId = resolveDefaultCategoryId(clauses, payload.category_id)
    const category = await ensureCategoryExists(categoryId)
    const extraInstruction = normalizeOptionalText(payload.instruction, 1000)

    const aiResult = await aiService.generateHazardRuleDrafts({
      clauses,
      category,
      instruction: extraInstruction,
      modelId: payload.model_id || payload.modelId || null,
    })

    const rawDrafts = Array.isArray(aiResult.drafts) ? aiResult.drafts : []
    if (!rawDrafts.length) throw draftError('AI 未返回可用的规则草稿')

    const normalizedDrafts = []
    for (const item of rawDrafts.slice(0, 12)) {
      const draftPayload = {
        ...item,
        category_id: Number(item.category_id || categoryId),
        clause_ids: normalizeDraftClauseIds(item.clause_ids ?? item.clauseIds, selectedClauseIds),
      }
      const normalized = await normalizeDraftPayload(draftPayload, { selectedClauseIds })
      normalizedDrafts.push({
        ...normalized,
        clause_ids: JSON.parse(normalized.clause_ids_json),
        generation_prompt: aiResult.prompt,
        ai_raw_response: aiResult.raw,
        generated_by: adminId || null,
      })
    }

    if (!normalizedDrafts.length) throw draftError('AI 返回内容未通过草稿字段校验')
    const ids = await hazardRuleDraftDal.createMany(normalizedDrafts)
    const created = []
    for (const id of ids) {
      const draft = await hazardRuleDraftDal.findById(id)
      if (draft) created.push(toClientDraft(draft))
    }
    return await attachClauseRefs(created)
  },

  /** 编辑规则草稿 */
  async update(payload = {}) {
    const id = normalizeDraftId(payload.id)
    const existing = await hazardRuleDraftDal.findById(id)
    if (!existing) throw draftError('规则草稿不存在')
    if (existing.review_status !== 'pending') throw draftError('只有待审核草稿可以编辑')

    const normalized = await normalizeDraftPayload(payload, { partial: true })
    await hazardRuleDraftDal.updateById(id, normalized)
    return (await attachClauseRefs([await hazardRuleDraftDal.findById(id)]))[0]
  },

  /** 审核通过草稿并转入正式规则库，默认保持未启用 */
  async approve(payload = {}, reviewerId = null) {
    const id = normalizeDraftId(payload.id)
    const existing = await hazardRuleDraftDal.findById(id)
    if (!existing) throw draftError('规则草稿不存在')
    if (existing.review_status !== 'pending') throw draftError('该草稿已审核，不能重复通过')
    await ensureVerifiedClauses(existing.clause_ids)

    const officialRule = await hazardRuleService.create(buildOfficialRulePayload(existing))
    await hazardRuleDraftDal.updateById(id, {
      review_status: 'approved',
      review_note: normalizeOptionalText(payload.review_note || payload.reviewNote, 1000),
      reviewed_by: reviewerId || null,
      reviewed_at: new Date(),
      approved_rule_id: officialRule.id,
    })
    return {
      draft: (await attachClauseRefs([await hazardRuleDraftDal.findById(id)]))[0],
      rule: officialRule,
    }
  },

  /** 驳回规则草稿，驳回后不会进入正式规则库 */
  async reject(payload = {}, reviewerId = null) {
    const id = normalizeDraftId(payload.id)
    const existing = await hazardRuleDraftDal.findById(id)
    if (!existing) throw draftError('规则草稿不存在')
    if (!DRAFT_REVIEW_STATUSES.has(existing.review_status)) throw draftError('草稿状态异常')
    if (existing.review_status !== 'pending') throw draftError('该草稿已审核，不能重复驳回')
    await hazardRuleDraftDal.updateById(id, {
      review_status: 'rejected',
      review_note: normalizeOptionalText(payload.review_note || payload.reviewNote, 1000),
      reviewed_by: reviewerId || null,
      reviewed_at: new Date(),
    })
    return (await attachClauseRefs([await hazardRuleDraftDal.findById(id)]))[0]
  },
}

module.exports = {
  hazardRuleDraftService,
  draftError,
}
