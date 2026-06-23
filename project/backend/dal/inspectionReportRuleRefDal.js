const db = require('./db')

/** 报告命中规则快照数据访问层，保证历史报告可追溯到当时使用的规则 */
const inspectionReportRuleRefDal = {
  /** 替换指定报告下的规则快照 */
  async replaceByReportId(reportId, rules = []) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('DELETE FROM inspection_report_rule_refs WHERE report_id = ?', [reportId])

      const normalizedRules = Array.isArray(rules) ? rules : []
      for (let index = 0; index < normalizedRules.length; index += 1) {
        const rule = normalizedRules[index] || {}
        await connection.execute(
          `INSERT INTO inspection_report_rule_refs
            (report_id, rule_id, rule_name, hazard_level, evidence_sufficiency, judgment_reason, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            reportId,
            rule.id || rule.rule_id || null,
            rule.name || rule.rule_name || '',
            rule.hazard_level || '',
            rule.evidence_sufficiency || rule.evidenceSufficiency || '',
            rule.judgment_reason || rule.reason || rule.trigger_condition || '',
            Number(rule.sort ?? index) || 0,
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

  /** 查询单个报告保存的规则快照 */
  async findByReportId(reportId) {
    const [rows] = await db.execute(
      `SELECT *
       FROM inspection_report_rule_refs
       WHERE report_id = ?
       ORDER BY sort ASC, id ASC`,
      [reportId]
    )
    return rows
  },

  /** 批量查询报告规则快照，便于历史记录展示 */
  async findByReportIds(reportIds = []) {
    const ids = Array.from(new Set(
      reportIds.map((id) => Number(id || 0)).filter((id) => id > 0)
    ))
    if (!ids.length) return new Map()

    const placeholders = ids.map(() => '?').join(', ')
    const [rows] = await db.execute(
      `SELECT *
       FROM inspection_report_rule_refs
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

  /** 删除报告下的规则快照 */
  async deleteByReportId(reportId) {
    await db.execute('DELETE FROM inspection_report_rule_refs WHERE report_id = ?', [reportId])
  },
}

module.exports = inspectionReportRuleRefDal