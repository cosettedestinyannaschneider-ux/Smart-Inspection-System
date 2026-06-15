const enterpriseDal = require('../dal/enterpriseDal')
const departmentDal = require('../dal/departmentDal')
const logDal = require('../dal/logDal')
const db = require('../dal/db')
const C = require('../common/Constants')

/** 创建带错误码的业务异常，供路由层返回明确提示 */
const businessError = (message) => {
  const error = new Error(message)
  error.isBusinessError = true
  return error
}

/** 标准化组织名称，禁止只包含空白字符 */
const normalizeName = (name, label) => {
  const value = String(name || '').trim()
  if (!value) throw businessError(`请输入${label}名称`)
  return value
}

const organizationService = {
  /** 查询企业组织列表 */
  async listEnterprises() {
    return await enterpriseDal.findOrganizationList()
  },

  /** 新增企业组织主数据，禁止写入历史 user_id 字段 */
  async addEnterprise(adminId, name, ipAddress = null) {
    const enterpriseName = normalizeName(name, '企业')
    if (await enterpriseDal.findByName(enterpriseName)) throw businessError('企业名称已存在')
    const id = await enterpriseDal.createOrganization(enterpriseName)
    await logDal.logAction(adminId, C.ACTION_ADMIN_ADD_ENTERPRISE, { id, name: enterpriseName }, ipAddress)
    return id
  },

  /** 本阶段企业更新仅允许修改组织名称 */
  async updateEnterprise(adminId, id, name, ipAddress = null) {
    const enterpriseId = Number(id)
    const enterpriseName = normalizeName(name, '企业')
    if (!enterpriseId || !await enterpriseDal.findById(enterpriseId)) throw businessError('企业不存在')
    const duplicated = await enterpriseDal.findByName(enterpriseName)
    if (duplicated && Number(duplicated.id) !== enterpriseId) throw businessError('企业名称已存在')
    await enterpriseDal.updateOrganizationName(enterpriseId, enterpriseName)
    await logDal.logAction(adminId, C.ACTION_ADMIN_UPDATE_ENTERPRISE, { id: enterpriseId, name: enterpriseName }, ipAddress)
  },

  /** 删除无任何组织或业务关联的企业 */
  async deleteEnterprise(adminId, id, ipAddress = null) {
    const enterpriseId = Number(id)
    if (!enterpriseId || !await enterpriseDal.findById(enterpriseId)) throw businessError('企业不存在')
    const references = await enterpriseDal.countDeleteReferences(enterpriseId)
    if (references.departments > 0) throw businessError('企业下存在部门，禁止删除')
    if (references.hazard_images > 0 || references.inspection_reports > 0) {
      throw businessError('企业存在隐患图片或排查报告，禁止删除')
    }
    await enterpriseDal.deleteById(enterpriseId)
    await logDal.logAction(adminId, C.ACTION_ADMIN_DELETE_ENTERPRISE, { id: enterpriseId }, ipAddress)
  },

  /** 查询部门列表 */
  async listDepartments(enterpriseId = null) {
    return await departmentDal.findAll(enterpriseId ? Number(enterpriseId) : null)
  },

  /** 新增企业内唯一部门 */
  async addDepartment(adminId, enterpriseId, name, ipAddress = null) {
    const targetEnterpriseId = Number(enterpriseId)
    const departmentName = normalizeName(name, '部门')
    if (!targetEnterpriseId || !await enterpriseDal.findById(targetEnterpriseId)) throw businessError('企业不存在')
    if (await departmentDal.findByEnterpriseAndName(targetEnterpriseId, departmentName)) throw businessError('当前企业已存在同名部门')
    const id = await departmentDal.create(targetEnterpriseId, departmentName)
    await logDal.logAction(adminId, C.ACTION_ADMIN_ADD_DEPARTMENT, { id, enterprise_id: targetEnterpriseId, name: departmentName }, ipAddress)
    return id
  },

  /** 更新部门名称或企业归属，已分配用户时禁止跨企业移动 */
  async updateDepartment(adminId, id, enterpriseId, name, ipAddress = null) {
    const departmentId = Number(id)
    const targetEnterpriseId = Number(enterpriseId)
    const departmentName = normalizeName(name, '部门')
    const department = await departmentDal.findById(departmentId)
    if (!department) throw businessError('部门不存在')
    if (!targetEnterpriseId || !await enterpriseDal.findById(targetEnterpriseId)) throw businessError('企业不存在')
    if (Number(department.enterprise_id) !== targetEnterpriseId && await departmentDal.countUsers(departmentId) > 0) {
      throw businessError('已分配用户的部门禁止跨企业移动')
    }
    const duplicated = await departmentDal.findByEnterpriseAndName(targetEnterpriseId, departmentName)
    if (duplicated && Number(duplicated.id) !== departmentId) throw businessError('当前企业已存在同名部门')
    await departmentDal.updateById(departmentId, targetEnterpriseId, departmentName)
    await logDal.logAction(adminId, C.ACTION_ADMIN_UPDATE_DEPARTMENT, {
      id: departmentId, enterprise_id: targetEnterpriseId, name: departmentName,
    }, ipAddress)
  },

  /**
   * 删除部门：正常或锁定用户阻止删除；仅关联禁用用户时事务内解除关联后删除
   */
  async deleteDepartment(adminId, id, ipAddress = null) {
    const departmentId = Number(id)
    if (!departmentId || !await departmentDal.findById(departmentId)) throw businessError('部门不存在')
    if (await departmentDal.countUsers(departmentId, [C.STATUS_ACTIVE, C.STATUS_LOCKED]) > 0) {
      throw businessError('部门存在正常或锁定用户，禁止删除')
    }
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const detachedUserIds = await departmentDal.findUserIdsByStatuses(departmentId, [C.STATUS_DISABLED], connection)
      await departmentDal.detachUsersByStatuses(departmentId, [C.STATUS_DISABLED], connection)
      await departmentDal.deleteById(departmentId, connection)
      await logDal.logAction(adminId, C.ACTION_ADMIN_DELETE_DEPARTMENT, {
        id: departmentId,
        detached_disabled_user_ids: detachedUserIds,
      }, ipAddress, connection)
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },
}

module.exports = organizationService
