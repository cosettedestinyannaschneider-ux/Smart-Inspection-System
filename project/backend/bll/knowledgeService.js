const fs = require('fs')
const path = require('path')
const knowledgeDal = require('../dal/knowledgeDal')
const knowledgeCategoryDal = require('../dal/knowledgeCategoryDal')
const knowledgeClauseDal = require('../dal/knowledgeClauseDal')
const { extractClauses } = require('./knowledgeClauseExtractService')
const C = require('../common/Constants')
const { resolveUploadAbsolutePath } = require('../common/fileAccess')

/** 创建知识库业务异常，供路由层返回明确提示 */
const knowledgeError = (message) => {
  const error = new Error(message)
  error.isKnowledgeError = true
  return error
}

/** 统一裁剪知识库标题和说明 */
const normalizeKnowledgePayload = (payload = {}) => ({
  title: String(payload.title || '').trim(),
  description: String(payload.description || '').trim(),
  categoryId: normalizeCategoryId(payload.category_id ?? payload.categoryId ?? null),
})

/** 统一裁剪分类名称和排序 */
const normalizeCategoryPayload = (payload = {}) => ({
  name: String(payload.name || '').trim(),
  sort: Number(payload.sort || 0) || 0,
})

/** 将分类 ID 归一化为数值或 null */
function normalizeCategoryId(value) {
  const categoryId = Number(value || 0)
  return categoryId > 0 ? categoryId : null
}

/** 统一解析知识库条目 ID */
const normalizeKnowledgeId = (value) => {
  const targetId = Number(value || 0)
  if (!targetId) throw knowledgeError('缺少知识库条目 ID')
  return targetId
}

/** 统一解析分类 ID */
const normalizeKnowledgeCategoryId = (value) => {
  const targetId = Number(value || 0)
  if (!targetId) throw knowledgeError('缺少知识分类 ID')
  return targetId
}

/** 校验上传文件扩展名 */
const assertKnowledgeFile = (file, required = true) => {
  if (!file) {
    if (required) throw knowledgeError('请上传知识库文件')
    return null
  }

  const originalName = String(file.originalname || file.name || '').trim()
  if (!originalName || !C.ALLOWED_DOC_TYPES.test(originalName)) {
    throw knowledgeError('仅支持上传 PDF、DOC 或 DOCX 文件')
  }

  return {
    storedPath: buildStoredKnowledgePath(file),
    originalName,
    fileType: path.extname(originalName).replace('.', '').toLowerCase(),
    fileSize: Number(file.size || 0) || null,
  }
}

/** 统一生成知识库文件的相对存储路径 */
const buildStoredKnowledgePath = (file) => path.posix.join(
  C.KNOWLEDGE_UPLOAD_SUBDIR,
  path.basename(String(file?.path || ''))
)

/** 删除已落库的知识库文件 */
const removeKnowledgeFile = (storedPath) => {
  const absolutePath = resolveUploadAbsolutePath(C.UPLOAD_DIR, storedPath)
  if (!absolutePath || !fs.existsSync(absolutePath)) return

  try {
    fs.unlinkSync(absolutePath)
  } catch (error) {
    console.warn('[knowledgeService] remove knowledge file failed:', error.message)
  }
}

/** 删除上传成功但未完成落库的临时文件 */
const removeUploadedTempFile = (file) => {
  const tempPath = String(file?.path || '').trim()
  if (!tempPath || !fs.existsSync(tempPath)) return

  try {
    fs.unlinkSync(tempPath)
  } catch (error) {
    console.warn('[knowledgeService] remove temp uploaded file failed:', error.message)
  }
}

/** 校验分类是否存在 */
const ensureCategoryExists = async (categoryId) => {
  if (!categoryId) return null
  const category = await knowledgeCategoryDal.findById(categoryId)
  if (!category) throw knowledgeError('所选知识分类不存在')
  return category
}

/** 将知识库记录转换为前端可直接消费的结构 */
const toClientKnowledge = (record) => {
  if (!record) return null
  const filePath = String(record.file_path || '').trim()
  const fileType = String(record.file_type || path.extname(filePath).replace('.', '') || '').toUpperCase()
  return {
    id: Number(record.id),
    title: record.title,
    description: record.description || '',
    category_id: record.category_id ? Number(record.category_id) : null,
    category_name: record.category_name || '',
    file_path: filePath,
    file_name: record.file_name || (filePath ? path.posix.basename(filePath) : ''),
    file_type: fileType || 'PDF',
    file_size: record.file_size ? Number(record.file_size) : null,
    clause_count: Number(record.clause_count || 0),
    parse_status: resolveParseStatus(record),
    parse_message: record.parse_message || '',
    status: record.status,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

/** 根据文件类型和条款数量推导条款抽取状态 */
const resolveParseStatus = (record) => {
  if (record?.parse_status) return record.parse_status
  const fileType = String(record?.file_type || '').toLowerCase()
  if (fileType === 'doc') return 'skipped'
  return Number(record?.clause_count || 0) > 0 ? 'parsed' : 'pending'
}

/** 上传或替换文件后同步生成结构化条款；失败只记录状态，不阻断文件级管理 */
const refreshClausesForKnowledge = async ({ knowledgeId, categoryId, title, description, storedFile }) => {
  const absolutePath = resolveUploadAbsolutePath(C.UPLOAD_DIR, storedFile?.storedPath)
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return {
      status: 'failed',
      reason: '知识库文件不存在，无法抽取条款',
      clause_count: 0,
    }
  }

  try {
    const extracted = await extractClauses({
      absolutePath,
      fileType: storedFile.fileType,
      knowledgeId,
      categoryId,
      sourceTitle: title,
      description,
    })

    await knowledgeClauseDal.replaceByKnowledgeId(knowledgeId, extracted.clauses)
    return {
      status: extracted.status,
      reason: extracted.reason || '',
      clause_count: extracted.clauses.length,
    }
  } catch (error) {
    await knowledgeClauseDal.replaceByKnowledgeId(knowledgeId, [])
    return {
      status: 'failed',
      reason: error.message || '知识条款抽取失败',
      clause_count: 0,
    }
  }
}

const knowledgeService = {
  /** 获取普通用户可查看的知识库列表 */
  async listForClient() {
    const list = await knowledgeDal.findAll()
    return list.map(toClientKnowledge)
  },

  /** 获取管理员知识库列表 */
  async listForAdmin() {
    return await this.listForClient()
  },

  /** 获取某个知识文档的结构化条款，供管理员检查抽取结果 */
  async listClauses(knowledgeId) {
    const targetId = normalizeKnowledgeId(knowledgeId)
    await this.getById(targetId)
    return await knowledgeClauseDal.findByKnowledgeId(targetId)
  },

  /** 获取知识分类列表 */
  async listCategories() {
    return await knowledgeCategoryDal.findAll()
  },

  /** 获取单条知识库记录 */
  async getById(id) {
    const targetId = normalizeKnowledgeId(id)
    const record = await knowledgeDal.findById(targetId)
    if (!record) throw knowledgeError('知识库条目不存在')
    return record
  },

  /** 新增知识分类 */
  async createCategory(payload = {}) {
    const normalized = normalizeCategoryPayload(payload)
    if (!normalized.name) throw knowledgeError('请输入知识分类名称')

    const existing = await knowledgeCategoryDal.findByName(normalized.name)
    if (existing) throw knowledgeError('知识分类名称不能重复')

    const categoryId = await knowledgeCategoryDal.create(normalized.name, normalized.sort)
    return await knowledgeCategoryDal.findById(categoryId)
  },

  /** 更新知识分类 */
  async updateCategory(payload = {}) {
    const categoryId = normalizeKnowledgeCategoryId(payload.id)
    const normalized = normalizeCategoryPayload(payload)
    if (!normalized.name) throw knowledgeError('请输入知识分类名称')

    const category = await knowledgeCategoryDal.findById(categoryId)
    if (!category) throw knowledgeError('知识分类不存在')

    const existing = await knowledgeCategoryDal.findByName(normalized.name)
    if (existing && Number(existing.id) !== categoryId) {
      throw knowledgeError('知识分类名称不能重复')
    }

    await knowledgeCategoryDal.updateById(categoryId, normalized.name, normalized.sort)
    return await knowledgeCategoryDal.findById(categoryId)
  },

  /** 删除知识分类前先检查是否还有关联文档 */
  async deleteCategory(id) {
    const categoryId = normalizeKnowledgeCategoryId(id)
    const category = await knowledgeCategoryDal.findById(categoryId)
    if (!category) throw knowledgeError('知识分类不存在')

    const relatedCount = await knowledgeDal.countActiveByCategoryId(categoryId)
    if (relatedCount > 0) {
      throw knowledgeError('请先处理该分类下的知识文档后再删除分类')
    }

    await knowledgeCategoryDal.deleteById(categoryId)
    return category
  },

  /** 新增知识库文档 */
  async create(payload = {}, file) {
    try {
      const normalized = normalizeKnowledgePayload(payload)
      if (!normalized.title) throw knowledgeError('请输入文档标题')

      await ensureCategoryExists(normalized.categoryId)
      const storedFile = assertKnowledgeFile(file, true)

      const createdId = await knowledgeDal.create({
        title: normalized.title,
        file_path: storedFile.storedPath,
        description: normalized.description || null,
        category_id: normalized.categoryId,
        file_size: storedFile.fileSize,
        file_type: storedFile.fileType,
      })

      const parseResult = await refreshClausesForKnowledge({
        knowledgeId: createdId,
        categoryId: normalized.categoryId,
        title: normalized.title,
        description: normalized.description,
        storedFile,
      })
      await knowledgeDal.updateById(createdId, {
        parse_status: parseResult.status,
        parse_message: parseResult.reason || null,
      })
      return {
        ...toClientKnowledge(await knowledgeDal.findById(createdId)),
        parse_status: parseResult.status,
        parse_message: parseResult.reason,
      }
    } catch (error) {
      if (file) removeUploadedTempFile(file)
      throw error
    }
  },

  /** 更新知识库文档，可选替换文件 */
  async update(payload = {}, file = null) {
    try {
      const targetId = normalizeKnowledgeId(payload.id)
      const existing = await this.getById(targetId)
      const normalized = normalizeKnowledgePayload(payload)
      if (!normalized.title) throw knowledgeError('请输入文档标题')

      await ensureCategoryExists(normalized.categoryId)
      const storedFile = assertKnowledgeFile(file, false)

      const updates = {
        title: normalized.title,
        description: normalized.description || null,
        category_id: normalized.categoryId,
      }

      if (storedFile) {
        updates.file_path = storedFile.storedPath
        updates.file_size = storedFile.fileSize
        updates.file_type = storedFile.fileType
      }

      await knowledgeDal.updateById(targetId, updates)

      if (storedFile && existing.file_path && existing.file_path !== storedFile.storedPath) {
        removeKnowledgeFile(existing.file_path)
      }

      let parseResult = null
      if (storedFile) {
        parseResult = await refreshClausesForKnowledge({
          knowledgeId: targetId,
          categoryId: normalized.categoryId,
          title: normalized.title,
          description: normalized.description,
          storedFile,
        })
        await knowledgeDal.updateById(targetId, {
          parse_status: parseResult.status,
          parse_message: parseResult.reason || null,
        })
      } else {
        await knowledgeClauseDal.syncKnowledgeMetadata(targetId, {
          categoryId: normalized.categoryId,
          sourceTitle: normalized.title,
        })
      }

      return {
        ...toClientKnowledge(await knowledgeDal.findById(targetId)),
        ...(parseResult ? {
          parse_status: parseResult.status,
          parse_message: parseResult.reason,
        } : {}),
      }
    } catch (error) {
      if (file) removeUploadedTempFile(file)
      throw error
    }
  },

  /** 单条归档知识库文档 */
  async archive(id) {
    const targetId = normalizeKnowledgeId(id)
    const existing = await this.getById(targetId)
    await knowledgeDal.archiveById(targetId)
    await knowledgeClauseDal.archiveByKnowledgeId(targetId)
    return existing
  },

  /** 批量归档知识库文档 */
  async batchArchive(ids = []) {
    const normalizedIds = Array.from(new Set(
      (Array.isArray(ids) ? ids : [])
        .map((item) => Number(item || 0))
        .filter((item) => item > 0)
    ))

    if (!normalizedIds.length) throw knowledgeError('请先选择需要归档的知识文档')

    const existingRecords = await knowledgeDal.findActiveByIds(normalizedIds)
    if (!existingRecords.length) throw knowledgeError('未找到可归档的知识文档')

    await knowledgeDal.archiveMany(normalizedIds)
    await knowledgeClauseDal.archiveByKnowledgeIds(normalizedIds)
    return existingRecords.map(toClientKnowledge)
  },

  /** 兼容旧调用：获取全部知识库 */
  async getAllKnowledge() {
    return await this.listForClient()
  },
}

module.exports = knowledgeService
