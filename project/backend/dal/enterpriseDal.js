const db = require('./db')

const enterpriseDal = {
  /**
   * 按用户所属部门推导企业
   * @param {number} userId 用户 ID
   */
  async findByUserOrganization(userId) {
    const [rows] = await db.execute(
      `SELECT e.*
       FROM users u
       JOIN departments d ON d.id = u.department_id
       JOIN enterprises e ON e.id = d.enterprise_id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    )
    return rows[0]
  },

  async findById(id) {
    const [rows] = await db.execute('SELECT * FROM enterprises WHERE id = ?', [id])
    return rows[0]
  },

  /** 按企业名称查询组织主数据 */
  async findByName(name) {
    const [rows] = await db.execute('SELECT * FROM enterprises WHERE name = ? LIMIT 1', [name])
    return rows[0]
  },

  /** 查询组织管理所需企业列表，不依赖历史 enterprises.user_id */
  async findOrganizationList() {
    const [rows] = await db.execute(
      `SELECT e.id, e.name, e.status, e.created_at, e.updated_at,
              COUNT(DISTINCT d.id) AS department_count,
              COUNT(DISTINCT u.id) AS user_count
       FROM enterprises e
       LEFT JOIN departments d ON d.enterprise_id = e.id
       LEFT JOIN users u ON u.department_id = d.id
       GROUP BY e.id, e.name, e.status, e.created_at, e.updated_at
       ORDER BY e.updated_at DESC, e.id DESC`
    )
    return rows
  },

  /** 新增企业组织主数据，SQL 明确不包含历史 user_id 字段 */
  async createOrganization(name) {
    const [result] = await db.execute('INSERT INTO enterprises (name) VALUES (?)', [name])
    return result.insertId
  },

  /** 本阶段仅修改企业组织名称 */
  async updateOrganizationName(id, name) {
    return await db.execute('UPDATE enterprises SET name = ? WHERE id = ?', [name, id])
  },

  /** 统计企业删除保护所需的全部直接关联 */
  async countDeleteReferences(id) {
    const [rows] = await db.execute(
      `SELECT
         (SELECT COUNT(*) FROM departments WHERE enterprise_id = ?) AS departments,
         (SELECT COUNT(*) FROM hazard_images WHERE enterprise_id = ?) AS hazard_images,
         (SELECT COUNT(*) FROM inspection_reports WHERE enterprise_id = ?) AS inspection_reports`,
      [id, id, id]
    )
    return {
      departments: Number(rows[0]?.departments || 0),
      hazard_images: Number(rows[0]?.hazard_images || 0),
      inspection_reports: Number(rows[0]?.inspection_reports || 0),
    }
  },

  /** 删除已通过业务保护校验的企业 */
  async deleteById(id) {
    return await db.execute('DELETE FROM enterprises WHERE id = ?', [id])
  },

  async listByUserId(userId) {
    const [rows] = await db.execute(
      `SELECT e.*
       FROM users u
       JOIN departments d ON d.id = u.department_id
       JOIN enterprises e ON e.id = d.enterprise_id
       WHERE u.id = ? AND e.status = 'active'
       ORDER BY e.updated_at DESC`,
      [userId]
    )
    return rows
  },

  /**
   * 按企业主键更新企业档案，不修改组织归属关系
   * @param {number} enterpriseId 企业 ID
   * @param {object} data 企业档案
   */
  async updateById(enterpriseId, data) {
    const [res] = await db.execute(
      `UPDATE enterprises
       SET name = ?, region = ?, address = ?, contact = ?, phone = ?,
            industry = ?, enterprise_type = ?, scale = ?,
            production_process = ?, inspector_name = ?, inspection_date = ?, project_name = ?
       WHERE id = ?`,
      [
        data.name, data.region, data.address, data.contact, data.phone,
        data.industry || null, data.enterprise_type || null, data.scale || null,
        data.production_process || null, data.inspector_name || null, data.inspection_date || null,
        data.project_name || null, enterpriseId
      ]
    )
    return res
  },

  async findAll() {
    const [rows] = await db.execute('SELECT * FROM enterprises ORDER BY updated_at DESC')
    return rows
  },

  /** 统计有效企业总数，供管理员工作台使用 */
  async countActiveEnterprises() {
    const [rows] = await db.execute(
      "SELECT COUNT(*) AS total FROM enterprises WHERE status = 'active'"
    )
    return Number(rows[0]?.total || 0)
  },

  /**
   * 企业综合查询，聚合隐患图片、AI 分析、报告和隐患整改统计数据
   * @param {object} filters — 筛选条件
   * @param {string} [filters.keyword] — 搜索关键词（匹配企业名称/检查员/联系人/地区/地址）
   * @param {string} [filters.industry] — 行业筛选
   * @param {string} [filters.enterprise_type] — 企业类型筛选
   * @param {string} [filters.inspection_status] — 排查状态筛选
   * @param {string} [filters.status] — 档案状态筛选
   * @param {string} [filters.inspection_date] — 排查月份（YYYY-MM）
   * @param {string} [filters.sort_by] — 排序字段：date/risk/name
   */
  async queryEnterprises(filters = {}) {
    /** 构建参数化查询条件 */
    const conditions = []
    const params = []

    if (filters.keyword) {
      conditions.push('(e.name LIKE ? OR u.username LIKE ? OR e.contact LIKE ? OR e.region LIKE ? OR e.address LIKE ?)')
      const kw = `%${filters.keyword}%`
      params.push(kw, kw, kw, kw, kw)
    }
    if (filters.industry) {
      conditions.push('e.industry = ?')
      params.push(filters.industry)
    }
    if (filters.enterprise_type) {
      conditions.push('e.enterprise_type = ?')
      params.push(filters.enterprise_type)
    }
    if (filters.inspection_status) {
      conditions.push('e.inspection_status = ?')
      params.push(filters.inspection_status)
    }
    if (filters.status) {
      conditions.push('e.status = ?')
      params.push(filters.status)
    }
    if (filters.inspection_date) {
      conditions.push("DATE_FORMAT(e.inspection_date, '%Y-%m') = ?")
      params.push(filters.inspection_date)
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

    /** 排序规则 */
    let orderClause = 'ORDER BY e.updated_at DESC, e.id DESC'
    if (filters.sort_by === 'risk') {
      orderClause = 'ORDER BY pending_count DESC, e.updated_at DESC'
    } else if (filters.sort_by === 'name') {
      orderClause = 'ORDER BY e.name ASC'
    }

    /** 主查询：聚合企业基础信息、关联统计与关联用户 */
    const [rows] = await db.execute(
      `SELECT
         e.id, e.name, e.region, e.address, e.contact, e.phone,
         e.industry, e.enterprise_type, e.scale,
         e.production_process, e.inspector_name, e.inspection_date,
         e.inspection_status, e.status, e.updated_at, e.project_name,
         COALESCE(u.username, '') AS username,
         COALESCE(img_stats.image_count, 0) AS image_count,
         COALESCE(img_stats.hazard_count, 0) AS hazard_count,
         COALESCE(img_stats.pending_count, 0) AS pending_count,
         COALESCE(img_stats.hazard_count - img_stats.pending_count, 0) AS rectified_count,
         COALESCE(rep_stats.analysis_count, 0) AS analysis_count,
         COALESCE(rep_stats.report_count, 0) AS report_count
       FROM enterprises e
       LEFT JOIN (
         /** 每个企业关联的隐患图片统计 */
         SELECT
           enterprise_id,
           COUNT(*) AS image_count,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS hazard_count,
           SUM(CASE WHEN status = 'active' AND (hazard_type IS NULL OR hazard_type NOT LIKE '%已整改%') THEN 1 ELSE 0 END) AS pending_count
         FROM hazard_images
         WHERE enterprise_id IS NOT NULL
         GROUP BY enterprise_id
       ) img_stats ON img_stats.enterprise_id = e.id
       LEFT JOIN (
         /** 每个企业关联的排查报告统计 */
         SELECT
           enterprise_id,
           COUNT(DISTINCT id) AS analysis_count,
           COUNT(DISTINCT id) AS report_count
         FROM inspection_reports
         WHERE enterprise_id IS NOT NULL
         GROUP BY enterprise_id
       ) rep_stats ON rep_stats.enterprise_id = e.id
       LEFT JOIN users u ON e.user_id = u.id
       ${whereClause}
       ${orderClause}`,
      params
    )

    /** 为每条企业记录补充主要隐患类型、最近图片、最近分析和报告列表 */
    for (const row of rows) {
      /** 主要隐患类型（取出现次数最多的前 5 种） */
      const [hazardTypes] = await db.execute(
        `SELECT hazard_type, COUNT(*) AS cnt
         FROM hazard_images
         WHERE enterprise_id = ? AND hazard_type IS NOT NULL AND status = 'active'
         GROUP BY hazard_type
         ORDER BY cnt DESC
         LIMIT 5`,
        [row.id]
      )
      row.main_hazards = hazardTypes.map((h) => h.hazard_type)

      /** 最近上传的隐患图片名称 */
      const [recentImages] = await db.execute(
        `SELECT original_name
         FROM hazard_images
         WHERE enterprise_id = ? AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 3`,
        [row.id]
      )
      row.recent_images = recentImages.map((img) => img.original_name)

      /** 最近的 AI 分析摘要 */
      const [recentAnalyses] = await db.execute(
        `SELECT COALESCE(title, '排查分析') AS title, created_at
         FROM inspection_reports
         WHERE enterprise_id = ?
         ORDER BY created_at DESC
         LIMIT 3`,
        [row.id]
      )
      row.recent_analyses = recentAnalyses.map((a) => a.title)

      /** 关联报告列表（含下载路径） */
      const [reports] = await db.execute(
        `SELECT id, title, created_at, word_path, pdf_path
         FROM inspection_reports
         WHERE enterprise_id = ? AND word_path IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 20`,
        [row.id]
      )
      row.reports = reports

      /** 根据隐患统计计算风险等级 */
      if (row.hazard_count === 0) {
        row.risk_level = '低风险'
      } else if (row.pending_count >= 5 || (row.hazard_count > 0 && row.pending_count / row.hazard_count >= 0.5)) {
        row.risk_level = '高风险'
      } else if (row.pending_count >= 2) {
        row.risk_level = '中风险'
      } else {
        row.risk_level = '低风险'
      }
    }

    return rows
  },

  /**
   * 管理员更新企业完整档案（组织名称已在阶段 B 独立管理）
   */
  async adminUpdateById(enterpriseId, data) {
    const [res] = await db.execute(
      `UPDATE enterprises
       SET name = ?, region = ?, address = ?, contact = ?, phone = ?,
           industry = ?, enterprise_type = ?, scale = ?,
           production_process = ?, inspector_name = ?, inspection_date = ?,
           inspection_status = ?, status = ?, project_name = ?
       WHERE id = ?`,
      [
        data.name, data.region || null, data.address || null,
        data.contact || null, data.phone || null,
        data.industry || null, data.enterprise_type || null, data.scale || null,
        data.production_process || null, data.inspector_name || null,
        data.inspection_date || null,
        data.inspection_status || 'pending', data.status || 'active',
        data.project_name || null, enterpriseId
      ]
    )
    return res
  },
}

module.exports = enterpriseDal
