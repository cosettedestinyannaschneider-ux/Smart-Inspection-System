const enterpriseDal = require('../dal/enterpriseDal')
const hazardImageDal = require('../dal/hazardImageDal')
const historyDal = require('../dal/historyDal')

/**
 * 管理员工作台统计服务
 * 仅返回当前阶段真实可计算、可审计的核心指标
 */
const adminWorkbenchService = {
  /**
   * 查询工作台统计指标
   * - 企业总数：有效企业数量
   * - 待分析图片数：已上传但尚未关联任何报告的有效图片
   * - 报告总数：全部排查报告数量
   * - 今日新增报告数：按数据库当前日期统计
   */
  async getStats() {
    const [enterpriseCount, pendingImageCount, reportStats] = await Promise.all([
      enterpriseDal.countActiveEnterprises(),
      hazardImageDal.countPendingAnalysis(),
      historyDal.getWorkbenchStats(),
    ])

    return {
      enterprise_count: enterpriseCount,
      pending_image_count: pendingImageCount,
      report_count: reportStats.reportTotalCount,
      today_report_count: reportStats.todayReportCount,
    }
  },
}

module.exports = adminWorkbenchService
