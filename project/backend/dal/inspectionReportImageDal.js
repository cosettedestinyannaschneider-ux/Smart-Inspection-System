const db = require('./db')

const inspectionReportImageDal = {
  /**
   * 批量关联隐患图片到报告
   * @param {number} reportId
   * @param {number[]} imageIds
   */
  async linkImages(reportId, imageIds) {
    for (const imageId of imageIds) {
      try {
        await db.execute(
          'INSERT IGNORE INTO inspection_report_images (report_id, image_id) VALUES (?, ?)',
          [reportId, Number(imageId)]
        )
      } catch (e) { /* 重复则忽略 */ }
    }
  },

  /**
   * 查询报告关联的图片记录
   * @param {number} reportId
   */
  async findByReportId(reportId) {
    const [rows] = await db.execute(
      `SELECT hi.* FROM hazard_images hi
       JOIN inspection_report_images iri ON iri.image_id = hi.id
       WHERE iri.report_id = ?
       ORDER BY iri.created_at ASC`,
      [reportId]
    )
    return rows
  },

  /**
   * 查询图片关联的报告
   * @param {number} imageId
   */
  async findByImageId(imageId) {
    const [rows] = await db.execute(
      `SELECT ir.* FROM inspection_reports ir
       JOIN inspection_report_images iri ON iri.report_id = ir.id
       WHERE iri.image_id = ?`,
      [imageId]
    )
    return rows
  },

  /**
   * 取消关联
   * @param {number} reportId
   * @param {number} imageId
   */
  async unlink(reportId, imageId) {
    await db.execute(
      'DELETE FROM inspection_report_images WHERE report_id = ? AND image_id = ?',
      [reportId, imageId]
    )
  },

  /**
   * 删除报告的所有关联
   * @param {number} reportId
   */
  async unlinkAll(reportId) {
    await db.execute('DELETE FROM inspection_report_images WHERE report_id = ?', [reportId])
  },
}

module.exports = inspectionReportImageDal
