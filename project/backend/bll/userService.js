/**
 * 用户服务模块
 * 负责认证、授权、密码管理
 *
 * @created 2026-04-12
 * @updated 2026-05-18 — 增加账户锁定/登录追踪/部门关联
 */
const userDal = require('../dal/userDal')
const userPermissionDal = require('../dal/userPermissionDal')
const departmentDal = require('../dal/departmentDal')
const logDal = require('../dal/logDal')
const db = require('../dal/db')
const crypto = require('crypto')
const C = require('../common/Constants')

/** 阶段 B 允许持久化的权限白名单 */
const PERMISSION_KEYS = [
  'enterprise:manage',
  'image:manage',
  'analysis:run',
  'report:download',
  'knowledge:view',
]

/** 创建业务异常，供路由层返回明确提示 */
const businessError = (message) => {
  const error = new Error(message)
  error.isBusinessError = true
  return error
}

/** 将权限对象或数组标准化为白名单内的权限 Key 数组 */
const normalizePermissions = (permissions, role) => {
  if (role === C.ROLE_ADMIN) return []
  const requested = Array.isArray(permissions)
    ? permissions
    : Object.keys(permissions || {}).filter((key) => permissions[key])
  const invalid = requested.filter((key) => !PERMISSION_KEYS.includes(key))
  if (invalid.length) throw businessError(`存在非法权限：${invalid.join(', ')}`)
  return [...new Set(requested)]
}

/** 校验用户角色与部门归属规则 */
const validateOrganization = async (role, departmentId) => {
  if (![C.ROLE_ADMIN, C.ROLE_USER].includes(role)) throw businessError('用户角色不合法')
  if (role === C.ROLE_USER && !departmentId) throw businessError('普通用户必须绑定有效部门')
  if (departmentId && !await departmentDal.findById(departmentId)) throw businessError('所属部门不存在')
}

/** 判断密码字段是否为 scrypt 哈希格式 */
const isScryptHash = (value) => typeof value === 'string' && value.startsWith('scrypt$')

/**
 * 使用 scrypt 对密码加盐哈希
 * @param {string} plainPassword — 明文密码
 * @returns {Promise<string>} scrypt$salt$hash 格式字符串
 */
const hashPassword = async (plainPassword) => {
  const salt = crypto.randomBytes(C.PASSWORD_SALT_LENGTH).toString('hex')
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(plainPassword, salt, C.PASSWORD_HASH_LENGTH, (err, derivedKey) => {
      if (err) return reject(err)
      resolve(derivedKey.toString('hex'))
    })
  })
  return `scrypt$${salt}$${hash}`
}

/**
 * 校验 scrypt 哈希
 * @param {string} plainPassword — 明文密码
 * @param {string} storedHash    — 存储的哈希值
 * @returns {Promise<boolean>}
 */
const verifyPassword = async (plainPassword, storedHash) => {
  if (!isScryptHash(storedHash)) return false
  const parts = storedHash.split('$')
  if (parts.length !== 3) return false
  const salt = parts[1]
  const hash = parts[2]
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(plainPassword, salt, C.PASSWORD_HASH_LENGTH, (err, derivedKey) => {
      if (err) return reject(err)
      resolve(derivedKey.toString('hex'))
    })
  })
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'))
}

const userService = {
  /**
   * 用户登录（含账户锁定检测与自动迁移明文密码）
   *
   * @param {string} username — 用户名
   * @param {string} password — 明文密码
   * @returns {Promise<{success: boolean, user?: object, message?: string}>}
   */
  async login(username, password) {
    const user = await userDal.findByUsername(username)
    if (!user || !password) return { success: false, message: '用户名或密码错误' }

    // 检查账户状态
    if (user.status === C.STATUS_LOCKED && user.locked_until) {
      if (new Date(user.locked_until) > new Date()) {
        return { success: false, message: '账户已被锁定，请稍后再试' }
      }
      // 锁定期已过，自动解锁
      await userDal.resetLoginAttempts(user.id)
      user.status = C.STATUS_ACTIVE
    }
    if (user.status === C.STATUS_DISABLED) {
      return { success: false, message: '账户已被禁用' }
    }

    let passwordOk = false

    // 兼容旧明文密码：验证通过后自动迁移为哈希
    if (!isScryptHash(user.password)) {
      if (user.password !== password) {
        await userDal.incrementLoginAttempts(user.id)
        return { success: false, message: '用户名或密码错误' }
      }
      const nextHash = await hashPassword(password)
      await userDal.updatePassword(user.id, nextHash)
      passwordOk = true
    } else {
      passwordOk = await verifyPassword(password, user.password)
    }

    if (passwordOk) {
      await userDal.resetLoginAttempts(user.id)
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          department_id: user.department_id,
        },
      }
    }

    // 登录失败：累计失败次数
    await userDal.incrementLoginAttempts(user.id)
    return { success: false, message: '用户名或密码错误' }
  },

  /**
   * 按 ID 获取用户
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async getUserById(id) {
    return await userDal.findById(id)
  },

  /**
   * 注册用户
   * @param {string} username      — 用户名
   * @param {string} password      — 明文密码
   * @param {string} role          — 角色 admin|user
   * @param {number} [departmentId] — 部门 ID
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async register(username, password, role, departmentId = null) {
    const existing = await userDal.findByUsername(username)
    if (existing) return { success: false, message: '用户名已存在' }
    const passwordHash = await hashPassword(password)
    await userDal.createUser(username, passwordHash, role, departmentId)
    return { success: true }
  },

  /**
   * 获取所有用户（管理员接口）
   * @param {number} adminId — 管理员 ID
   * @returns {Promise<Array>}
   * @throws {Error} 权限不足
   */
  async getAllUsers(adminId) {
    const admin = await userDal.findById(adminId)
    if (!admin || admin.role !== C.ROLE_ADMIN || admin.status !== C.STATUS_ACTIVE) throw new Error('权限不足')
    const users = await userDal.findAll()
    const groupedPermissions = await userPermissionDal.findAllGrouped()
    return users.map((user) => ({
      ...user,
      permissions: groupedPermissions[user.id] || {},
    }))
  },

  /**
   * 管理员新增用户，并在同一事务内写入权限集合
   */
  async addManagedUser(adminId, payload, ipAddress = null) {
    const username = String(payload.username || '').trim()
    const password = String(payload.password || '')
    const role = payload.role || C.ROLE_USER
    const departmentId = payload.department_id ? Number(payload.department_id) : null
    if (!username || !password) throw businessError('用户名和初始密码不能为空')
    if (await userDal.findByUsername(username)) throw businessError('用户名已存在')
    await validateOrganization(role, departmentId)
    const permissionKeys = normalizePermissions(payload.permissions, role)
    const passwordHash = await hashPassword(password)
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const id = await userDal.createUser(username, passwordHash, role, departmentId, connection)
      await userPermissionDal.replaceForUser(id, permissionKeys, connection)
      await logDal.logAction(adminId, C.ACTION_ADMIN_ADD_USER, { target_id: id, username, role, department_id: departmentId }, ipAddress, connection)
      if (permissionKeys.length) {
        await logDal.logAction(adminId, C.ACTION_ADMIN_UPDATE_USER_PERMISSIONS, { target_id: id, permissions: permissionKeys }, ipAddress, connection)
      }
      await connection.commit()
      return id
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  /**
   * 管理员更新用户，并在同一事务内完整替换权限集合
   * @param {number} adminId      — 管理员 ID
   * @param {number} targetId     — 目标用户 ID
   * @param {object} payload      — 更新字段 { username, password, role, department_id, status, permissions }
   * @param {string} [ipAddress]  — 客户端 IP
   */
  async updateManagedUser(adminId, targetId, payload, ipAddress = null) {
    const id = Number(targetId)
    const target = await userDal.findById(id)
    if (!target) throw businessError('用户不存在')
    const username = String(payload.username || '').trim()
    const password = String(payload.password || '')
    const role = payload.role || C.ROLE_USER
    const departmentId = payload.department_id ? Number(payload.department_id) : null
    /** 允许管理员显式传递 status 以重新启用或禁用用户，仅接受 active 或 disabled */
    const status = (payload.status === C.STATUS_ACTIVE || payload.status === C.STATUS_DISABLED) ? payload.status : null
    if (!username) throw businessError('用户名不能为空')
    if (id === Number(adminId) && (role !== C.ROLE_ADMIN || status === C.STATUS_DISABLED)) {
      throw businessError('禁止禁用当前管理员或取消当前管理员身份')
    }
    const duplicated = await userDal.findByUsername(username)
    if (duplicated && Number(duplicated.id) !== id) throw businessError('用户名已存在')
    await validateOrganization(role, departmentId)
    const permissionKeys = normalizePermissions(payload.permissions, role)
    const nextPassword = password ? await hashPassword(password) : ''
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await userDal.updateUser(id, username, nextPassword, role, departmentId, status, connection)
      await userPermissionDal.replaceForUser(id, permissionKeys, connection)
      await logDal.logAction(adminId, C.ACTION_ADMIN_UPDATE_USER, { target_id: id, username, role, department_id: departmentId, status: status || target.status }, ipAddress, connection)
      await logDal.logAction(adminId, C.ACTION_ADMIN_UPDATE_USER_PERMISSIONS, { target_id: id, permissions: permissionKeys }, ipAddress, connection)
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  /**
   * 禁用用户（软删除）
   * @param {number} adminId  — 管理员 ID
   * @param {number} targetId — 目标用户 ID
   * @throws {Error} 权限不足
   */
  async removeUser(adminId, targetId) {
    const admin = await userDal.findById(adminId)
    if (!admin || admin.role !== C.ROLE_ADMIN || admin.status !== C.STATUS_ACTIVE) throw new Error('权限不足')
    if (Number(adminId) === Number(targetId)) throw businessError('禁止禁用当前登录管理员')
    const target = await userDal.findById(targetId)
    if (!target) throw businessError('用户不存在')
    await userDal.deleteUser(targetId)
    return { success: true }
  },
}

module.exports = userService
