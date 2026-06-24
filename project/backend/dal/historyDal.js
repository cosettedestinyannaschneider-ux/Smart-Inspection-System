const db = require('./db')
const C = require('../common/Constants')

const historyDal = {
  /**
   * 创建排查报告记录
   * @param {number} userId
   * @param {string} prompt
   * @param {string} result
   * @param {string|null} wordPath
   * @param {string|null} pdfPath
   * @param {string|null} imagePath  兼容旧单图字段
   * @param {string|null} sessionId
   * @param {object}  [opts]         扩展参数
   * @param {number}  [opts.enterpriseId]
   * @param {string}  [opts.title]
   */
  async createHistory(userId, prompt, result, wordPath, pdfPath, imagePath = null, sessionId = null, opts = {}) {
    const [res] = await db.execute(
      `INSERT INTO inspection_reports
       (user_id, prompt, result, word_path, pdf_path, image_path, session_id, enterprise_id, inspection_task_id, title, review_status, review_required, report_allowed, report_block_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, prompt, result, wordPath, pdfPath, imagePath, sessionId,
       opts.enterpriseId || null, opts.inspectionTaskId || null, opts.title || null,
       opts.reviewStatus || C.REPORT_REVIEW_PENDING, opts.reviewRequired ? 1 : 0,
       opts.reportAllowed === false ? 0 : 1, opts.reportBlockReason || null]
    )
    return res.insertId
  },

  async findByUserId(userId) {
    const [rows] = await db.execute(
      'SELECT * FROM inspection_reports WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    )
    return rows
  },

  /** 按检查任务查询报告，普通用户只能查看自己的任务报告 */
  async findByTaskId(inspectionTaskId, userId, isAdmin = false) {
    const params = [inspectionTaskId]
    let sql = 'SELECT * FROM inspection_reports WHERE inspection_task_id = ?'
    if (!isAdmin) {
      sql += ' AND user_id = ?'
      params.push(userId)
    }
    sql += ' ORDER BY created_at DESC'
    const [rows] = await db.execute(sql, params)
    return rows
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM inspection_reports WHERE id = ?', [id])
    return rows[0]
  },

  async findSessionsByUserId(userId, filters = {}) {
    const params = [userId]
    let where = "s.user_id = ? AND s.status = 'active'"
    if (filters.inspectionTaskId) {
      where += ' AND s.inspection_task_id = ?'
      params.push(filters.inspectionTaskId)
    }
    const [rows] = await db.execute(`
      SELECT
        s.id AS session_id,
        s.inspection_task_id,
        COALESCE(NULLIF(MAX(ir.prompt), ''), NULLIF(MAX(s.title), ''), '新对话') AS title,
        MAX(ir.created_at) AS created_at
      FROM sessions s
      LEFT JOIN inspection_reports ir ON ir.session_id = s.id AND ir.user_id = s.user_id
      WHERE ${where}
      GROUP BY s.id, s.inspection_task_id
      ORDER BY COALESCE(MAX(ir.created_at), s.updated_at) DESC, s.updated_at DESC
    `, params)
    return rows
  },

  async findBySessionId(sessionId) {
    const [rows] = await db.execute(
      'SELECT * FROM inspection_reports WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    )
    return rows
  },

  async findBySessionIdForUser(sessionId, userId, filters = {}) {
    const params = [sessionId, userId]
    let sql = 'SELECT * FROM inspection_reports WHERE session_id = ? AND user_id = ?'
    if (filters.inspectionTaskId) {
      sql += ' AND inspection_task_id = ?'
      params.push(filters.inspectionTaskId)
    }
    sql += ' ORDER BY created_at ASC'
    const [rows] = await db.execute(sql, params)
    return rows
  },

  async updateResult(id, result, opts = {}) {
    return await db.execute(
      `UPDATE inspection_reports
       SET result = ?, word_path = ?, pdf_path = ?, review_status = ?, review_required = ?,
           review_comment = ?, reviewed_by = NULL, reviewed_at = NULL
       WHERE id = ?`,
      [
        result,
        opts.wordPath || null,
        opts.pdfPath || null,
        opts.reviewStatus || C.REPORT_REVIEW_PENDING,
        opts.reviewRequired ? 1 : 0,
        opts.reviewComment || null,
        id,
      ]
    )
  },

  /** 更新正式报告文件路径和完成状态 */
  async updateReportFiles(id, wordPath = null, pdfPath = null) {
    return await db.execute(
      `UPDATE inspection_reports
       SET word_path = ?, pdf_path = ?, status = ?
       WHERE id = ?`,
      [wordPath, pdfPath, C.STATUS_COMPLETED, id]
    )
  },

  /** 人工确认报告，允许后续生成正式 Word/PDF */
  async confirmReview(id, reviewerId, comment = '') {
    return await db.execute(
      `UPDATE inspection_reports
       SET review_status = ?, review_required = 0, review_comment = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [C.REPORT_REVIEW_CONFIRMED, comment || null, reviewerId, id]
    )
  },

  /** 退回或标记需复核，清空正式报告文件路径 */
  async rejectReview(id, reviewerId, comment = '') {
    return await db.execute(
      `UPDATE inspection_reports
       SET review_status = ?, review_required = 1, review_comment = ?, reviewed_by = ?, reviewed_at = NOW(),
           word_path = NULL, pdf_path = NULL, status = ?
       WHERE id = ?`,
      [C.REPORT_REVIEW_NEEDS_REVIEW, comment || null, reviewerId, C.STATUS_DRAFT, id]
    )
  },

  async deleteById(userId, id) {
    return await db.execute(
      'DELETE FROM inspection_reports WHERE id = ? AND user_id = ?',
      [id, userId]
    )
  },

  async deleteBySessionId(sessionId) {
    return await db.execute(
      'DELETE FROM inspection_reports WHERE session_id = ?',
      [sessionId]
    )
  },

  async deleteBySessionIdForUser(sessionId, userId) {
    return await db.execute(
      'DELETE FROM inspection_reports WHERE session_id = ? AND user_id = ?',
      [sessionId, userId]
    )
  },

  async findAll() {
    const [rows] = await db.execute(`
      SELECT h.*, u.username
      FROM inspection_reports h
      JOIN users u ON h.user_id = u.id
      ORDER BY h.created_at DESC
    `)
    return rows
  },

  /** 统计工作台需要的报告数量指标 */
  async getWorkbenchStats() {
    const [rows] = await db.execute(`
      SELECT
        COUNT(*) AS report_total_count,
        SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS today_report_count
      FROM inspection_reports
    `)
    return {
      reportTotalCount: Number(rows[0]?.report_total_count || 0),
      todayReportCount: Number(rows[0]?.today_report_count || 0),
    }
  },
}

module.exports = historyDal
