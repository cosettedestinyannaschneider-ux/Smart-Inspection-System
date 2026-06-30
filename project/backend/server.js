const express = require('express')
const cors = require('cors')
const multer = require('multer')
const fs = require('fs')
const path = require('path')

// ---- 业务层 ----
const userService = require('./bll/userService')
const authService = require('./bll/authService')
const aiService = require('./bll/aiService')
const docService = require('./bll/docService')
const knowledgeService = require('./bll/knowledgeService')
const legalClauseImportService = require('./bll/legalClauseImportService')
const { hazardRuleService } = require('./bll/hazardRuleService')
const { hazardRuleDraftService } = require('./bll/hazardRuleDraftService')
const modelConfigService = require('./bll/modelConfigService')
const adminWorkbenchService = require('./bll/adminWorkbenchService')
const reportTemplateService = require('./bll/reportTemplateService')
const backupService = require('./bll/backupService')

// ---- 数据访问层 ----
const historyDal = require('./dal/historyDal')
const enterpriseDal = require('./dal/enterpriseDal')
const logDal = require('./dal/logDal')
const schemaInit = require('./dal/schemaInit')
const hazardImageDal = require('./dal/hazardImageDal')
const sessionDal = require('./dal/sessionDal')
const departmentDal = require('./dal/departmentDal')
const aiModelConfigDal = require('./dal/aiModelConfigDal')
const inspectionReportImageDal = require('./dal/inspectionReportImageDal')
const inspectionReportKnowledgeRefDal = require('./dal/inspectionReportKnowledgeRefDal')
const inspectionReportRuleRefDal = require('./dal/inspectionReportRuleRefDal')
const inspectionTaskDal = require('./dal/inspectionTaskDal')
const enterpriseAssignmentDal = require('./dal/enterpriseAssignmentDal')

// ---- 公共模块 ----
const { responseMiddleware } = require('./common/Result')
const { ErrorCode, ErrorMessage } = require('./common/ErrorCode')
const C = require('./common/Constants')
const {
  resolveUploadAbsolutePath,
  isPublicStaticUploadPath,
  buildFileUrl,
} = require('./common/fileAccess')
const adminAuth = require('./middleware/adminAuth')
const requireAuth = require('./middleware/requireAuth')
const requirePermission = require('./middleware/requirePermission')
const requireAdmin = require('./middleware/requireAdmin')
const adminUserRoutes = require('./routes/admin/userRoutes')
const adminEnterpriseRoutes = require('./routes/admin/enterpriseRoutes')
const adminDepartmentRoutes = require('./routes/admin/departmentRoutes')

// =========================================================================
// Express 初始化
// =========================================================================
const app = express()

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true
}))

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  if (req.headers['access-control-request-private-network']) {
    res.header('Access-Control-Allow-Private-Network', 'true')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 挂载统一响应方法 res.success / res.fail
app.use(responseMiddleware)

// 静态文件
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  const requestPath = String(req.path || '').replace(/^\/+/, '')
  if (!isPublicStaticUploadPath(requestPath, C.HAZARD_UPLOAD_SUBDIR, [C.REPORT_TEMPLATE_UPLOAD_SUBDIR])) {
    return res.status(404).end()
  }
  next()
}, express.static(C.UPLOAD_DIR))

// 确保目录存在
for (const dir of [
  C.UPLOAD_DIR,
  path.join(C.UPLOAD_DIR, C.HAZARD_UPLOAD_SUBDIR),
  path.join(C.UPLOAD_DIR, C.KNOWLEDGE_UPLOAD_SUBDIR),
  path.join(C.UPLOAD_DIR, C.REPORT_TEMPLATE_UPLOAD_SUBDIR),
  path.join(C.UPLOAD_DIR, C.BACKUP_UPLOAD_SUBDIR),
]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// 文件上传配置
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, C.UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  })
})

const hazardUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(C.UPLOAD_DIR, C.HAZARD_UPLOAD_SUBDIR)),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
  })
})

const reportTemplateUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(C.UPLOAD_DIR, C.REPORT_TEMPLATE_UPLOAD_SUBDIR)),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  fileFilter: (req, file, cb) => {
    if (!/\.docx$/i.test(String(file.originalname || ''))) {
      cb(new Error('仅支持上传 DOCX 模板文件'))
      return
    }
    cb(null, true)
  },
})

const knowledgeUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(C.UPLOAD_DIR, C.KNOWLEDGE_UPLOAD_SUBDIR)),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: {
    fileSize: C.MAX_DOCUMENT_UPLOAD_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (!C.ALLOWED_DOC_TYPES.test(String(file.originalname || ''))) {
      cb(new Error('仅支持上传 PDF、DOC 或 DOCX 文件'))
      return
    }
    cb(null, true)
  },
})

const legalClauseCsvUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(C.UPLOAD_DIR, C.KNOWLEDGE_UPLOAD_SUBDIR)),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  fileFilter: (req, file, cb) => {
    if (!/\.csv$/i.test(String(file.originalname || ''))) {
      return cb(new Error('仅支持上传 CSV 文件'))
    }
    return cb(null, true)
  },
  limits: { fileSize: 5 * 1024 * 1024 },
})

// 初始化数据库
/** 包装模板上传中间件，统一处理文件格式与缺失错误 */
const useReportTemplateUpload = (fieldName) => (req, res, next) => {
  reportTemplateUpload.single(fieldName)(req, res, (error) => {
    if (!error) return next()
    if (String(error.message || '').includes('DOCX')) {
      return res.fail(ErrorCode.FILE_FORMAT_INVALID, error.message)
    }
    return res.fail(ErrorCode.FILE_REQUIRED, error.message || '模板文件上传失败')
  })
}

/** 包装知识库上传中间件，统一处理文件格式和大小限制 */
const useKnowledgeUpload = (fieldName) => (req, res, next) => {
  knowledgeUpload.single(fieldName)(req, res, (error) => {
    if (!error) return next()
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.fail(ErrorCode.PARAM_INVALID, '知识库文件不能超过 20MB')
    }
    if (String(error.message || '').includes('PDF') || String(error.message || '').includes('DOC')) {
      return res.fail(ErrorCode.FILE_FORMAT_INVALID, error.message)
    }
    return res.fail(ErrorCode.FILE_REQUIRED, error.message || '知识库文件上传失败')
  })
}

/** CSV 上传中间件，统一返回业务错误 */
const useLegalClauseCsvUpload = (fieldName) => (req, res, next) => {
  const handler = legalClauseCsvUpload.single(fieldName)
  handler(req, res, (err) => {
    if (!err) return next()
    return res.fail(ErrorCode.INVALID_PARAM, err.message || 'CSV 上传失败')
  })
}

/** 统一映射知识库业务异常返回码 */
const resolveKnowledgeErrorCode = (error) => {
  if (!error?.isKnowledgeError) return ErrorCode.INTERNAL_ERROR
  if (String(error.message || '').includes('请上传知识库文件')) return ErrorCode.FILE_REQUIRED
  if (String(error.message || '').includes('仅支持上传')) return ErrorCode.FILE_FORMAT_INVALID
  return ErrorCode.PARAM_INVALID
}

if (process.env.NODE_ENV !== 'test') {
  schemaInit.init().catch(err => console.error('[Server] Schema init failed:', err))
}

/** 统一读取当前登录用户 ID */
const getAuthUserId = (req) => Number(req.auth?.userId || 0)

/** 判断当前请求是否管理员 */
const isAdminRequest = (req) => req.auth?.user?.role === C.ROLE_ADMIN

/** 读取并校验当前用户可访问的检查任务 */
const loadAccessibleInspectionTask = async (req, inspectionTaskId) => {
  const taskId = Number(inspectionTaskId || 0)
  if (!taskId) return null
  return inspectionTaskDal.findAccessibleById(taskId, getAuthUserId(req), isAdminRequest(req))
}

/** 统一生成报告下载链接 */
const buildReportDownloadUrls = (req, reportId, wordPath, pdfPath) => ({
  wordPath: wordPath
    ? buildFileUrl(`/api/files/reports/${reportId}/word`, authService.createFileAccessToken({
        userId: getAuthUserId(req),
        jti: req.auth.jti,
        resourceType: 'report',
        resourceId: reportId,
        format: 'word',
      }))
    : null,
  pdfPath: pdfPath
    ? buildFileUrl(`/api/files/reports/${reportId}/pdf`, authService.createFileAccessToken({
        userId: getAuthUserId(req),
        jti: req.auth.jti,
        resourceType: 'report',
        resourceId: reportId,
        format: 'pdf',
      }))
    : null,
})

/** 统一生成隐患图片受控访问链接 */
const buildHazardImagePreviewUrl = (req, imageId) => buildFileUrl(
  `/api/files/hazard-images/${imageId}`,
  authService.createFileAccessToken({
    userId: getAuthUserId(req),
    jti: req.auth.jti,
    resourceType: 'hazard-image',
    resourceId: imageId,
  })
)

/** 统一生成按报告回放的受控图片预览链接 */
const buildReportImagePreviewUrl = (req, reportId) => buildFileUrl(
  `/api/files/reports/${reportId}/image`,
  authService.createFileAccessToken({
    userId: getAuthUserId(req),
    jti: req.auth.jti,
    resourceType: 'report-image',
    resourceId: reportId,
  })
)

/** 缁熶竴鐢熸垚绠＄悊鍛樻ā鏉挎枃浠朵笅杞介摼鎺?*/
const buildAdminTemplateDownloadUrl = (req, templateId) => buildFileUrl(
  `/api/admin/templates/${templateId}/file`,
  authService.createFileAccessToken({
    userId: getAuthUserId(req),
    jti: req.auth.jti,
    resourceType: 'admin-report-template',
    resourceId: templateId,
  })
)

/** 灏嗘ā鏉胯褰曟槧灏勪负鍓嶇鍙洿鎺ュ睍绀虹殑缁撴瀯 */
const mapTemplateRecordForClient = (req, record) => ({
  ...record,
  download_url: record?.has_file ? buildAdminTemplateDownloadUrl(req, record.id) : null,
})

/** 生成管理员数据库备份的受控下载链接 */
const buildAdminBackupDownloadUrl = (req, backupId) => buildFileUrl(
  `/api/admin/backup/${backupId}/file`,
  authService.createFileAccessToken({
    userId: getAuthUserId(req),
    jti: req.auth.jti,
    resourceType: 'admin-database-backup',
    resourceId: backupId,
  })
)

/** 尝试读取 Bearer Token 或文件访问票据 */
const resolveFileRequestAuth = async (req, expected) => {
  const bearer = String(req.headers.authorization || '').trim()
  if (bearer.startsWith('Bearer ')) {
    return await authService.authenticateAccessToken(bearer.slice('Bearer '.length).trim(), {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    })
  }

  const fileToken = String(req.query.access_token || '').trim()
  if (!fileToken) {
    throw new Error('请先登录')
  }
  return await authService.authenticateFileAccessToken(fileToken, expected)
}

/** 将报告引用依据快照映射为前端展示结构 */
const mapKnowledgeRefsForClient = (refs = []) => refs.map((ref) => ({
  id: Number(ref.id),
  knowledge_clause_id: ref.knowledge_clause_id ? Number(ref.knowledge_clause_id) : null,
  knowledge_id: ref.knowledge_id ? Number(ref.knowledge_id) : null,
  source_title: ref.source_title || '',
  source_code: ref.source_code || '',
  clause_no: ref.clause_no || '',
  content: ref.content || '',
  match_keyword: ref.match_keyword || '',
}))


/** 将报告命中规则快照映射为前端展示结构 */
const mapRuleRefsForClient = (refs = []) => refs.map((ref) => ({
  id: Number(ref.id || ref.rule_id || 0),
  rule_id: ref.rule_id ? Number(ref.rule_id) : (ref.id ? Number(ref.id) : null),
  rule_name: ref.rule_name || ref.name || '',
  name: ref.rule_name || ref.name || '',
  hazard_level: ref.hazard_level || '',
  evidence_sufficiency: ref.evidence_sufficiency || '',
  judgment_reason: ref.judgment_reason || ref.reason || '',
}))

/** 安全解析报告结果 JSON */
const parseReportResult = (result) => {
  try { return JSON.parse(String(result || '').trim()) }
  catch { return null }
}

/** 提取可信度、依据来源和兜底说明快照 */
const extractAssessmentSnapshot = (assessment) => ({
  confidenceLevel: assessment?.confidence_level || 'low',
  analysisBasisType: assessment?.analysis_basis_type || 'ai_fallback',
  fallbackUsed: assessment?.fallback_used === true || Number(assessment?.fallback_used || 0) === 1,
  basisNotice: assessment?.basis_notice || '',
})

/** 根据分析结果生成报告复核状态 */
const buildReviewStateFromAssessment = (assessment) => {
  const reportAllowed = assessment?.report_allowed !== false
  const reviewRequired = assessment?.review_required !== false
  const blockReason = assessment?.report_block_reason || (reviewRequired ? 'AI 初判结果需人工确认后方可形成正式结论' : '')
  return {
    reportAllowed,
    reviewRequired,
    reviewStatus: reportAllowed ? C.REPORT_REVIEW_PENDING : C.REPORT_REVIEW_NEEDS_REVIEW,
    reportBlockReason: blockReason,
    ...extractAssessmentSnapshot(assessment),
  }
}

const extractRuleRefsFromAssessment = (assessment) => {
  const rules = Array.isArray(assessment?.matched_rules) ? assessment.matched_rules : []
  const itemRules = Array.isArray(assessment?.items)
    ? assessment.items.flatMap((item) => (item.matched_rules || []).map((rule) => ({
        ...rule,
        evidence_sufficiency: item.evidence_sufficiency,
        judgment_reason: item.hazard_description,
      })))
    : []
  const map = new Map()
  ;[...rules, ...itemRules].forEach((rule) => {
    const key = Number(rule.id || rule.rule_id || 0) || String(rule.name || rule.rule_name || '')
    if (!key || map.has(key)) return
    map.set(key, rule)
  })
  return Array.from(map.values())
}

/** 查询报告关联图片的绝对路径，用于确认后生成正式报告 */
const resolveReportImagePaths = async (reportId) => {
  const linkedImages = await inspectionReportImageDal.findByReportId(reportId)
  return linkedImages
    .map((img) => img.file_path ? path.join(C.UPLOAD_DIR, String(img.file_path)) : null)
    .filter(Boolean)
}

/** 根据报告记录生成正式 Word/PDF，并写回报告路径 */
const generateFormalReportForRecord = async (record, resultOverride = null) => {
  const result = resultOverride || record.result || ''
  const reportImages = await resolveReportImagePaths(record.id)
  const task = record.inspection_task_id ? await inspectionTaskDal.findById(record.inspection_task_id) : null
  const reportMeta = {
    confidence_level: record.confidence_level,
    analysis_basis_type: record.analysis_basis_type,
    fallback_used: record.fallback_used,
    basis_notice: record.basis_notice,
    review_status: record.review_status,
    review_comment: record.review_comment,
    report_allowed: Number(record.report_allowed) !== 0,
    report_block_reason: record.report_block_reason,
    task_no: task?.task_no || '',
    task_inspection_date: task?.inspection_date || '',
    inspector_name: task?.inspector_name || '',
  }
  let wordPath = null
  let pdfPath = null
  if (record.enterprise_id) {
    const enterprise = await enterpriseDal.findById(record.enterprise_id)
    if (enterprise) {
      wordPath = await docService.generateTemplateReport({
        enterprise,
        prompt: record.prompt,
        result,
        imagePaths: reportImages,
        reportMeta,
      })
      pdfPath = await docService.generateTemplatePDF({
        enterprise,
        prompt: record.prompt,
        result,
        imagePaths: reportImages,
        wordPath,
        reportMeta,
      })
    }
  }
  if (!wordPath) wordPath = await docService.generateWord(record.prompt, result, reportImages, { reportMeta })
  if (!pdfPath) pdfPath = await docService.generatePDF(record.prompt, result, reportImages, { wordPath, reportMeta })
  await historyDal.updateReportFiles(record.id, wordPath, pdfPath)
  return { wordPath, pdfPath }
}
/** ?????????????????????????? */
const mapHistoryRecordForClient = (req, record, knowledgeRefs = [], ruleRefs = []) => ({
  ...record,
  fallback_used: Number(record.fallback_used || 0) === 1,
  image_path: record.image_path ? buildReportImagePreviewUrl(req, record.id) : null,
  knowledge_refs: mapKnowledgeRefsForClient(knowledgeRefs),
  rule_refs: mapRuleRefsForClient(ruleRefs),
  ...buildReportDownloadUrls(req, record.id, record.word_path, record.pdf_path),
})

/** 批量映射报告记录，并附带引用依据快照 */
const mapHistoryRecordsForClient = async (req, records = []) => {
  const reportIds = records.map((record) => Number(record.id)).filter((id) => id > 0)
  const refMap = await inspectionReportKnowledgeRefDal.findByReportIds(reportIds)
  const ruleMap = await inspectionReportRuleRefDal.findByReportIds(reportIds)
  return records.map((record) => mapHistoryRecordForClient(req, record, refMap.get(Number(record.id)) || [], ruleMap.get(Number(record.id)) || []))
}

/** 安全发送本地上传文件 */
const sendControlledUploadFile = (res, absolutePath) => {
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return res.fail(ErrorCode.NOT_FOUND, '文件不存在或已被移除')
  }
  return res.sendFile(absolutePath)
}

// 阶段 B 管理路由按领域拆分，保持原接口路径不变
app.use('/api/admin/users', adminUserRoutes)
app.use('/api/admin/enterprises', adminEnterpriseRoutes)
app.use('/api/admin/departments', adminDepartmentRoutes)

// =========================================================================
// 健康检查
// =========================================================================
app.get('/api/health', (req, res) => {
  res.success({ status: 'running' }, 'Backend is running')
})

// =========================================================================
// AI 模型列表（公共接口）
// =========================================================================
app.get('/api/models/list', async (req, res) => {
  try {
    const all = await aiModelConfigDal.findAll()
    // 仅返回必要字段，屏蔽 api_key
    const list = all.map((m) => ({
      id: m.id, name: m.name, model_name: m.model_name,
      is_active: !!m.is_active, max_tokens: m.max_tokens,
    }))
    res.success(list)
  } catch (err) { res.fail(ErrorCode.DATABASE_ERROR) }
})

app.get('/api/models/active', async (req, res) => {
  try {
    const config = await aiModelConfigDal.findActive()
    if (!config) return res.success({ model_name: process.env.ARK_MODEL || 'default', is_env: true })
    res.success({
      id: config.id, name: config.name, model_name: config.model_name, is_env: false,
    })
  } catch (err) { res.fail(ErrorCode.DATABASE_ERROR) }
})

// =========================================================================
// 用户认证
// =========================================================================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const result = await userService.login(username, password)
    if (!result.success) {
      const codeMap = {
        '账户已被锁定，请稍后再试': ErrorCode.ACCOUNT_LOCKED,
        '账户已被禁用': ErrorCode.ACCOUNT_DISABLED,
      }
      const code = codeMap[result.message] || ErrorCode.LOGIN_FAILED
      return res.fail(code, result.message)
    }
    await logDal.logAction(result.user.id, C.ACTION_LOGIN, { username }, req.ip)
    const loginPayload = await authService.createLoginSession({
      userId: result.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    })
    res.success(loginPayload)
  } catch (err) {
    console.error('[Server] login error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const currentUser = await authService.getCurrentAuthUser(req.auth.userId)
    if (!currentUser) return res.fail(ErrorCode.UNAUTHORIZED, '当前登录已失效，请重新登录')
    res.success({ user: currentUser })
  } catch (err) {
    console.error('[Server] auth/me error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

app.post('/api/logout', requireAuth, async (req, res) => {
  try {
    await authService.logoutByJti(req.auth.jti)
    await logDal.logAction(req.auth.userId, C.ACTION_LOGOUT, { jti: req.auth.jti }, req.ip)
    res.success(null, '已退出登录')
  } catch (err) {
    console.error('[Server] logout error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

app.post('/api/register', async (req, res) => {
  const { username, password, role, department_id } = req.body
  if (!username || !password) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const result = await userService.register(username, password, role || C.ROLE_USER, department_id ? Number(department_id) : null)
    if (!result.success) return res.fail(ErrorCode.USERNAME_EXISTS, result.message)
    res.success(null, '注册成功')
  } catch (err) {
    console.error('[Server] register error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

// =========================================================================
// 部门（公共读取）
// =========================================================================
app.get('/api/departments/list', requireAuth, async (req, res) => {
  try {
    const list = await departmentDal.findAll()
    res.success(list)
  } catch (err) {
    res.fail(ErrorCode.DATABASE_ERROR)
  }
})

// =========================================================================
// 隐患排查图片（9.5 模块）
// =========================================================================
// =========================================================================
// 客户企业与检查任务（PR21：检查员归档模型）
// =========================================================================
app.post('/api/client-enterprises/search', requireAuth, async (req, res) => {
  try {
    const userId = getAuthUserId(req)
    const list = isAdminRequest(req)
      ? await enterpriseDal.searchClients(req.body.keyword || '', req.body.limit || 100)
      : await enterpriseAssignmentDal.listAssignedEnterprises(userId, req.body.keyword || '', req.body.limit || 100)
    res.success(list)
  } catch (err) {
    console.error('[Server] client enterprise search error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

app.post('/api/client-enterprises/upsert', requireAuth, requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) return res.fail(ErrorCode.PARAM_MISSING, '请输入被检查客户企业名称')
  try {
    const enterprise = await enterpriseDal.upsertClient(req.body)
    await logDal.logAction(getAuthUserId(req), C.ACTION_UPDATE_ENTERPRISE, { enterprise_id: enterprise.id, name: enterprise.name }, req.ip)
    res.success(enterprise)
  } catch (err) {
    console.error('[Server] client enterprise upsert error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR, err.message)
  }
})

app.post('/api/inspection-tasks/start', requireAuth, requirePermission('image:manage'), async (req, res) => {
  const enterpriseId = Number(req.body.enterprise_id)
  if (!enterpriseId) return res.fail(ErrorCode.PARAM_MISSING, '请先选择被检查客户企业')
  try {
    const enterprise = await enterpriseDal.findById(enterpriseId)
    if (!enterprise || enterprise.status === C.STATUS_ARCHIVED) return res.fail(ErrorCode.RECORD_NOT_FOUND, '被检查客户企业不存在')
    if (!isAdminRequest(req) && !await enterpriseAssignmentDal.canAccessEnterprise(getAuthUserId(req), enterpriseId)) {
      return res.fail(ErrorCode.PERMISSION_DENIED, '当前检查员未分配该客户企业')
    }
    const task = await inspectionTaskDal.create({
      enterpriseId,
      inspectorId: getAuthUserId(req),
      inspectionDate: req.body.inspection_date,
      location: req.body.location,
      requirement: req.body.requirement,
      remark: req.body.remark,
    })
    await logDal.logAction(getAuthUserId(req), 'CREATE_INSPECTION_TASK', { task_id: task.id, enterprise_id: enterpriseId }, req.ip)
    res.success(task)
  } catch (err) {
    console.error('[Server] inspection task start error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR, err.message)
  }
})

app.post('/api/inspection-tasks/list', requireAuth, async (req, res) => {
  try {
    const list = await inspectionTaskDal.list({
      userId: getAuthUserId(req),
      isAdmin: isAdminRequest(req),
      enterpriseId: req.body.enterprise_id ? Number(req.body.enterprise_id) : null,
      status: req.body.status || null,
      keyword: req.body.keyword || '',
      dateFrom: req.body.date_from || null,
      dateTo: req.body.date_to || null,
      limit: req.body.limit || 50,
      includeArchived: !!req.body.include_archived,
    })
    res.success(list)
  } catch (err) {
    console.error('[Server] inspection task list error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

app.post('/api/inspection-tasks/detail', requireAuth, async (req, res) => {
  const taskId = Number(req.body.id || req.body.inspection_task_id)
  if (!taskId) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const task = await loadAccessibleInspectionTask(req, taskId)
    if (!task) return res.fail(ErrorCode.RECORD_NOT_FOUND, '检查任务不存在或无权访问')
    const images = await hazardImageDal.listByTaskId(taskId)
    const reports = await historyDal.findByTaskId(taskId, getAuthUserId(req), isAdminRequest(req))
    res.success({
      task,
      enterprise: await enterpriseDal.findById(task.enterprise_id),
      images: images.map((img) => ({ ...img, file_path: buildHazardImagePreviewUrl(req, img.id) })),
      reports: await mapHistoryRecordsForClient(req, reports),
    })
  } catch (err) {
    console.error('[Server] inspection task detail error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

const updateInspectionTaskArchiveStatus = async (req, res, archived) => {
  const taskId = Number(req.body.id || req.body.inspection_task_id)
  if (!taskId) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const ok = archived
      ? await inspectionTaskDal.archive(taskId, getAuthUserId(req), isAdminRequest(req))
      : await inspectionTaskDal.restore(taskId, getAuthUserId(req), isAdminRequest(req))
    if (!ok) return res.fail(ErrorCode.RECORD_NOT_FOUND, '检查任务不存在或无权操作')
    await logDal.logAction(getAuthUserId(req), archived ? 'ARCHIVE_INSPECTION_TASK' : 'RESTORE_INSPECTION_TASK', { task_id: taskId }, req.ip)
    res.success(null, archived ? '检查任务已归档' : '检查任务已恢复')
  } catch (err) {
    console.error('[Server] inspection task archive error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
}

app.post('/api/inspection-tasks/archive', requireAuth, requirePermission('image:manage'), async (req, res) => updateInspectionTaskArchiveStatus(req, res, true))
app.post('/api/inspection-tasks/restore', requireAuth, requirePermission('image:manage'), async (req, res) => updateInspectionTaskArchiveStatus(req, res, false))
app.post('/api/inspection-tasks/complete', requireAuth, requirePermission('image:manage'), async (req, res) => updateInspectionTaskArchiveStatus(req, res, true))

app.post('/api/hazard/images/upload', requireAuth, requirePermission('image:manage'), hazardUpload.array('files', C.MAX_UPLOAD_FILES), async (req, res) => {
  const userId = getAuthUserId(req)
  const files = Array.isArray(req.files) ? req.files : []
  const inspectionTaskId = Number(req.body.inspection_task_id)
  if (!files.length) return res.fail(ErrorCode.FILE_REQUIRED, '请上传图片文件')
  if (!inspectionTaskId) return res.fail(ErrorCode.PARAM_MISSING, '请先选择或创建检查任务')
  try {
    const task = await loadAccessibleInspectionTask(req, inspectionTaskId)
    if (!task) return res.fail(ErrorCode.RECORD_NOT_FOUND, '检查任务不存在或无权访问')
    if (task.status === 'archived') return res.fail(ErrorCode.PERMISSION_DENIED, '检查任务已归档，只能查看历史记录，恢复后才能继续上传图片')
    const payload = files.map((f) => ({
      filePath: path.posix.join(C.HAZARD_UPLOAD_SUBDIR, path.basename(f.path)),
      originalName: f.originalname,
      fileSize: f.size,
      enterpriseId: task.enterprise_id,
      inspectionTaskId: task.id,
    }))
    const created = await hazardImageDal.createMany(userId, payload)
    await logDal.logAction(userId, C.ACTION_HAZARD_IMAGE_UPLOAD, { count: created.length, inspection_task_id: task.id, enterprise_id: task.enterprise_id }, req.ip)
    res.success(created)
  } catch (err) {
    console.error('[Server] hazard image upload error:', err)
    res.fail(ErrorCode.IMAGE_PROCESS_FAILED, err.message)
  }
})

app.get('/api/hazard/images/list', requireAuth, requirePermission('image:manage'), async (req, res) => {
  const userId = getAuthUserId(req)
  const inspectionTaskId = req.query.inspection_task_id ? Number(req.query.inspection_task_id) : null
  try {
    if (inspectionTaskId) {
      const task = await loadAccessibleInspectionTask(req, inspectionTaskId)
      if (!task) return res.fail(ErrorCode.RECORD_NOT_FOUND, '检查任务不存在或无权访问')
    }
    const list = await hazardImageDal.listByUserId(userId, { inspectionTaskId })
    const result = list.map((img) => ({
      ...img,
      file_path: buildHazardImagePreviewUrl(req, img.id),
    }))
    res.success(result)
  } catch (err) {
    console.error('[Server] hazard image list error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

app.post('/api/hazard/images/delete', requireAuth, requirePermission('image:manage'), async (req, res) => {
  const userId = getAuthUserId(req)
  const id = Number(req.body.id)
  if (!id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const record = await hazardImageDal.findById(id)
    if (!record) return res.fail(ErrorCode.IMAGE_NOT_FOUND)
    if (Number(record.user_id) !== userId) return res.fail(ErrorCode.PERMISSION_DENIED, '无权限删除该图片')
    await hazardImageDal.softDeleteById(id)
    fs.unlink(path.join(C.UPLOAD_DIR, String(record.file_path || '')), () => {})
    await logDal.logAction(userId, C.ACTION_HAZARD_IMAGE_DELETE, { id }, req.ip)
    res.success(null, '已删除')
  } catch (err) {
    console.error('[Server] hazard image delete error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

app.post('/api/hazard/images/label', requireAuth, requirePermission('image:manage'), async (req, res) => {
  const userId = getAuthUserId(req)
  const id = Number(req.body.id)
  const label = String(req.body.label || '').trim()
  if (!id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await hazardImageDal.updateLabel(userId, id, label || null)
    await logDal.logAction(userId, C.ACTION_HAZARD_IMAGE_LABEL, { id, label: label || null }, req.ip)
    res.success(null, '已更新')
  } catch (err) {
    console.error('[Server] hazard image label error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

// =========================================================================
// 9.6 智能隐患分析（多图）
// =========================================================================
app.post('/api/hazard/analyze', requireAuth, requirePermission('analysis:run'), async (req, res) => {
  const userId = getAuthUserId(req)
  const prompt = String(req.body.prompt || '')
  const sessionId = req.body.session_id
  const imageIds = Array.isArray(req.body.image_ids)
    ? req.body.image_ids
    : String(req.body.image_ids || '').split(',').filter(Boolean)
  const inspectionTaskId = Number(req.body.inspection_task_id)
  const modelId = req.body.model_id ? Number(req.body.model_id) : null

  if (sessionId) {
    const existingSession = await sessionDal.findById(sessionId).catch(() => null)
    if (existingSession && existingSession.inspection_task_id && Number(existingSession.inspection_task_id) !== Number(inspectionTaskId)) {
      return res.fail(ErrorCode.PERMISSION_DENIED, '当前会话不属于所选检查任务')
    }
  }

  if (!inspectionTaskId) return res.fail(ErrorCode.PARAM_MISSING, '请先选择或创建检查任务')
  if (!imageIds.length) return res.fail(ErrorCode.PARAM_MISSING, '请至少选择 1 张隐患照片')

  try {
    const task = await loadAccessibleInspectionTask(req, inspectionTaskId)
    if (!task) return res.fail(ErrorCode.RECORD_NOT_FOUND, '检查任务不存在或无权访问')
    if (task.status === 'archived') return res.fail(ErrorCode.PERMISSION_DENIED, '检查任务已归档，只能查看历史记录，恢复后才能继续分析')
    const enterprise = await enterpriseDal.findById(task.enterprise_id)
    if (!enterprise) return res.fail(ErrorCode.RECORD_NOT_FOUND, '被检查客户企业不存在')

    const images = await hazardImageDal.findByIds(userId, imageIds, { isAdmin: isAdminRequest(req) })
    if (images.length !== imageIds.length) return res.fail(ErrorCode.IMAGE_NOT_FOUND, '部分图片不存在或无权访问')
    const hasMixedTask = images.some((img) => Number(img.inspection_task_id) !== Number(task.id))
    const hasMixedEnterprise = images.some((img) => Number(img.enterprise_id) !== Number(task.enterprise_id))
    if (hasMixedTask || hasMixedEnterprise) return res.fail(ErrorCode.PARAM_INVALID, '所选图片必须属于同一个检查任务和客户企业')

    const aiImages = images.map((img) => ({
      id: Number(img.id),
      absPath: path.join(C.UPLOAD_DIR, String(img.file_path || '')),
      label: img.label || null,
      originalName: img.original_name || null,
    }))

    const { result, sessionId: newSessionId, knowledgeRefs = [] } = await aiService.processHazardImagesInspection({
      prompt, sessionId, enterprise, images: aiImages, userId, modelId, inspectionTask: task,
    })
    // 图片分析创建的新会话必须绑定当前检查任务，否则切换任务后无法恢复对应对话记录。
    if (newSessionId) await sessionDal.bindTask(newSessionId, task.id)

    const parsedAssessment = parseReportResult(result)
    const reviewState = buildReviewStateFromAssessment(parsedAssessment)
    const ruleRefs = extractRuleRefsFromAssessment(parsedAssessment)

    // 分析阶段只保存 AI 初判和依据快照，正式 Word/PDF 必须人工确认后生成。
    const firstImagePath = images[0]?.file_path || null
    const historyId = await historyDal.createHistory(userId, prompt, result, null, null, firstImagePath, newSessionId, {
      enterpriseId: task.enterprise_id,
      inspectionTaskId: task.id,
      title: enterprise.name + ' - ' + task.task_no + ' - 隐患排查报告',
      reviewStatus: reviewState.reviewStatus,
      reviewRequired: reviewState.reviewRequired,
      reportAllowed: reviewState.reportAllowed,
      reportBlockReason: reviewState.reportBlockReason,
      confidenceLevel: reviewState.confidenceLevel,
      analysisBasisType: reviewState.analysisBasisType,
      fallbackUsed: reviewState.fallbackUsed,
      basisNotice: reviewState.basisNotice,
    })

    await inspectionReportImageDal.linkImages(historyId, imageIds)
    await inspectionReportKnowledgeRefDal.replaceByReportId(historyId, knowledgeRefs)
    await inspectionReportRuleRefDal.replaceByReportId(historyId, ruleRefs)
    await logDal.logAction(userId, C.ACTION_AI_HAZARD_ANALYZE_MULTI, {
      count: images.length,
      knowledge_ref_count: knowledgeRefs.length,
      inspection_task_id: task.id,
      enterprise_id: task.enterprise_id,
    }, req.ip)

    res.success({
      result,
      sessionId: newSessionId,
      id: historyId,
      inspection_task_id: task.id,
      enterprise_id: task.enterprise_id,
      task_no: task.task_no,
      knowledge_refs: mapKnowledgeRefsForClient(knowledgeRefs),
      report_allowed: reviewState.reportAllowed,
      report_block_reason: reviewState.reportBlockReason,
      review_status: reviewState.reviewStatus,
      review_required: reviewState.reviewRequired,
      confidence_level: reviewState.confidenceLevel,
      analysis_basis_type: reviewState.analysisBasisType,
      fallback_used: reviewState.fallbackUsed,
      basis_notice: reviewState.basisNotice,
      rule_refs: mapRuleRefsForClient(ruleRefs),
      ...buildReportDownloadUrls(req, historyId, null, null),
    })
  } catch (err) {
    console.error('[Server] hazard analyze error:', err)
    const code = err.message?.includes('AI') ? ErrorCode.AI_SERVICE_ERROR : ErrorCode.INTERNAL_ERROR
    res.fail(code, err.message)
  }
})

// =========================================================================
// AI 巡检（旧接口，保持兼容）
// =========================================================================


app.post('/api/process', requireAuth, requirePermission('analysis:run'), upload.single('file'), async (req, res) => {
  const { prompt, session_id, isInspection, model_id } = req.body
  const filePath = req.file ? req.file.path : null
  const isInspectionFlag = isInspection === 'true' || isInspection === true || !!filePath
  const userId = getAuthUserId(req)
  const inspectionTaskId = req.body.inspection_task_id ? Number(req.body.inspection_task_id) : null

  try {
    console.log(`[Server] Processing: prompt=${prompt}, sessionId=${session_id}, isInspection=${isInspectionFlag}`)
    let task = null
    let enterprise = null

    // 检查员侧对话必须绑定检查任务，保证聊天记录、图片和报告不会串到其他企业。
    if (!isAdminRequest(req)) {
      if (!inspectionTaskId) return res.fail(ErrorCode.PARAM_MISSING, '请先选择检查任务后再发起对话')
      task = await loadAccessibleInspectionTask(req, inspectionTaskId)
      if (!task) return res.fail(ErrorCode.RECORD_NOT_FOUND, '检查任务不存在或无权访问')
      if (task.status === 'archived') return res.fail(ErrorCode.PERMISSION_DENIED, '检查任务已归档，只能查看历史记录，恢复后才能继续对话')
      enterprise = await enterpriseDal.findById(task.enterprise_id)
      if (!enterprise) return res.fail(ErrorCode.RECORD_NOT_FOUND, '被检查客户企业不存在')
    } else if (inspectionTaskId) {
      task = await loadAccessibleInspectionTask(req, inspectionTaskId)
      if (!task) return res.fail(ErrorCode.RECORD_NOT_FOUND, '检查任务不存在或无权访问')
      enterprise = await enterpriseDal.findById(task.enterprise_id)
    }

    if (session_id) {
      const existingSession = await sessionDal.findById(session_id).catch(() => null)
      if (existingSession && inspectionTaskId && existingSession.inspection_task_id && Number(existingSession.inspection_task_id) !== Number(inspectionTaskId)) {
        return res.fail(ErrorCode.PERMISSION_DENIED, '当前会话不属于所选检查任务')
      }
    }

    const modelId = model_id ? Number(model_id) : null
    const { result, sessionId, businessScopeRefusal, knowledgeRefs = [] } = await aiService.processAI(prompt, filePath, session_id, isInspectionFlag, modelId, userId, inspectionTaskId)
    if (inspectionTaskId && sessionId) await sessionDal.bindTask(sessionId, inspectionTaskId)
    console.log(`[Server] AI result length: ${result ? result.length : 0}`)

    if (businessScopeRefusal) {
      const historyId = await historyDal.createHistory(userId, prompt, result, null, null, null, sessionId, {
        enterpriseId: enterprise?.id || null,
        inspectionTaskId: task?.id || null,
        title: task ? `${enterprise?.name || '客户企业'} - ${task.task_no} - 业务范围提示` : '业务范围提示',
        reviewRequired: true,
        reportAllowed: false,
        reportBlockReason: '非安全生产业务范围内容，不生成正式报告。',
      })
      await logDal.logAction(userId, C.ACTION_AI_INSPECTION, { prompt, refused: true, inspection_task_id: task?.id || null }, req.ip)
      return res.success({
        result,
        sessionId,
        id: historyId,
        wordPath: null,
        pdfPath: null,
        report_allowed: false,
        report_block_reason: '非安全生产业务范围内容，不生成正式报告。',
      })
    }

    if (!enterprise) enterprise = await enterpriseDal.findByUserOrganization(userId)
    const shouldGenerateLegacyReport = !inspectionTaskId
    const wordPath = shouldGenerateLegacyReport ? await docService.generateWord(prompt, result, filePath, { enterprise }) : null
    const pdfPath = shouldGenerateLegacyReport ? await docService.generatePDF(prompt, result, filePath, { enterprise, wordPath }) : null

    const historyId = await historyDal.createHistory(userId, prompt, result, wordPath, pdfPath, filePath, sessionId, {
      enterpriseId: enterprise ? enterprise.id : null,
      inspectionTaskId: task?.id || null,
      title: task ? `${enterprise?.name || '客户企业'} - ${task.task_no} - 任务对话` : (enterprise ? `${enterprise.name} - 隐患排查报告` : null),
      reviewRequired: !!inspectionTaskId,
      reportAllowed: !inspectionTaskId,
      reportBlockReason: inspectionTaskId ? '普通任务对话仅作为过程记录，不直接生成正式报告。请使用图片分析形成报告草稿。' : null,
    })
    await inspectionReportKnowledgeRefDal.replaceByReportId(historyId, knowledgeRefs)
    await logDal.logAction(userId, C.ACTION_AI_INSPECTION, {
      prompt,
      hasImage: !!filePath,
      knowledge_ref_count: knowledgeRefs.length,
      inspection_task_id: task?.id || null,
      enterprise_id: enterprise?.id || null,
    }, req.ip)

    res.success({
      result,
      sessionId,
      id: historyId,
      inspection_task_id: task?.id || null,
      enterprise_id: enterprise?.id || null,
      knowledge_refs: mapKnowledgeRefsForClient(knowledgeRefs),
      report_allowed: !inspectionTaskId,
      report_block_reason: inspectionTaskId ? '普通任务对话仅作为过程记录，不直接生成正式报告。请使用图片分析形成报告草稿。' : null,
      ...buildReportDownloadUrls(req, historyId, wordPath, pdfPath),
    })
  } catch (err) {
    console.error('[Server] process error:', err)
    const code = err.message?.includes('AI') ? ErrorCode.AI_SERVICE_ERROR : ErrorCode.INTERNAL_ERROR
    res.fail(code, err.message)
  }
})
app.post('/api/clear-session', requireAuth, async (req, res) => {
  const sessionId = String(req.body.session_id || '').trim()
  if (!sessionId) return res.fail(ErrorCode.PARAM_MISSING)
  const messages = await historyDal.findBySessionIdForUser(sessionId, getAuthUserId(req))
  if (!messages.length) return res.fail(ErrorCode.RECORD_NOT_FOUND, '会话不存在')
  await aiService.clearSession(sessionId)
  res.success()
})

// =========================================================================
// 会话管理
// =========================================================================
app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const inspectionTaskId = req.query.inspection_task_id ? Number(req.query.inspection_task_id) : null
    if (inspectionTaskId) {
      const task = await loadAccessibleInspectionTask(req, inspectionTaskId)
      if (!task) return res.fail(ErrorCode.RECORD_NOT_FOUND, '检查任务不存在或无权访问')
    }
    const sessions = await historyDal.findSessionsByUserId(getAuthUserId(req), { inspectionTaskId })
    res.success(sessions)
  } catch (err) {
    res.fail(ErrorCode.DATABASE_ERROR)
  }
})

app.get('/api/session/:session_id', requireAuth, async (req, res) => {
  try {
    const inspectionTaskId = req.query.inspection_task_id ? Number(req.query.inspection_task_id) : null
    if (inspectionTaskId) {
      const task = await loadAccessibleInspectionTask(req, inspectionTaskId)
      if (!task) return res.fail(ErrorCode.RECORD_NOT_FOUND, '检查任务不存在或无权访问')
      const session = await sessionDal.findById(req.params.session_id)
      // 会话必须已经绑定当前任务；旧的未绑定会话不能被任意任务读取，避免无效记录跨任务串联。
      if (!session || Number(session.user_id) !== Number(getAuthUserId(req)) || Number(session.inspection_task_id) !== Number(inspectionTaskId)) {
        return res.fail(ErrorCode.RECORD_NOT_FOUND, '会话不属于当前检查任务')
      }
    }
    const messages = await historyDal.findBySessionIdForUser(req.params.session_id, getAuthUserId(req), { inspectionTaskId })
    if (!messages.length) return res.fail(ErrorCode.RECORD_NOT_FOUND, '会话不存在')
    const result = await mapHistoryRecordsForClient(req, messages)
    res.success(result)
  } catch (err) {
    res.fail(ErrorCode.DATABASE_ERROR)
  }
})

app.post('/api/session/delete', requireAuth, async (req, res) => {
  const sessionId = String(req.body.session_id || '').trim()
  if (!sessionId) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const messages = await historyDal.findBySessionIdForUser(sessionId, getAuthUserId(req))
    if (!messages.length) return res.fail(ErrorCode.RECORD_NOT_FOUND, '会话不存在')
    await historyDal.deleteBySessionIdForUser(sessionId, getAuthUserId(req))
    await aiService.clearSession(sessionId)
    res.success(null, '会话已删除')
  } catch (err) {
    res.fail(ErrorCode.DATABASE_ERROR)
  }
})

// =========================================================================
// 9.6 编辑保存分析结果
// =========================================================================
app.post('/api/history/update-result', requireAuth, requirePermission('analysis:run'), async (req, res) => {
  const { id, result } = req.body
  const userId = getAuthUserId(req)
  if (!id || !result) return res.fail(ErrorCode.PARAM_MISSING)

  try {
    const record = await historyDal.findById(id)
    if (!record) return res.fail(ErrorCode.RECORD_NOT_FOUND)
    if (record.user_id !== userId) return res.fail(ErrorCode.PERMISSION_DENIED, '无权限修改此记录')

    const parsedAssessment = parseReportResult(result)
    const reviewState = buildReviewStateFromAssessment(parsedAssessment)
    const ruleRefs = extractRuleRefsFromAssessment(parsedAssessment)

    await historyDal.updateResult(id, result, {
      reviewStatus: reviewState.reviewStatus,
      reviewRequired: reviewState.reviewRequired,
      reviewComment: '分析结果已编辑，需重新人工确认后生成正式报告。',
      reportAllowed: reviewState.reportAllowed,
      reportBlockReason: reviewState.reportBlockReason,
      confidenceLevel: reviewState.confidenceLevel,
      analysisBasisType: reviewState.analysisBasisType,
      fallbackUsed: reviewState.fallbackUsed,
      basisNotice: reviewState.basisNotice,
    })
    await inspectionReportKnowledgeRefDal.replaceByReportId(id, parsedAssessment?.legal_refs || parsedAssessment?.reference_standards || [])
    await inspectionReportRuleRefDal.replaceByReportId(id, ruleRefs)
    await logDal.logAction(userId, C.ACTION_UPDATE_INSPECTION_RESULT, { id, review_status: reviewState.reviewStatus }, req.ip)

    res.success({
      ...buildReportDownloadUrls(req, id, null, null),
      review_status: reviewState.reviewStatus,
      review_required: reviewState.reviewRequired,
      report_allowed: reviewState.reportAllowed,
      report_block_reason: reviewState.reportBlockReason,
      confidence_level: reviewState.confidenceLevel,
      analysis_basis_type: reviewState.analysisBasisType,
      fallback_used: reviewState.fallbackUsed,
      basis_notice: reviewState.basisNotice,
      rule_refs: mapRuleRefsForClient(ruleRefs),
    }, '保存成功，正式报告需人工确认后生成')
  } catch (err) {
    console.error('[Server] update result error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR, err.message)
  }
})

/** 校验当前用户是否可以操作指定报告 */
const canOperateReport = (req, record) => {
  const userId = getAuthUserId(req)
  return req.auth?.user?.role === C.ROLE_ADMIN || Number(record?.user_id) === userId
}

app.post('/api/history/review/confirm', requireAuth, requirePermission('analysis:run'), async (req, res) => {
  const id = Number(req.body.id)
  const comment = String(req.body.comment || '').trim()
  const userId = getAuthUserId(req)
  if (!id) return res.fail(ErrorCode.PARAM_MISSING)

  try {
    const record = await historyDal.findById(id)
    if (!record) return res.fail(ErrorCode.RECORD_NOT_FOUND)
    if (!canOperateReport(req, record)) return res.fail(ErrorCode.PERMISSION_DENIED, '无权限确认此报告')
    if (Number(record.report_allowed) === 0) {
      return res.fail(ErrorCode.PARAM_INVALID, record.report_block_reason || '当前分析结果不允许生成正式报告')
    }

    await historyDal.confirmReview(id, userId, comment)
    const updatedRecord = { ...record, review_status: C.REPORT_REVIEW_CONFIRMED, review_required: 0 }
    const { wordPath, pdfPath } = await generateFormalReportForRecord(updatedRecord)
    await logDal.logAction(userId, C.ACTION_CONFIRM_INSPECTION_REPORT, { id, has_word: !!wordPath, has_pdf: !!pdfPath }, req.ip)

    res.success({
      review_status: C.REPORT_REVIEW_CONFIRMED,
      review_required: false,
      ...buildReportDownloadUrls(req, id, wordPath, pdfPath),
    }, '已确认并生成正式报告')
  } catch (err) {
    console.error('[Server] confirm report error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR, err.message)
  }
})

app.post('/api/history/review/reject', requireAuth, requirePermission('analysis:run'), async (req, res) => {
  const id = Number(req.body.id)
  const comment = String(req.body.comment || '').trim()
  const userId = getAuthUserId(req)
  if (!id) return res.fail(ErrorCode.PARAM_MISSING)

  try {
    const record = await historyDal.findById(id)
    if (!record) return res.fail(ErrorCode.RECORD_NOT_FOUND)
    if (!canOperateReport(req, record)) return res.fail(ErrorCode.PERMISSION_DENIED, '无权限退回此报告')

    await historyDal.rejectReview(id, userId, comment || '人工退回，需补充信息或重新分析。')
    await logDal.logAction(userId, C.ACTION_REJECT_INSPECTION_REPORT, { id }, req.ip)
    res.success({
      review_status: C.REPORT_REVIEW_NEEDS_REVIEW,
      review_required: true,
      ...buildReportDownloadUrls(req, id, null, null),
    }, '已退回，正式报告已锁定')
  } catch (err) {
    console.error('[Server] reject report error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR, err.message)
  }
})
// =========================================================================
// 报告管理（9.7）
// =========================================================================
app.post('/api/history/delete', requireAuth, requirePermission('report:download'), async (req, res) => {
  const userId = getAuthUserId(req)
  const id = Number(req.body.id)
  if (!id) return res.fail(ErrorCode.PARAM_MISSING)

  try {
    const record = await historyDal.findById(id)
    if (!record) return res.fail(ErrorCode.RECORD_NOT_FOUND)
    if (Number(record.user_id) !== userId) return res.fail(ErrorCode.PERMISSION_DENIED, '无权限删除此记录')

    await inspectionReportImageDal.unlinkAll(id)
    await inspectionReportKnowledgeRefDal.deleteByReportId(id)
    await inspectionReportRuleRefDal.deleteByReportId(id)
    await historyDal.deleteById(userId, id)

    if (record.word_path) fs.unlink(resolveUploadAbsolutePath(C.UPLOAD_DIR, record.word_path), () => {})
    if (record.pdf_path) fs.unlink(resolveUploadAbsolutePath(C.UPLOAD_DIR, record.pdf_path), () => {})

    await logDal.logAction(userId, C.ACTION_DELETE_REPORT, { id }, req.ip)
    res.success(null, '已删除')
  } catch (err) {
    console.error('[Server] delete history error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

// =========================================================================
// 知识库
// =========================================================================
app.get('/api/knowledge/list', requireAuth, requirePermission('knowledge:view'), async (req, res) => {
  try {
    const list = await knowledgeService.listForClient()
    res.success(list)
  } catch (err) {
    res.fail(err?.isKnowledgeError ? resolveKnowledgeErrorCode(err) : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.get('/api/knowledge/categories/list', requireAuth, requirePermission('knowledge:view'), async (req, res) => {
  try {
    const list = await knowledgeService.listCategories()
    res.success(list)
  } catch (err) {
    res.fail(err?.isKnowledgeError ? resolveKnowledgeErrorCode(err) : ErrorCode.DATABASE_ERROR, err.message)
  }
})

// =========================================================================
// 历史记录
// =========================================================================
app.get('/api/history', requireAuth, requirePermission('report:download'), async (req, res) => {
  try {
    const history = await historyDal.findByUserId(getAuthUserId(req))
    res.success(await mapHistoryRecordsForClient(req, history))
  } catch (err) {
    console.error('[Server] history error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

// =========================================================================
// 管理员：知识库管理
// =========================================================================
app.post('/api/admin/knowledge/list', adminAuth, async (req, res) => {
  try {
    res.success(await knowledgeService.listForAdmin())
  } catch (err) {
    res.fail(err?.isKnowledgeError ? resolveKnowledgeErrorCode(err) : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/clauses/list', adminAuth, async (req, res) => {
  try {
    res.success(await knowledgeService.listClauses(req.body.knowledge_id || req.body.id))
  } catch (err) {
    res.fail(err?.isKnowledgeError ? resolveKnowledgeErrorCode(err) : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/coverage', adminAuth, async (req, res) => {
  try {
    res.success({ data: await knowledgeService.getCoverage() })
  } catch (err) {
    res.fail(err?.isKnowledgeError ? resolveKnowledgeErrorCode(err) : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/categories/list', adminAuth, async (req, res) => {
  try {
    res.success(await knowledgeService.listCategories())
  } catch (err) {
    res.fail(err?.isKnowledgeError ? resolveKnowledgeErrorCode(err) : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/categories/add', adminAuth, async (req, res) => {
  try {
    const created = await knowledgeService.createCategory(req.body)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_ADD_KNOWLEDGE_CATEGORY, {
      id: Number(created.id),
      name: created.name,
    }, req.ip)
    res.success(created, '已添加')
  } catch (err) {
    res.fail(err?.isKnowledgeError ? resolveKnowledgeErrorCode(err) : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/categories/update', adminAuth, async (req, res) => {
  try {
    const updated = await knowledgeService.updateCategory(req.body)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_UPDATE_KNOWLEDGE_CATEGORY, {
      id: Number(updated.id),
      name: updated.name,
    }, req.ip)
    res.success(updated, '已更新')
  } catch (err) {
    res.fail(err?.isKnowledgeError ? resolveKnowledgeErrorCode(err) : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/categories/delete', adminAuth, async (req, res) => {
  try {
    const deleted = await knowledgeService.deleteCategory(req.body.id)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_DELETE_KNOWLEDGE_CATEGORY, {
      id: Number(deleted.id),
      name: deleted.name,
    }, req.ip)
    res.success(null, '已删除')
  } catch (err) {
    res.fail(err?.isKnowledgeError ? resolveKnowledgeErrorCode(err) : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/add', adminAuth, useKnowledgeUpload('file'), async (req, res) => {
  try {
    const created = await knowledgeService.create(req.body, req.file)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_ADD_KNOWLEDGE, {
      id: created.id,
      title: created.title,
      category_name: created.category_name || '未分类',
      clause_count: created.clause_count,
      parse_status: created.parse_status,
    }, req.ip)
    res.success(created, '知识条目已添加')
  } catch (err) {
    res.fail(resolveKnowledgeErrorCode(err), err.message)
  }
})

app.post('/api/admin/knowledge/delete', adminAuth, async (req, res) => {
  try {
    const archived = await knowledgeService.archive(req.body.id)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_ARCHIVE_KNOWLEDGE, {
      id: Number(archived.id),
      title: archived.title,
    }, req.ip)
    res.success(null, '知识条目已归档')
  } catch (err) {
    res.fail(resolveKnowledgeErrorCode(err), err.message)
  }
})

app.post('/api/admin/knowledge/update', adminAuth, async (req, res) => {
  try {
    const updated = await knowledgeService.update(req.body)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_UPDATE_KNOWLEDGE, {
      id: updated.id,
      title: updated.title,
      replaced_file: false,
      clause_count: updated.clause_count,
      parse_status: updated.parse_status,
    }, req.ip)
    res.success(updated, '知识条目已更新')
  } catch (err) {
    res.fail(resolveKnowledgeErrorCode(err), err.message)
  }
})

app.post('/api/admin/knowledge/save', adminAuth, useKnowledgeUpload('file'), async (req, res) => {
  try {
    const updated = await knowledgeService.update(req.body, req.file || null)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_UPDATE_KNOWLEDGE, {
      id: updated.id,
      title: updated.title,
      replaced_file: !!req.file,
      clause_count: updated.clause_count,
      parse_status: updated.parse_status,
    }, req.ip)
    res.success(updated, '知识条目已更新')
  } catch (err) {
    res.fail(resolveKnowledgeErrorCode(err), err.message)
  }
})

app.post('/api/admin/knowledge/batch-delete', adminAuth, async (req, res) => {
  try {
    const archivedList = await knowledgeService.batchArchive(req.body.ids)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_BATCH_ARCHIVE_KNOWLEDGE, {
      archived_count: archivedList.length,
      ids: archivedList.map((item) => item.id),
    }, req.ip)
    res.success({ archived_ids: archivedList.map((item) => item.id) }, '知识条目已批量归档')
  } catch (err) {
    res.fail(resolveKnowledgeErrorCode(err), err.message)
  }
})

app.post('/api/admin/knowledge/drafts/list', adminAuth, async (req, res) => {
  try {
    res.success(await knowledgeService.listDrafts(req.body || {}))
  } catch (err) {
    res.fail(resolveKnowledgeErrorCode(err), err.message)
  }
})

app.post('/api/admin/knowledge/drafts/update', adminAuth, async (req, res) => {
  try {
    const updated = await knowledgeService.updateDraft(req.body || {})
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_UPDATE_KNOWLEDGE_DRAFT, {
      id: Number(updated.id),
      knowledge_id: Number(updated.knowledge_id || 0),
    }, req.ip)
    res.success(updated, '草稿已更新')
  } catch (err) {
    res.fail(resolveKnowledgeErrorCode(err), err.message)
  }
})

app.post('/api/admin/knowledge/drafts/approve', adminAuth, async (req, res) => {
  try {
    const approved = await knowledgeService.approveDraft(req.body || {}, getAuthUserId(req))
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_APPROVE_KNOWLEDGE_DRAFT, {
      id: Number(approved.id),
      knowledge_id: Number(approved.knowledge_id || 0),
    }, req.ip)
    res.success(approved, '草稿已通过并写入正式条文')
  } catch (err) {
    res.fail(resolveKnowledgeErrorCode(err), err.message)
  }
})

app.post('/api/admin/knowledge/drafts/reject', adminAuth, async (req, res) => {
  try {
    const rejected = await knowledgeService.rejectDraft(req.body || {}, getAuthUserId(req))
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_REJECT_KNOWLEDGE_DRAFT, {
      id: Number(rejected.id),
      knowledge_id: Number(rejected.knowledge_id || 0),
    }, req.ip)
    res.success(rejected, '草稿已驳回')
  } catch (err) {
    res.fail(resolveKnowledgeErrorCode(err), err.message)
  }
})

app.post('/api/admin/knowledge/rules/list', adminAuth, async (req, res) => {
  try {
    res.success(await hazardRuleService.list(req.body || {}))
  } catch (err) {
    res.fail(err?.isHazardRuleError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/rules/search-clauses', adminAuth, async (req, res) => {
  try {
    res.success(await hazardRuleService.searchClauses(req.body || {}))
  } catch (err) {
    res.fail(err?.isHazardRuleError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/rules/create', adminAuth, async (req, res) => {
  try {
    const created = await hazardRuleService.create(req.body || {})
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_ADD_HAZARD_RULE, {
      id: Number(created.id),
      name: created.name,
      hazard_level: created.hazard_level,
    }, req.ip)
    res.success(created, '规则已新增')
  } catch (err) {
    res.fail(err?.isHazardRuleError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/rules/update', adminAuth, async (req, res) => {
  try {
    const updated = await hazardRuleService.update(req.body || {})
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_UPDATE_HAZARD_RULE, {
      id: Number(updated.id),
      name: updated.name,
      hazard_level: updated.hazard_level,
    }, req.ip)
    res.success(updated, '规则已更新')
  } catch (err) {
    res.fail(err?.isHazardRuleError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/rules/toggle', adminAuth, async (req, res) => {
  try {
    const updated = await hazardRuleService.setActive(req.body || {})
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_TOGGLE_HAZARD_RULE, {
      id: Number(updated.id),
      is_active: !!updated.is_active,
    }, req.ip)
    res.success(updated, updated.is_active ? '规则已启用' : '规则已停用')
  } catch (err) {
    res.fail(err?.isHazardRuleError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/rules/archive', adminAuth, async (req, res) => {
  try {
    const archived = await hazardRuleService.archive(req.body || {})
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_ARCHIVE_HAZARD_RULE, {
      id: Number(archived.id),
    }, req.ip)
    res.success(archived, '规则已归档')
  } catch (err) {
    res.fail(err?.isHazardRuleError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/rules/import-seed', adminAuth, async (req, res) => {
  try {
    const summary = await hazardRuleService.importSeedPack()
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_IMPORT_HAZARD_RULE_SEED, summary, req.ip)
    res.success(summary, '规则种子导入完成')
  } catch (err) {
    res.fail(err?.isHazardRuleError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})
app.post('/api/admin/knowledge/rules/drafts/list', adminAuth, async (req, res) => {
  try {
    res.success(await hazardRuleDraftService.list(req.body || {}))
  } catch (err) {
    res.fail(err?.isHazardRuleDraftError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/rules/drafts/generate', adminAuth, async (req, res) => {
  try {
    const drafts = await hazardRuleDraftService.generate(req.body || {}, getAuthUserId(req))
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_GENERATE_HAZARD_RULE_DRAFTS, {
      draft_count: drafts.length,
      clause_ids: req.body?.clause_ids || req.body?.clauseIds || [],
    }, req.ip)
    res.success(drafts, 'AI 规则草稿已生成')
  } catch (err) {
    const code = err?.isHazardRuleDraftError ? ErrorCode.PARAM_INVALID : ErrorCode.AI_SERVICE_ERROR
    res.fail(code, err.message)
  }
})

app.post('/api/admin/knowledge/rules/drafts/update', adminAuth, async (req, res) => {
  try {
    const updated = await hazardRuleDraftService.update(req.body || {})
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_UPDATE_HAZARD_RULE_DRAFT, {
      id: Number(updated.id),
      name: updated.name,
    }, req.ip)
    res.success(updated, '规则草稿已更新')
  } catch (err) {
    const isBusinessError = err?.isHazardRuleDraftError || err?.isHazardRuleError
    res.fail(isBusinessError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/rules/drafts/approve', adminAuth, async (req, res) => {
  try {
    const approved = await hazardRuleDraftService.approve(req.body || {}, getAuthUserId(req))
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_APPROVE_HAZARD_RULE_DRAFT, {
      draft_id: Number(approved.draft.id),
      rule_id: Number(approved.rule.id),
    }, req.ip)
    res.success(approved, '草稿已通过，并生成未启用的正式规则')
  } catch (err) {
    const isBusinessError = err?.isHazardRuleDraftError || err?.isHazardRuleError
    res.fail(isBusinessError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/knowledge/rules/drafts/reject', adminAuth, async (req, res) => {
  try {
    const rejected = await hazardRuleDraftService.reject(req.body || {}, getAuthUserId(req))
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_REJECT_HAZARD_RULE_DRAFT, {
      id: Number(rejected.id),
    }, req.ip)
    res.success(rejected, '规则草稿已驳回')
  } catch (err) {
    res.fail(err?.isHazardRuleDraftError ? ErrorCode.PARAM_INVALID : ErrorCode.DATABASE_ERROR, err.message)
  }
})
app.post('/api/admin/knowledge/clauses/import-csv', adminAuth, useLegalClauseCsvUpload('file'), async (req, res) => {
  try {
    if (!req.file?.path) return res.fail(ErrorCode.FILE_REQUIRED, '请上传法规条文 CSV 文件')
    const summary = await legalClauseImportService.importCsvFile(req.file.path)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_IMPORT_LEGAL_CLAUSES, {
      total_rows: summary.total_rows,
      imported_clauses: summary.imported_clauses,
      skipped_duplicates: summary.skipped_duplicates,
      failed_count: summary.failed_rows.length,
    }, req.ip)
    res.success(summary, '法规条文导入完成')
  } catch (err) {
    res.fail(resolveKnowledgeErrorCode(err), err.message)
  } finally {
    if (req.file?.path) {
      fs.promises.unlink(req.file.path).catch(() => {})
    }
  }
})

app.post('/api/admin/history', adminAuth, async (req, res) => {
  try { res.success(await historyDal.findAll()) }
  catch (err) { res.fail(ErrorCode.INTERNAL_ERROR) }
})

// =========================================================================
// 企业信息管理
// =========================================================================
app.post('/api/enterprise/get', requireAuth, requirePermission('enterprise:manage'), async (req, res) => {
  try {
    const data = await enterpriseDal.findByUserOrganization(getAuthUserId(req))
    res.success(data || {})
  } catch (err) {
    res.fail(ErrorCode.DATABASE_ERROR)
  }
})

app.post('/api/enterprise/update', requireAuth, requirePermission('enterprise:manage'), async (req, res) => {
  const userId = getAuthUserId(req)
  const { name } = req.body
  if (!name) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const enterprise = await enterpriseDal.findByUserOrganization(userId)
    if (!enterprise) {
      return res.fail(ErrorCode.PARAM_INVALID, '当前用户尚未分配所属企业和部门')
    }
    const {
      region, address, contact, phone, industry, enterprise_type, scale,
      production_process, inspector_name, inspection_date, project_name
    } = req.body
    await enterpriseDal.updateById(enterprise.id, {
      name, region, address, contact, phone,
      industry, enterprise_type, scale,
      production_process, inspector_name, inspection_date,
      project_name,
    })
    await logDal.logAction(userId, C.ACTION_UPDATE_ENTERPRISE, { name }, req.ip)
    res.success(null, '企业信息已更新')
  } catch (err) {
    res.fail(ErrorCode.INTERNAL_ERROR, err.message)
  }
})

// =========================================================================
// 受控文件访问
// =========================================================================
app.get('/api/files/hazard-images/:image_id', async (req, res) => {
  const imageId = Number(req.params.image_id)
  if (!imageId) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const auth = await resolveFileRequestAuth(req, {
      resourceType: 'hazard-image',
      resourceId: imageId,
    })
    if (auth.user.role !== C.ROLE_ADMIN && !auth.permissions?.['image:manage']) {
      return res.fail(ErrorCode.PERMISSION_DENIED, '当前账号没有此操作权限')
    }
    const record = await hazardImageDal.findById(imageId)
    const isOwner = Number(record?.user_id) === Number(auth.userId)
    if (!record || (auth.user.role !== C.ROLE_ADMIN && !isOwner)) {
      return res.fail(ErrorCode.IMAGE_NOT_FOUND)
    }
    return sendControlledUploadFile(res, resolveUploadAbsolutePath(C.UPLOAD_DIR, record.file_path))
  } catch (err) {
    console.error('[Server] hazard image file error:', err)
    res.fail(ErrorCode.UNAUTHORIZED, err.message)
  }
})

app.get('/api/files/reports/:report_id/image', async (req, res) => {
  const reportId = Number(req.params.report_id)
  if (!reportId) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const auth = await resolveFileRequestAuth(req, {
      resourceType: 'report-image',
      resourceId: reportId,
    })
    if (auth.user.role !== C.ROLE_ADMIN && !auth.permissions?.['report:download']) {
      return res.fail(ErrorCode.PERMISSION_DENIED, '当前账号没有此操作权限')
    }
    const record = await historyDal.findById(reportId)
    const isOwner = Number(record?.user_id) === Number(auth.userId)
    if (!record || (auth.user.role !== C.ROLE_ADMIN && !isOwner)) {
      return res.fail(ErrorCode.RECORD_NOT_FOUND)
    }

    const linkedImages = await inspectionReportImageDal.findByReportId(reportId)
    const targetImage = linkedImages[0] || (record.image_path ? { file_path: record.image_path } : null)
    if (!targetImage?.file_path) return res.fail(ErrorCode.IMAGE_NOT_FOUND)

    return sendControlledUploadFile(res, resolveUploadAbsolutePath(C.UPLOAD_DIR, targetImage.file_path))
  } catch (err) {
    console.error('[Server] report image file error:', err)
    res.fail(ErrorCode.UNAUTHORIZED, err.message)
  }
})

app.get('/api/files/reports/:report_id/:format', async (req, res) => {
  const reportId = Number(req.params.report_id)
  const format = String(req.params.format || '').trim().toLowerCase()
  if (!reportId || !['word', 'pdf'].includes(format)) return res.fail(ErrorCode.PARAM_INVALID)
  try {
    const auth = await resolveFileRequestAuth(req, {
      resourceType: 'report',
      resourceId: reportId,
      format,
    })
    if (auth.user.role !== C.ROLE_ADMIN && !auth.permissions?.['report:download']) {
      return res.fail(ErrorCode.PERMISSION_DENIED, '当前账号没有此操作权限')
    }
    const record = await historyDal.findById(reportId)
    const isOwner = Number(record?.user_id) === Number(auth.userId)
    if (!record || (auth.user.role !== C.ROLE_ADMIN && !isOwner)) {
      return res.fail(ErrorCode.RECORD_NOT_FOUND)
    }

    const storedPath = format === 'word' ? record.word_path : record.pdf_path
    return sendControlledUploadFile(res, resolveUploadAbsolutePath(C.UPLOAD_DIR, storedPath))
  } catch (err) {
    console.error('[Server] report file error:', err)
    res.fail(ErrorCode.UNAUTHORIZED, err.message)
  }
})

// =========================================================================
// 管理员：AI 模型配置
// =========================================================================
app.post('/api/admin/config/ai', adminAuth, async (req, res) => {
  try {
    const config = await modelConfigService.getActiveForClient()
    res.success(config || {})
  } catch (err) { res.fail(ErrorCode.DATABASE_ERROR, err.message) }
})

app.post('/api/admin/config/ai/list', adminAuth, async (req, res) => {
  try { res.success(await modelConfigService.listForClient()) }
  catch (err) { res.fail(ErrorCode.DATABASE_ERROR, err.message) }
})

app.post('/api/admin/config/ai/env-default', adminAuth, async (req, res) => {
  try { res.success(modelConfigService.getEnvDefaultForClient()) }
  catch (err) { res.fail(ErrorCode.DATABASE_ERROR, err.message) }
})

app.post('/api/admin/config/ai/add', adminAuth, async (req, res) => {
  const { name, provider, base_url, api_key, model_name } = req.body
  if (!name || !provider || !base_url || !api_key || !model_name) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const { id } = await modelConfigService.create(req.body)
    res.success({ id })
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR, err.message) }
})

app.post('/api/admin/config/ai/update', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await modelConfigService.update(req.body)
    res.success(null, '配置已更新')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR, err.message) }
})

app.post('/api/admin/config/ai/activate', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await modelConfigService.activate(req.body.id)
    res.success(null, '已切换为当前模型')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR, err.message) }
})

app.post('/api/admin/config/ai/test', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    res.success(await modelConfigService.testConnection(req.body.id))
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR, err.message) }
})

app.post('/api/admin/config/ai/delete', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await modelConfigService.delete(req.body.id)
    res.success(null, '配置已删除')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR, err.message) }
})

// =========================================================================
// 管理员：报告模板管理
// =========================================================================
app.post('/api/admin/templates/list', adminAuth, async (req, res) => {
  try {
    const templates = await reportTemplateService.listForClient()
    res.success(templates.map((item) => mapTemplateRecordForClient(req, item)))
  } catch (err) {
    res.fail(ErrorCode.DATABASE_ERROR, err.message)
  }
})

app.post('/api/admin/templates/create', adminAuth, useReportTemplateUpload('file'), async (req, res) => {
  try {
    const created = await reportTemplateService.create(req.body, req.file)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_ADD_REPORT_TEMPLATE, {
      id: created.id,
      name: created.name,
      is_default: created.is_default,
    }, req.ip)
    res.success(mapTemplateRecordForClient(req, created), '模板已新增')
  } catch (err) {
    res.fail(
      err.isTemplateError ? ErrorCode.PARAM_INVALID : ErrorCode.INTERNAL_ERROR,
      err.message
    )
  }
})

app.post('/api/admin/templates/save', adminAuth, useReportTemplateUpload('file'), async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const updated = await reportTemplateService.update(req.body, req.file || null)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_UPDATE_REPORT_TEMPLATE, {
      id: updated.id,
      name: updated.name,
      replaced_file: !!req.file,
    }, req.ip)
    res.success(mapTemplateRecordForClient(req, updated), '模板已更新')
  } catch (err) {
    res.fail(
      err.isTemplateError ? ErrorCode.PARAM_INVALID : ErrorCode.INTERNAL_ERROR,
      err.message
    )
  }
})

app.post('/api/admin/templates/activate', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const updated = await reportTemplateService.setDefault(req.body.id)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_SET_REPORT_TEMPLATE_DEFAULT, {
      id: updated.id,
      name: updated.name,
    }, req.ip)
    res.success(mapTemplateRecordForClient(req, updated), '已设为默认模板')
  } catch (err) {
    res.fail(
      err.isTemplateError ? ErrorCode.PARAM_INVALID : ErrorCode.INTERNAL_ERROR,
      err.message
    )
  }
})

app.post('/api/admin/templates/remove', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const existing = await reportTemplateService.getById(req.body.id)
    await reportTemplateService.delete(req.body.id)
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_DELETE_REPORT_TEMPLATE, {
      id: Number(existing.id),
      name: existing.name,
    }, req.ip)
    res.success(null, '已删除')
  } catch (err) {
    res.fail(
      err.isTemplateError ? ErrorCode.PARAM_INVALID : ErrorCode.INTERNAL_ERROR,
      err.message
    )
  }
})

app.get('/api/admin/templates/:template_id/file', async (req, res) => {
  const templateId = Number(req.params.template_id)
  if (!templateId) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const auth = await resolveFileRequestAuth(req, {
      resourceType: 'admin-report-template',
      resourceId: templateId,
    })
    if (auth.user.role !== C.ROLE_ADMIN) {
      return res.fail(ErrorCode.ADMIN_REQUIRED, '仅限管理员操作')
    }
    const record = await reportTemplateService.getById(templateId)
    const absolutePath = resolveUploadAbsolutePath(C.UPLOAD_DIR, record.file_path)
    if (!absolutePath) return res.fail(ErrorCode.NOT_FOUND, '模板文件不存在')
    return sendControlledUploadFile(res, absolutePath)
  } catch (err) {
    res.fail(
      err.isTemplateError ? ErrorCode.PARAM_INVALID : ErrorCode.UNAUTHORIZED,
      err.message
    )
  }
})

// =========================================================================
// 管理员：工作台统计
// =========================================================================
app.post('/api/admin/workbench/stats', adminAuth, async (req, res) => {
  try {
    res.success({ data: await adminWorkbenchService.getStats() })
  } catch (err) {
    console.error('[Server] admin workbench stats error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

// =========================================================================
// 管理员：操作日志
// =========================================================================
app.post('/api/admin/logs/list', adminAuth, async (req, res) => {
  try {
    res.success({ data: await logDal.findAll() })
  } catch (err) {
    console.error('[Server] admin logs list error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

// =========================================================================
// 管理员：数据库备份真实手动流程
// =========================================================================
app.post('/api/admin/backup/status', adminAuth, async (req, res) => {
  try {
    res.success({ data: backupService.getStatus() })
  } catch (err) {
    console.error('[Server] admin backup status error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR, err.message)
  }
})

app.post('/api/admin/backup/records', adminAuth, async (req, res) => {
  try {
    const records = await backupService.listRecords((record) => buildAdminBackupDownloadUrl(req, record.id))
    res.success({ data: records })
  } catch (err) {
    console.error('[Server] admin backup records error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR, err.message)
  }
})

app.post('/api/admin/backup/create', adminAuth, async (req, res) => {
  try {
    const created = await backupService.createManualBackup({ userId: getAuthUserId(req) })
    const record = {
      ...created,
      download_url: created?.has_file ? buildAdminBackupDownloadUrl(req, created.id) : null,
    }
    await logDal.logAction(getAuthUserId(req), C.ACTION_ADMIN_CREATE_BACKUP, {
      id: record.id,
      file_name: record.file_name,
      file_size: record.file_size,
    }, req.ip)
    res.success({ data: record }, '数据库备份已完成')
  } catch (err) {
    console.error('[Server] admin backup create error:', err)
    res.fail(err.isBackupError ? ErrorCode.PARAM_INVALID : ErrorCode.INTERNAL_ERROR, err.message)
  }
})

app.get('/api/admin/backup/:backup_id/file', async (req, res) => {
  const backupId = Number(req.params.backup_id)
  if (!backupId) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const auth = await resolveFileRequestAuth(req, {
      resourceType: 'admin-database-backup',
      resourceId: backupId,
    })
    if (auth.user.role !== C.ROLE_ADMIN) {
      return res.fail(ErrorCode.ADMIN_REQUIRED, '仅限管理员操作')
    }

    const { record, absolutePath } = await backupService.getDownloadFile(backupId)
    return res.download(absolutePath, record.file_name)
  } catch (err) {
    res.fail(err.isBackupError ? ErrorCode.PARAM_INVALID : ErrorCode.UNAUTHORIZED, err.message)
  }
})

// =========================================================================
// 启动服务
// =========================================================================
const PORT = process.env.PORT || C.DEFAULT_PORT
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`)
  })
}

module.exports = app











