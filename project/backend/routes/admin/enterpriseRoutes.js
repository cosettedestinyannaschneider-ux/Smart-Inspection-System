const express = require('express')
const organizationService = require('../../bll/organizationService')
const adminEnterpriseService = require('../../bll/adminEnterpriseService')
const adminAuth = require('../../middleware/adminAuth')
const { respondServiceError } = require('./routeUtils')

const router = express.Router()

/** 查询组织管理企业列表 */
router.post('/list', adminAuth, async (req, res) => {
  try { res.success(await organizationService.listEnterprises()) }
  catch (err) { respondServiceError(res, err) }
})

/** 新增企业组织主数据 */
router.post('/add', adminAuth, async (req, res) => {
  try {
    const id = await organizationService.addEnterprise(req.admin.id, req.body.name, req.ip)
    res.success({ id }, '企业已新增')
  } catch (err) { respondServiceError(res, err) }
})

/** 更新企业组织名称或完整档案 */
router.post('/update', adminAuth, async (req, res) => {
  try {
    const hasProfileFields = req.body.industry !== undefined || req.body.region !== undefined
      || req.body.inspection_status !== undefined || req.body.status !== undefined
    if (hasProfileFields) {
      const updated = await adminEnterpriseService.updateProfile(req.admin.id, req.body.id, req.body, req.ip)
      res.success(updated, '企业档案已更新')
    } else {
      await organizationService.updateEnterprise(req.admin.id, req.body.id, req.body.name, req.ip)
      res.success(null, '企业名称已更新')
    }
  } catch (err) { respondServiceError(res, err) }
})

/** 删除无组织和业务关联的企业 */
router.post('/delete', adminAuth, async (req, res) => {
  try {
    await organizationService.deleteEnterprise(req.admin.id, req.body.id, req.ip)
    res.success(null, '企业已删除')
  } catch (err) { respondServiceError(res, err) }
})

/** 查询企业综合档案 */
router.post('/query', adminAuth, async (req, res) => {
  try { res.success(await adminEnterpriseService.query(req.body)) }
  catch (err) { respondServiceError(res, err) }
})

/** 导出企业查询结果 */
router.post('/export', adminAuth, async (req, res) => {
  try {
    const result = await adminEnterpriseService.exportToCSV(req.admin.id, req.body, req.ip)
    res.success(result)
  } catch (err) { respondServiceError(res, err) }
})

module.exports = router
