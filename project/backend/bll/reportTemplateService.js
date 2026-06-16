const fs = require('fs')
const path = require('path')
const reportTemplateDal = require('../dal/reportTemplateDal')
const C = require('../common/Constants')
const { resolveUploadAbsolutePath } = require('../common/fileAccess')

/** 创建模板业务异常，供路由层返回明确提示 */
const templateError = (message) => {
  const error = new Error(message)
  error.isTemplateError = true
  return error
}

/** 统一清洗模板名称和说明，避免把空白值直接写入数据库 */
const normalizeTemplatePayload = (payload = {}) => ({
  name: String(payload.name || '').trim(),
  description: String(payload.description || '').trim(),
})

/** 校验上传文件必须为 DOCX 模板 */
const assertDocxFile = (file) => {
  if (!file) throw templateError('请上传 DOCX 模板文件')
  const originalName = String(file.originalname || file.name || '').trim()
  if (!/\.docx$/i.test(originalName)) {
    throw templateError('仅支持上传 DOCX 模板文件')
  }
}

/** 判断模板记录是否拥有可用文件 */
const hasStoredTemplateFile = (record) => {
  const absolutePath = resolveUploadAbsolutePath(C.UPLOAD_DIR, record?.file_path)
  return !!absolutePath && fs.existsSync(absolutePath)
}

/** 将数据库记录转换为前端可直接使用的模板信息 */
const toClientTemplate = (record) => {
  if (!record) return null

  const absoluteFilePath = resolveUploadAbsolutePath(C.UPLOAD_DIR, record.file_path)
  return {
    id: Number(record.id),
    name: record.name,
    description: record.description || '',
    file_path: record.file_path || null,
    file_name: absoluteFilePath ? path.basename(absoluteFilePath) : null,
    is_default: !!record.is_default,
    has_file: !!absoluteFilePath && fs.existsSync(absoluteFilePath),
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

/** 删除已落库的模板文件 */
const removeTemplateFile = (storedPath) => {
  const absolutePath = resolveUploadAbsolutePath(C.UPLOAD_DIR, storedPath)
  if (!absolutePath || !fs.existsSync(absolutePath)) return

  try {
    fs.unlinkSync(absolutePath)
  } catch (error) {
    // 模板文件清理失败不阻塞主流程，交由日志排查
    console.warn('[reportTemplateService] remove template file failed:', error.message)
  }
}

/** 删除上传成功但未完成落库的临时模板文件 */
const removeUploadedTempFile = (file) => {
  const tempPath = String(file?.path || '').trim()
  if (!tempPath || !fs.existsSync(tempPath)) return

  try {
    fs.unlinkSync(tempPath)
  } catch (error) {
    // 临时文件清理失败只记录告警，避免覆盖原始业务异常
    console.warn('[reportTemplateService] remove temp uploaded file failed:', error.message)
  }
}

/** 计算模板文件在数据库中的相对存储路径 */
const buildStoredTemplatePath = (file) => path.posix.join(
  C.REPORT_TEMPLATE_UPLOAD_SUBDIR,
  path.basename(String(file?.path || ''))
)

const reportTemplateService = {
  /** 获取模板列表，默认模板优先展示 */
  async listForClient() {
    const list = await reportTemplateDal.findAll()
    return list.map(toClientTemplate)
  },

  /** 获取单个模板记录 */
  async getById(id) {
    const targetId = Number(id || 0)
    if (!targetId) throw templateError('缺少模板 ID')

    const record = await reportTemplateDal.findById(targetId)
    if (!record) throw templateError('报告模板不存在')
    return record
  },

  /** 获取当前默认模板 */
  async getDefaultTemplate() {
    return await reportTemplateDal.findDefault()
  },

  /** 新增模板，首个模板自动设为默认 */
  async create(payload = {}, file) {
    const normalized = normalizeTemplatePayload(payload)
    assertDocxFile(file)

    if (!normalized.name) throw templateError('请输入模板名称')

    const existingDefault = await reportTemplateDal.findDefault()
    const shouldSetDefault = payload.is_default ? 1 : (existingDefault ? 0 : 1)
    const storedFilePath = buildStoredTemplatePath(file)

    let createdId = null
    try {
      createdId = await reportTemplateDal.create({
        name: normalized.name,
        filePath: storedFilePath,
        description: normalized.description || null,
        isDefault: shouldSetDefault,
      })
    } catch (error) {
      removeUploadedTempFile(file)
      throw error
    }

    const created = await reportTemplateDal.findById(createdId)
    return toClientTemplate(created)
  },

  /** 更新模板基础信息，可选替换模板文件 */
  async update(payload = {}, file = null) {
    const targetId = Number(payload.id || 0)
    if (!targetId) throw templateError('缺少模板 ID')

    const existing = await this.getById(targetId)
    const normalized = normalizeTemplatePayload(payload)
    if (!normalized.name) throw templateError('请输入模板名称')

    if (file) {
      assertDocxFile(file)
    }

    const updates = {
      name: normalized.name,
      description: normalized.description || null,
    }

    if (file) {
      updates.file_path = buildStoredTemplatePath(file)
    }

    let updateSucceeded = false
    try {
      await reportTemplateDal.updateById(targetId, updates)
      updateSucceeded = true
    } catch (error) {
      if (file && !updateSucceeded) {
        removeUploadedTempFile(file)
      }
      throw error
    }

    const updated = await reportTemplateDal.findById(targetId)
    if (file && existing.file_path && existing.file_path !== updates.file_path) {
      removeTemplateFile(existing.file_path)
    }

    return toClientTemplate(updated)
  },

  /** 切换默认模板，要求模板文件必须可用 */
  async setDefault(id) {
    const record = await this.getById(id)
    if (!hasStoredTemplateFile(record)) {
      throw templateError('模板文件不存在或不可用，不能设为默认模板')
    }

    await reportTemplateDal.setDefault(record.id)
    return toClientTemplate(await reportTemplateDal.findById(record.id))
  },

  /** 删除模板，默认模板受保护 */
  async delete(id) {
    const record = await this.getById(id)
    if (record.is_default) {
      throw templateError('默认模板不能删除，请先切换其他默认模板')
    }

    await reportTemplateDal.deleteById(record.id)
    removeTemplateFile(record.file_path)
  },

  /** 获取默认模板的绝对文件路径，供报告生成优先使用 */
  async getDefaultTemplateAbsolutePath() {
    const record = await reportTemplateDal.findDefault()
    if (!record) return null

    const absolutePath = resolveUploadAbsolutePath(C.UPLOAD_DIR, record.file_path)
    if (!absolutePath || !fs.existsSync(absolutePath)) return null
    return absolutePath
  },
}

module.exports = reportTemplateService
