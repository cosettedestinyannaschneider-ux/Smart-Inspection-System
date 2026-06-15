const express = require('express')
const userService = require('../../bll/userService')
const logDal = require('../../dal/logDal')
const adminAuth = require('../../middleware/adminAuth')
const { respondServiceError } = require('./routeUtils')
const { ErrorCode } = require('../../common/ErrorCode')
const C = require('../../common/Constants')

const router = express.Router()

/** 查询用户、组织归属和权限集合 */
router.post('/list', adminAuth, async (req, res) => {
  try {
    res.success(await userService.getAllUsers(req.admin.id))
  } catch (err) {
    respondServiceError(res, err)
  }
})

/** 事务新增用户与权限 */
router.post('/add', adminAuth, async (req, res) => {
  try {
    const id = await userService.addManagedUser(req.admin.id, req.body, req.ip)
    res.success({ id }, '用户创建成功')
  } catch (err) {
    respondServiceError(res, err)
  }
})

/** 事务更新用户与权限 */
router.post('/update', adminAuth, async (req, res) => {
  try {
    const { target_id } = req.body
    if (!target_id || !String(req.body.username || '').trim()) return res.fail(ErrorCode.PARAM_MISSING)
    await userService.updateManagedUser(req.admin.id, target_id, req.body, req.ip)
    res.success(null, '用户信息已更新')
  } catch (err) {
    respondServiceError(res, err)
  }
})

/** 软禁用用户并保护当前管理员 */
router.post('/delete', adminAuth, async (req, res) => {
  try {
    const { target_id } = req.body
    if (!target_id) return res.fail(ErrorCode.PARAM_MISSING)
    await userService.removeUser(req.admin.id, target_id)
    await logDal.logAction(req.admin.id, C.ACTION_ADMIN_DELETE_USER, { target_id }, req.ip)
    res.success(null, '用户已禁用')
  } catch (err) {
    respondServiceError(res, err)
  }
})

module.exports = router
