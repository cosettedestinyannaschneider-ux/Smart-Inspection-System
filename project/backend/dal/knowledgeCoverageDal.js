const db = require('./db')

/** 知识库覆盖率统计数据访问层 */
const knowledgeCoverageDal = {
  /** 按法规分类统计文档、条款和校验状态 */
  async findCategoryCoverage() {
    const [rows] = await db.execute(`
      SELECT
        c.id AS category_id,
        c.name AS category_name,
        c.sort,
        COUNT(DISTINCT CASE WHEN k.status = 'active' THEN k.id END) AS knowledge_count,
        COUNT(DISTINCT CASE WHEN kc.status = 'active' THEN kc.id END) AS clause_count,
        COUNT(DISTINCT CASE WHEN kc.status = 'active' AND kc.verification_status = 'verified' THEN kc.id END) AS verified_clause_count,
        COUNT(DISTINCT CASE WHEN kc.status = 'active' AND kc.verification_status = 'pending' THEN kc.id END) AS pending_clause_count,
        COUNT(DISTINCT CASE WHEN kc.status = 'active' AND kc.verification_status = 'rejected' THEN kc.id END) AS rejected_clause_count
      FROM knowledge_categories c
      LEFT JOIN knowledge_category_relations r ON r.category_id = c.id
      LEFT JOIN knowledge k ON k.id = r.knowledge_id AND k.status = 'active'
      LEFT JOIN knowledge_clauses kc ON kc.knowledge_id = k.id AND kc.status = 'active'
      WHERE c.name <> '安全生产隐患排查报告'
      GROUP BY c.id, c.name, c.sort
      ORDER BY c.sort ASC, c.id ASC
    `)
    return rows
  },

  /** 统计全局唯一文档和唯一条款数量，避免通用法规关联多个分类时顶部汇总重复计数 */
  async findGlobalCoverageSummary() {
    const [rows] = await db.execute(`
      SELECT
        COUNT(DISTINCT CASE WHEN k.status = 'active' THEN k.id END) AS knowledge_count,
        COUNT(DISTINCT CASE WHEN kc.status = 'active' THEN kc.id END) AS clause_count,
        COUNT(DISTINCT CASE WHEN kc.status = 'active' AND kc.verification_status = 'verified' THEN kc.id END) AS verified_clause_count,
        COUNT(DISTINCT CASE WHEN kc.status = 'active' AND kc.verification_status = 'pending' THEN kc.id END) AS pending_clause_count,
        COUNT(DISTINCT CASE WHEN kc.status = 'active' AND kc.verification_status = 'rejected' THEN kc.id END) AS rejected_clause_count
      FROM knowledge_category_relations r
      INNER JOIN knowledge_categories c ON c.id = r.category_id AND c.name <> '安全生产隐患排查报告'
      INNER JOIN knowledge k ON k.id = r.knowledge_id AND k.status = 'active'
      LEFT JOIN knowledge_clauses kc ON kc.knowledge_id = k.id AND kc.status = 'active'
    `)
    return rows[0] || {}
  },
}

module.exports = knowledgeCoverageDal
