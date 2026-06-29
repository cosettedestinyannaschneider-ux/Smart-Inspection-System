process.env.NODE_ENV = 'test'
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-jwt-secret'
process.env.MODEL_CONFIG_SECRET = process.env.MODEL_CONFIG_SECRET || '12345678901234567890123456789012'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const request = require('supertest')

const userService = require('../bll/userService')
const authService = require('../bll/authService')
const knowledgeService = require('../bll/knowledgeService')
const { hazardRuleDraftService } = require('../bll/hazardRuleDraftService')
const modelConfigService = require('../bll/modelConfigService')
const aiService = require('../bll/aiService')
const docService = require('../bll/docService')
const enterpriseDal = require('../dal/enterpriseDal')
const hazardImageDal = require('../dal/hazardImageDal')
const historyDal = require('../dal/historyDal')
const inspectionReportImageDal = require('../dal/inspectionReportImageDal')
const inspectionReportKnowledgeRefDal = require('../dal/inspectionReportKnowledgeRefDal')
const inspectionReportRuleRefDal = require('../dal/inspectionReportRuleRefDal')
const inspectionTaskDal = require('../dal/inspectionTaskDal')
const sessionDal = require('../dal/sessionDal')
const logDal = require('../dal/logDal')
const C = require('../common/Constants')
const { ErrorCode } = require('../common/ErrorCode')

// 测试夹具只表达接口身份和权限，不连接真实用户表。
const fixtures = {
  user: {
    id: 11,
    username: 'demo_user',
    role: C.ROLE_USER,
    status: C.STATUS_ACTIVE,
    permissions: {
      'analysis:run': true,
      'report:download': true,
      'image:manage': true,
    },
  },
  admin: {
    id: 1,
    username: 'admin',
    role: C.ROLE_ADMIN,
    status: C.STATUS_ACTIVE,
    permissions: {},
  },
}

// 认证上下文模拟 JWT + 会话校验后的结果，用于覆盖不同权限边界。
const authContexts = {
  user: {
    token: 'user-token',
    jti: 'user-jti',
    userId: fixtures.user.id,
    user: fixtures.user,
    permissions: fixtures.user.permissions,
  },
  admin: {
    token: 'admin-token',
    jti: 'admin-jti',
    userId: fixtures.admin.id,
    user: fixtures.admin,
    permissions: fixtures.admin.permissions,
  },
  limited: {
    token: 'limited-token',
    jti: 'limited-jti',
    userId: 12,
    user: {
      id: 12,
      username: 'limited_user',
      role: C.ROLE_USER,
      status: C.STATUS_ACTIVE,
      permissions: {},
    },
    permissions: {},
  },
  otherUser: {
    token: 'other-user-token',
    jti: 'other-user-jti',
    userId: 13,
    user: {
      id: 13,
      username: 'other_user',
      role: C.ROLE_USER,
      status: C.STATUS_ACTIVE,
      permissions: {
        'report:download': true,
      },
    },
    permissions: {
      'report:download': true,
    },
  },
}

const uploadDir = C.UPLOAD_DIR
const testReportRelativePath = 'test/report-fixture.txt'
const testReportAbsolutePath = path.join(uploadDir, testReportRelativePath)

// 统一记录猴子补丁，测试结束后恢复，避免污染后续测试进程。
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

const app = (() => {
  // 在加载 Express app 前替换数据库、AI、文档生成等外部依赖。
  patch(logDal, 'logAction', async () => undefined)

  patch(userService, 'login', async (username, password) => {
    if (username === 'demo_user' && password === 'correct-password') {
      return { success: true, user: fixtures.user }
    }
    return { success: false, message: '用户名或密码错误' }
  })

  patch(authService, 'createLoginSession', async ({ userId }) => ({
    access_token: 'issued-test-token',
    token_type: 'Bearer',
    expires_at: '2030-01-01T00:00:00.000Z',
    user: userId === fixtures.admin.id ? fixtures.admin : fixtures.user,
  }))

  patch(authService, 'authenticateAccessToken', async (token) => {
    if (token === 'expired-token') {
      const error = new Error('测试 Token 已过期')
      error.authCode = 'TOKEN_EXPIRED'
      throw error
    }
    if (token === 'revoked-token') {
      const error = new Error('测试 Token 已撤销')
      error.authCode = 'SESSION_REVOKED'
      throw error
    }
    const context = Object.values(authContexts).find((item) => item.token === token)
    if (!context) throw new Error('测试 Token 无效')
    return context
  })

  patch(authService, 'authenticateFileAccessToken', async (token, expected) => {
    if (token !== 'file-token') throw new Error('测试文件 Token 无效')
    return {
      ...authContexts.user,
      fileGrant: {
        resourceType: expected.resourceType,
        resourceId: String(expected.resourceId),
        format: expected.format || null,
      },
    }
  })

  patch(authService, 'getCurrentAuthUser', async (userId) => (
    Number(userId) === fixtures.user.id ? fixtures.user : fixtures.admin
  ))

  patch(authService, 'logoutByJti', async () => undefined)

  patch(authService, 'createFileAccessToken', () => 'file-token')

  patch(hazardRuleDraftService, 'list', async () => ([{
    id: 501,
    name: 'AI 草稿：消防通道堵塞',
    category_id: 5,
    category_name: '消防安全',
    hazard_level: '一般隐患',
    visible_fact_keywords: '消防通道,堵塞',
    trigger_condition: '现场可见消防通道被杂物占用或堵塞。',
    required_evidence: '图片能显示通道及占用状态。',
    image_evidence_supported: true,
    insufficient_evidence_level: '需人工复核',
    rectification_template: '立即清理占用物，保持消防通道畅通。',
    clause_ids: [101],
    clause_refs: [{ clause_id: 101, source_title: '测试法规', clause_no: '第1条' }],
    review_status: 'pending',
  }]))

  patch(hazardRuleDraftService, 'generate', async (payload, adminId) => {
    assert.deepEqual(payload.clause_ids, [101])
    assert.equal(adminId, fixtures.admin.id)
    return [{ id: 502, name: 'AI 生成草稿', clause_ids: [101], review_status: 'pending' }]
  })

  patch(hazardRuleDraftService, 'update', async (payload) => ({
    id: Number(payload.id),
    name: payload.name || '更新后的草稿',
    review_status: 'pending',
  }))

  patch(hazardRuleDraftService, 'approve', async (payload, reviewerId) => ({
    draft: { id: Number(payload.id), review_status: 'approved', approved_rule_id: 701 },
    rule: { id: 701, name: 'AI 草稿转正式规则', is_active: false },
    reviewer_id: reviewerId,
  }))

  patch(hazardRuleDraftService, 'reject', async (payload) => ({
    id: Number(payload.id),
    review_status: 'rejected',
  }))

  patch(knowledgeService, 'getCoverage', async () => ({
    summary: {
      category_count: 14,
      covered_category_count: 1,
      usable_category_count: 1,
      knowledge_count: 1,
      clause_count: 3,
      verified_clause_count: 2,
      pending_clause_count: 1,
      rejected_clause_count: 0,
    },
    categories: [{
      category_id: 5,
      category_name: '消防安全',
      knowledge_count: 1,
      clause_count: 3,
      verified_clause_count: 2,
      pending_clause_count: 1,
      rejected_clause_count: 0,
      coverage_status: 'usable',
      verified_ratio: 0.6667,
    }],
    is_empty: false,
    can_support_formal_assessment: true,
    message: '已有人工校验条文，可为后续规则判定和报告依据追溯提供基础。',
  }))

  patch(modelConfigService, 'listForClient', async () => ([{
    id: 3,
    name: '测试模型',
    provider: 'mock',
    base_url: 'https://example.test/v1',
    model_name: 'mock-vision',
    max_tokens: 1024,
    temperature: 0.1,
    timeout_ms: 30000,
    is_active: true,
    api_key_masked: 'sk-***test',
  }]))

  patch(modelConfigService, 'create', async () => ({ id: 4 }))
  patch(modelConfigService, 'update', async () => undefined)
  patch(modelConfigService, 'activate', async () => undefined)
  patch(modelConfigService, 'delete', async () => undefined)
  patch(modelConfigService, 'testConnection', async () => ({
    ok: true,
    message: '测试连接成功',
  }))

  patch(enterpriseDal, 'findById', async (id) => ({
    id: Number(id),
    name: '测试企业',
    industry: '工贸行业安全',
  }))

  patch(enterpriseDal, 'findByUserOrganization', async () => ({
    id: 21,
    name: '测试企业',
    industry: '工贸行业安全',
  }))


  patch(sessionDal, 'bindTask', async () => undefined)

  patch(inspectionTaskDal, 'findAccessibleById', async (id, userId, isAdmin = false) => ({
    id: Number(id),
    task_no: Number(id) === 32 ? 'IT-TEST-000002' : 'IT-TEST-000001',
    enterprise_id: Number(id) === 32 ? 22 : 21,
    inspector_id: isAdmin ? fixtures.user.id : Number(userId),
    inspection_date: '2026-06-24',
    status: 'active',
  }))

  patch(hazardImageDal, 'findByIds', async (userId, imageIds) => (
    imageIds.map((id) => ({
      id: Number(id),
      user_id: Number(userId),
      file_path: testReportRelativePath,
      label: '配电箱',
      original_name: 'fixture.jpg',
      enterprise_id: Number(id) === 8 ? 22 : 21,
      inspection_task_id: Number(id) === 8 ? 32 : 31,
    }))
  ))

  patch(aiService, 'processHazardImagesInspection', async () => ({
    result: JSON.stringify({
      scene_status: 'related',
      scene_reason: '现场图片可用于安全生产检查',
      visible_facts: ['消防通道堆放纸箱造成堵塞'],
      items: [{
        image_id: 1,
        hazard_description: '图片可见消防通道堆放纸箱造成堵塞。命中规则：消防通道堵塞。',
        hazard_level: '一般隐患',
        basis: '《测试法规》（GB TEST-2026）第1条：测试条文内容',
        suggestion: '立即清理占用物，保持消防通道畅通。',
        responsibility: '企业安全管理部门',
        visible_facts: ['消防通道堆放纸箱造成堵塞'],
        matched_rules: [{ id: 7, name: '消防通道堵塞', hazard_level: '一般隐患' }],
        legal_refs: [{ knowledge_clause_id: 101, knowledge_id: 201, source_title: '测试法规', source_code: 'GB TEST-2026', clause_no: '第1条', content: '测试条文内容', match_keyword: '消防通道' }],
        evidence_sufficiency: 'sufficient',
        review_required: false,
      }],
      matched_rules: [{ id: 7, name: '消防通道堵塞', hazard_level: '一般隐患' }],
      legal_refs: [{ knowledge_clause_id: 101, knowledge_id: 201, source_title: '测试法规', source_code: 'GB TEST-2026', clause_no: '第1条', content: '测试条文内容', match_keyword: '消防通道' }],
      reference_standards: [{ name: '测试法规', code: 'GB TEST-2026', clause: '第1条', content: '测试条文内容' }],
      hazard_level: '一般隐患',
      evidence_sufficiency: 'sufficient',
      confidence_level: 'high',
      analysis_basis_type: 'local_rule',
      fallback_used: false,
      basis_notice: '?????????????????????',
      review_required: false,
      report_allowed: true,
      report_block_reason: '',
      comprehensive_opinion: { improvement_directions: [], general_suggestions: '测试综合建议' },
    }),
    sessionId: 'session-from-mock',
    knowledgeRefs: [{
      id: 1,
      knowledge_clause_id: 101,
      knowledge_id: 201,
      source_title: '测试法规',
      source_code: 'GB TEST-2026',
      clause_no: '第1条',
      content: '测试条文内容',
      match_keyword: '配电箱',
    }],
  }))

  patch(docService, 'generateTemplateReport', async () => testReportRelativePath)
  patch(docService, 'generateTemplatePDF', async () => testReportRelativePath)
  patch(docService, 'generateWord', async () => testReportRelativePath)
  patch(docService, 'generatePDF', async () => testReportRelativePath)

  patch(historyDal, 'createHistory', async (userId, prompt, result, wordPath, pdfPath, imagePath, sessionId, opts = {}) => {
    assert.equal(opts.inspectionTaskId, 31)
    assert.equal(opts.enterpriseId, 21)
    return 88
  })
  patch(historyDal, 'updateResult', async () => undefined)
  patch(historyDal, 'updateReportFiles', async () => undefined)
  patch(historyDal, 'confirmReview', async () => undefined)
  patch(historyDal, 'rejectReview', async () => undefined)
  patch(historyDal, 'findById', async (id) => ({
    id: Number(id),
    user_id: fixtures.user.id,
    word_path: testReportRelativePath,
    pdf_path: testReportRelativePath,
    report_allowed: 1,
    review_status: C.REPORT_REVIEW_PENDING,
    image_path: testReportRelativePath,
  }))

  patch(inspectionReportImageDal, 'linkImages', async () => undefined)
  patch(inspectionReportImageDal, 'findByReportId', async () => ([{
    file_path: testReportRelativePath,
  }]))
  patch(inspectionReportKnowledgeRefDal, 'replaceByReportId', async () => undefined)
  patch(inspectionReportRuleRefDal, 'replaceByReportId', async () => undefined)
  patch(inspectionReportRuleRefDal, 'findByReportIds', async () => new Map())
  patch(inspectionReportRuleRefDal, 'deleteByReportId', async () => undefined)

  return require('../server')
})()

test.after(() => {
  restorePatches()
  fs.rmSync(path.dirname(testReportAbsolutePath), { recursive: true, force: true })
})

test.before(() => {
  fs.mkdirSync(path.dirname(testReportAbsolutePath), { recursive: true })
  fs.writeFileSync(testReportAbsolutePath, 'controlled report content', 'utf8')
})

test('POST /api/login 登录成功时返回 Bearer Token 和用户信息', async () => {
  const res = await request(app)
    .post('/api/login')
    .send({ username: 'demo_user', password: 'correct-password' })
    .expect(200)

  assert.equal(res.body.code, ErrorCode.SUCCESS)
  assert.equal(res.body.access_token, 'issued-test-token')
  assert.equal(res.body.token_type, 'Bearer')
  assert.equal(res.body.user.username, fixtures.user.username)
})

test('POST /api/login 登录失败时返回 LOGIN_FAILED', async () => {
  const res = await request(app)
    .post('/api/login')
    .send({ username: 'demo_user', password: 'wrong-password' })
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.LOGIN_FAILED)
})

test('GET /api/auth/me 缺少 Bearer Token 时拒绝访问', async () => {
  const res = await request(app)
    .get('/api/auth/me')
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.UNAUTHORIZED)
})

test('GET /api/auth/me 使用有效 Token 时返回当前用户', async () => {
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', 'Bearer user-token')
    .expect(200)

  assert.equal(res.body.code, ErrorCode.SUCCESS)
  assert.equal(res.body.user.username, fixtures.user.username)
})

test('GET /api/auth/me 使用伪造 Token 时拒绝访问', async () => {
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', 'Bearer forged-token')
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.UNAUTHORIZED)
})

test('GET /api/auth/me 使用过期 Token 时返回 SESSION_EXPIRED', async () => {
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', 'Bearer expired-token')
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.SESSION_EXPIRED)
})

test('GET /api/auth/me 使用已撤销 Token 时拒绝访问', async () => {
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', 'Bearer revoked-token')
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.UNAUTHORIZED)
})

test('管理员模型配置接口缺少 Token 时拒绝访问', async () => {
  const res = await request(app)
    .post('/api/admin/config/ai/list')
    .send({})
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.UNAUTHORIZED)
})

test('管理员模型配置接口使用普通用户 Token 时拒绝访问', async () => {
  const res = await request(app)
    .post('/api/admin/config/ai/list')
    .set('Authorization', 'Bearer user-token')
    .send({})
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.ADMIN_REQUIRED)
})

test('管理员模型配置接口使用管理员 Token 时可增查启用删除', async () => {
  const listRes = await request(app)
    .post('/api/admin/config/ai/list')
    .set('Authorization', 'Bearer admin-token')
    .send({})
    .expect(200)
  assert.equal(listRes.body.code, ErrorCode.SUCCESS)
  assert.equal(listRes.body.data[0].name, '测试模型')

  const addRes = await request(app)
    .post('/api/admin/config/ai/add')
    .set('Authorization', 'Bearer admin-token')
    .send({
      name: '新增测试模型',
      provider: 'mock',
      base_url: 'https://example.test/v1',
      api_key: 'sk-test',
      model_name: 'mock-vision',
    })
    .expect(200)
  assert.equal(addRes.body.code, ErrorCode.SUCCESS)
  assert.equal(addRes.body.id, 4)

  const activateRes = await request(app)
    .post('/api/admin/config/ai/activate')
    .set('Authorization', 'Bearer admin-token')
    .send({ id: 4 })
    .expect(200)
  assert.equal(activateRes.body.code, ErrorCode.SUCCESS)

  const updateRes = await request(app)
    .post('/api/admin/config/ai/update')
    .set('Authorization', 'Bearer admin-token')
    .send({ id: 4, name: '更新测试模型' })
    .expect(200)
  assert.equal(updateRes.body.code, ErrorCode.SUCCESS)

  const testRes = await request(app)
    .post('/api/admin/config/ai/test')
    .set('Authorization', 'Bearer admin-token')
    .send({ id: 4 })
    .expect(200)
  assert.equal(testRes.body.code, ErrorCode.SUCCESS)
  assert.equal(testRes.body.ok, true)

  const deleteRes = await request(app)
    .post('/api/admin/config/ai/delete')
    .set('Authorization', 'Bearer admin-token')
    .send({ id: 4 })
    .expect(200)
  assert.equal(deleteRes.body.code, ErrorCode.SUCCESS)
})

test('管理员知识库覆盖率接口返回可用性汇总', async () => {
  const res = await request(app)
    .post('/api/admin/knowledge/coverage')
    .set('Authorization', 'Bearer admin-token')
    .send({})
    .expect(200)

  assert.equal(res.body.code, ErrorCode.SUCCESS)
  assert.equal(res.body.data.summary.category_count, 14)
  assert.equal(res.body.data.summary.clause_count, 3)
  assert.equal(res.body.data.can_support_formal_assessment, true)
  assert.equal(res.body.data.categories[0].category_name, '消防安全')
  assert.equal(res.body.data.categories[0].coverage_status, 'usable')
})

test('规则草稿接口缺少管理员身份时拒绝访问', async () => {
  const res = await request(app)
    .post('/api/admin/knowledge/rules/drafts/list')
    .set('Authorization', 'Bearer user-token')
    .send({})
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.ADMIN_REQUIRED)
})

test('管理员可生成并审核 AI 规则草稿', async () => {
  const listRes = await request(app)
    .post('/api/admin/knowledge/rules/drafts/list')
    .set('Authorization', 'Bearer admin-token')
    .send({ review_status: 'pending' })
    .expect(200)
  assert.equal(listRes.body.code, ErrorCode.SUCCESS)
  assert.equal(listRes.body.data[0].review_status, 'pending')

  const generateRes = await request(app)
    .post('/api/admin/knowledge/rules/drafts/generate')
    .set('Authorization', 'Bearer admin-token')
    .send({ clause_ids: [101] })
    .expect(200)
  assert.equal(generateRes.body.code, ErrorCode.SUCCESS)
  assert.equal(generateRes.body.data[0].name, 'AI 生成草稿')

  const updateRes = await request(app)
    .post('/api/admin/knowledge/rules/drafts/update')
    .set('Authorization', 'Bearer admin-token')
    .send({ id: 502, name: '更新后的草稿' })
    .expect(200)
  assert.equal(updateRes.body.code, ErrorCode.SUCCESS)
  assert.equal(updateRes.body.name, '更新后的草稿')

  const approveRes = await request(app)
    .post('/api/admin/knowledge/rules/drafts/approve')
    .set('Authorization', 'Bearer admin-token')
    .send({ id: 502 })
    .expect(200)
  assert.equal(approveRes.body.code, ErrorCode.SUCCESS)
  assert.equal(approveRes.body.rule.is_active, false)
  assert.equal(approveRes.body.draft.approved_rule_id, 701)

  const rejectRes = await request(app)
    .post('/api/admin/knowledge/rules/drafts/reject')
    .set('Authorization', 'Bearer admin-token')
    .send({ id: 503 })
    .expect(200)
  assert.equal(rejectRes.body.code, ErrorCode.SUCCESS)
  assert.equal(rejectRes.body.review_status, 'rejected')
})

test('受控报告下载缺少鉴权时拒绝访问', async () => {
  const res = await request(app)
    .get('/api/files/reports/88/pdf')
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.UNAUTHORIZED)
})

test('受控报告下载使用他人用户 Token 时拒绝访问', async () => {
  const res = await request(app)
    .get('/api/files/reports/88/pdf')
    .set('Authorization', 'Bearer other-user-token')
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.RECORD_NOT_FOUND)
})

test('受控报告下载使用有效 Bearer Token 时返回文件内容', async () => {
  const res = await request(app)
    .get('/api/files/reports/88/pdf')
    .set('Authorization', 'Bearer user-token')
    .expect(200)

  assert.equal(res.text, 'controlled report content')
})

test('POST /api/hazard/analyze 使用 mock AI 保存待确认初判，不直接生成正式报告', async () => {
  const res = await request(app)
    .post('/api/hazard/analyze')
    .set('Authorization', 'Bearer user-token')
    .send({
      prompt: '检查配电箱隐患',
      image_ids: [7],
      inspection_task_id: 31,
      model_id: 3,
    })
    .expect(200)

  assert.equal(res.body.code, ErrorCode.SUCCESS)
  assert.equal(res.body.id, 88)
  assert.equal(res.body.sessionId, 'session-from-mock')
  assert.match(res.body.result, /消防通道/)
  assert.equal(res.body.pdfPath, null)
  assert.equal(res.body.wordPath, null)
  assert.equal(res.body.review_status, C.REPORT_REVIEW_PENDING)
  assert.equal(res.body.report_allowed, true)
  assert.ok(['high', 'medium', 'low', 'non_business'].includes(res.body.confidence_level))
  assert.ok(['local_rule', 'local_clause', 'ai_fallback', 'external_search', 'non_business'].includes(res.body.analysis_basis_type))
  assert.ok(typeof res.body.basis_notice === 'string' && res.body.basis_notice.length > 0)
  assert.equal(res.body.knowledge_refs[0].source_title, '测试法规')
  assert.equal(res.body.rule_refs[0].name, '消防通道堵塞')
})


test('POST /api/history/review/confirm 人工确认后生成正式 Word/PDF 报告链接', async () => {
  const res = await request(app)
    .post('/api/history/review/confirm')
    .set('Authorization', 'Bearer user-token')
    .send({ id: 88 })
    .expect(200)

  assert.equal(res.body.code, ErrorCode.SUCCESS)
  assert.equal(res.body.review_status, C.REPORT_REVIEW_CONFIRMED)
  assert.match(res.body.pdfPath, /\/api\/files\/reports\/88\/pdf/)
  assert.match(res.body.wordPath, /\/api\/files\/reports\/88\/word/)
})
test('POST /api/hazard/analyze 缺少检查任务时拒绝分析', async () => {
  const res = await request(app)
    .post('/api/hazard/analyze')
    .set('Authorization', 'Bearer user-token')
    .send({
      prompt: '检查配电箱隐患',
      image_ids: [7],
    })
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.PARAM_MISSING)
})

test('POST /api/hazard/analyze 混选不同检查任务图片时拒绝分析', async () => {
  const res = await request(app)
    .post('/api/hazard/analyze')
    .set('Authorization', 'Bearer user-token')
    .send({
      prompt: '检查配电箱隐患',
      image_ids: [7, 8],
      inspection_task_id: 31,
    })
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.PARAM_INVALID)
})

test('POST /api/hazard/analyze 普通用户缺少分析权限时拒绝访问', async () => {
  const res = await request(app)
    .post('/api/hazard/analyze')
    .set('Authorization', 'Bearer limited-token')
    .send({
      prompt: '检查配电箱隐患',
      image_ids: [7],
    })
    .expect(200)

  assert.equal(res.body.success, false)
  assert.equal(res.body.code, ErrorCode.PERMISSION_DENIED)
})

