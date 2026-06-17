const db = require('./db')

/** 知识条款数据访问层，服务 AI 报告依据追溯 */
const knowledgeClauseDal = {
  /** 批量替换某个知识文档的条款，确保文件更新后条款与文件内容一致 */
  async replaceByKnowledgeId(knowledgeId, clauses = []) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('DELETE FROM knowledge_clauses WHERE knowledge_id = ?', [knowledgeId])

      for (const clause of clauses) {
        await connection.execute(
          `INSERT INTO knowledge_clauses
            (knowledge_id, category_id, source_title, source_code, clause_no, content, keywords, sort, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            knowledgeId,
            clause.category_id || null,
            clause.source_title || '',
            clause.source_code || null,
            clause.clause_no || null,
            clause.content || '',
            clause.keywords || null,
            Number(clause.sort || 0) || 0,
            clause.status || 'active',
          ]
        )
      }

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
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
  async syncKnowledgeMetadata(knowledgeId, { categoryId = null, sourceTitle = '' } = {}) {
    await db.execute(
      `UPDATE knowledge_clauses
       SET category_id = ?, source_title = ?
       WHERE knowledge_id = ? AND status = 'active'`,
      [
        categoryId || null,
        sourceTitle || '',
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
}

module.exports = knowledgeClauseDal
