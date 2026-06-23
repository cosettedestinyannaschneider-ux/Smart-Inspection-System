const hazardRuleDal = require('../dal/hazardRuleDal')

const NON_REPORTABLE_SCENE_STATUSES = new Set(['unrelated', 'non_business', 'irrelevant'])
const STRICT_LEVELS = new Set(['重大隐患', '疑似重大隐患'])

/** 归一化文本，避免规则匹配时被空值和多余空白干扰 */
const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim()

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

/** 将规则关键词拆分为数组 */
const splitRuleKeywords = (value) => normalizeText(value)
  .split(/[,，、;；\s]+/)
  .map((item) => item.trim())
  .filter((item) => item.length >= 2)

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
  source_title: ref.source_title || '',
  source_code: ref.source_code || '',
  clause_no: ref.clause_no || '',
  content: ref.content || '',
  match_keyword: rule.name,
}))

/** 把引用依据转换为旧报告生成兼容的 reference_standards */
const buildReferenceStandards = (legalRefs = []) => legalRefs.map((ref) => ({
  name: ref.source_title || '',
  code: ref.source_code || '',
  clause: ref.clause_no || '',
  content: ref.content || '',
}))

/** 组装单张图片的规则评估结果 */
const assessImageFacts = ({ imageIndex, imageFact, rules }) => {
  const facts = imageFact.visible_facts || []
  const uncertainPoints = imageFact.uncertain_points || []
  const factText = [
    ...facts,
    ...uncertainPoints,
    ...(imageFact.suggested_keywords || []),
  ].join(' ')

  const scoredRules = rules
    .map((rule) => ({ rule, score: scoreRule(rule, factText) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.rule.id) - Number(b.rule.id))
    .slice(0, 3)
    .map((item) => item.rule)

  if (!scoredRules.length) {
    return {
      image_id: imageIndex + 1,
      hazard_description: facts.length
        ? `图片可见事实：${facts.join('；')}。当前未命中已启用隐患规则，需人工复核。`
        : '未能提取到足够现场事实，需人工复核。',
      hazard_level: '需人工复核',
      basis: '未命中本地启用规则，需人工复核具体条款。',
      suggestion: '请补充现场位置、作业状态、管理台账或更清晰图片，由安全管理人员复核后再出具正式结论。',
      responsibility: '企业安全管理部门',
      visible_facts: facts,
      uncertain_points: uncertainPoints,
      matched_rules: [],
      legal_refs: [],
      evidence_sufficiency: 'insufficient',
      review_required: true,
    }
  }

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
      : '规则未关联有效条文，需人工复核具体条款。',
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
  }
}

/** 规则驱动隐患评估服务 */
const hazardAssessmentService = {
  /** 根据 AI 抽取事实和本地启用规则形成最终初判 */
  async assess({ factExtraction, imageCount = 0, enterprise = null } = {}) {
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
        report_allowed: false,
        report_block_reason: facts.scene_reason || '图片内容与安全生产检查场景无关，系统不生成正式报告。',
        comprehensive_opinion: {
          improvement_directions: [],
          general_suggestions: '当前图片不属于安全生产检查场景，请上传现场设备、作业环境、消防设施、施工区域等相关图片后重新分析。',
        },
      }
    }

    const rules = await hazardRuleDal.findActiveForAssessment({
      category_id: enterprise?.knowledge_category_id || null,
      limit: 200,
    })

    const items = facts.image_facts.map((imageFact, index) => assessImageFacts({
      imageIndex: index,
      imageFact,
      rules,
    }))
    const legalRefs = items.flatMap((item) => item.legal_refs || [])
    const matchedRules = items.flatMap((item) => item.matched_rules || [])
    const hasFormalRuleMatch = items.some((item) => (item.matched_rules || []).length > 0)
    const allSufficient = items.length > 0 && items.every((item) => item.evidence_sufficiency === 'sufficient')

    return {
      ...facts,
      items,
      matched_rules: matchedRules,
      legal_refs: legalRefs,
      reference_standards: buildReferenceStandards(legalRefs),
      hazard_level: items.some((item) => item.hazard_level === '重大隐患')
        ? '重大隐患'
        : (items.some((item) => item.hazard_level === '疑似重大隐患') ? '疑似重大隐患' : (items[0]?.hazard_level || '需人工复核')),
      evidence_sufficiency: allSufficient ? 'sufficient' : (hasFormalRuleMatch ? 'partial' : 'insufficient'),
      review_required: items.some((item) => item.review_required),
      report_allowed: hasFormalRuleMatch && allSufficient,
      report_block_reason: hasFormalRuleMatch
        ? (allSufficient ? '' : '部分规则需要补充资料或人工确认，暂不生成正式报告。')
        : '未命中本地启用规则，暂不生成正式报告。',
      comprehensive_opinion: {
        improvement_directions: hasFormalRuleMatch
          ? [
              { title: '按规则落实整改', content: '请优先处理命中的隐患规则，结合现场实际补充责任人、整改期限和复查记录。' },
              { title: '保留依据追溯', content: '本次初判已绑定本地法规条文，后续人工确认时应核对条文适用性和证据充分性。' },
            ]
          : [
              { title: '补充规则依据', content: '当前事实未命中启用规则，建议管理员补充对应法规条文和隐患规则后再进行正式判定。' },
            ],
        general_suggestions: hasFormalRuleMatch
          ? '本次结果为 AI 事实抽取后的规则初判，正式报告前仍建议由安全管理人员确认。'
          : '当前仅完成图片事实识别，尚不能形成正式法规判断。',
      },
    }
  },
}

module.exports = {
  hazardAssessmentService,
  normalizeFactExtraction,
}
