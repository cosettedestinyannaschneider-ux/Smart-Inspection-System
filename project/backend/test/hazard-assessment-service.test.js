const test = require('node:test')
const assert = require('node:assert/strict')

const hazardRuleDal = require('../dal/hazardRuleDal')
const knowledgeClauseDal = require('../dal/knowledgeClauseDal')
const {
  hazardAssessmentService,
  normalizeFactExtraction,
} = require('../bll/hazardAssessmentService')

const originalMethods = []
const patch = (target, method, implementation) => {
  originalMethods.push([target, method, target[method]])
  target[method] = implementation
}

const restorePatches = () => {
  while (originalMethods.length) {
    const [target, method, original] = originalMethods.pop()
    target[method] = original
  }
}

test.afterEach(() => {
  restorePatches()
})

test('无关图片会被场景门控拒绝并禁止生成正式报告', async () => {
  const result = await hazardAssessmentService.assess({
    imageCount: 1,
    factExtraction: JSON.stringify({
      scene_status: 'unrelated',
      scene_reason: '图片为动漫角色，与安全生产检查无关',
      can_continue_assessment: false,
      visible_facts: ['动漫人物'],
      image_facts: [{ image_id: 1, visible_facts: ['动漫人物'] }],
    }),
  })

  assert.equal(result.report_allowed, false)
  assert.equal(result.hazard_level, '非业务图片')
  assert.equal(result.confidence_level, 'non_business')
  assert.equal(result.analysis_basis_type, 'non_business')
  assert.equal(result.report_block_reason, '图片为动漫角色，与安全生产检查无关')
})

test('没有启用规则但命中本地条文时返回中可信结果', async () => {
  patch(hazardRuleDal, 'findActiveForAssessment', async () => [])
  patch(knowledgeClauseDal, 'searchVerifiedActiveByKeywords', async () => ([{
    id: 101,
    knowledge_id: 201,
    source_title: '测试法规',
    source_code: 'GB TEST-2026',
    clause_no: '第1条',
    content: '配电箱周围不得堆放影响操作和散热的杂物。',
    match_keyword: '配电箱',
    keywords: '配电箱 杂物',
  }]))

  const result = await hazardAssessmentService.assess({
    imageCount: 1,
    prompt: '请分析配电箱旁堆放杂物是否存在风险',
    factExtraction: JSON.stringify({
      scene_status: 'related',
      can_continue_assessment: true,
      visible_facts: ['现场配电箱旁堆放杂物'],
      image_facts: [{ image_id: 1, visible_facts: ['现场配电箱旁堆放杂物'], suggested_keywords: ['配电箱'] }],
    }),
  })

  assert.equal(result.report_allowed, true)
  assert.equal(result.confidence_level, 'medium')
  assert.equal(result.analysis_basis_type, 'local_clause')
  assert.equal(result.items[0].confidence_level, 'medium')
  assert.equal(result.items[0].analysis_basis_type, 'local_clause')
  assert.equal(result.items[0].matched_rules.length, 0)
  assert.equal(result.legal_refs[0].knowledge_clause_id, 101)
})

test('命中启用规则且图片证据充分时返回高可信结果', async () => {
  patch(hazardRuleDal, 'findActiveForAssessment', async () => [{
    id: 7,
    name: '消防通道堵塞',
    hazard_level: '一般隐患',
    visible_fact_keywords: '消防通道,堵塞,堆放',
    trigger_condition: '现场可见消防通道被物品堵塞。',
    required_evidence: '图片可见消防通道标识和堵塞状态。',
    image_evidence_supported: true,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '立即清理占用物，保持消防通道畅通。',
    clause_refs: [{
      clause_id: 11,
      knowledge_id: 3,
      source_title: '中华人民共和国消防法',
      source_code: '主席令第二十九号',
      clause_no: '第二十八条',
      content: '任何单位、个人不得占用、堵塞、封闭疏散通道、安全出口、消防车通道。',
    }],
  }])
  patch(knowledgeClauseDal, 'searchVerifiedActiveByKeywords', async () => [])

  const result = await hazardAssessmentService.assess({
    imageCount: 1,
    factExtraction: JSON.stringify({
      scene_status: 'related',
      can_continue_assessment: true,
      visible_facts: ['消防通道堆放纸箱造成堵塞'],
      image_facts: [{ image_id: 1, visible_facts: ['消防通道堆放纸箱造成堵塞'], suggested_keywords: ['消防通道', '堵塞'] }],
    }),
  })

  assert.equal(result.report_allowed, true)
  assert.equal(result.confidence_level, 'high')
  assert.equal(result.analysis_basis_type, 'local_rule')
  assert.equal(result.items[0].hazard_level, '一般隐患')
  assert.equal(result.items[0].matched_rules[0].id, 7)
  assert.equal(result.legal_refs[0].knowledge_clause_id, 11)
})

test('无规则且无本地条文时返回低可信 AI 兜底占位', async () => {
  patch(hazardRuleDal, 'findActiveForAssessment', async () => [])
  patch(knowledgeClauseDal, 'searchVerifiedActiveByKeywords', async () => [])

  const result = await hazardAssessmentService.assess({
    imageCount: 1,
    prompt: '请分析现场杂乱堆放问题',
    factExtraction: JSON.stringify({
      scene_status: 'related',
      can_continue_assessment: true,
      visible_facts: ['现场存在杂乱堆放，但无法识别具体设施类型'],
      image_facts: [{ image_id: 1, visible_facts: ['现场存在杂乱堆放，但无法识别具体设施类型'], suggested_keywords: ['堆放'] }],
    }),
  })

  assert.equal(result.report_allowed, true)
  assert.equal(result.confidence_level, 'low')
  assert.equal(result.analysis_basis_type, 'ai_fallback')
  assert.equal(result.items[0].confidence_level, 'low')
  assert.equal(result.items[0].analysis_basis_type, 'ai_fallback')
  assert.match(result.items[0].basis, /低可信 AI 参考|未找到本地启用规则/)
})

test('事实抽取 JSON 解析失败时进入不充分证据兜底', () => {
  const result = normalizeFactExtraction('不是 JSON', 1)
  assert.equal(result.scene_status, 'uncertain')
  assert.equal(result.can_continue_assessment, true)
  assert.equal(result.image_facts.length, 1)
})
