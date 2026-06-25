const fs = require('fs')
const path = require('path')
const knowledgeDal = require('../dal/knowledgeDal')
const knowledgeCategoryDal = require('../dal/knowledgeCategoryDal')
const knowledgeCategoryRelationDal = require('../dal/knowledgeCategoryRelationDal')
const knowledgeClauseDal = require('../dal/knowledgeClauseDal')
const knowledgeClauseDraftDal = require('../dal/knowledgeClauseDraftDal')
const knowledgeCoverageDal = require('../dal/knowledgeCoverageDal')
const { extractClauses } = require('./knowledgeClauseExtractService')
const C = require('../common/Constants')
const { resolveUploadAbsolutePath } = require('../common/fileAccess')
const { isLegalKnowledgeCategoryName } = require('../common/legalKnowledgeTaxonomy')

const DOCUMENT_TYPES = new Set(['法律', '行政法规', '部门规章', '规范性文件', '国家标准', '行业标准', '地方标准', '团体标准', '其他'])
const CURRENT_STATUSES = new Set(['现行有效', '现行', '已废止', '已修订', '征求意见', '未知'])
const VERIFICATION_STATUSES = new Set(['pending', 'verified', 'rejected'])
const DRAFT_REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected'])

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
  applicableCategoryIds: normalizeCategoryIds(payload.applicable_category_ids ?? payload.applicableCategoryIds ?? null),
  sourceCode: normalizeOptionalText(payload.source_code ?? payload.sourceCode),
  sourceUrl: normalizeOptionalText(payload.source_url ?? payload.sourceUrl, 1000),
  issuingAuthority: normalizeOptionalText(payload.issuing_authority ?? payload.issuingAuthority),
  documentType: normalizeDocumentType(payload.document_type ?? payload.documentType),
  publishDate: normalizeDateValue(payload.publish_date ?? payload.publishDate),
  effectiveDate: normalizeDateValue(payload.effective_date ?? payload.effectiveDate),
  currentStatus: normalizeCurrentStatus(payload.current_status ?? payload.currentStatus),
  verificationStatus: normalizeVerificationStatus(payload.verification_status ?? payload.verificationStatus),
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

/** 归一化多分类 ID，兼容数组、JSON 字符串和逗号字符串 */
function normalizeCategoryIds(value) {
  if (value === undefined || value === null || value === '') return []
  let raw = value
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    try {
      raw = JSON.parse(text)
    } catch {
      raw = text.split(',')
    }
  }
  const items = Array.isArray(raw) ? raw : [raw]
  return Array.from(new Set(
    items.map((item) => Number(item || 0)).filter((item) => item > 0)
  ))
}

/** 归一化可选文本字段，避免空字符串入库 */
function normalizeOptionalText(value, maxLength = 200) {
  const text = String(value || '').trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

/** 归一化日期字段，仅接受 YYYY-MM-DD */
function normalizeDateValue(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

/** 归一化法规文件类型 */
function normalizeDocumentType(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return DOCUMENT_TYPES.has(text) ? text : '其他'
}

/** 归一化现行状态 */
function normalizeCurrentStatus(value) {
  const text = String(value || '').trim()
  return CURRENT_STATUSES.has(text) ? text : '现行有效'
}

/** 归一化人工校验状态 */
function normalizeVerificationStatus(value) {
  const text = String(value || '').trim()
  return VERIFICATION_STATUSES.has(text) ? text : 'pending'
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

/** 校验多分类 ID 是否均存在 */
const ensureCategoriesExist = async (categoryIds = []) => {
  for (const categoryId of categoryIds) {
    await ensureCategoryExists(categoryId)
  }
}

/** 主分类也写入适用分类，保证单分类和多分类查询语义一致 */
const buildApplicableCategoryIds = (normalized) => Array.from(new Set([
  normalized.categoryId,
  ...normalized.applicableCategoryIds,
].filter(Boolean)))

/** 组装法规来源元数据，供 knowledge 与 knowledge_clauses 共用 */
const buildProvenanceParams = (normalized) => ({
  source_code: normalized.sourceCode,
  source_url: normalized.sourceUrl,
  issuing_authority: normalized.issuingAuthority,
  document_type: normalized.documentType,
  publish_date: normalized.publishDate,
  effective_date: normalized.effectiveDate,
  current_status: normalized.currentStatus,
  verification_status: normalized.verificationStatus,
})

/** 将旧记录作为默认值，避免局部更新时误清空已维护的来源信息 */
const buildPayloadWithExistingDefaults = (payload = {}, existing = {}) => ({
  source_code: existing.source_code,
  source_url: existing.source_url,
  issuing_authority: existing.issuing_authority,
  document_type: existing.document_type,
  publish_date: formatDateForPayload(existing.publish_date),
  effective_date: formatDateForPayload(existing.effective_date),
  current_status: existing.current_status,
  verification_status: existing.verification_status,
  applicable_category_ids: existing.applicable_category_ids,
  ...payload,
})

/** 将数据库日期值转成前端和接口统一使用的 YYYY-MM-DD */
function formatDateForPayload(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value || '').trim()
  return text ? text.slice(0, 10) : null
}

/** 将数据库聚合的分类 ID 字符串转换为数值数组 */
const parseApplicableCategoryIds = (record) => {
  const ids = String(record.applicable_category_ids || '')
    .split(',')
    .map((item) => Number(item || 0))
    .filter((item) => item > 0)
  if (record.category_id) ids.push(Number(record.category_id))
  return Array.from(new Set(ids))
}

/** 将覆盖率记录转换为前端展示结构 */
const toClientCoverageItem = (record = {}) => {
  const clauseCount = Number(record.clause_count || 0)
  const verifiedClauseCount = Number(record.verified_clause_count || 0)
  const pendingClauseCount = Number(record.pending_clause_count || 0)
  const rejectedClauseCount = Number(record.rejected_clause_count || 0)
  return {
    category_id: Number(record.category_id),
    category_name: record.category_name || '',
    sort: Number(record.sort || 0),
    knowledge_count: Number(record.knowledge_count || 0),
    clause_count: clauseCount,
    verified_clause_count: verifiedClauseCount,
    pending_clause_count: pendingClauseCount,
    rejected_clause_count: rejectedClauseCount,
    coverage_status: clauseCount === 0
      ? 'empty'
      : (verifiedClauseCount > 0 ? 'usable' : 'unverified'),
    verified_ratio: clauseCount > 0 ? Number((verifiedClauseCount / clauseCount).toFixed(4)) : 0,
  }
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
    applicable_category_ids: parseApplicableCategoryIds(record),
    applicable_category_names: record.applicable_category_names || record.category_name || '',
    source_code: record.source_code || '',
    source_url: record.source_url || '',
    issuing_authority: record.issuing_authority || '',
    document_type: record.document_type || '',
    publish_date: formatDateForPayload(record.publish_date),
    effective_date: formatDateForPayload(record.effective_date),
    current_status: record.current_status || '现行有效',
    verification_status: record.verification_status || 'pending',
    file_path: filePath,
    file_name: record.file_name || (filePath ? path.posix.basename(filePath) : ''),
    file_type: fileType || 'PDF',
    file_size: record.file_size ? Number(record.file_size) : null,
    clause_count: Number(record.clause_count || 0),
    parse_status: resolveParseStatus(record),
    parse_message: record.parse_message || '',
    draft_count: Number(record.draft_count || 0),
    pending_draft_count: Number(record.pending_draft_count || 0),
    approved_draft_count: Number(record.approved_draft_count || 0),
    rejected_draft_count: Number(record.rejected_draft_count || 0),
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

/** 上传或替换文件后生成抽取草稿；失败只记录状态，不阻断文件级管理 */
const refreshClauseDraftsForKnowledge = async ({
  knowledgeId,
  categoryId,
  title,
  description,
  storedFile,
  provenance = {},
}) => {
  const absolutePath = resolveUploadAbsolutePath(C.UPLOAD_DIR, storedFile?.storedPath)
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return {
      status: 'failed',
      reason: '知识库文件不存在，无法抽取条款',
      draft_count: 0,
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
      sourceCode: provenance.source_code,
      sourceUrl: provenance.source_url,
      issuingAuthority: provenance.issuing_authority,
      documentType: provenance.document_type,
      publishDate: provenance.publish_date,
      effectiveDate: provenance.effective_date,
      currentStatus: provenance.current_status,
      verificationStatus: provenance.verification_status,
    })

    const drafts = extracted.clauses.map((clause) => ({
      ...clause,
      extraction_method: storedFile.fileType === 'pdf' ? 'pdf' : (storedFile.fileType === 'docx' ? 'docx' : 'auto'),
      confidence_level: storedFile.fileType === 'docx' ? 'medium' : 'low',
      review_status: 'pending',
    }))
    await knowledgeClauseDraftDal.replaceByKnowledgeId(knowledgeId, drafts)
    return {
      status: extracted.status,
      reason: extracted.reason || '',
      draft_count: extracted.clauses.length,
    }
  } catch (error) {
    await knowledgeClauseDraftDal.replaceByKnowledgeId(knowledgeId, [])
    return {
      status: 'failed',
      reason: error.message || '知识条款抽取失败',
      draft_count: 0,
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
    const list = await this.listForClient()
    const draftCountMap = await knowledgeClauseDraftDal.countByKnowledgeIds(list.map((item) => item.id))
    return list.map((item) => ({ ...item, ...(draftCountMap.get(Number(item.id)) || {}) }))
  },

  /** 获取法规知识库覆盖率统计，供管理员判断当前条文库是否足以支撑 AI 判断 */
  async getCoverage() {
    const categories = (await knowledgeCoverageDal.findCategoryCoverage()).map(toClientCoverageItem)
    const categorySummary = categories.reduce((total, item) => ({
      category_count: total.category_count + 1,
      covered_category_count: total.covered_category_count + (item.clause_count > 0 ? 1 : 0),
      usable_category_count: total.usable_category_count + (item.verified_clause_count > 0 ? 1 : 0),
    }), {
      category_count: 0,
      covered_category_count: 0,
      usable_category_count: 0,
    })
    const globalSummary = await knowledgeCoverageDal.findGlobalCoverageSummary()
    const summary = {
      ...categorySummary,
      knowledge_count: Number(globalSummary.knowledge_count || 0),
      clause_count: Number(globalSummary.clause_count || 0),
      verified_clause_count: Number(globalSummary.verified_clause_count || 0),
      pending_clause_count: Number(globalSummary.pending_clause_count || 0),
      rejected_clause_count: Number(globalSummary.rejected_clause_count || 0),
    }

    return {
      summary,
      categories,
      is_empty: summary.clause_count === 0,
      can_support_formal_assessment: summary.verified_clause_count > 0,
      message: summary.clause_count === 0
        ? '当前知识库没有结构化法规条文，只能进行图片事实识别，不能出具法规判断。'
        : (summary.verified_clause_count === 0
            ? '当前条文均未人工校验，只能用于整理和测试，不能直接作为正式报告结论。'
            : '已有人工校验条文，可为后续规则判定和报告依据追溯提供基础。'),
    }
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
    if (!isLegalKnowledgeCategoryName(normalized.name)) {
      throw knowledgeError('知识分类已固定为 14 类法规分类，请选择已有分类维护条文')
    }

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
    if (!isLegalKnowledgeCategoryName(normalized.name)) {
      throw knowledgeError('知识分类已固定为 14 类法规分类，请选择已有分类维护条文')
    }

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
      const applicableCategoryIds = buildApplicableCategoryIds(normalized)
      await ensureCategoriesExist(applicableCategoryIds)
      const storedFile = assertKnowledgeFile(file, true)
      const provenance = buildProvenanceParams(normalized)

      const createdId = await knowledgeDal.create({
        title: normalized.title,
        file_path: storedFile.storedPath,
        description: normalized.description || null,
        category_id: normalized.categoryId,
        file_size: storedFile.fileSize,
        file_type: storedFile.fileType,
        ...provenance,
      })
      await knowledgeCategoryRelationDal.replaceByKnowledgeId(createdId, applicableCategoryIds)

      const parseResult = await refreshClauseDraftsForKnowledge({
        knowledgeId: createdId,
        categoryId: normalized.categoryId,
        title: normalized.title,
        description: normalized.description,
        storedFile,
        provenance,
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
      const normalized = normalizeKnowledgePayload(buildPayloadWithExistingDefaults(payload, existing))
      if (!normalized.title) throw knowledgeError('请输入文档标题')

      await ensureCategoryExists(normalized.categoryId)
      const applicableCategoryIds = buildApplicableCategoryIds(normalized)
      await ensureCategoriesExist(applicableCategoryIds)
      const storedFile = assertKnowledgeFile(file, false)
      const provenance = buildProvenanceParams(normalized)

      const updates = {
        title: normalized.title,
        description: normalized.description || null,
        category_id: normalized.categoryId,
        ...provenance,
      }

      if (storedFile) {
        updates.file_path = storedFile.storedPath
        updates.file_size = storedFile.fileSize
        updates.file_type = storedFile.fileType
      }

      await knowledgeDal.updateById(targetId, updates)
      await knowledgeCategoryRelationDal.replaceByKnowledgeId(targetId, applicableCategoryIds)

      if (storedFile && existing.file_path && existing.file_path !== storedFile.storedPath) {
        removeKnowledgeFile(existing.file_path)
      }

      let parseResult = null
      if (storedFile) {
        parseResult = await refreshClauseDraftsForKnowledge({
          knowledgeId: targetId,
          categoryId: normalized.categoryId,
          title: normalized.title,
          description: normalized.description,
          storedFile,
          provenance,
        })
        await knowledgeDal.updateById(targetId, {
          parse_status: parseResult.status,
          parse_message: parseResult.reason || null,
        })
      } else {
        await knowledgeClauseDal.syncKnowledgeMetadata(targetId, {
          categoryId: normalized.categoryId,
          sourceTitle: normalized.title,
          ...provenance,
        })
        await knowledgeClauseDraftDal.syncKnowledgeMetadata(targetId, {
          categoryId: normalized.categoryId,
          sourceTitle: normalized.title,
          ...provenance,
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

  /** 查询抽取草稿列表 */
  async listDrafts(payload = {}) {
    const knowledgeId = payload.knowledge_id || payload.knowledgeId || null
    if (knowledgeId) await this.getById(knowledgeId)
    const reviewStatus = String(payload.review_status || payload.reviewStatus || '').trim()
    if (reviewStatus && !DRAFT_REVIEW_STATUSES.has(reviewStatus)) throw knowledgeError('草稿审核状态无效')
    return await knowledgeClauseDraftDal.findAll({
      knowledge_id: knowledgeId ? normalizeKnowledgeId(knowledgeId) : null,
      review_status: reviewStatus || null,
    })
  },

  /** 更新抽取草稿内容，审核前允许管理员人工修正 */
  async updateDraft(payload = {}) {
    const draftId = Number(payload.id || 0)
    if (!draftId) throw knowledgeError('缺少草稿 ID')
    const existing = await knowledgeClauseDraftDal.findById(draftId)
    if (!existing) throw knowledgeError('抽取草稿不存在')
    if (existing.review_status !== 'pending') throw knowledgeError('已审核草稿不能再编辑')

    const content = String(payload.content ?? existing.content ?? '').trim()
    const clauseNo = String(payload.clause_no ?? payload.clauseNo ?? existing.clause_no ?? '').trim()
    if (!content) throw knowledgeError('草稿条文内容不能为空')

    await knowledgeClauseDraftDal.updateById(draftId, {
      category_id: normalizeCategoryId(payload.category_id ?? payload.categoryId ?? existing.category_id),
      clause_no: clauseNo || null,
      content,
      keywords: normalizeOptionalText(payload.keywords ?? existing.keywords, 500),
      review_note: normalizeOptionalText(payload.review_note ?? payload.reviewNote ?? existing.review_note, 500),
    })
    return await knowledgeClauseDraftDal.findById(draftId)
  },

  /** 审核通过草稿，正式写入 knowledge_clauses 并标记 verified */
  async approveDraft(payload = {}, reviewerId = null) {
    const draftId = Number(payload.id || 0)
    if (!draftId) throw knowledgeError('缺少草稿 ID')
    const draft = await knowledgeClauseDraftDal.findById(draftId)
    if (!draft) throw knowledgeError('抽取草稿不存在')
    if (draft.review_status !== 'pending') throw knowledgeError('该草稿已审核')
    if (!String(draft.content || '').trim()) throw knowledgeError('草稿条文内容不能为空')

    const duplicate = await knowledgeClauseDal.findDuplicate({
      source_title: draft.source_title,
      source_code: draft.source_code,
      clause_no: draft.clause_no,
      content: draft.content,
    })

    if (!duplicate) {
      await knowledgeClauseDal.create(draft.knowledge_id, {
        category_id: draft.category_id,
        source_title: draft.source_title,
        source_code: draft.source_code,
        source_url: draft.source_url,
        issuing_authority: draft.issuing_authority,
        document_type: draft.document_type,
        publish_date: draft.publish_date,
        effective_date: draft.effective_date,
        current_status: draft.current_status,
        verification_status: 'verified',
        clause_no: draft.clause_no,
        content: draft.content,
        keywords: draft.keywords,
        sort: draft.sort,
        status: 'active',
      })
    }

    await knowledgeClauseDraftDal.updateById(draftId, {
      review_status: 'approved',
      review_note: normalizeOptionalText(payload.review_note ?? payload.reviewNote, 500) || (duplicate ? '已存在相同正式条文，本次仅标记通过' : null),
      reviewed_by: reviewerId || null,
      reviewed_at: new Date(),
    })
    return await knowledgeClauseDraftDal.findById(draftId)
  },

  /** 驳回抽取草稿，不进入正式知识条文库 */
  async rejectDraft(payload = {}, reviewerId = null) {
    const draftId = Number(payload.id || 0)
    if (!draftId) throw knowledgeError('缺少草稿 ID')
    const draft = await knowledgeClauseDraftDal.findById(draftId)
    if (!draft) throw knowledgeError('抽取草稿不存在')
    if (draft.review_status !== 'pending') throw knowledgeError('该草稿已审核')

    await knowledgeClauseDraftDal.updateById(draftId, {
      review_status: 'rejected',
      review_note: normalizeOptionalText(payload.review_note ?? payload.reviewNote, 500) || '管理员驳回',
      reviewed_by: reviewerId || null,
      reviewed_at: new Date(),
    })
    return await knowledgeClauseDraftDal.findById(draftId)
  },
  /** 单条归档知识库文档 */
  async archive(id) {
    const targetId = normalizeKnowledgeId(id)
    const existing = await this.getById(targetId)
    await knowledgeDal.archiveById(targetId)
    await knowledgeCategoryRelationDal.deleteByKnowledgeId(targetId)
    await knowledgeClauseDal.archiveByKnowledgeId(targetId)
    await knowledgeClauseDraftDal.archiveByKnowledgeId(targetId)
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
    await knowledgeClauseDraftDal.archiveByKnowledgeIds(normalizedIds)
    return existingRecords.map(toClientKnowledge)
  },

  /** 兼容旧调用：获取全部知识库 */
  async getAllKnowledge() {
    return await this.listForClient()
  },
}

module.exports = knowledgeService
