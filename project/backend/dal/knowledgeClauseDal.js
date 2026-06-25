const db = require('./db')
const { ACTIVE_LEGAL_CLAUSE_STATUSES } = require('../common/legalClauseStatus')

const ACTIVE_STATUS_PLACEHOLDERS = ACTIVE_LEGAL_CLAUSE_STATUSES.map(() => '?').join(', ')

const CLAUSE_INSERT_SQL = `
  INSERT INTO knowledge_clauses
    (
      knowledge_id, category_id, source_title, source_code, source_url,
      issuing_authority, document_type, publish_date, effective_date,
      current_status, verification_status, clause_no, content, keywords,
      sort, status
    )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

/** 将条款对象整理为 SQL 参数 */
const buildClauseParams = (knowledgeId, clause = {}) => [
  knowledgeId,
  clause.category_id || null,
  clause.source_title || '',
  clause.source_code || null,
  clause.source_url || null,
  clause.issuing_authority || null,
  clause.document_type || null,
  clause.publish_date || null,
  clause.effective_date || null,
  clause.current_status || '现行有效',
  clause.verification_status || 'pending',
  clause.clause_no || null,
  clause.content || '',
  clause.keywords || null,
  Number(clause.sort || 0) || 0,
  clause.status || 'active',
]

/** 知识条款数据访问层，服务 AI 报告依据追溯 */
const knowledgeClauseDal = {
  /** 批量替换某个知识文档的条款，确保文件更新后条款与文件内容一致 */
  async replaceByKnowledgeId(knowledgeId, clauses = []) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('DELETE FROM knowledge_clauses WHERE knowledge_id = ?', [knowledgeId])

      for (const clause of clauses) {
        await connection.execute(CLAUSE_INSERT_SQL, buildClauseParams(knowledgeId, clause))
      }

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  /** 追加单条条款，供 CSV 批量导入使用 */
  async create(knowledgeId, clause = {}) {
    const [res] = await db.execute(CLAUSE_INSERT_SQL, buildClauseParams(knowledgeId, clause))
    return res.insertId
  },

  /** 按法规来源、条款号和内容查询重复条款 */
  async findDuplicate({ source_title, source_code = null, clause_no = null, content = '' }) {
    const [rows] = await db.execute(
      `SELECT *
       FROM knowledge_clauses
       WHERE status = 'active'
         AND source_title = ?
         AND (source_code <=> ?)
         AND (clause_no <=> ?)
         AND content = ?
       LIMIT 1`,
      [source_title || '', source_code || null, clause_no || null, content || '']
    )
    return rows[0] || null
  },

  /** 归档某个知识文档下的全部条款 */
  async archiveByKnowledgeId(knowledgeId) {
    await db.execute(
      `UPDATE knowledge_clauses
       SET status = 'archived'
       WHERE knowledge_id = ?`,
      [knowledgeId]
    )
  },

  /** 同步知识文档元数据，避免只改标题或分类时条款来源仍显示旧值 */
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
    verification_status = 'pending',
  } = {}) {
    await db.execute(
      `UPDATE knowledge_clauses
       SET category_id = ?,
           source_title = ?,
           source_code = ?,
           source_url = ?,
           issuing_authority = ?,
           document_type = ?,
           publish_date = ?,
           effective_date = ?,
           current_status = ?,
           verification_status = ?
       WHERE knowledge_id = ? AND status = 'active'`,
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
        verification_status || 'pending',
        knowledgeId,
      ]
    )
  },

  /** 批量归档多个知识文档下的全部条款 */
  async archiveByKnowledgeIds(knowledgeIds = []) {
    const ids = knowledgeIds.map((item) => Number(item || 0)).filter((item) => item > 0)
    if (!ids.length) return

    const placeholders = ids.map(() => '?').join(', ')
    await db.execute(
      `UPDATE knowledge_clauses
       SET status = 'archived'
       WHERE knowledge_id IN (${placeholders})`,
      ids
    )
  },

  /** 统计知识文档下仍有效的条款数量 */
  async countActiveByKnowledgeId(knowledgeId) {
    const [rows] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM knowledge_clauses
       WHERE knowledge_id = ? AND status = 'active'`,
      [knowledgeId]
    )
    return Number(rows[0]?.total || 0)
  },

  /** 按知识文档批量统计条款数量，供知识库列表展示 */
  async countActiveByKnowledgeIds(knowledgeIds = []) {
    const ids = knowledgeIds.map((item) => Number(item || 0)).filter((item) => item > 0)
    if (!ids.length) return new Map()

    const placeholders = ids.map(() => '?').join(', ')
    const [rows] = await db.execute(
      `SELECT knowledge_id, COUNT(*) AS total
       FROM knowledge_clauses
       WHERE status = 'active' AND knowledge_id IN (${placeholders})
       GROUP BY knowledge_id`,
      ids
    )

    return new Map(rows.map((row) => [Number(row.knowledge_id), Number(row.total || 0)]))
  },

  /** 查询知识文档下的条款列表 */
  async findByKnowledgeId(knowledgeId) {
    const [rows] = await db.execute(
      `SELECT *
       FROM knowledge_clauses
       WHERE knowledge_id = ? AND status = 'active'
       ORDER BY sort ASC, id ASC`,
      [knowledgeId]
    )
    return rows
  },

  /** 按 ID 批量查询已校验、现行状态的正式条文 */
  async findVerifiedActiveByIds(ids = []) {
    const clauseIds = Array.from(new Set(
      ids.map((item) => Number(item || 0)).filter((item) => item > 0)
    ))
    if (!clauseIds.length) return []

    const placeholders = clauseIds.map(() => '?').join(', ')
    const [rows] = await db.execute(
      `SELECT kc.*, c.name AS category_name
       FROM knowledge_clauses kc
       LEFT JOIN knowledge_categories c ON c.id = kc.category_id
       WHERE kc.id IN (${placeholders})
         AND kc.status = 'active'
         AND kc.verification_status = 'verified'
         AND kc.current_status IN (${ACTIVE_STATUS_PLACEHOLDERS})
       ORDER BY kc.source_title ASC, kc.sort ASC, kc.id ASC`,
      [...clauseIds, ...ACTIVE_LEGAL_CLAUSE_STATUSES]
    )
    return rows
  },

  /**
   * 按关键词检索可用于报告引用的本地知识条款。
   * 当前阶段采用 MySQL LIKE 检索，避免引入向量库或复杂 RAG 链路。
   */
  async searchActiveByKeywords(keywords = [], limit = 8) {
    const cleanedKeywords = Array.from(new Set(
      keywords
        .map((item) => String(item || '').trim())
        .filter((item) => item.length >= 2)
    )).slice(0, 12)

    if (!cleanedKeywords.length) return []

    const whereParts = []
    const params = []
    cleanedKeywords.forEach((keyword) => {
      const likeValue = `%${keyword}%`
      whereParts.push(`(
        source_title LIKE ?
        OR source_code LIKE ?
        OR source_url LIKE ?
        OR issuing_authority LIKE ?
        OR document_type LIKE ?
        OR clause_no LIKE ?
        OR content LIKE ?
        OR keywords LIKE ?
      )`)
      params.push(likeValue, likeValue, likeValue, likeValue, likeValue, likeValue, likeValue, likeValue)
    })

    const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20))
    const [rows] = await db.execute(
      `SELECT
         id, knowledge_id, category_id, source_title, source_code, source_url,
         issuing_authority, document_type, publish_date, effective_date,
         current_status, verification_status, clause_no, content, keywords, sort
       FROM knowledge_clauses
       WHERE status = 'active'
         AND (${whereParts.join(' OR ')})
       ORDER BY sort ASC, id ASC
       LIMIT ${safeLimit}`,
      params
    )

    return rows.map((row) => {
      const haystack = [
        row.source_title,
        row.source_code,
        row.source_url,
        row.issuing_authority,
        row.document_type,
        row.clause_no,
        row.content,
        row.keywords,
      ].join(' ')
      const matchKeyword = cleanedKeywords.find((keyword) => haystack.includes(keyword)) || cleanedKeywords[0] || null
      return { ...row, match_keyword: matchKeyword }
    })
  },
}

module.exports = knowledgeClauseDal
