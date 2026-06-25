const test = require('node:test')
const assert = require('node:assert/strict')

const hazardRuleDal = require('../dal/hazardRuleDal')
const knowledgeCategoryDal = require('../dal/knowledgeCategoryDal')
const {
  hazardRuleService,
} = require('../bll/hazardRuleService')

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

const createRulePayload = (overrides = {}) => ({
  name: '高处作业未采取防坠措施',
  category_id: 4,
  hazard_level: '疑似重大隐患',
  visible_fact_keywords: '高处作业,安全带,临边',
  trigger_condition: '现场可见高处作业人员未使用安全带或临边缺少防护。',
  required_evidence: '图片能显示作业高度、临边位置和防坠措施缺失。',
  image_evidence_supported: true,
  insufficient_evidence_level: '疑似重大隐患',
  rectification_template: '暂停高处作业，补齐防坠措施并复核。',
  is_active: true,
  clause_ids: [11],
  ...overrides,
})

const createRuleRecord = (overrides = {}) => ({
  id: 9,
  name: '高处作业未采取防坠措施',
  category_id: 4,
  category_name: '建筑施工安全',
  hazard_level: '疑似重大隐患',
  visible_fact_keywords: '高处作业,安全带,临边',
  trigger_condition: '现场可见高处作业人员未使用安全带或临边缺少防护。',
  required_evidence: '图片能显示作业高度、临边位置和防坠措施缺失。',
  image_evidence_supported: true,
  insufficient_evidence_level: '疑似重大隐患',
  rectification_template: '暂停高处作业，补齐防坠措施并复核。',
  is_active: true,
  status: 'active',
  clause_ref_count: 1,
  clause_refs: [{ clause_id: 11, source_title: '建筑施工高处作业安全技术规范' }],
  ...overrides,
})

test('重大和疑似重大隐患规则启用时必须关联已校验条文', async () => {
  patch(knowledgeCategoryDal, 'findById', async () => ({ id: 4, name: '建筑施工安全' }))
  patch(hazardRuleDal, 'findVerifiedClausesByIds', async () => [])

  try {
    await assert.rejects(
      () => hazardRuleService.create(createRulePayload({ clause_ids: [] })),
      /必须关联已校验法规条文/
    )
  } finally {
    restorePatches()
  }
})

test('规则只能关联 verified 且现行有效的正式条文', async () => {
  patch(knowledgeCategoryDal, 'findById', async () => ({ id: 4, name: '建筑施工安全' }))
  patch(hazardRuleDal, 'findVerifiedClausesByIds', async () => [{ id: 11 }])

  try {
    await assert.rejects(
      () => hazardRuleService.create(createRulePayload({ clause_ids: [11, 12] })),
      /异常条款 ID：12/
    )
  } finally {
    restorePatches()
  }
})

test('现行国家标准条文可作为正式规则依据', async () => {
  let clauseIdsForCreate = null

  patch(knowledgeCategoryDal, 'findById', async () => ({ id: 5, name: '消防安全' }))
  patch(hazardRuleDal, 'findVerifiedClausesByIds', async () => [{
    id: 21,
    current_status: '现行',
    verification_status: 'verified',
    source_title: '手提式灭火器',
  }])
  patch(hazardRuleDal, 'create', async (payload, clauseIds) => {
    clauseIdsForCreate = clauseIds
    return 21
  })
  patch(hazardRuleDal, 'findById', async () => createRuleRecord({
    id: 21,
    category_id: 5,
    category_name: '消防安全',
    hazard_level: '一般隐患',
    clause_refs: [{ clause_id: 21, source_title: '手提式灭火器', current_status: '现行' }],
  }))

  try {
    const created = await hazardRuleService.create(createRulePayload({
      category_id: 5,
      hazard_level: '一般隐患',
      clause_ids: [21],
    }))
    assert.deepEqual(clauseIdsForCreate, [21])
    assert.deepEqual(created.clause_ids, [21])
  } finally {
    restorePatches()
  }
})

test('未启用的重大规则允许先保存为草稿，后续补充依据后再启用', async () => {
  let createdPayload = null
  let createdClauseIds = null

  patch(knowledgeCategoryDal, 'findById', async () => ({ id: 4, name: '建筑施工安全' }))
  patch(hazardRuleDal, 'findVerifiedClausesByIds', async () => [])
  patch(hazardRuleDal, 'create', async (payload, clauseIds) => {
    createdPayload = payload
    createdClauseIds = clauseIds
    return 3
  })
  patch(hazardRuleDal, 'findById', async () => createRuleRecord({
    id: 3,
    category_id: 4,
    hazard_level: '疑似重大隐患',
    is_active: false,
    clause_refs: [],
  }))

  try {
    const created = await hazardRuleService.create(createRulePayload({
      category_id: 4,
      hazard_level: '疑似重大隐患',
      is_active: false,
      insufficient_evidence_level: '需人工复核',
      clause_ids: [],
    }))
    assert.equal(created.id, 3)
    assert.equal(createdPayload.is_active, false)
    assert.deepEqual(createdClauseIds, [])
    assert.deepEqual(created.clause_ids, [])
  } finally {
    restorePatches()
  }
})
test('启用既有重大规则时会再次校验条文依据', async () => {
  patch(hazardRuleDal, 'findById', async () => createRuleRecord({ clause_refs: [] }))

  try {
    await assert.rejects(
      () => hazardRuleService.setActive({ id: 9, is_active: true }),
      /必须关联已校验法规条文/
    )
  } finally {
    restorePatches()
  }
})

test('规则种子重复导入时按 seed_key 更新而不是重复创建', async () => {
  const categories = [
    { id: 5, name: '消防安全' },
    { id: 4, name: '建筑施工安全' },
    { id: 8, name: '工贸行业安全' },
    { id: 6, name: '特种设备安全' },
    { id: 12, name: '职业健康与劳动安全' },
  ]
  let createCount = 0
  let updateCount = 0

  patch(knowledgeCategoryDal, 'findAll', async () => categories)
  patch(hazardRuleDal, 'searchVerifiedClausesForSeed', async ({ limit }) => {
    assert.ok([1, 2].includes(limit))
    return [{ id: 31 }, { id: 32 }]
  })
  patch(hazardRuleDal, 'findBySeedKey', async () => null)
  patch(hazardRuleDal, 'create', async () => {
    createCount += 1
    return createCount
  })

  try {
    const first = await hazardRuleService.importSeedPack()
    assert.equal(first.created_rules, first.total_rules)
    assert.equal(createCount, first.total_rules)
  } finally {
    restorePatches()
  }

  patch(knowledgeCategoryDal, 'findAll', async () => categories)
  patch(hazardRuleDal, 'searchVerifiedClausesForSeed', async ({ limit }) => {
    assert.ok([1, 2].includes(limit))
    return [{ id: 31 }, { id: 32 }]
  })
  patch(hazardRuleDal, 'findBySeedKey', async (seedKey) => createRuleRecord({ id: seedKey.length, seed_key: seedKey }))
  patch(hazardRuleDal, 'updateById', async () => { updateCount += 1 })
  patch(hazardRuleDal, 'create', async () => { createCount += 1 })

  try {
    const second = await hazardRuleService.importSeedPack()
    assert.equal(second.updated_rules, second.total_rules)
    assert.equal(second.created_rules, 0)
    assert.equal(updateCount, second.total_rules)
  } finally {
    restorePatches()
  }
})

test('安全帽种子规则允许从劳动防护相关分类补充检索依据', async () => {
  const categories = [
    { id: 4, name: '建筑施工安全' },
    { id: 8, name: '工贸行业安全' },
    { id: 12, name: '职业健康与劳动安全' },
  ]
  const calls = []

  patch(knowledgeCategoryDal, 'findAll', async () => categories)
  patch(hazardRuleDal, 'searchVerifiedClausesForSeed', async (params) => {
    calls.push(params)
    return [{ id: 453 }, { id: 1988 }]
  })
  patch(hazardRuleDal, 'findBySeedKey', async () => null)
  patch(hazardRuleDal, 'create', async () => 1)

  try {
    await hazardRuleService.importSeedPack()
    const helmetCall = calls.find((item) => (item.keywords || []).includes('安全帽'))
    assert.ok(helmetCall)
    assert.equal(helmetCall.category_id, 4)
    assert.deepEqual(helmetCall.category_ids, [12, 8])
    assert.deepEqual(helmetCall.required_keywords, ['佩戴'])
  } finally {
    restorePatches()
  }
})
