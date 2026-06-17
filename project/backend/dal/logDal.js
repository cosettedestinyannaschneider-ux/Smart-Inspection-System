const db = require('./db')
const C = require('../common/Constants')

/** 角色中文名称映射 */
const ROLE_LABEL_MAP = {
  admin: '管理员',
  user: '检查员',
}

/** 状态中文名称映射 */
const STATUS_LABEL_MAP = {
  active: '正常',
  disabled: '禁用',
  locked: '锁定',
  archived: '已归档',
  deleted: '已删除',
  draft: '草稿',
  completed: '已完成',
}

/** 操作日志对应的模块与展示名称 */
const ACTION_META_MAP = {
  [C.ACTION_LOGIN]: { module: '认证', label: '登录系统' },
  [C.ACTION_LOGOUT]: { module: '认证', label: '退出登录' },
  [C.ACTION_HAZARD_IMAGE_UPLOAD]: { module: '隐患图片', label: '上传隐患图片' },
  [C.ACTION_HAZARD_IMAGE_DELETE]: { module: '隐患图片', label: '删除隐患图片' },
  [C.ACTION_HAZARD_IMAGE_LABEL]: { module: '隐患图片', label: '更新图片标注' },
  [C.ACTION_AI_HAZARD_ANALYZE_MULTI]: { module: 'AI 分析', label: '批量隐患分析' },
  [C.ACTION_AI_INSPECTION]: { module: 'AI 分析', label: '单图巡检分析' },
  [C.ACTION_UPDATE_INSPECTION_RESULT]: { module: '报告管理', label: '编辑分析结果' },
  [C.ACTION_DELETE_REPORT]: { module: '报告管理', label: '删除排查报告' },
  [C.ACTION_UPDATE_ENTERPRISE]: { module: '企业档案', label: '更新企业信息' },
  [C.ACTION_ADMIN_ADD_USER]: { module: '用户管理', label: '新增用户' },
  [C.ACTION_ADMIN_UPDATE_USER]: { module: '用户管理', label: '更新用户' },
  [C.ACTION_ADMIN_DELETE_USER]: { module: '用户管理', label: '禁用用户' },
  [C.ACTION_ADMIN_UPDATE_USER_PERMISSIONS]: { module: '用户管理', label: '更新用户权限' },
  [C.ACTION_ADMIN_ADD_ENTERPRISE]: { module: '组织管理', label: '新增企业组织' },
  [C.ACTION_ADMIN_UPDATE_ENTERPRISE]: { module: '组织管理', label: '更新企业组织' },
  [C.ACTION_ADMIN_DELETE_ENTERPRISE]: { module: '组织管理', label: '删除企业组织' },
  [C.ACTION_ADMIN_ADD_DEPARTMENT]: { module: '组织管理', label: '新增部门' },
  [C.ACTION_ADMIN_UPDATE_DEPARTMENT]: { module: '组织管理', label: '更新部门' },
  [C.ACTION_ADMIN_DELETE_DEPARTMENT]: { module: '组织管理', label: '删除部门' },
  [C.ACTION_ADMIN_EXPORT_ENTERPRISES]: { module: '企业档案', label: '导出企业数据' },
  [C.ACTION_ADMIN_UPDATE_ENTERPRISE_PROFILE]: { module: '企业档案', label: '更新企业档案' },
  [C.ACTION_ADMIN_ADD_KNOWLEDGE]: { module: '知识库管理', label: '新增知识文档' },
  [C.ACTION_ADMIN_UPDATE_KNOWLEDGE]: { module: '知识库管理', label: '更新知识文档' },
  [C.ACTION_ADMIN_ARCHIVE_KNOWLEDGE]: { module: '知识库管理', label: '归档知识文档' },
  [C.ACTION_ADMIN_BATCH_ARCHIVE_KNOWLEDGE]: { module: '知识库管理', label: '批量归档知识文档' },
  [C.ACTION_ADMIN_ADD_KNOWLEDGE_CATEGORY]: { module: '知识分类', label: '新增知识分类' },
  [C.ACTION_ADMIN_UPDATE_KNOWLEDGE_CATEGORY]: { module: '知识分类', label: '更新知识分类' },
  [C.ACTION_ADMIN_DELETE_KNOWLEDGE_CATEGORY]: { module: '知识分类', label: '删除知识分类' },
  [C.ACTION_ADMIN_ADD_REPORT_TEMPLATE]: { module: '报告模板', label: '新增报告模板' },
  [C.ACTION_ADMIN_UPDATE_REPORT_TEMPLATE]: { module: '报告模板', label: '更新报告模板' },
  [C.ACTION_ADMIN_DELETE_REPORT_TEMPLATE]: { module: '报告模板', label: '删除报告模板' },
  [C.ACTION_ADMIN_SET_REPORT_TEMPLATE_DEFAULT]: { module: '报告模板', label: '切换默认模板' },
}

/** 常用详情字段的中文标签 */
const DETAIL_LABEL_MAP = {
  id: '记录 ID',
  jti: '会话标识',
  count: '数量',
  file: '文件名',
  name: '名称',
  label: '标注',
  prompt: '提示词',
  status: '状态',
  role: '角色',
  username: '用户名',
  target_id: '目标用户 ID',
  department_id: '部门 ID',
  enterprise_id: '企业 ID',
  permissions: '权限',
  detached_disabled_user_ids: '解除关联用户',
  hasImage: '包含图片',
  is_default: '默认模板',
  replaced_file: '替换文件',
  title: '文档标题',
  category_name: '分类名称',
  archived_count: '归档数量',
}

/** 解析数据库中的 JSON 详情 */
const parseDetails = (rawDetails) => {
  if (rawDetails === null || rawDetails === undefined || rawDetails === '') return null
  if (typeof rawDetails === 'object') return rawDetails

  try {
    return JSON.parse(rawDetails)
  } catch (error) {
    return String(rawDetails)
  }
}

/** 角色代码转中文 */
const formatRoleLabel = (role) => ROLE_LABEL_MAP[String(role || '').toLowerCase()] || String(role || '未知角色')

/** 操作代码转展示信息 */
const getActionMeta = (actionCode) => {
  if (ACTION_META_MAP[actionCode]) return ACTION_META_MAP[actionCode]
  if (String(actionCode || '').startsWith('ADMIN_')) {
    return { module: '系统管理', label: actionCode }
  }
  return { module: '业务操作', label: actionCode || '未知操作' }
}

/** 统一格式化详情字段值 */
const formatDetailValue = (key, value) => {
  if (value === null || value === undefined || value === '') return '-'
  if (Array.isArray(value)) return value.map((item) => formatDetailValue('', item)).join('、')
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (key === 'role') return formatRoleLabel(value)
  if (key === 'status') return STATUS_LABEL_MAP[String(value)] || String(value)
  if (key === 'prompt') {
    const compact = String(value).replace(/\s+/g, ' ').trim()
    return compact.length > 40 ? `${compact.slice(0, 40)}...` : compact
  }
  return String(value)
}

/** 默认将对象详情转成可读文本 */
const formatObjectDetails = (details) => {
  const entries = Object.entries(details || {}).filter(([, value]) => value !== undefined)
  if (!entries.length) return '暂无操作详情'

  return entries.map(([key, value]) => {
    const label = DETAIL_LABEL_MAP[key] || key
    return `${label}：${formatDetailValue(key, value)}`
  }).join('；')
}

/** 按操作类型定制更友好的详情文案 */
const formatDetails = (actionCode, rawDetails) => {
  const details = parseDetails(rawDetails)
  if (!details) return '暂无操作详情'
  if (typeof details === 'string') return details

  switch (actionCode) {
    case C.ACTION_LOGIN:
      return `登录账号：${formatDetailValue('username', details.username)}`
    case C.ACTION_LOGOUT:
      return '当前登录会话已退出'
    case C.ACTION_HAZARD_IMAGE_UPLOAD:
      return `上传隐患图片 ${formatDetailValue('count', details.count)} 张`
    case C.ACTION_HAZARD_IMAGE_DELETE:
      return `删除隐患图片，记录 ID：${formatDetailValue('id', details.id)}`
    case C.ACTION_HAZARD_IMAGE_LABEL:
      return `更新图片标注，记录 ID：${formatDetailValue('id', details.id)}，标注：${formatDetailValue('label', details.label)}`
    case C.ACTION_AI_HAZARD_ANALYZE_MULTI:
      return `发起批量分析，图片数量：${formatDetailValue('count', details.count)}`
    case C.ACTION_AI_INSPECTION:
      return `发起单图巡检分析，包含图片：${formatDetailValue('hasImage', details.hasImage)}`
    case C.ACTION_UPDATE_INSPECTION_RESULT:
      return `更新分析结果，报告 ID：${formatDetailValue('id', details.id)}`
    case C.ACTION_DELETE_REPORT:
      return `删除排查报告，报告 ID：${formatDetailValue('id', details.id)}`
    case C.ACTION_UPDATE_ENTERPRISE:
      return `更新企业信息：${formatDetailValue('name', details.name)}`
    case C.ACTION_ADMIN_EXPORT_ENTERPRISES:
      return `导出企业数据 ${formatDetailValue('count', details.count)} 条，文件：${formatDetailValue('file', details.file)}`
    case C.ACTION_ADMIN_UPDATE_ENTERPRISE_PROFILE:
      return `更新企业档案，企业 ID：${formatDetailValue('id', details.id)}，名称：${formatDetailValue('name', details.name)}`
    case C.ACTION_ADMIN_ADD_KNOWLEDGE:
      return `新增知识文档，条目 ID：${formatDetailValue('id', details.id)}，标题：${formatDetailValue('title', details.title)}，分类：${formatDetailValue('category_name', details.category_name)}`
    case C.ACTION_ADMIN_UPDATE_KNOWLEDGE:
      return `更新知识文档，条目 ID：${formatDetailValue('id', details.id)}，标题：${formatDetailValue('title', details.title)}，替换文件：${formatDetailValue('replaced_file', details.replaced_file)}`
    case C.ACTION_ADMIN_ARCHIVE_KNOWLEDGE:
      return `归档知识文档，条目 ID：${formatDetailValue('id', details.id)}，标题：${formatDetailValue('title', details.title)}`
    case C.ACTION_ADMIN_BATCH_ARCHIVE_KNOWLEDGE:
      return `批量归档知识文档，数量：${formatDetailValue('archived_count', details.archived_count)}`
    case C.ACTION_ADMIN_ADD_KNOWLEDGE_CATEGORY:
      return `新增知识分类，分类 ID：${formatDetailValue('id', details.id)}，名称：${formatDetailValue('name', details.name)}`
    case C.ACTION_ADMIN_UPDATE_KNOWLEDGE_CATEGORY:
      return `更新知识分类，分类 ID：${formatDetailValue('id', details.id)}，名称：${formatDetailValue('name', details.name)}`
    case C.ACTION_ADMIN_DELETE_KNOWLEDGE_CATEGORY:
      return `删除知识分类，分类 ID：${formatDetailValue('id', details.id)}，名称：${formatDetailValue('name', details.name)}`
    case C.ACTION_ADMIN_ADD_REPORT_TEMPLATE:
      return `新增报告模板，模板 ID：${formatDetailValue('id', details.id)}，名称：${formatDetailValue('name', details.name)}，默认模板：${formatDetailValue('is_default', details.is_default)}`
    case C.ACTION_ADMIN_UPDATE_REPORT_TEMPLATE:
      return `更新报告模板，模板 ID：${formatDetailValue('id', details.id)}，名称：${formatDetailValue('name', details.name)}，替换文件：${formatDetailValue('replaced_file', details.replaced_file)}`
    case C.ACTION_ADMIN_DELETE_REPORT_TEMPLATE:
      return `删除报告模板，模板 ID：${formatDetailValue('id', details.id)}，名称：${formatDetailValue('name', details.name)}`
    case C.ACTION_ADMIN_SET_REPORT_TEMPLATE_DEFAULT:
      return `设为默认模板，模板 ID：${formatDetailValue('id', details.id)}，名称：${formatDetailValue('name', details.name)}`
    default:
      return formatObjectDetails(details)
  }
}

/** 将数据库日志记录映射为页面展示结构 */
const mapLogRow = (row) => {
  const actionMeta = getActionMeta(row.action)
  const details = parseDetails(row.details)
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    username: row.username || '未知用户',
    role: formatRoleLabel(row.role),
    role_code: row.role || null,
    action: actionMeta.label,
    action_code: row.action,
    module: actionMeta.module,
    details: formatDetails(row.action, details),
    details_raw: details,
    ip_address: row.ip_address || null,
    created_at: row.created_at,
  }
}

/** 执行通用日志查询并统一格式化 */
const queryLogs = async (whereSql = '', params = []) => {
  const [rows] = await db.execute(
    `SELECT
       l.id,
       l.user_id,
       l.action,
       l.details,
       l.ip_address,
       DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
       u.username,
       u.role
     FROM action_logs l
     JOIN users u ON l.user_id = u.id
     ${whereSql}
     ORDER BY l.created_at DESC
     LIMIT ${C.LOG_QUERY_LIMIT}`,
    params
  )
  return rows.map(mapLogRow)
}

const logDal = {
  /** 写入操作日志 */
  async logAction(userId, action, details, ipAddress = null, executor = db) {
    const [res] = await executor.execute(
      'INSERT INTO action_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId, action, JSON.stringify(details), ipAddress]
    )
    return res.insertId
  },

  /** 查询管理员日志列表，返回页面可直接展示的数据 */
  async findAll() {
    return await queryLogs()
  },

  /** 按用户查询日志，保持与管理员列表一致的展示结构 */
  async findByUserId(userId) {
    return await queryLogs('WHERE l.user_id = ?', [userId])
  },
}

module.exports = logDal
