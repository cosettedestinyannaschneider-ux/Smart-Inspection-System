const express = require('express')
const organizationService = require('../../bll/organizationService')
const adminEnterpriseService = require('../../bll/adminEnterpriseService')
const enterpriseAssignmentDal = require('../../dal/enterpriseAssignmentDal')
const adminAuth = require('../../middleware/adminAuth')
const { respondServiceError } = require('./routeUtils')

const router = express.Router()

/** 管理员企业档案接口 */
router.post('/list', adminAuth, async (req, res) => {
  try { res.success(await organizationService.listEnterprises()) }
  catch (err) { respondServiceError(res, err) }
})

/** 管理员企业档案接口 */
router.post('/add', adminAuth, async (req, res) => {
  try {
    const id = await organizationService.addEnterprise(req.admin.id, req.body.name, req.ip)
    res.success({ id }, '企业已新增')
  } catch (err) { respondServiceError(res, err) }
})


/** 管理员创建客户企业完整档案 */
router.post('/create', adminAuth, async (req, res) => {
  try {
    const created = await adminEnterpriseService.createProfile(req.admin.id, req.body, req.ip)
    res.success(created, '企业档案已新增')
  } catch (err) { respondServiceError(res, err) }
})
/** 管理员企业档案接口 */
router.post('/update', adminAuth, async (req, res) => {
  try {
    const hasProfileFields = req.body.industry !== undefined || req.body.region !== undefined
      || req.body.inspection_status !== undefined || req.body.status !== undefined
      || req.body.enterprise_type !== undefined || req.body.scale !== undefined
      || req.body.phone !== undefined || req.body.inspection_date !== undefined
    if (hasProfileFields) {
      const updated = await adminEnterpriseService.updateProfile(req.admin.id, req.body.id, req.body, req.ip)
      res.success(updated, '企业档案已更新')
    } else {
      await organizationService.updateEnterprise(req.admin.id, req.body.id, req.body.name, req.ip)
      res.success(null, '企业已更新')
    }
  } catch (err) { respondServiceError(res, err) }
})

/** 管理员企业档案接口 */
router.post('/delete', adminAuth, async (req, res) => {
  try {
    await organizationService.deleteEnterprise(req.admin.id, req.body.id, req.ip)
    res.success(null, '企业已归档')
  } catch (err) { respondServiceError(res, err) }
})

/** 管理员企业档案接口 */
router.post('/restore', adminAuth, async (req, res) => {
  try {
    await organizationService.restoreEnterprise(req.admin.id, req.body.id, req.ip)
    res.success(null, '企业已恢复')
  } catch (err) { respondServiceError(res, err) }
})

/** 管理员企业档案接口 */
router.post('/query', adminAuth, async (req, res) => {
  try { res.success(await adminEnterpriseService.query(req.body)) }
  catch (err) { respondServiceError(res, err) }
})

/** 管理员企业档案接口 */
router.post('/export', adminAuth, async (req, res) => {
  try {
    const result = await adminEnterpriseService.exportToCSV(req.admin.id, req.body, req.ip)
    res.success(result)
  } catch (err) { respondServiceError(res, err) }
})

/** 查询企业已分配检查员 */
router.post('/assignments/list', adminAuth, async (req, res) => {
  try {
    const enterpriseId = Number(req.body.enterprise_id)
    if (!enterpriseId) return res.fail(4001, '请选择企业')
    res.success(await enterpriseAssignmentDal.listByEnterpriseId(enterpriseId))
  } catch (err) { respondServiceError(res, err) }
})

/** 保存企业检查员分配关系 */
router.post('/assignments/save', adminAuth, async (req, res) => {
  try {
    const enterpriseId = Number(req.body.enterprise_id)
    if (!enterpriseId) return res.fail(4001, '请选择企业')
    const assignments = await enterpriseAssignmentDal.saveForEnterprise(enterpriseId, req.body.inspector_ids || [], req.admin.id)
    res.success(assignments, '检查员分配已保存')
  } catch (err) { respondServiceError(res, err) }
})

module.exports = router
