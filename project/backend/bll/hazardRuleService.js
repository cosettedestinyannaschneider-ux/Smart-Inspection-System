const hazardRuleDal = require('../dal/hazardRuleDal')
const knowledgeCategoryDal = require('../dal/knowledgeCategoryDal')

const HAZARD_LEVELS = new Set(['未发现明显隐患', '一般隐患', '疑似重大隐患', '重大隐患', '需人工复核'])
const INSUFFICIENT_LEVELS = new Set(['疑似隐患', '疑似重大隐患', '需人工复核'])
const STRICT_LEVELS = new Set(['重大隐患', '疑似重大隐患'])

/** 创建规则库业务异常，供路由层统一转换错误码 */
const ruleError = (message) => {
  const error = new Error(message)
  error.isHazardRuleError = true
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

/** 统一解析规则 ID */
const normalizeRuleId = (value) => {
  const id = Number(value || 0)
  if (!id) throw ruleError('缺少规则 ID')
  return id
}

/** 校验规则分类是否存在 */
const ensureCategoryExists = async (categoryId) => {
  if (!categoryId) throw ruleError('请选择规则所属分类')
  const category = await knowledgeCategoryDal.findById(categoryId)
  if (!category) throw ruleError('规则所属分类不存在')
  return category
}

/** 校验规则关联条款均为已校验、现行有效的正式条文 */
const ensureVerifiedClauses = async (clauseIds = []) => {
  const ids = normalizeClauseIds(clauseIds)
  if (!ids.length) return []

  const clauses = await hazardRuleDal.findVerifiedClausesByIds(ids)
  const foundIds = new Set(clauses.map((item) => Number(item.id)))
  const missingIds = ids.filter((id) => !foundIds.has(id))
  if (missingIds.length) {
    throw ruleError(`规则只能关联已校验且现行有效的正式条文，异常条款 ID：${missingIds.join(', ')}`)
  }
  return ids
}

/** 归一化规则载荷并执行业务校验 */
const normalizeRulePayload = async (payload = {}, { partial = false } = {}) => {
  const normalized = {}

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'name')) {
    normalized.name = String(payload.name || '').trim()
    if (!normalized.name) throw ruleError('请输入规则名称')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'category_id')) {
    normalized.category_id = Number(payload.category_id || 0)
    await ensureCategoryExists(normalized.category_id)
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'hazard_level')) {
    normalized.hazard_level = String(payload.hazard_level || '').trim()
    if (!HAZARD_LEVELS.has(normalized.hazard_level)) throw ruleError('隐患等级无效')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'visible_fact_keywords')) {
    normalized.visible_fact_keywords = normalizeOptionalText(payload.visible_fact_keywords, 500)
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'trigger_condition')) {
    normalized.trigger_condition = String(payload.trigger_condition || '').trim()
    if (!normalized.trigger_condition) throw ruleError('请输入触发条件')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'required_evidence')) {
    normalized.required_evidence = String(payload.required_evidence || '').trim()
    if (!normalized.required_evidence) throw ruleError('请输入所需证据')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'image_evidence_supported')) {
    normalized.image_evidence_supported = normalizeBoolean(payload.image_evidence_supported)
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'insufficient_evidence_level')) {
    normalized.insufficient_evidence_level = String(payload.insufficient_evidence_level || '需人工复核').trim()
    if (!INSUFFICIENT_LEVELS.has(normalized.insufficient_evidence_level)) throw ruleError('证据不足默认结论无效')
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'rectification_template')) {
    normalized.rectification_template = String(payload.rectification_template || '').trim()
    if (!normalized.rectification_template) throw ruleError('请输入整改建议模板')
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'is_active')) {
    normalized.is_active = normalizeBoolean(payload.is_active)
  } else if (!partial) {
    normalized.is_active = false
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'seed_key')) {
    normalized.seed_key = normalizeOptionalText(payload.seed_key, 100)
  }

  return normalized
}

/** 启用前强校验：参与正式判定的规则必须关联正式依据 */
const assertCanBeActive = (rule, clauseIds = []) => {
  if (!rule.is_active) return
  if (!clauseIds.length) {
    const prefix = STRICT_LEVELS.has(rule.hazard_level) ? '重大隐患和疑似重大隐患规则' : '启用规则'
    throw ruleError(`${prefix}必须关联已校验法规条文后才能启用`)
  }
}

/** 将规则转换为前端展示结构 */
const toClientRule = (rule = {}) => ({
  ...rule,
  clause_ids: Array.isArray(rule.clause_refs)
    ? rule.clause_refs.map((item) => Number(item.clause_id)).filter(Boolean)
    : [],
})

const hazardRuleService = {
  /** 查询规则列表 */
  async list(payload = {}) {
    const rules = await hazardRuleDal.findAll({
      keyword: payload.keyword,
      category_id: Number(payload.category_id || 0) || null,
      hazard_level: String(payload.hazard_level || '').trim(),
      status: payload.status || 'active',
      limit: payload.limit,
    })
    return rules.map(toClientRule)
  },

  /** 新增规则 */
  async create(payload = {}) {
    const normalized = await normalizeRulePayload(payload)
    const clauseIds = await ensureVerifiedClauses(payload.clause_ids ?? payload.clauseIds)
    assertCanBeActive(normalized, clauseIds)
    const id = await hazardRuleDal.create({ ...normalized, status: 'active' }, clauseIds)
    return toClientRule(await hazardRuleDal.findById(id))
  },

  /** 编辑规则 */
  async update(payload = {}) {
    const id = normalizeRuleId(payload.id)
    const existing = await hazardRuleDal.findById(id)
    if (!existing) throw ruleError('规则不存在')

    const normalized = await normalizeRulePayload(payload, { partial: true })
    const clauseIds = Object.prototype.hasOwnProperty.call(payload, 'clause_ids') || Object.prototype.hasOwnProperty.call(payload, 'clauseIds')
      ? await ensureVerifiedClauses(payload.clause_ids ?? payload.clauseIds)
      : existing.clause_refs.map((item) => Number(item.clause_id))
    const nextRule = { ...existing, ...normalized }
    assertCanBeActive(nextRule, clauseIds)
    await hazardRuleDal.updateById(id, normalized, clauseIds)
    return toClientRule(await hazardRuleDal.findById(id))
  },

  /** 启用或停用规则 */
  async setActive(payload = {}) {
    const id = normalizeRuleId(payload.id)
    const existing = await hazardRuleDal.findById(id)
    if (!existing) throw ruleError('规则不存在')
    const isActive = normalizeBoolean(payload.is_active)
    if (isActive) {
      assertCanBeActive(existing, existing.clause_refs.map((item) => Number(item.clause_id)))
    }
    await hazardRuleDal.setActive(id, isActive)
    return toClientRule(await hazardRuleDal.findById(id))
  },

  /** 归档规则 */
  async archive(payload = {}) {
    const id = normalizeRuleId(payload.id)
    const existing = await hazardRuleDal.findById(id)
    if (!existing) throw ruleError('规则不存在')
    await hazardRuleDal.archiveById(id)
    return { id }
  },

  /** 搜索可用于规则引用的正式条文 */
  async searchClauses(payload = {}) {
    return await hazardRuleDal.searchVerifiedClauses({
      keyword: payload.keyword,
      category_id: Number(payload.category_id || 0) || null,
      limit: payload.limit,
    })
  },

  /** 导入或刷新内置高频隐患规则种子包 */
  async importSeedPack() {
    const categories = await knowledgeCategoryDal.findAll()
    const categoryMap = new Map(categories.map((item) => [item.name, Number(item.id)]))
    const summary = {
      total_rules: HAZARD_RULE_SEED_PACK.length,
      created_rules: 0,
      updated_rules: 0,
      activated_rules: 0,
      skipped_without_clause: 0,
      items: [],
    }

    for (const seed of HAZARD_RULE_SEED_PACK) {
      const categoryId = categoryMap.get(seed.category_name)
      if (!categoryId) {
        summary.skipped_without_clause += 1
        summary.items.push({ seed_key: seed.seed_key, status: 'skipped', message: '分类不存在' })
        continue
      }

      const matchedClauses = await hazardRuleDal.searchVerifiedClausesForSeed({
        category_id: categoryId,
        keywords: seed.clause_keywords,
        limit: 5,
      })
      const clauseIds = matchedClauses.map((item) => Number(item.id))
      const canActivate = clauseIds.length > 0
      if (!canActivate) {
        summary.skipped_without_clause += 1
        summary.items.push({ seed_key: seed.seed_key, status: 'skipped', message: '未找到已校验依据条文' })
        continue
      }

      const rulePayload = {
        seed_key: seed.seed_key,
        name: seed.name,
        category_id: categoryId,
        hazard_level: seed.hazard_level,
        visible_fact_keywords: seed.visible_fact_keywords.join(','),
        trigger_condition: seed.trigger_condition,
        required_evidence: seed.required_evidence,
        image_evidence_supported: seed.image_evidence_supported,
        insufficient_evidence_level: seed.insufficient_evidence_level,
        rectification_template: seed.rectification_template,
        is_active: true,
        status: 'active',
      }

      const existing = await hazardRuleDal.findBySeedKey(seed.seed_key)
      if (existing) {
        await hazardRuleDal.updateById(existing.id, rulePayload, clauseIds)
        summary.updated_rules += 1
        summary.items.push({ seed_key: seed.seed_key, status: 'updated', clause_count: clauseIds.length })
      } else {
        await hazardRuleDal.create(rulePayload, clauseIds)
        summary.created_rules += 1
        summary.items.push({ seed_key: seed.seed_key, status: 'created', clause_count: clauseIds.length })
      }
      summary.activated_rules += 1
    }

    return summary
  },
}

const HAZARD_RULE_SEED_PACK = [
  {
    seed_key: 'fire_access_blocked',
    name: '消防通道堵塞',
    category_name: '消防安全',
    hazard_level: '一般隐患',
    visible_fact_keywords: ['消防通道', '疏散通道', '占用', '堵塞', '堆放'],
    clause_keywords: ['疏散通道', '消防车通道', '占用', '堵塞'],
    trigger_condition: '现场可见疏散通道、消防车通道被货物、车辆、杂物等占用或堵塞。',
    required_evidence: '图片能看到通道标识或通道空间被明显占用；无法确认通道性质时需人工复核。',
    image_evidence_supported: true,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '立即清理占用物，保持消防通道和疏散通道畅通，并建立日常巡查记录。',
  },
  {
    seed_key: 'safety_exit_blocked',
    name: '安全出口堵塞',
    category_name: '消防安全',
    hazard_level: '一般隐患',
    visible_fact_keywords: ['安全出口', '堵塞', '锁闭', '封闭', '堆物'],
    clause_keywords: ['安全出口', '疏散通道', '锁闭', '封闭', '堵塞'],
    trigger_condition: '现场可见安全出口被物品堵塞、封闭、锁闭或影响正常开启。',
    required_evidence: '图片能显示安全出口标识、门体或出口位置及其被阻挡状态。',
    image_evidence_supported: true,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '清除安全出口障碍物，确保出口可随时开启，并对责任区域开展复查。',
  },
  {
    seed_key: 'fire_equipment_blocked_or_misused',
    name: '消防设施器材被遮挡或挪用',
    category_name: '消防安全',
    hazard_level: '一般隐患',
    visible_fact_keywords: ['消防设施', '消火栓', '灭火器', '遮挡', '挪用'],
    clause_keywords: ['消防设施', '器材', '遮挡', '挪用', '消火栓'],
    trigger_condition: '现场可见消火栓、灭火器、消防按钮等消防设施器材被遮挡、圈占、挪用或难以取用。',
    required_evidence: '图片能显示消防设施器材及遮挡、圈占或挪用状态。',
    image_evidence_supported: true,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '恢复消防设施器材原位和可见可取状态，清理周边遮挡物，补充巡检标识。',
  },
  {
    seed_key: 'extinguisher_missing_or_abnormal',
    name: '灭火器缺失或配置异常',
    category_name: '消防安全',
    hazard_level: '一般隐患',
    visible_fact_keywords: ['灭火器', '缺失', '压力不足', '过期', '配置不足'],
    clause_keywords: ['灭火器', '消防器材', '配置', '完好有效'],
    trigger_condition: '现场可见灭火器缺失、压力异常、明显过期、配置数量不足或摆放位置不符合取用要求。',
    required_evidence: '图片能显示灭火器位置、压力表、有效期或配置状态；有效期无法辨认时需人工复核。',
    image_evidence_supported: true,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '按场所火灾类别和保护距离补齐灭火器，及时更换失效器材并建立月度检查记录。',
  },
  {
    seed_key: 'emergency_lighting_sign_abnormal',
    name: '应急照明和疏散指示异常',
    category_name: '消防安全',
    hazard_level: '一般隐患',
    visible_fact_keywords: ['应急照明', '疏散指示', '损坏', '遮挡', '未点亮'],
    clause_keywords: ['应急照明', '疏散指示', '消防设施', '完好有效'],
    trigger_condition: '现场可见应急照明灯、疏散指示标志损坏、遮挡、缺失或疑似无法正常工作。',
    required_evidence: '图片能显示应急照明或疏散指示设施及异常状态；是否通电需结合现场测试。',
    image_evidence_supported: true,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '修复或更换异常设施，组织功能测试，确保疏散方向和应急照明连续可靠。',
  },
  {
    seed_key: 'fire_door_abnormal',
    name: '防火门损坏或异常',
    category_name: '消防安全',
    hazard_level: '一般隐患',
    visible_fact_keywords: ['防火门', '常开', '闭门器', '损坏', '封堵'],
    clause_keywords: ['防火门', '消防设施', '完好有效', '损坏'],
    trigger_condition: '现场可见防火门门体、闭门器、顺序器损坏，或常闭防火门异常开启、被阻挡。',
    required_evidence: '图片能显示防火门及损坏、阻挡或异常开启状态；防火分区性质无法确认时需人工复核。',
    image_evidence_supported: true,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '修复防火门及闭门装置，清除阻挡物，恢复常闭功能并纳入消防巡查。',
  },
  {
    seed_key: 'helmet_not_worn',
    name: '未佩戴安全帽',
    category_name: '建筑施工安全',
    hazard_level: '一般隐患',
    visible_fact_keywords: ['安全帽', '未佩戴', '施工现场', '作业人员'],
    clause_keywords: ['安全帽', '劳动防护用品', '施工现场', '佩戴'],
    trigger_condition: '施工或生产作业场景中可见作业人员未按要求佩戴安全帽。',
    required_evidence: '图片能显示人员处于需佩戴安全帽的作业区域，且头部防护缺失。',
    image_evidence_supported: true,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '立即停止相关人员作业并按要求佩戴安全帽，对班组开展劳动防护用品使用教育。',
  },
  {
    seed_key: 'work_at_height_protection',
    name: '高处作业分级与防护',
    category_name: '建筑施工安全',
    hazard_level: '疑似重大隐患',
    visible_fact_keywords: ['高处作业', '安全带', '临边', '洞口', '防护栏杆'],
    clause_keywords: ['高处作业', '安全带', '临边', '洞口', '防护'],
    trigger_condition: '现场可见高处作业人员未使用安全带，或临边、洞口缺少可靠防护。',
    required_evidence: '图片能显示作业高度、临边洞口位置或人员防坠措施；高度和作业条件无法确认时需补充现场资料。',
    image_evidence_supported: true,
    insufficient_evidence_level: '疑似重大隐患',
    rectification_template: '暂停高处作业，补齐临边洞口防护和个人防坠措施，经现场复核确认后恢复作业。',
  },
  {
    seed_key: 'confined_space_risk',
    name: '有限空间作业风险',
    category_name: '工贸行业安全',
    hazard_level: '疑似重大隐患',
    visible_fact_keywords: ['有限空间', '警示标识', '通风', '检测', '审批'],
    clause_keywords: ['有限空间', '辨识', '警示', '审批', '通风', '检测'],
    trigger_condition: '现场可见有限空间入口缺少警示标识、通风检测措施或作业审批信息不足。',
    required_evidence: '图片通常只能证明入口标识和现场措施，是否完成审批、检测、监护需补充台账或现场记录。',
    image_evidence_supported: false,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '补充有限空间辨识、警示标识、审批、通风、检测和监护措施，未确认前不得进入作业。',
  },
  {
    seed_key: 'special_equipment_major_risk',
    name: '特种设备重大事故隐患判定',
    category_name: '特种设备安全',
    hazard_level: '疑似重大隐患',
    visible_fact_keywords: ['特种设备', '检验标志', '超期', '压力容器', '起重机械', '电梯'],
    clause_keywords: ['特种设备', '重大事故隐患', '检验', '登记', '安全附件'],
    trigger_condition: '现场可见特种设备缺少检验合格标志、登记标识，或安全附件、保护装置明显异常。',
    required_evidence: '图片可提示标识缺失或异常，重大隐患定性通常还需核验设备登记、检验报告和运行记录。',
    image_evidence_supported: false,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '暂停疑似异常设备使用，核验登记、检验、维保和安全附件状态，按特种设备管理要求整改。',
  },
]

module.exports = {
  HAZARD_LEVELS,
  HAZARD_RULE_SEED_PACK,
  hazardRuleService,
  ruleError,
}
