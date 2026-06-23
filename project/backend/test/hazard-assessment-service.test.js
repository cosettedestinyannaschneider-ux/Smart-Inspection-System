const test = require('node:test')
const assert = require('node:assert/strict')

const hazardRuleDal = require('../dal/hazardRuleDal')
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
  assert.match(result.report_block_reason, /无关|安全生产检查/)
})

test('没有启用规则时只输出需人工复核，不生成正式报告', async () => {
  patch(hazardRuleDal, 'findActiveForAssessment', async () => [])

  try {
    const result = await hazardAssessmentService.assess({
      imageCount: 1,
      factExtraction: JSON.stringify({
        scene_status: 'related',
        can_continue_assessment: true,
        visible_facts: ['现场配电箱旁堆放杂物'],
        image_facts: [{ image_id: 1, visible_facts: ['现场配电箱旁堆放杂物'], suggested_keywords: ['配电箱'] }],
      }),
    })

    assert.equal(result.report_allowed, false)
    assert.equal(result.items[0].hazard_level, '需人工复核')
    assert.equal(result.items[0].matched_rules.length, 0)
  } finally {
    restorePatches()
  }
})

test('命中启用规则且图片证据充分时允许生成正式报告', async () => {
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

  try {
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
    assert.equal(result.items[0].hazard_level, '一般隐患')
    assert.equal(result.items[0].matched_rules[0].id, 7)
    assert.equal(result.legal_refs[0].knowledge_clause_id, 11)
  } finally {
    restorePatches()
  }
})

test('事实抽取 JSON 解析失败时进入不充分证据兜底', () => {
  const result = normalizeFactExtraction('不是 JSON', 1)
  assert.equal(result.scene_status, 'uncertain')
  assert.equal(result.can_continue_assessment, true)
  assert.equal(result.image_facts.length, 1)
})