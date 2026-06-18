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
const modelConfigService = require('../bll/modelConfigService')
const aiService = require('../bll/aiService')
const docService = require('../bll/docService')
const enterpriseDal = require('../dal/enterpriseDal')
const hazardImageDal = require('../dal/hazardImageDal')
const historyDal = require('../dal/historyDal')
const inspectionReportImageDal = require('../dal/inspectionReportImageDal')
const inspectionReportKnowledgeRefDal = require('../dal/inspectionReportKnowledgeRefDal')
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

  patch(hazardImageDal, 'findByIds', async (userId, imageIds) => (
    imageIds.map((id) => ({
      id: Number(id),
      user_id: Number(userId),
      file_path: testReportRelativePath,
      label: '配电箱',
      original_name: 'fixture.jpg',
    }))
  ))

  patch(aiService, 'processHazardImagesInspection', async () => ({
    result: '发现配电箱周边存在可见杂物，建议人工复核并清理。',
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

  patch(historyDal, 'createHistory', async () => 88)
  patch(historyDal, 'findById', async (id) => ({
    id: Number(id),
    user_id: fixtures.user.id,
    word_path: testReportRelativePath,
    pdf_path: testReportRelativePath,
    image_path: testReportRelativePath,
  }))

  patch(inspectionReportImageDal, 'linkImages', async () => undefined)
  patch(inspectionReportImageDal, 'findByReportId', async () => ([{
    file_path: testReportRelativePath,
  }]))
  patch(inspectionReportKnowledgeRefDal, 'replaceByReportId', async () => undefined)

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

test('POST /api/hazard/analyze 使用 mock AI 完成上传分析到报告链接的基础链路', async () => {
  const res = await request(app)
    .post('/api/hazard/analyze')
    .set('Authorization', 'Bearer user-token')
    .send({
      prompt: '检查配电箱隐患',
      image_ids: [7],
      enterprise_id: 21,
      model_id: 3,
    })
    .expect(200)

  assert.equal(res.body.code, ErrorCode.SUCCESS)
  assert.equal(res.body.id, 88)
  assert.equal(res.body.sessionId, 'session-from-mock')
  assert.match(res.body.result, /配电箱/)
  assert.match(res.body.pdfPath, /\/api\/files\/reports\/88\/pdf/)
  assert.equal(res.body.knowledge_refs[0].source_title, '测试法规')
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
