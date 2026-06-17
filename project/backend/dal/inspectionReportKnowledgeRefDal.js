const db = require('./db')

/** 报告引用知识条款数据访问层，保存报告生成时命中的法规依据快照 */
const inspectionReportKnowledgeRefDal = {
  /** 批量保存报告和知识条款的引用关系 */
  async replaceByReportId(reportId, refs = []) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('DELETE FROM inspection_report_knowledge_refs WHERE report_id = ?', [reportId])

      const normalizedRefs = Array.isArray(refs) ? refs : []
      for (let index = 0; index < normalizedRefs.length; index += 1) {
        const ref = normalizedRefs[index] || {}
        await connection.execute(
          `INSERT INTO inspection_report_knowledge_refs
            (report_id, knowledge_clause_id, knowledge_id, source_title, source_code, clause_no, content, match_keyword, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reportId,
            ref.knowledge_clause_id || ref.id || null,
            ref.knowledge_id || null,
            ref.source_title || ref.name || '',
            ref.source_code || ref.code || null,
            ref.clause_no || ref.clause || null,
            ref.content || '',
            ref.match_keyword || null,
            Number(ref.sort ?? index) || 0,
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

  /** 查询单个报告保存的引用依据快照 */
  async findByReportId(reportId) {
    const [rows] = await db.execute(
      `SELECT *
       FROM inspection_report_knowledge_refs
       WHERE report_id = ?
       ORDER BY sort ASC, id ASC`,
      [reportId]
    )
    return rows
  },

  /** 批量查询多个报告的引用依据快照，便于历史记录和会话回放展示 */
  async findByReportIds(reportIds = []) {
    const ids = Array.from(new Set(
      reportIds.map((id) => Number(id || 0)).filter((id) => id > 0)
    ))
    if (!ids.length) return new Map()

    const placeholders = ids.map(() => '?').join(', ')
    const [rows] = await db.execute(
      `SELECT *
       FROM inspection_report_knowledge_refs
       WHERE report_id IN (${placeholders})
       ORDER BY report_id ASC, sort ASC, id ASC`,
      ids
    )

    const grouped = new Map()
    rows.forEach((row) => {
      const reportId = Number(row.report_id)
      if (!grouped.has(reportId)) grouped.set(reportId, [])
      grouped.get(reportId).push(row)
    })
    return grouped
  },

  /** 删除报告下的引用关系，配合报告删除保持数据整洁 */
  async deleteByReportId(reportId) {
    await db.execute('DELETE FROM inspection_report_knowledge_refs WHERE report_id = ?', [reportId])
  },
}

module.exports = inspectionReportKnowledgeRefDal
