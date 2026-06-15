const express = require('express')
const organizationService = require('../../bll/organizationService')
const adminAuth = require('../../middleware/adminAuth')
const { respondServiceError } = require('./routeUtils')

const router = express.Router()

/** 查询部门列表，可按企业筛选 */
router.post('/list', adminAuth, async (req, res) => {
  try { res.success(await organizationService.listDepartments(req.body.enterprise_id)) }
  catch (err) { respondServiceError(res, err) }
})

/** 新增企业内唯一部门 */
router.post('/add', adminAuth, async (req, res) => {
  try {
    const id = await organizationService.addDepartment(req.admin.id, req.body.enterprise_id, req.body.name, req.ip)
    res.success({ id }, '部门已新增')
  } catch (err) { respondServiceError(res, err) }
})

/** 更新部门名称或企业归属 */
router.post('/update', adminAuth, async (req, res) => {
  try {
    await organizationService.updateDepartment(req.admin.id, req.body.id, req.body.enterprise_id, req.body.name, req.ip)
    res.success(null, '已更新')
  } catch (err) { respondServiceError(res, err) }
})

/** 删除部门并事务处理禁用用户关联 */
router.post('/delete', adminAuth, async (req, res) => {
  try {
    await organizationService.deleteDepartment(req.admin.id, req.body.id, req.ip)
    res.success(null, '已删除')
  } catch (err) { respondServiceError(res, err) }
})

module.exports = router
