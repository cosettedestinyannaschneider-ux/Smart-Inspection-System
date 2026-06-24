const enterpriseDal = require('../dal/enterpriseDal')
const logDal = require('../dal/logDal')
const C = require('../common/Constants')
const path = require('path')
const fs = require('fs')

/** 创建带错误码的业务异常 */
const businessError = (message) => {
  const error = new Error(message)
  error.isBusinessError = true
  return error
}

/** 企业档案更新允许的字段白名单 */
const ALLOWED_UPDATE_FIELDS = [
  'name', 'region', 'address', 'contact', 'phone',
  'industry', 'enterprise_type', 'scale', 'production_process',
  'inspector_name', 'inspection_date', 'inspection_status', 'status', 'project_name'
]

/**
 * 管理员企业综合查询与档案管理服务
 */
const adminEnterpriseService = {
  /**
   * 企业综合查询（聚合隐患、分析、报告和整改统计）
   * @param {object} filters — 筛选条件
   */
  async query(filters = {}) {
    /** 标准化筛选参数 */
    const normalized = {
      keyword: String(filters.keyword || '').trim() || null,
      industry: filters.industry || null,
      enterprise_type: filters.enterprise_type || null,
      inspection_status: filters.inspection_status || null,
      status: filters.status || null,
      inspection_date: filters.inspection_date || null,
      sort_by: ['date', 'risk', 'name'].includes(filters.sort_by) ? filters.sort_by : 'date',
    }
    return await enterpriseDal.queryEnterprises(normalized)
  },

  /**
   * 导出当前筛选结果为 CSV 文件
   * @param {number} adminId — 管理员 ID
   * @param {object} filters — 与 query 相同的筛选条件
   * @param {string} [ipAddress]
   * @returns {Promise<{file_path: string, file_name: string}>}
   */
  async exportToCSV(adminId, filters = {}, ipAddress = null) {
    const rows = await this.query(filters)
    /** CSV 表头 */
    const headers = [
      '企业名称', '所在地区', '详细地址', '所属行业', '企业类型', '企业规模',
      '联系人', '联系电话', '检查员', '现场排查人员', '排查日期', '排查状态',
      '风险等级', '隐患总数', '待整改', '已整改', '整改率(%)',
      '隐患图片数', 'AI 分析数', '报告数', '主要隐患类型', '档案状态', '最近更新时间'
    ]
    /** 生成 CSV 行 */
    const csvRows = [headers.join(',')]
    for (const row of rows) {
      const rate = row.hazard_count > 0 ? Math.round(row.rectified_count / row.hazard_count * 100) : 0
      csvRows.push([
        `"${String(row.name || '').replace(/"/g, '""')}"`,
        `"${String(row.region || '').replace(/"/g, '""')}"`,
        `"${String(row.address || '').replace(/"/g, '""')}"`,
        `"${String(row.industry || '').replace(/"/g, '""')}"`,
        `"${String(row.enterprise_type || '').replace(/"/g, '""')}"`,
        `"${String(row.scale || '').replace(/"/g, '""')}"`,
        `"${String(row.contact || '').replace(/"/g, '""')}"`,
        `"${String(row.phone || '').replace(/"/g, '""')}"`,
        `"${String(row.username || '').replace(/"/g, '""')}"`,
        `"${String(row.inspector_name || '').replace(/"/g, '""')}"`,
        `"${String(row.inspection_date || '').replace(/"/g, '""')}"`,
        `"${String(row.inspection_status || '').replace(/"/g, '""')}"`,
        `"${String(row.risk_level || '').replace(/"/g, '""')}"`,
        row.hazard_count, row.pending_count, row.rectified_count, rate,
        row.image_count, row.analysis_count, row.report_count,
        `"${String((row.main_hazards || []).join('、')).replace(/"/g, '""')}"`,
        row.status === 'active' ? '正常' : '已归档',
        `"${String(row.updated_at || '').replace(/"/g, '""')}"`,
      ].join(','))
    }
    /** 写入导出文件 */
    const exportDir = path.join(C.UPLOAD_DIR, 'exports')
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
    const fileName = `enterprises_export_${timestamp}.csv`
    const filePath = path.join(exportDir, fileName)
    fs.writeFileSync(filePath, '﻿' + csvRows.join('\n'), 'utf-8') // BOM 确保 Excel 正确识别中文
    await logDal.logAction(adminId, 'ADMIN_EXPORT_ENTERPRISES', { count: rows.length, file: fileName }, ipAddress)
    return { file_path: 'uploads/exports/' + fileName, file_name: fileName }
  },

  /**
   * 管理员更新企业完整档案，使用字段白名单防越权
   * @param {number} adminId
   * @param {number} enterpriseId
   * @param {object} payload — 允许更新的企业档案字段
   * @param {string} [ipAddress]
   */

  /**
   * 管理员创建客户企业完整档案，创建后可继续分配检查员。
   * @param {number} adminId
   * @param {object} payload — 企业基础档案字段
   * @param {string} [ipAddress]
   */
  async createProfile(adminId, payload, ipAddress = null) {
    const data = {}
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (payload[field] !== undefined) data[field] = payload[field]
    }
    const name = String(data.name || '').trim()
    if (!name) throw businessError('企业名称不能为空')
    if (await enterpriseDal.findByName(name)) throw businessError('企业名称已存在')
    const created = await enterpriseDal.upsertClient({ ...data, name, status: data.status || C.STATUS_ACTIVE })
    await logDal.logAction(adminId, C.ACTION_ADMIN_ADD_ENTERPRISE, { id: created.id, name }, ipAddress)
    return created
  },
  async updateProfile(adminId, enterpriseId, payload, ipAddress = null) {
    if (!enterpriseId || !await enterpriseDal.findById(enterpriseId)) throw businessError('企业不存在')
    /** 仅保留白名单内字段，且不允许通过此接口修改企业组织名称（组织名称由阶段 B 独立管理） */
    const data = {}
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (payload[field] !== undefined) data[field] = payload[field]
    }
    if (!String(data.name || '').trim()) throw businessError('企业名称不能为空')
    await enterpriseDal.adminUpdateById(enterpriseId, data)
    await logDal.logAction(adminId, 'ADMIN_UPDATE_ENTERPRISE_PROFILE', { id: enterpriseId, name: data.name }, ipAddress)
    /** 返回更新后的企业完整档案 */
    const updated = await enterpriseDal.findById(enterpriseId)
    return updated
  },
}

module.exports = adminEnterpriseService
