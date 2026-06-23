const test = require('node:test')
const assert = require('node:assert/strict')

const knowledgeDal = require('../dal/knowledgeDal')
const knowledgeClauseDal = require('../dal/knowledgeClauseDal')
const knowledgeClauseDraftDal = require('../dal/knowledgeClauseDraftDal')
const knowledgeService = require('../bll/knowledgeService')

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

const createDraft = (overrides = {}) => ({
  id: 7,
  knowledge_id: 3,
  category_id: 5,
  source_title: '中华人民共和国消防法',
  source_code: '主席令第八十一号',
  source_url: 'https://flk.npc.gov.cn/example',
  issuing_authority: '全国人民代表大会常务委员会',
  document_type: '法律',
  publish_date: null,
  effective_date: '2021-04-29',
  current_status: '现行有效',
  clause_no: '第二十八条',
  content: '任何单位、个人不得占用、堵塞、封闭疏散通道、安全出口。',
  keywords: '疏散通道,安全出口',
  review_status: 'pending',
  status: 'active',
  sort: 1,
  ...overrides,
})

test('抽取草稿通过后才写入正式条文并标记 verified', async () => {
  let createdClause = null
  let updatedDraft = null
  const draft = createDraft()

  patch(knowledgeClauseDraftDal, 'findById', async () => draft)
  patch(knowledgeClauseDal, 'findDuplicate', async () => null)
  patch(knowledgeClauseDal, 'create', async (knowledgeId, clause) => {
    createdClause = { knowledgeId, clause }
    return 11
  })
  patch(knowledgeClauseDraftDal, 'updateById', async (id, params) => {
    updatedDraft = { id, params }
  })

  try {
    await knowledgeService.approveDraft({ id: draft.id, review_note: '人工核对通过' }, 1)
    assert.equal(createdClause.knowledgeId, draft.knowledge_id)
    assert.equal(createdClause.clause.verification_status, 'verified')
    assert.equal(createdClause.clause.content, draft.content)
    assert.equal(updatedDraft.params.review_status, 'approved')
    assert.equal(updatedDraft.params.reviewed_by, 1)
  } finally {
    restorePatches()
  }
})

test('抽取草稿命中重复正式条文时不重复创建', async () => {
  let createCalled = false
  let updatedDraft = null
  const draft = createDraft()

  patch(knowledgeClauseDraftDal, 'findById', async () => draft)
  patch(knowledgeClauseDal, 'findDuplicate', async () => ({ id: 99 }))
  patch(knowledgeClauseDal, 'create', async () => { createCalled = true })
  patch(knowledgeClauseDraftDal, 'updateById', async (id, params) => {
    updatedDraft = { id, params }
  })

  try {
    await knowledgeService.approveDraft({ id: draft.id }, 1)
    assert.equal(createCalled, false)
    assert.equal(updatedDraft.params.review_status, 'approved')
    assert.match(updatedDraft.params.review_note, /已存在相同正式条文/)
  } finally {
    restorePatches()
  }
})

test('驳回抽取草稿不会写入正式条文', async () => {
  let createCalled = false
  let updatedDraft = null
  const draft = createDraft()

  patch(knowledgeClauseDraftDal, 'findById', async () => draft)
  patch(knowledgeClauseDal, 'create', async () => { createCalled = true })
  patch(knowledgeClauseDraftDal, 'updateById', async (id, params) => {
    updatedDraft = { id, params }
  })

  try {
    await knowledgeService.rejectDraft({ id: draft.id, review_note: '抽取错位' }, 1)
    assert.equal(createCalled, false)
    assert.equal(updatedDraft.params.review_status, 'rejected')
    assert.equal(updatedDraft.params.review_note, '抽取错位')
  } finally {
    restorePatches()
  }
})

test('已审核草稿不能再次通过', async () => {
  patch(knowledgeClauseDraftDal, 'findById', async () => createDraft({ review_status: 'approved' }))

  try {
    await assert.rejects(
      () => knowledgeService.approveDraft({ id: 7 }, 1),
      /该草稿已审核/
    )
  } finally {
    restorePatches()
  }
})