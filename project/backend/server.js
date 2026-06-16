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

// ---- 数据访问层 ----
const historyDal = require('./dal/historyDal')
const knowledgeDal = require('./dal/knowledgeDal')
const enterpriseDal = require('./dal/enterpriseDal')
const logDal = require('./dal/logDal')
const schemaInit = require('./dal/schemaInit')
const hazardImageDal = require('./dal/hazardImageDal')
const sessionDal = require('./dal/sessionDal')
const departmentDal = require('./dal/departmentDal')
const aiModelConfigDal = require('./dal/aiModelConfigDal')
const reportTemplateDal = require('./dal/reportTemplateDal')
const inspectionReportImageDal = require('./dal/inspectionReportImageDal')
const knowledgeCategoryDal = require('./dal/knowledgeCategoryDal')

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
  if (!isPublicStaticUploadPath(requestPath, C.HAZARD_UPLOAD_SUBDIR)) {
    return res.status(404).end()
  }
  next()
}, express.static(C.UPLOAD_DIR))

// 确保目录存在
for (const dir of [C.UPLOAD_DIR, path.join(C.UPLOAD_DIR, C.HAZARD_UPLOAD_SUBDIR)]) {
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

// 初始化数据库
schemaInit.init().catch(err => console.error('[Server] Schema init failed:', err))

/** 统一读取当前登录用户 ID */
const getAuthUserId = (req) => Number(req.auth?.userId || 0)

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

/** 将数据库记录中的文件路径转为当前接口应暴露的受控地址 */
const mapHistoryRecordForClient = (req, record) => ({
  ...record,
  image_path: record.image_path ? buildReportImagePreviewUrl(req, record.id) : null,
  ...buildReportDownloadUrls(req, record.id, record.word_path, record.pdf_path),
})

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
    await logDal.logAction(result.user.id, C.ACTION_LOGIN, { username })
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
app.post('/api/hazard/images/upload', requireAuth, requirePermission('image:manage'), hazardUpload.array('files', C.MAX_UPLOAD_FILES), async (req, res) => {
  const userId = getAuthUserId(req)
  const files = Array.isArray(req.files) ? req.files : []
  if (!files.length) return res.fail(ErrorCode.FILE_REQUIRED, '请上传图片文件')
  const enterpriseId = req.body.enterprise_id ? Number(req.body.enterprise_id) : null
  try {
    const payload = files.map((f) => ({
      filePath: path.posix.join(C.HAZARD_UPLOAD_SUBDIR, path.basename(f.path)),
      originalName: f.originalname,
      fileSize: f.size,
      enterpriseId,
    }))
    const created = await hazardImageDal.createMany(userId, payload)
    await logDal.logAction(userId, C.ACTION_HAZARD_IMAGE_UPLOAD, { count: created.length })
    res.success(created)
  } catch (err) {
    console.error('[Server] hazard image upload error:', err)
    res.fail(ErrorCode.IMAGE_PROCESS_FAILED)
  }
})

app.get('/api/hazard/images/list', requireAuth, requirePermission('image:manage'), async (req, res) => {
  const userId = getAuthUserId(req)
  try {
    const list = await hazardImageDal.listByUserId(userId)
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
    await logDal.logAction(userId, C.ACTION_HAZARD_IMAGE_DELETE, { id })
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
    await logDal.logAction(userId, C.ACTION_HAZARD_IMAGE_LABEL, { id, label: label || null })
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
  const enterpriseId = req.body.enterprise_id ? Number(req.body.enterprise_id) : null
  const modelId = req.body.model_id ? Number(req.body.model_id) : null

  if (!imageIds.length) return res.fail(ErrorCode.PARAM_MISSING, '请至少选择 1 张隐患照片')

  try {
    const enterprise = enterpriseId
      ? await enterpriseDal.findById(enterpriseId)
      : await enterpriseDal.findByUserOrganization(userId)
    const images = await hazardImageDal.findByIds(userId, imageIds)
    if (!images.length) return res.fail(ErrorCode.IMAGE_NOT_FOUND)

    const aiImages = images.map((img) => ({
      id: Number(img.id),
      absPath: path.join(C.UPLOAD_DIR, String(img.file_path || '')),
      label: img.label || null,
      originalName: img.original_name || null,
    }))

    const { result, sessionId: newSessionId } = await aiService.processHazardImagesInspection({
      prompt, sessionId, enterprise, images: aiImages, userId, modelId,
    })

    const imageAbsPaths = aiImages.map((i) => i.absPath)
    // 使用模板化报告（优先），降级到旧方法
    let wordPath, pdfPath
    if (enterprise) {
      wordPath = await docService.generateTemplateReport({
        enterprise,
        prompt,
        result,
        imagePaths: imageAbsPaths,
      })
      pdfPath = await docService.generateTemplatePDF({
        enterprise,
        prompt,
        result,
        imagePaths: imageAbsPaths,
        wordPath,
      })
    } else {
      wordPath = await docService.generateWord(prompt, result, imageAbsPaths)
      pdfPath = await docService.generatePDF(prompt, result, imageAbsPaths)
    }

    const firstImagePath = images[0]?.file_path || null
    const historyId = await historyDal.createHistory(userId, prompt, result, wordPath, pdfPath, firstImagePath, newSessionId, {
      enterpriseId: enterpriseId || (enterprise ? enterprise.id : null),
      title: enterprise ? `${enterprise.name} - 隐患排查报告` : null,
    })

    await inspectionReportImageDal.linkImages(historyId, imageIds)
    await logDal.logAction(userId, C.ACTION_AI_HAZARD_ANALYZE_MULTI, { count: images.length })

    res.success({
      result,
      sessionId: newSessionId,
      id: historyId,
      ...buildReportDownloadUrls(req, historyId, wordPath, pdfPath),
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

  try {
    console.log(`[Server] Processing: prompt=${prompt}, sessionId=${session_id}, isInspection=${isInspectionFlag}`)
    const modelId = model_id ? Number(model_id) : null
    const { result, sessionId } = await aiService.processAI(prompt, filePath, session_id, isInspectionFlag, modelId, userId)
    console.log(`[Server] AI result length: ${result ? result.length : 0}`)

    const enterprise = await enterpriseDal.findByUserOrganization(userId)
    const wordPath = await docService.generateWord(prompt, result, filePath, { enterprise })
    const pdfPath = await docService.generatePDF(prompt, result, filePath, { enterprise, wordPath })

    const historyId = await historyDal.createHistory(userId, prompt, result, wordPath, pdfPath, filePath, sessionId, {
      enterpriseId: enterprise ? enterprise.id : null,
      title: enterprise ? `${enterprise.name} - 隐患排查报告` : null,
    })
    await logDal.logAction(userId, C.ACTION_AI_INSPECTION, { prompt, hasImage: !!filePath })

    res.success({
      result,
      sessionId,
      id: historyId,
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
    const sessions = await historyDal.findSessionsByUserId(getAuthUserId(req))
    res.success(sessions)
  } catch (err) {
    res.fail(ErrorCode.DATABASE_ERROR)
  }
})

app.get('/api/session/:session_id', requireAuth, async (req, res) => {
  try {
    const messages = await historyDal.findBySessionIdForUser(req.params.session_id, getAuthUserId(req))
    if (!messages.length) return res.fail(ErrorCode.RECORD_NOT_FOUND, '会话不存在')
    const result = messages.map((m) => mapHistoryRecordForClient(req, m))
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

    let reportImages = record.image_path
    try {
      const parsed = JSON.parse(String(result).trim())
      const selectedImages = await inspectionReportImageDal.findByReportId(id)
      const ids = selectedImages.map((item) => Number(item.id)).filter((v) => Number.isFinite(v) && v > 0)
      if (ids.length) {
        const imgs = await hazardImageDal.findByIds(userId, ids)
        reportImages = imgs.map((img) => path.join(C.UPLOAD_DIR, String(img.file_path || '')))
      }
    } catch (e) { /* JSON 解析失败则保持原样 */ }

    // 如果关联了企业，使用模板化报告
    let wordPath, pdfPath
    if (record.enterprise_id) {
      const enterprise = await enterpriseDal.findById(record.enterprise_id)
      if (enterprise) {
        wordPath = await docService.generateTemplateReport({
          enterprise,
          prompt: record.prompt,
          result,
          imagePaths: Array.isArray(reportImages) ? reportImages : [],
        })
        pdfPath = await docService.generateTemplatePDF({
          enterprise,
          prompt: record.prompt,
          result,
          imagePaths: Array.isArray(reportImages) ? reportImages : [],
          wordPath,
        })
      } else {
        wordPath = await docService.generateWord(record.prompt, result, reportImages)
        pdfPath = await docService.generatePDF(record.prompt, result, reportImages)
      }
    } else {
      wordPath = await docService.generateWord(record.prompt, result, reportImages)
      pdfPath = await docService.generatePDF(record.prompt, result, reportImages, { wordPath })
    }

    await historyDal.updateResult(id, result, wordPath, pdfPath)
    await logDal.logAction(userId, C.ACTION_UPDATE_INSPECTION_RESULT, { id })
    res.success(buildReportDownloadUrls(req, id, wordPath, pdfPath), '保存成功')
  } catch (err) {
    console.error('[Server] update result error:', err)
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
    await historyDal.deleteById(userId, id)

    if (record.word_path) fs.unlink(resolveUploadAbsolutePath(C.UPLOAD_DIR, record.word_path), () => {})
    if (record.pdf_path) fs.unlink(resolveUploadAbsolutePath(C.UPLOAD_DIR, record.pdf_path), () => {})

    await logDal.logAction(userId, C.ACTION_DELETE_REPORT, { id })
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
    const list = await knowledgeService.getAllKnowledge()
    res.success(list)
  } catch (err) {
    res.fail(ErrorCode.DATABASE_ERROR)
  }
})

app.get('/api/knowledge/categories/list', requireAuth, requirePermission('knowledge:view'), async (req, res) => {
  try {
    const list = await knowledgeCategoryDal.findAll()
    res.success(list)
  } catch (err) {
    res.fail(ErrorCode.DATABASE_ERROR)
  }
})

// =========================================================================
// 历史记录
// =========================================================================
app.get('/api/history', requireAuth, requirePermission('report:download'), async (req, res) => {
  try {
    const history = await historyDal.findByUserId(getAuthUserId(req))
    res.success(history.map((item) => mapHistoryRecordForClient(req, item)))
  } catch (err) {
    console.error('[Server] history error:', err)
    res.fail(ErrorCode.INTERNAL_ERROR)
  }
})

// =========================================================================
// 管理员：知识库管理
// =========================================================================
app.post('/api/admin/knowledge/list', adminAuth, async (req, res) => {
  try { res.success(await knowledgeService.getAllKnowledge()) }
  catch (err) { res.fail(ErrorCode.DATABASE_ERROR) }
})

app.post('/api/admin/knowledge/categories/list', adminAuth, async (req, res) => {
  try { res.success(await knowledgeCategoryDal.findAll()) }
  catch (err) { res.fail(ErrorCode.DATABASE_ERROR) }
})

app.post('/api/admin/knowledge/categories/add', adminAuth, async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) return res.fail(ErrorCode.PARAM_MISSING, '缺少分类名称')
  try {
    await knowledgeCategoryDal.create(name, Number(req.body.sort || 0) || 0)
    res.success(null, '已添加')
  } catch (err) { res.fail(ErrorCode.DATABASE_ERROR) }
})

app.post('/api/admin/knowledge/categories/update', adminAuth, async (req, res) => {
  const id = Number(req.body.id)
  const name = String(req.body.name || '').trim()
  if (!id || !name) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await knowledgeCategoryDal.updateById(id, name, Number(req.body.sort || 0) || 0)
    res.success(null, '已更新')
  } catch (err) { res.fail(ErrorCode.DATABASE_ERROR) }
})

app.post('/api/admin/knowledge/categories/delete', adminAuth, async (req, res) => {
  if (!Number(req.body.id)) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await knowledgeCategoryDal.deleteById(Number(req.body.id))
    res.success(null, '已删除')
  } catch (err) { res.fail(ErrorCode.DATABASE_ERROR) }
})

app.post('/api/admin/knowledge/add', adminAuth, upload.single('file'), async (req, res) => {
  try {
    const { id, title, description, isUpdate, category_id } = req.body
    const filePath = req.file ? req.file.path.replace(/\\/g, '/') : null
    const categoryId = category_id ? Number(category_id) : null

    if (isUpdate === 'true' && id) {
      await knowledgeDal.update(id, title, description, filePath, categoryId)
      return res.success(null, '知识条目已更新')
    }

    if (!filePath) return res.fail(ErrorCode.FILE_REQUIRED)
    await knowledgeDal.create(title, filePath, description, categoryId, {
      fileSize: req.file ? req.file.size : null,
      fileType: req.file ? path.extname(req.file.originalname).replace('.', '') : null,
    })
    res.success(null, '知识条目已添加')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR, err.message) }
})

app.post('/api/admin/knowledge/delete', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await knowledgeDal.delete(req.body.id)
    res.success(null, '知识条目已归档')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR) }
})

app.post('/api/admin/knowledge/update', adminAuth, async (req, res) => {
  const { id, title, description, category_id } = req.body
  if (!id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await knowledgeDal.update(id, title, description, null, category_id ? Number(category_id) : null)
    res.success(null, '知识条目已更新')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR) }
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
    const { region, address, contact, phone, industry, enterprise_type, scale, inspector_name, inspection_date, project_name } = req.body
    await enterpriseDal.updateById(enterprise.id, {
      name, region, address, contact, phone,
      industry, enterprise_type, scale,
      inspector_name, inspection_date,
      project_name,
    })
    await logDal.logAction(userId, C.ACTION_UPDATE_ENTERPRISE, { name })
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
    const config = await aiModelConfigDal.findActive()
    res.success(config || {})
  } catch (err) { res.fail(ErrorCode.DATABASE_ERROR) }
})

app.post('/api/admin/config/ai/list', adminAuth, async (req, res) => {
  try { res.success(await aiModelConfigDal.findAll()) }
  catch (err) { res.fail(ErrorCode.DATABASE_ERROR) }
})

app.post('/api/admin/config/ai/add', adminAuth, async (req, res) => {
  const { name, base_url, api_key, model_name } = req.body
  if (!name || !base_url || !api_key || !model_name) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const id = await aiModelConfigDal.create({
      name, baseUrl: base_url, apiKeyEncrypted: api_key, modelName: model_name,
      maxTokens: req.body.max_tokens || C.AI_DEFAULT_MAX_TOKENS,
      temperature: req.body.temperature ?? C.AI_DEFAULT_TEMPERATURE,
      timeoutMs: req.body.timeout_ms || C.AI_TIMEOUT_MS,
    })
    res.success({ id })
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR, err.message) }
})

app.post('/api/admin/config/ai/update', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    const { id, ...params } = req.body
    await aiModelConfigDal.updateById(id, params)
    res.success(null, '配置已更新')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR, err.message) }
})

app.post('/api/admin/config/ai/activate', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await aiModelConfigDal.setActive(req.body.id)
    res.success(null, '已切换为当前模型')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR) }
})

app.post('/api/admin/config/ai/delete', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await aiModelConfigDal.deleteById(req.body.id)
    res.success(null, '配置已删除')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR) }
})

// =========================================================================
// 管理员：报告模板管理
// =========================================================================
app.post('/api/admin/templates/list', adminAuth, async (req, res) => {
  try { res.success(await reportTemplateDal.findAll()) }
  catch (err) { res.fail(ErrorCode.DATABASE_ERROR) }
})

app.post('/api/admin/templates/add', adminAuth, async (req, res) => {
  const { name } = req.body
  if (!name) return res.fail(ErrorCode.PARAM_MISSING, '缺少模板名称')
  try {
    const id = await reportTemplateDal.create(name, req.body.file_path || null, req.body.description || null, req.body.is_default ? 1 : 0)
    res.success({ id })
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR, err.message) }
})

app.post('/api/admin/templates/update', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await reportTemplateDal.updateById(req.body.id, req.body)
    res.success(null, '已更新')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR, err.message) }
})

app.post('/api/admin/templates/set-default', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await reportTemplateDal.setDefault(req.body.id)
    res.success(null, '已设为默认模板')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR) }
})

app.post('/api/admin/templates/delete', adminAuth, async (req, res) => {
  if (!req.body.id) return res.fail(ErrorCode.PARAM_MISSING)
  try {
    await reportTemplateDal.deleteById(req.body.id)
    res.success(null, '已删除')
  } catch (err) { res.fail(ErrorCode.INTERNAL_ERROR) }
})

// =========================================================================
// 管理员：操作日志
// =========================================================================
app.post('/api/admin/logs/list', adminAuth, async (req, res) => {
  try { res.success(await logDal.findAll()) }
  catch (err) { res.fail(ErrorCode.INTERNAL_ERROR) }
})

// =========================================================================
// 启动服务
// =========================================================================
const PORT = process.env.PORT || C.DEFAULT_PORT
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`)
})
