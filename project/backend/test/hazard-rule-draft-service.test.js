const test = require('node:test')
const assert = require('node:assert/strict')

const knowledgeClauseDal = require('../dal/knowledgeClauseDal')
const knowledgeCategoryDal = require('../dal/knowledgeCategoryDal')
const aiService = require('../bll/aiService')
const hazardRuleDraftDal = require('../dal/hazardRuleDraftDal')
const { hazardRuleDraftService } = require('../bll/hazardRuleDraftService')

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

const verifiedClause = (overrides = {}) => ({
  id: 101,
  knowledge_id: 201,
  category_id: 5,
  category_name: '消防安全',
  source_title: '公众聚集场所投入使用营业消防安全检查规则',
  source_code: 'GB 46034-2025',
  clause_no: '5.1',
  content: '安全出口、疏散通道应保持畅通，不得被占用、堵塞或者封闭。',
  keywords: '安全出口,疏散通道,堵塞',
  verification_status: 'verified',
  current_status: '现行',
  status: 'active',
  ...overrides,
})

test('AI 规则草稿可基于现行国家标准条文生成并进入草稿池', async () => {
  patch(knowledgeClauseDal, 'findVerifiedActiveByIds', async () => [verifiedClause()])
  patch(knowledgeCategoryDal, 'findById', async () => ({ id: 5, name: '消防安全' }))
  patch(aiService, 'generateHazardRuleDrafts', async () => ({
    prompt: '测试提示词',
    raw: '{"drafts":[]}',
    drafts: [{
      name: '安全出口堵塞',
      category_id: 5,
      hazard_level: '一般隐患',
      visible_fact_keywords: '安全出口,堵塞',
      trigger_condition: '现场可见安全出口被物品堵塞。',
      required_evidence: '图片能显示安全出口标识和堵塞状态。',
      image_evidence_supported: true,
      insufficient_evidence_level: '需人工复核',
      rectification_template: '立即清除安全出口障碍物。',
      clause_ids: [101],
    }],
  }))
  patch(hazardRuleDraftDal, 'createMany', async (drafts) => {
    assert.equal(drafts[0].clause_ids_json, '[101]')
    assert.deepEqual(drafts[0].clause_ids, [101])
    return [301]
  })
  patch(hazardRuleDraftDal, 'findById', async () => ({
    id: 301,
    name: '安全出口堵塞',
    category_id: 5,
    hazard_level: '一般隐患',
    image_evidence_supported: true,
    generated_by: 1,
    reviewed_by: null,
    approved_rule_id: null,
    clause_ids_json: '[101]',
    review_status: 'pending',
  }))

  try {
    const drafts = await hazardRuleDraftService.generate({ clause_ids: [101] }, 1)
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].review_status, 'pending')
  } finally {
    restorePatches()
  }
})

test('原则性条文不进入 AI 草稿生成，直接提示管理员选择具体条款', async () => {
  patch(knowledgeClauseDal, 'findVerifiedActiveByIds', async () => [verifiedClause({
    clause_no: '第一条',
    content: '第一条 为了加强安全生产工作，防止和减少生产安全事故，制定本法。',
  })])

  try {
    await assert.rejects(
      () => hazardRuleDraftService.generate({ clause_ids: [101] }, 1),
      /所选条文偏原则性/
    )
  } finally {
    restorePatches()
  }
})
