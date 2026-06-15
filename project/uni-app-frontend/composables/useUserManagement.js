import { computed } from 'vue'

/** 角色筛选配置 */
export const roleFilters = [
  { key: 'all', label: '全部用户' },
  { key: 'user', label: '检查员' },
  { key: 'admin', label: '管理员' }
]

/** 用户状态筛选配置 */
export const statusFilters = [
  { key: 'all', label: '全部状态' },
  { key: 'active', label: '正常' },
  { key: 'disabled', label: '已禁用' }
]

/** 功能权限配置 */
export const permOptions = [
  { key: 'enterprise:manage', label: '企业信息管理', description: '录入、编辑和维护企业资料' },
  { key: 'image:manage', label: '隐患图片管理', description: '上传、查看、删除和标注图片' },
  { key: 'analysis:run', label: 'AI 智能分析', description: '提交隐患并查看智能分析结果' },
  { key: 'report:download', label: '报告生成下载', description: '生成并下载 Word、PDF 报告' },
  { key: 'knowledge:view', label: '知识库查阅', description: '搜索并查看安全生产法规条款' }
]

/** 创建空白用户表单，避免新增和重置逻辑重复维护字段 */
export const createDefaultUserForm = () => ({
  id: null,
  username: '',
  password: '',
  role: 'user',
  enterprise_id: null,
  department_id: null,
  perms: {}
})

/**
 * 创建用户列表展示逻辑
 * @param {Object} state 页面传入的响应式状态
 */
export const useUserListPresentation = ({ userList, keyword, activeRole, activeStatus }) => {
  /** 根据列表计算用户概览数据 */
  const summaryCards = computed(() => [
    { key: 'all', label: '用户总数', value: userList.value.length, symbol: '♙', theme: 'blue' },
    { key: 'user', label: '检查员', value: userList.value.filter(item => item.role === 'user').length, symbol: '◇', theme: 'green' },
    { key: 'admin', label: '管理员', value: userList.value.filter(item => item.role === 'admin').length, symbol: '▣', theme: 'purple' },
    { key: 'disabled', label: '已禁用', value: userList.value.filter(item => item.status === 'disabled').length, symbol: '⊘', theme: 'red' }
  ])

  /** 根据关键词、角色和状态筛选用户 */
  const filteredUsers = computed(() => {
    /** 标准化后的搜索关键词 */
    const searchText = keyword.value.trim().toLowerCase()
    return userList.value.filter((item) => {
      /** 当前用户是否符合所有筛选条件 */
      const roleMatched = activeRole.value === 'all' || item.role === activeRole.value
      const statusMatched = activeStatus.value === 'all' || item.status === activeStatus.value
      const textMatched = !searchText
        || item.username.toLowerCase().includes(searchText)
        || (item.enterprise_name || '').toLowerCase().includes(searchText)
        || (item.department_name || '').toLowerCase().includes(searchText)
      return roleMatched && statusMatched && textMatched
    })
  })

  return { summaryCards, filteredUsers }
}
