const db = require('./db')

const DRAFT_INSERT_SQL = `
  INSERT INTO knowledge_clause_drafts
    (
      knowledge_id, category_id, source_title, source_code, source_url,
      issuing_authority, document_type, publish_date, effective_date,
      current_status, clause_no, content, keywords, extraction_method,
      confidence_level, review_status, review_note, sort, status
    )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

/** 将抽取草稿对象整理为 SQL 参数 */
const buildDraftParams = (knowledgeId, draft = {}) => [
  knowledgeId,
  draft.category_id || null,
  draft.source_title || '',
  draft.source_code || null,
  draft.source_url || null,
  draft.issuing_authority || null,
  draft.document_type || null,
  draft.publish_date || null,
  draft.effective_date || null,
  draft.current_status || '现行有效',
  draft.clause_no || null,
  draft.content || '',
  draft.keywords || null,
  draft.extraction_method || 'auto',
  draft.confidence_level || 'medium',
  draft.review_status || 'pending',
  draft.review_note || null,
  Number(draft.sort || 0) || 0,
  draft.status || 'active',
]

const ALLOWED_UPDATE_COLUMNS = new Set([
  'category_id',
  'source_title',
  'source_code',
  'source_url',
  'issuing_authority',
  'document_type',
  'publish_date',
  'effective_date',
  'current_status',
  'clause_no',
  'content',
  'keywords',
  'extraction_method',
  'confidence_level',
  'review_status',
  'review_note',
  'reviewed_by',
  'reviewed_at',
  'sort',
  'status',
])

/** 将驼峰字段转换为数据库列名 */
const normalizeColumnName = (key) => String(key || '')
  .trim()
  .replace(/[A-Z]/g, (matched) => `_${matched.toLowerCase()}`)

/** 知识条款抽取草稿数据访问层 */
const knowledgeClauseDraftDal = {
  /** 批量替换某个知识文档的抽取草稿，文件替换后草稿重新生成 */
  async replaceByKnowledgeId(knowledgeId, drafts = []) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('DELETE FROM knowledge_clause_drafts WHERE knowledge_id = ?', [knowledgeId])
      for (const draft of drafts) {
        await connection.execute(DRAFT_INSERT_SQL, buildDraftParams(knowledgeId, draft))
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  /** 查询草稿列表，默认仅返回有效草稿 */
  async findAll({ knowledge_id = null, review_status = null, limit = 500 } = {}) {
    const where = ['d.status = \'active\'']
    const params = []
    if (knowledge_id) {
      where.push('d.knowledge_id = ?')
      params.push(Number(knowledge_id))
    }
    if (review_status) {
      where.push('d.review_status = ?')
      params.push(review_status)
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 1000))
    const [rows] = await db.execute(
      `SELECT d.*, k.title AS knowledge_title, c.name AS category_name
       FROM knowledge_clause_drafts d
       LEFT JOIN knowledge k ON k.id = d.knowledge_id
       LEFT JOIN knowledge_categories c ON c.id = d.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY d.created_at DESC, d.knowledge_id DESC, d.sort ASC, d.id ASC
       LIMIT ${safeLimit}`,
      params
    )
    return rows
  },

  /** 按 ID 查询草稿 */
  async findById(id) {
    const [rows] = await db.execute(
      `SELECT d.*, k.title AS knowledge_title, c.name AS category_name
       FROM knowledge_clause_drafts d
       LEFT JOIN knowledge k ON k.id = d.knowledge_id
       LEFT JOIN knowledge_categories c ON c.id = d.category_id
       WHERE d.id = ? AND d.status = 'active'
       LIMIT 1`,
      [id]
    )
    return rows[0] || null
  },

  /** 白名单更新草稿字段 */
  async updateById(id, params = {}) {
    const fields = []
    const values = []
    for (const [key, value] of Object.entries(params)) {
      const columnName = normalizeColumnName(key)
      if (!ALLOWED_UPDATE_COLUMNS.has(columnName)) continue
      fields.push(`${columnName} = ?`)
      values.push(value)
    }
    if (!fields.length) return
    values.push(id)
    await db.execute(`UPDATE knowledge_clause_drafts SET ${fields.join(', ')} WHERE id = ?`, values)
  },

  /** 同步文档元数据，避免只改文档标题或来源后草稿仍显示旧信息 */
  async syncKnowledgeMetadata(knowledgeId, {
    categoryId = null,
    sourceTitle = '',
    source_code = null,
    source_url = null,
    issuing_authority = null,
    document_type = null,
    publish_date = null,
    effective_date = null,
    current_status = '现行有效',
  } = {}) {
    await db.execute(
      `UPDATE knowledge_clause_drafts
       SET category_id = ?,
           source_title = ?,
           source_code = ?,
           source_url = ?,
           issuing_authority = ?,
           document_type = ?,
           publish_date = ?,
           effective_date = ?,
           current_status = ?
       WHERE knowledge_id = ? AND status = 'active' AND review_status = 'pending'`,
      [
        categoryId || null,
        sourceTitle || '',
        source_code || null,
        source_url || null,
        issuing_authority || null,
        document_type || null,
        publish_date || null,
        effective_date || null,
        current_status || '现行有效',
        knowledgeId,
      ]
    )
  },

  /** 统计知识文档下各状态草稿数量 */
  async countByKnowledgeIds(knowledgeIds = []) {
    const ids = knowledgeIds.map((item) => Number(item || 0)).filter((item) => item > 0)
    if (!ids.length) return new Map()

    const placeholders = ids.map(() => '?').join(', ')
    const [rows] = await db.execute(
      `SELECT knowledge_id,
              COUNT(*) AS draft_count,
              SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) AS pending_draft_count,
              SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) AS approved_draft_count,
              SUM(CASE WHEN review_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_draft_count
       FROM knowledge_clause_drafts
       WHERE status = 'active' AND knowledge_id IN (${placeholders})
       GROUP BY knowledge_id`,
      ids
    )

    return new Map(rows.map((row) => [Number(row.knowledge_id), {
      draft_count: Number(row.draft_count || 0),
      pending_draft_count: Number(row.pending_draft_count || 0),
      approved_draft_count: Number(row.approved_draft_count || 0),
      rejected_draft_count: Number(row.rejected_draft_count || 0),
    }]))
  },

  /** 归档某个文档下的全部草稿 */
  async archiveByKnowledgeId(knowledgeId) {
    await db.execute(
      `UPDATE knowledge_clause_drafts
       SET status = 'archived'
       WHERE knowledge_id = ?`,
      [knowledgeId]
    )
  },

  /** 批量归档多个文档下的全部草稿 */
  async archiveByKnowledgeIds(knowledgeIds = []) {
    const ids = knowledgeIds.map((item) => Number(item || 0)).filter((item) => item > 0)
    if (!ids.length) return
    const placeholders = ids.map(() => '?').join(', ')
    await db.execute(
      `UPDATE knowledge_clause_drafts
       SET status = 'archived'
       WHERE knowledge_id IN (${placeholders})`,
      ids
    )
  },
}

module.exports = knowledgeClauseDraftDal
