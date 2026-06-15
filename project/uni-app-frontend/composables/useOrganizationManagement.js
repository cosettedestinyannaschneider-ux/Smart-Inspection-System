import { computed, ref } from 'vue'

/**
 * 创建企业与部门组织管理逻辑
 * @param {Object} options 页面传入的接口方法与共享状态
 */
export const useOrganizationManagement = ({
  postAdmin,
  userList,
  getUserForm,
  fetchUsers,
  showRequestError,
  closeUserOrganizationOptions
}) => {
  /** 延迟获取用户编辑表单，避免组织与用户 composable 互相初始化依赖 */
  const currentUserForm = () => getUserForm().value
  /** 企业选择列表 */
  const enterpriseList = ref([])
  /** 部门选择列表 */
  const deptList = ref([])
  /** 企业与部门管理弹窗显示状态 */
  const showDeptModal = ref(false)
  /** 组织管理弹窗当前选中的企业 ID */
  const managedEnterpriseId = ref(null)
  /** 企业新增与编辑表单 */
  const enterpriseForm = ref({ id: null, name: '' })
  /** 部门新增与编辑表单 */
  const departmentForm = ref({ id: null, name: '' })
  /** 企业或部门删除确认状态 */
  const organizationDeleteConfirm = ref({
    visible: false,
    type: '',
    target: null,
    content: '',
    error: ''
  })

  /** 组织管理弹窗当前选中的企业 */
  const managedEnterprise = computed(() => {
    return enterpriseList.value.find(item => item.id === managedEnterpriseId.value) || null
  })

  /** 组织管理弹窗当前企业下的部门 */
  const managedDepartments = computed(() => {
    return deptList.value.filter(item => item.enterprise_id === managedEnterpriseId.value)
  })

  /** 加载真实企业组织列表 */
  const fetchEnterprises = async () => {
    try {
      const response = await postAdmin('/api/admin/enterprises/list')
      enterpriseList.value = Array.isArray(response.data) ? response.data : []
      if (!enterpriseList.value.some(item => item.id === managedEnterpriseId.value)) {
        managedEnterpriseId.value = enterpriseList.value[0]?.id || null
      }
    } catch (error) {
      showRequestError(error)
    }
  }

  /** 加载真实部门列表 */
  const fetchDepartments = async () => {
    try {
      const response = await postAdmin('/api/admin/departments/list')
      deptList.value = Array.isArray(response.data) ? response.data : []
    } catch (error) {
      showRequestError(error)
    }
  }

  /** 清空企业编辑表单 */
  const resetEnterpriseForm = () => {
    enterpriseForm.value = { id: null, name: '' }
  }

  /** 清空部门编辑表单 */
  const resetDepartmentForm = () => {
    departmentForm.value = { id: null, name: '' }
  }

  /** 打开企业与部门管理弹窗 */
  const openDepartmentModal = () => {
    closeUserOrganizationOptions()
    if (currentUserForm().enterprise_id) managedEnterpriseId.value = currentUserForm().enterprise_id
    else if (!managedEnterpriseId.value) managedEnterpriseId.value = enterpriseList.value[0]?.id || null
    resetEnterpriseForm()
    resetDepartmentForm()
    showDeptModal.value = true
  }

  /** 关闭企业与部门管理弹窗 */
  const closeDepartmentModal = () => {
    showDeptModal.value = false
    resetEnterpriseForm()
    resetDepartmentForm()
  }

  /** 选择组织管理弹窗中需要维护的企业 */
  const selectManagedEnterprise = (enterprise) => {
    managedEnterpriseId.value = enterprise.id
    resetDepartmentForm()
  }

  /** 保存企业组织名称 */
  const saveEnterprise = async () => {
    /** 去除首尾空格后的企业名称 */
    const enterpriseName = enterpriseForm.value.name.trim()
    if (!enterpriseName) {
      uni.showToast({ title: '请输入企业名称', icon: 'none' })
      return
    }
    /** 是否存在同名企业 */
    const duplicated = enterpriseList.value.some(item => item.name === enterpriseName && item.id !== enterpriseForm.value.id)
    if (duplicated) {
      uni.showToast({ title: '企业名称已存在', icon: 'none' })
      return
    }
    try {
      if (enterpriseForm.value.id) {
        await postAdmin('/api/admin/enterprises/update', { id: enterpriseForm.value.id, name: enterpriseName })
      } else {
        const response = await postAdmin('/api/admin/enterprises/add', { name: enterpriseName })
        managedEnterpriseId.value = response.id
      }
      await Promise.all([fetchEnterprises(), fetchUsers()])
      uni.showToast({ title: enterpriseForm.value.id ? '企业名称已更新' : '企业已新增', icon: 'success' })
      resetEnterpriseForm()
    } catch (error) {
      showRequestError(error)
    }
  }

  /** 将指定企业载入重命名表单 */
  const editEnterprise = (enterprise) => {
    enterpriseForm.value = { id: enterprise.id, name: enterprise.name }
  }

  /** 打开企业或部门删除确认层 */
  const openOrganizationDeleteConfirm = (type, target) => {
    organizationDeleteConfirm.value = {
      visible: true,
      type,
      target,
      content: type === 'enterprise'
        ? `确定删除企业「${target.name}」吗？`
        : `确定删除部门「${target.name}」吗？`,
      error: ''
    }
  }

  /** 关闭企业或部门删除确认层 */
  const closeOrganizationDeleteConfirm = () => {
    organizationDeleteConfirm.value = { visible: false, type: '', target: null, content: '', error: '' }
  }

  /** 确认删除企业或部门，并展示后端关联保护提示 */
  const confirmOrganizationDelete = async () => {
    /** 当前等待删除的组织对象 */
    const confirmState = organizationDeleteConfirm.value
    if (!confirmState.target) return
    try {
      if (confirmState.type === 'enterprise') {
        await postAdmin('/api/admin/enterprises/delete', { id: confirmState.target.id })
        if (currentUserForm().enterprise_id === confirmState.target.id) {
          currentUserForm().enterprise_id = null
          currentUserForm().department_id = null
        }
        await Promise.all([fetchEnterprises(), fetchDepartments(), fetchUsers()])
        uni.showToast({ title: '企业已删除', icon: 'success' })
      } else {
        await postAdmin('/api/admin/departments/delete', { id: confirmState.target.id })
        if (currentUserForm().department_id === confirmState.target.id) currentUserForm().department_id = null
        await Promise.all([fetchDepartments(), fetchEnterprises(), fetchUsers()])
        uni.showToast({ title: '部门已删除', icon: 'success' })
      }
      closeOrganizationDeleteConfirm()
    } catch (error) {
      organizationDeleteConfirm.value.error = error?.message || '删除失败'
      showRequestError(error)
    }
  }

  /** 删除企业，由后端执行关联数据保护校验 */
  const deleteEnterprise = (enterprise) => {
    openOrganizationDeleteConfirm('enterprise', enterprise)
  }

  /** 保存所属部门 */
  const saveDepartment = async () => {
    if (!managedEnterpriseId.value) {
      uni.showToast({ title: '请先选择企业', icon: 'none' })
      return
    }
    /** 去除首尾空格后的部门名称 */
    const departmentName = departmentForm.value.name.trim()
    if (!departmentName) {
      uni.showToast({ title: '请输入部门名称', icon: 'none' })
      return
    }
    /** 是否存在同名部门 */
    const duplicated = deptList.value.some(item =>
      item.enterprise_id === managedEnterpriseId.value
      && item.name === departmentName
      && item.id !== departmentForm.value.id
    )
    if (duplicated) {
      uni.showToast({ title: '部门名称已存在', icon: 'none' })
      return
    }
    try {
      const payload = { enterprise_id: managedEnterpriseId.value, name: departmentName }
      if (departmentForm.value.id) {
        await postAdmin('/api/admin/departments/update', { id: departmentForm.value.id, ...payload })
      } else {
        await postAdmin('/api/admin/departments/add', payload)
      }
      await Promise.all([fetchDepartments(), fetchEnterprises(), fetchUsers()])
      uni.showToast({ title: departmentForm.value.id ? '部门名称已更新' : '部门已新增', icon: 'success' })
      resetDepartmentForm()
    } catch (error) {
      showRequestError(error)
    }
  }

  /** 将指定部门载入重命名表单 */
  const editDepartment = (department) => {
    departmentForm.value = { id: department.id, name: department.name }
  }

  /** 获取指定部门当前分配的有效用户数量 */
  const getDepartmentUserCount = (departmentId) => {
    return userList.value.filter(item => item.department_id === departmentId && item.status !== 'disabled').length
  }

  /** 删除所属部门，由后端执行用户关联保护校验 */
  const deleteDepartment = (department) => {
    openOrganizationDeleteConfirm('department', department)
  }

  return {
    enterpriseList,
    deptList,
    showDeptModal,
    managedEnterpriseId,
    enterpriseForm,
    departmentForm,
    organizationDeleteConfirm,
    managedEnterprise,
    managedDepartments,
    fetchEnterprises,
    fetchDepartments,
    openDepartmentModal,
    closeDepartmentModal,
    resetEnterpriseForm,
    resetDepartmentForm,
    selectManagedEnterprise,
    saveEnterprise,
    editEnterprise,
    closeOrganizationDeleteConfirm,
    confirmOrganizationDelete,
    deleteEnterprise,
    saveDepartment,
    editDepartment,
    getDepartmentUserCount,
    deleteDepartment
  }
}
