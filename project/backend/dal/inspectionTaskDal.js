const db = require('./db')

/**
 * 将前端可能传入的 ISO 时间、日期字符串统一转换为 MySQL DATE 可接受的 YYYY-MM-DD。
 * 无法识别时使用当天日期，避免检查任务因为日期格式阻断主流程。
 */
const normalizeDateOnly = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10)
  const text = String(value).trim()
  const datePart = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (datePart) return datePart
  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

/**
 * 检查任务数据访问层。
 *
 * 任务用于把检查员、被检查客户企业、隐患图片和报告串成同一条业务归档线。
 */
const inspectionTaskDal = {
  /** 生成可读、可追溯的检查任务编号 */
  async generateTaskNo() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    for (let i = 0; i < 5; i += 1) {
      const suffix = String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
      const taskNo = `IT-${datePart}-${suffix}`
      const [rows] = await db.execute('SELECT id FROM inspection_tasks WHERE task_no = ? LIMIT 1', [taskNo])
      if (!rows.length) return taskNo
    }
    return `IT-${datePart}-${Date.now()}`
  },

  /** 创建新的客户企业检查任务 */
  async create(data) {
    const taskNo = data.taskNo || await this.generateTaskNo()
    const [res] = await db.execute(
      `INSERT INTO inspection_tasks
       (task_no, enterprise_id, inspector_id, inspection_date, location, requirement, status, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskNo,
        data.enterpriseId,
        data.inspectorId,
        normalizeDateOnly(data.inspectionDate),
        data.location || null,
        data.requirement || null,
        data.status || 'active',
        data.remark || null,
      ]
    )
    return this.findById(res.insertId)
  },

  /** 查询单个任务，附带客户企业和检查员展示字段 */
  async findById(id) {
    const [rows] = await db.execute(
      `SELECT
         t.*,
         e.name AS enterprise_name,
         e.industry AS enterprise_industry,
         e.region AS enterprise_region,
         e.address AS enterprise_address,
         e.contact AS enterprise_contact,
         e.phone AS enterprise_phone,
         u.username AS inspector_name
       FROM inspection_tasks t
       LEFT JOIN enterprises e ON e.id = t.enterprise_id
       LEFT JOIN users u ON u.id = t.inspector_id
       WHERE t.id = ?
       LIMIT 1`,
      [id]
    )
    return rows[0]
  },

  /** 普通检查员只能访问自己的任务，管理员可以访问全部任务 */
  async findAccessibleById(id, userId, isAdmin = false) {
    const task = await this.findById(id)
    if (!task) return null
    if (!isAdmin && Number(task.inspector_id) !== Number(userId)) return null
    return task
  },

  /** 查询任务列表，普通用户限定为自己的任务 */
  async list(filters = {}) {
    const conditions = []
    const params = []
    if (!filters.isAdmin) {
      conditions.push('t.inspector_id = ?')
      params.push(filters.userId)
    }
    if (filters.enterpriseId) {
      conditions.push('t.enterprise_id = ?')
      params.push(filters.enterpriseId)
    }
    if (filters.status) {
      conditions.push('t.status = ?')
      params.push(filters.status)
    } else if (!filters.includeArchived) {
      conditions.push("t.status <> 'archived'")
    }
    if (filters.keyword) {
      conditions.push('(t.task_no LIKE ? OR e.name LIKE ? OR t.location LIKE ? OR t.requirement LIKE ?)')
      const kw = `%${filters.keyword}%`
      params.push(kw, kw, kw, kw)
    }
    if (filters.dateFrom) {
      conditions.push('t.inspection_date >= ?')
      params.push(filters.dateFrom)
    }
    if (filters.dateTo) {
      conditions.push('t.inspection_date <= ?')
      params.push(filters.dateTo)
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 200)
    const [rows] = await db.execute(
      `SELECT
         t.*,
         e.name AS enterprise_name,
         e.industry AS enterprise_industry,
         e.region AS enterprise_region,
         u.username AS inspector_name,
         COALESCE(img_stats.image_count, 0) AS image_count,
         COALESCE(rep_stats.report_count, 0) AS report_count
       FROM inspection_tasks t
       LEFT JOIN enterprises e ON e.id = t.enterprise_id
       LEFT JOIN users u ON u.id = t.inspector_id
       LEFT JOIN (
         SELECT inspection_task_id, COUNT(*) AS image_count
         FROM hazard_images
         WHERE inspection_task_id IS NOT NULL AND status = 'active'
         GROUP BY inspection_task_id
       ) img_stats ON img_stats.inspection_task_id = t.id
       LEFT JOIN (
         SELECT inspection_task_id, COUNT(*) AS report_count
         FROM inspection_reports
         WHERE inspection_task_id IS NOT NULL
         GROUP BY inspection_task_id
       ) rep_stats ON rep_stats.inspection_task_id = t.id
       ${whereClause}
       ORDER BY t.updated_at DESC, t.id DESC
       LIMIT ${limit}`,
      params
    )
    return rows
  },

  /** 更新任务归档状态，普通检查员只能操作自己的任务 */
  async updateStatus(id, status, userId, isAdmin = false) {
    const params = [status, id]
    let sql = 'UPDATE inspection_tasks SET status = ? WHERE id = ?'
    if (!isAdmin) {
      sql += ' AND inspector_id = ?'
      params.push(userId)
    }
    const [res] = await db.execute(sql, params)
    return res.affectedRows > 0
  },

  /** 归档任务 */
  async archive(id, userId, isAdmin = false) {
    return this.updateStatus(id, 'archived', userId, isAdmin)
  },

  /** 恢复任务 */
  async restore(id, userId, isAdmin = false) {
    return this.updateStatus(id, 'active', userId, isAdmin)
  },

  /** 保留旧完成接口兼容，内部按归档处理 */
  async complete(id, userId, isAdmin = false) {
    return this.archive(id, userId, isAdmin)
  },
}

module.exports = inspectionTaskDal
