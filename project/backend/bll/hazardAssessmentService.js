const hazardRuleDal = require('../dal/hazardRuleDal')
const knowledgeClauseDal = require('../dal/knowledgeClauseDal')

const NON_REPORTABLE_SCENE_STATUSES = new Set(['unrelated', 'non_business', 'irrelevant'])
const STRICT_LEVELS = new Set(['重大隐患', '疑似重大隐患'])
const LOW_CONFIDENCE_PLACEHOLDER_BASIS = '未找到本地启用规则或已校验条文依据，以下内容仅作为低可信 AI 参考。'

/** 归一化文本，避免规则匹配时被空值和多余空白干扰 */
const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim()

/** 统一数组去重，保留原有顺序 */
const uniqueList = (list = []) => {
  const seen = new Set()
  return list.filter((item) => {
    const key = normalizeText(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 安全解析 JSON，兼容模型返回代码块 */
const parseJsonObject = (value) => {
  if (value && typeof value === 'object') return value
  let text = normalizeText(value)
  if (!text) return {}
  if (text.startsWith('```json')) text = text.slice(7).trim()
  else if (text.startsWith('```')) text = text.slice(3).trim()
  if (text.endsWith('```')) text = text.slice(0, -3).trim()
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

/** 将模型事实抽取结果整理为稳定结构 */
const normalizeFactExtraction = (raw, imageCount = 0) => {
  const data = parseJsonObject(raw)
  const sceneStatus = normalizeText(data.scene_status || data.sceneStatus || 'uncertain') || 'uncertain'
  const visibleFacts = Array.isArray(data.visible_facts)
    ? data.visible_facts.map((item) => normalizeText(item)).filter(Boolean)
    : []
  const uncertainPoints = Array.isArray(data.uncertain_points)
    ? data.uncertain_points.map((item) => normalizeText(item)).filter(Boolean)
    : []
  const suggestedKeywords = Array.isArray(data.suggested_keywords)
    ? data.suggested_keywords.map((item) => normalizeText(item)).filter(Boolean)
    : []
  const imageFacts = Array.isArray(data.image_facts)
    ? data.image_facts
    : []

  return {
    scene_status: sceneStatus,
    scene_reason: normalizeText(data.scene_reason || data.sceneReason || ''),
    visible_facts: visibleFacts,
    uncertain_points: uncertainPoints,
    suggested_keywords: suggestedKeywords,
    can_continue_assessment: data.can_continue_assessment !== false && !NON_REPORTABLE_SCENE_STATUSES.has(sceneStatus),
    image_facts: Array.from({ length: Math.max(imageCount, imageFacts.length || 0) }).map((_, index) => {
      const item = imageFacts[index] || {}
      return {
        image_id: Number(item.image_id) || index + 1,
        visible_facts: Array.isArray(item.visible_facts)
          ? item.visible_facts.map((fact) => normalizeText(fact)).filter(Boolean)
          : visibleFacts,
        uncertain_points: Array.isArray(item.uncertain_points)
          ? item.uncertain_points.map((point) => normalizeText(point)).filter(Boolean)
          : uncertainPoints,
        suggested_keywords: Array.isArray(item.suggested_keywords)
          ? item.suggested_keywords.map((keyword) => normalizeText(keyword)).filter(Boolean)
          : suggestedKeywords,
      }
    }),
  }
}

/** 将文本拆成可用于规则或条文检索的关键词 */
const splitSearchKeywords = (value) => {
  const text = normalizeText(value)
  if (!text) return []
  const coarse = text
    .split(/[\n,，、;；|/\\()（）【】《》“”'":：]/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length >= 2 && item.length <= 24)
  if (text.length >= 2 && text.length <= 24) coarse.unshift(text)
  return uniqueList(coarse)
}

/** 将规则关键词拆分为数组 */
const splitRuleKeywords = (value) => normalizeText(value)
  .split(/[,，、;；\s]+/)
  .map((item) => item.trim())
  .filter((item) => item.length >= 2)

/** 组装本地法规检索关键词 */
const buildSearchKeywords = ({ facts = null, imageFact = null, prompt = '', enterprise = null } = {}) => uniqueList([
  ...splitSearchKeywords(prompt),
  ...splitSearchKeywords(enterprise?.industry || ''),
  ...splitSearchKeywords(enterprise?.project_name || ''),
  ...splitSearchKeywords(enterprise?.name || ''),
  ...(facts?.suggested_keywords || []).map((item) => normalizeText(item)),
  ...(facts?.visible_facts || []).flatMap((item) => splitSearchKeywords(item)),
  ...(imageFact?.suggested_keywords || []).map((item) => normalizeText(item)),
  ...(imageFact?.visible_facts || []).flatMap((item) => splitSearchKeywords(item)),
])

/** 判断事实文本是否命中规则关键词 */
const scoreRule = (rule, factText) => {
  const keywords = splitRuleKeywords(rule.visible_fact_keywords)
  if (!keywords.length || !factText) return 0
  return keywords.reduce((score, keyword) => (
    factText.includes(keyword) ? score + 1 : score
  ), 0)
}

/** 将规则关联条文转成报告可用引用格式 */
const buildLegalRefs = (rule) => (rule.clause_refs || []).map((ref) => ({
  rule_id: Number(rule.id),
  rule_name: rule.name,
  knowledge_clause_id: Number(ref.clause_id),
  knowledge_id: ref.knowledge_id ? Number(ref.knowledge_id) : null,
  source_title: ref.source_title || '',
  source_code: ref.source_code || '',
  clause_no: ref.clause_no || '',
  content: ref.content || '',
  match_keyword: rule.name,
}))

/** 将本地条文命中结果转成报告引用结构 */
const buildClauseRefs = (clauses = []) => clauses.map((clause, index) => ({
  knowledge_clause_id: Number(clause.id),
  knowledge_id: clause.knowledge_id ? Number(clause.knowledge_id) : null,
  source_title: clause.source_title || '',
  source_code: clause.source_code || '',
  clause_no: clause.clause_no || '',
  content: clause.content || '',
  match_keyword: clause.match_keyword || '',
  sort: Number(clause.sort ?? index) || 0,
}))

/** 把引用依据转换为旧报告生成兼容的 reference_standards */
const buildReferenceStandards = (legalRefs = []) => legalRefs.map((ref) => ({
  name: ref.source_title || '',
  code: ref.source_code || '',
  clause: ref.clause_no || '',
  content: ref.content || '',
}))

/** 评分本地法规候选条文与当前图片事实的相关性 */
const scoreClauseCandidate = (clause, factText, keywords = []) => {
  const haystack = [
    clause.source_title,
    clause.source_code,
    clause.clause_no,
    clause.content,
    clause.keywords,
  ].join(' ')
  const keywordScore = keywords.reduce((score, keyword) => (
    haystack.includes(keyword) ? score + 3 : score
  ), 0)
  const factScore = factText && haystack.includes(factText) ? 2 : 0
  return Number(clause.match_score || 0) + keywordScore + factScore
}

/** 选择与当前图片最相关的 1~3 条本地法规依据 */
const pickRelevantClauses = (clauseCandidates = [], { imageFact = null, facts = null, prompt = '' } = {}) => {
  const factText = [
    ...(imageFact?.visible_facts || []),
    ...(imageFact?.uncertain_points || []),
    ...(imageFact?.suggested_keywords || []),
  ].join(' ')
  const keywords = buildSearchKeywords({ facts, imageFact, prompt })
  return clauseCandidates
    .map((clause) => ({ clause, score: scoreClauseCandidate(clause, factText, keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => (
      b.score - a.score
      || String(a.clause.content || '').length - String(b.clause.content || '').length
      || Number(a.clause.sort || 0) - Number(b.clause.sort || 0)
    ))
    .slice(0, 3)
    .map((item) => item.clause)
}

/** 汇总规则评估结果中的风险等级 */
const summarizeHazardLevel = (items = []) => {
  if (items.some((item) => item.hazard_level === '重大隐患')) return '重大隐患'
  if (items.some((item) => item.hazard_level === '疑似重大隐患')) return '疑似重大隐患'
  if (items.some((item) => item.hazard_level === '一般隐患')) return '一般隐患'
  return items[0]?.hazard_level || '需人工复核'
}

/** 根据每张图片的结果推断整体可信度 */
const summarizeConfidence = (items = []) => {
  const counts = {
    high: items.filter((item) => item.confidence_level === 'high').length,
    medium: items.filter((item) => item.confidence_level === 'medium').length,
    low: items.filter((item) => item.confidence_level === 'low').length,
  }
  if (counts.low > 0) {
    return { confidence_level: 'low', analysis_basis_type: 'ai_fallback', counts }
  }
  if (counts.medium > 0) {
    return { confidence_level: 'medium', analysis_basis_type: 'local_clause', counts }
  }
  return { confidence_level: 'high', analysis_basis_type: 'local_rule', counts }
}

/** 生成整体依据说明，帮助前端和报告解释可信度 */
const buildBasisNotice = ({ confidence_level, counts }) => {
  if (confidence_level === 'high') {
    return '命中本地启用隐患规则，并关联已校验法规条文，可作为高可信判断依据。'
  }
  if (confidence_level === 'medium') {
    return counts.high > 0
      ? '部分图片命中本地启用规则，部分图片仅命中本地法规条文参考；整体按中可信结果处理，需人工复核。'
      : '未命中正式隐患规则，但已检索到本地正式法规条文；本次结果仅作为中可信参考，需人工复核。'
  }
  return counts.high > 0 || counts.medium > 0
    ? '部分图片已命中本地规则或条文，但仍有图片未找到本地依据，已补充低可信 AI 参考；整体需人工复核。'
    : '未命中本地规则或条文，以下为低可信 AI 参考，不得直接作为正式结论。'
}

/** 生成综合建议，避免不同可信度下的提示风格混乱 */
const buildComprehensiveOpinion = ({ confidence_level, hasFormalRuleMatch, hasClauseMatch }) => {
  if (confidence_level === 'high') {
    return {
      improvement_directions: [
        { title: '按命中规则落实整改', content: '请优先处理命中的隐患规则，明确整改责任人、整改时限和复查要求，形成整改闭环。' },
        { title: '保留法规依据追溯', content: '本次结果已绑定本地已校验法规条文，人工确认时请结合现场位置、作业状态和附加证据复核条文适用性。' },
      ],
      general_suggestions: '本次结果已命中本地启用规则，可作为高可信初判依据；正式报告仍需人工确认后生成。',
    }
  }
  if (confidence_level === 'medium') {
    return {
      improvement_directions: [
        { title: '补充正式规则', content: '当前图片已命中本地法规条文，但尚未命中正式隐患规则，建议管理员补充对应规则，提升后续自动判断稳定性。' },
        { title: '补强现场证据', content: '建议补充现场部位照片、作业状态、台账或检测资料，由安全管理人员结合条文进行人工复核。' },
      ],
      general_suggestions: hasFormalRuleMatch
        ? '本次结果同时包含规则命中和法规参考，未命中规则的部分需重点人工复核。'
        : '本次结果仅基于本地法规条文参考，尚未命中正式隐患规则，需人工复核后再形成正式结论。',
    }
  }
  return {
    improvement_directions: [
      { title: '优先人工复核', content: '当前未找到本地规则或条文依据，请由检查员补充现场描述、拍摄角度和相关资料后进行人工复核。' },
      { title: '完善知识库覆盖', content: hasClauseMatch || hasFormalRuleMatch ? '建议结合未覆盖场景补充规则颗粒度。' : '建议管理员补充对应行业法规条文和隐患规则，减少后续低可信结果。' },
    ],
    general_suggestions: '本次结果为低可信 AI 参考，不得直接作为重大隐患正式结论，请结合人工判断和补充证据后再确认。',
  }
}

/** 组装高可信规则命中结果 */
const buildHighConfidenceItem = ({ imageIndex, imageFact, scoredRules = [] }) => {
  const facts = imageFact.visible_facts || []
  const uncertainPoints = imageFact.uncertain_points || []
  const primaryRule = scoredRules[0]
  const legalRefs = scoredRules.flatMap(buildLegalRefs)
  const evidenceSufficiency = primaryRule.image_evidence_supported ? 'sufficient' : 'partial'
  const hazardLevel = evidenceSufficiency === 'sufficient'
    ? primaryRule.hazard_level
    : (primaryRule.insufficient_evidence_level || '需人工复核')
  const reviewRequired = evidenceSufficiency !== 'sufficient' || STRICT_LEVELS.has(hazardLevel)

  return {
    image_id: imageIndex + 1,
    hazard_description: facts.length
      ? `图片可见事实：${facts.join('；')}。命中规则：${primaryRule.name}。`
      : `命中规则：${primaryRule.name}，但可见事实不足，需人工复核。`,
    hazard_level: hazardLevel,
    basis: legalRefs.length
      ? legalRefs.map((ref) => `《${ref.source_title}》${ref.source_code ? `（${ref.source_code}）` : ''}${ref.clause_no || ''}：${ref.content}`).join('；')
      : '规则已命中，但暂未读取到关联条文快照，需人工复核。',
    suggestion: primaryRule.rectification_template || '请根据命中规则要求完成整改并复查。',
    responsibility: '企业安全管理部门',
    visible_facts: facts,
    uncertain_points: uncertainPoints,
    matched_rules: scoredRules.map((rule) => ({
      id: Number(rule.id),
      name: rule.name,
      hazard_level: rule.hazard_level,
      image_evidence_supported: !!rule.image_evidence_supported,
      insufficient_evidence_level: rule.insufficient_evidence_level,
    })),
    legal_refs: legalRefs,
    evidence_sufficiency: evidenceSufficiency,
    review_required: reviewRequired,
    confidence_level: 'high',
    analysis_basis_type: 'local_rule',
  }
}

/** 组装中可信本地法规参考结果 */
const buildMediumConfidenceItem = ({ imageIndex, imageFact, clauseRefs = [] }) => {
  const facts = imageFact.visible_facts || []
  const uncertainPoints = imageFact.uncertain_points || []
  const legalRefs = buildClauseRefs(clauseRefs)
  return {
    image_id: imageIndex + 1,
    hazard_description: facts.length
      ? `图片可见事实：${facts.join('；')}。未命中正式隐患规则，但检索到相关本地法规条文，需人工复核。`
      : '图片证据有限，已检索到相关本地法规条文，需人工复核。',
    hazard_level: '需人工复核',
    basis: legalRefs.length
      ? legalRefs.map((ref) => `《${ref.source_title}》${ref.source_code ? `（${ref.source_code}）` : ''}${ref.clause_no || ''}：${ref.content}`).join('；')
      : '已检索到本地法规条文，但当前条文快照不完整，需人工复核。',
    suggestion: '请结合命中的本地法规条文、现场部位照片和管理资料进行人工复核，必要时补充对应正式隐患规则。',
    responsibility: '企业安全管理部门',
    visible_facts: facts,
    uncertain_points: uncertainPoints,
    matched_rules: [],
    legal_refs: legalRefs,
    evidence_sufficiency: facts.length ? 'partial' : 'insufficient',
    review_required: true,
    confidence_level: 'medium',
    analysis_basis_type: 'local_clause',
  }
}

/** 组装低可信占位结果，后续可由 AI 兜底补充描述 */
const buildLowConfidenceItem = ({ imageIndex, imageFact }) => {
  const facts = imageFact.visible_facts || []
  const uncertainPoints = imageFact.uncertain_points || []
  return {
    image_id: imageIndex + 1,
    hazard_description: facts.length
      ? `图片可见事实：${facts.join('；')}。当前未命中本地规则或条文依据，以下仅提供低可信 AI 参考。`
      : '未能提取到足够现场事实，且未找到本地规则或条文依据，以下仅提供低可信 AI 参考。',
    hazard_level: '需人工复核',
    basis: LOW_CONFIDENCE_PLACEHOLDER_BASIS,
    suggestion: '请补充更清晰的现场图片、作业位置、设备状态或管理资料，由人工复核后再形成正式结论。',
    responsibility: '企业安全管理部门',
    visible_facts: facts,
    uncertain_points: uncertainPoints,
    matched_rules: [],
    legal_refs: [],
    evidence_sufficiency: 'insufficient',
    review_required: true,
    confidence_level: 'low',
    analysis_basis_type: 'ai_fallback',
  }
}

/** 将整体评估结果中的低可信图片替换为 AI 兜底补充内容 */
const mergeLowConfidenceFallback = (assessment = {}, fallback = null) => {
  const fallbackItems = Array.isArray(fallback?.items) ? fallback.items : []
  const fallbackMap = new Map(
    fallbackItems.map((item) => [Number(item.image_id || 0), item])
  )
  const mergedItems = (Array.isArray(assessment.items) ? assessment.items : []).map((item) => {
    if (item.analysis_basis_type !== 'ai_fallback') return item
    const extra = fallbackMap.get(Number(item.image_id || 0)) || {}
    return {
      ...item,
      hazard_description: normalizeText(extra.hazard_description) || item.hazard_description,
      suggestion: normalizeText(extra.suggestion) || item.suggestion,
      uncertain_points: uniqueList([...(item.uncertain_points || []), ...((extra.uncertain_points || []).map((point) => normalizeText(point)).filter(Boolean))]),
    }
  })
  return {
    ...assessment,
    items: mergedItems,
    pending_fallback_images: [],
    comprehensive_opinion: {
      ...(assessment.comprehensive_opinion || { improvement_directions: [], general_suggestions: '' }),
      general_suggestions: normalizeText(fallback?.general_suggestions) || assessment?.comprehensive_opinion?.general_suggestions || '',
    },
  }
}

/** 规则驱动隐患评估服务 */
const hazardAssessmentService = {
  /** 根据 AI 抽取事实和本地启用规则形成最终初判 */
  async assess({ factExtraction, imageCount = 0, enterprise = null, prompt = '' } = {}) {
    const facts = normalizeFactExtraction(factExtraction, imageCount)
    if (!facts.can_continue_assessment) {
      return {
        ...facts,
        items: [],
        matched_rules: [],
        legal_refs: [],
        reference_standards: [],
        hazard_level: '非业务图片',
        evidence_sufficiency: 'not_applicable',
        review_required: true,
        confidence_level: 'non_business',
        analysis_basis_type: 'non_business',
        fallback_used: false,
        basis_notice: facts.scene_reason || '图片内容与安全生产检查场景无关，系统不生成正式报告。',
        report_allowed: false,
        report_block_reason: facts.scene_reason || '图片内容与安全生产检查场景无关，系统不生成正式报告。',
        pending_fallback_images: [],
        comprehensive_opinion: {
          improvement_directions: [],
          general_suggestions: '当前图片不属于安全生产检查场景，请上传现场设备、作业环境、消防设施、施工区域等相关图片后重新分析。',
        },
      }
    }

    const categoryId = enterprise?.knowledge_category_id || null
    const rules = await hazardRuleDal.findActiveForAssessment({
      category_id: categoryId,
      limit: 200,
    })
    const clauseCandidates = await knowledgeClauseDal.searchVerifiedActiveByKeywords({
      keywords: buildSearchKeywords({ facts, prompt, enterprise }),
      category_id: categoryId,
      limit: 12,
    })

    const items = facts.image_facts.map((imageFact, index) => {
      const factText = [
        ...(imageFact.visible_facts || []),
        ...(imageFact.uncertain_points || []),
        ...(imageFact.suggested_keywords || []),
      ].join(' ')

      const scoredRules = rules
        .map((rule) => ({ rule, score: scoreRule(rule, factText) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || Number(a.rule.id) - Number(b.rule.id))
        .slice(0, 3)
        .map((item) => item.rule)

      if (scoredRules.length) {
        return buildHighConfidenceItem({ imageIndex: index, imageFact, scoredRules })
      }

      const clauses = pickRelevantClauses(clauseCandidates, { imageFact, facts, prompt })
      if (clauses.length) {
        return buildMediumConfidenceItem({ imageIndex: index, imageFact, clauseRefs: clauses })
      }

      return buildLowConfidenceItem({ imageIndex: index, imageFact })
    })

    const legalRefs = uniqueList(items.flatMap((item) => (
      (item.legal_refs || []).map((ref) => JSON.stringify(ref))
    ))).map((item) => JSON.parse(item))
    const matchedRules = uniqueList(items.flatMap((item) => (
      (item.matched_rules || []).map((rule) => JSON.stringify(rule))
    ))).map((item) => JSON.parse(item))
    const evidenceLevels = new Set(items.map((item) => item.evidence_sufficiency))
    const confidenceSummary = summarizeConfidence(items)
    const hasFormalRuleMatch = items.some((item) => item.analysis_basis_type === 'local_rule')
    const hasClauseMatch = items.some((item) => item.analysis_basis_type === 'local_clause')
    const pendingFallbackImages = items
      .filter((item) => item.analysis_basis_type === 'ai_fallback')
      .map((item) => ({
        image_id: item.image_id,
        visible_facts: item.visible_facts || [],
        uncertain_points: item.uncertain_points || [],
        suggested_keywords: facts.image_facts.find((imageFact) => Number(imageFact.image_id) === Number(item.image_id))?.suggested_keywords || [],
      }))

    return {
      ...facts,
      items,
      matched_rules: matchedRules,
      legal_refs: legalRefs,
      reference_standards: buildReferenceStandards(legalRefs),
      hazard_level: summarizeHazardLevel(items),
      evidence_sufficiency: evidenceLevels.has('insufficient')
        ? 'insufficient'
        : (evidenceLevels.has('partial') ? 'partial' : 'sufficient'),
      review_required: items.some((item) => item.review_required),
      confidence_level: confidenceSummary.confidence_level,
      analysis_basis_type: confidenceSummary.analysis_basis_type,
      fallback_used: confidenceSummary.confidence_level !== 'high',
      basis_notice: buildBasisNotice(confidenceSummary),
      report_allowed: true,
      report_block_reason: '',
      pending_fallback_images: pendingFallbackImages,
      comprehensive_opinion: buildComprehensiveOpinion({
        confidence_level: confidenceSummary.confidence_level,
        hasFormalRuleMatch,
        hasClauseMatch,
      }),
    }
  },
}

module.exports = {
  hazardAssessmentService,
  mergeLowConfidenceFallback,
  normalizeFactExtraction,
}
