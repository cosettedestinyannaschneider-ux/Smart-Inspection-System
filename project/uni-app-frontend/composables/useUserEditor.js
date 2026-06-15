import { computed, ref } from 'vue'
import { createDefaultUserForm, permOptions } from './useUserManagement'

/**
 * 创建用户新增、编辑、权限和状态管理逻辑
 * @param {Object} options 页面传入的接口方法与组织列表
 */
export const useUserEditor = ({
  postAdmin,
  currentAdmin,
  enterpriseList,
  deptList,
  fetchUsers,
  fetchEnterprises,
  showRequestError
}) => {
  /** 用户弹窗显示状态 */
  const showModal = ref(false)
  /** 当前是否处于编辑模式 */
  const isEdit = ref(false)
  /** 密码可见状态 */
  const showPwd = ref(false)
  /** 部门选择列表显示状态 */
  const showDeptOptions = ref(false)
  /** 企业选择列表显示状态 */
  const showEnterpriseOptions = ref(false)
  /** 当前用户表单 */
  const form = ref(createDefaultUserForm())

  /** 当前选中的企业名称 */
  const selectedEnterpriseName = computed(() => {
    /** 当前表单已选择的企业 */
    const enterprise = enterpriseList.value.find(item => item.id === form.value.enterprise_id)
    return enterprise ? enterprise.name : ''
  })

  /** 当前企业可选择的部门列表 */
  const availableDepartments = computed(() => {
    return deptList.value.filter(item => item.enterprise_id === form.value.enterprise_id)
  })

  /** 当前选中的部门名称 */
  const selectedDeptName = computed(() => {
    /** 当前表单已选择的部门 */
    const department = deptList.value.find(item => item.id === form.value.department_id)
    return department ? department.name : ''
  })

  /** 当前是否已选择全部功能权限 */
  const allChecked = computed(() => permOptions.every(item => form.value.perms[item.key]))

  /** 关闭用户表单中的企业和部门下拉选项 */
  const closeUserOrganizationOptions = () => {
    showEnterpriseOptions.value = false
    showDeptOptions.value = false
  }

  /** 打开新增用户弹窗 */
  const openAddModal = () => {
    isEdit.value = false
    showPwd.value = false
    closeUserOrganizationOptions()
    form.value = createDefaultUserForm()
    showModal.value = true
  }

  /** 打开编辑用户弹窗 */
  const openEditModal = (item) => {
    isEdit.value = true
    showPwd.value = false
    showDeptOptions.value = false
    form.value = {
      id: item.id,
      username: item.username,
      password: '',
      role: item.role,
      enterprise_id: item.enterprise_id || null,
      department_id: item.department_id || null,
      perms: { ...(item.permissions || {}) }
    }
    showModal.value = true
  }

  /** 关闭用户编辑弹窗 */
  const closeModal = () => {
    closeUserOrganizationOptions()
    showModal.value = false
  }

  /** 展开或收起所属企业选择列表 */
  const toggleEnterpriseOptions = () => {
    showDeptOptions.value = false
    showEnterpriseOptions.value = !showEnterpriseOptions.value
  }

  /** 选择用户所属企业，并清空原部门避免跨企业关联 */
  const selectEnterprise = (enterprise) => {
    form.value.enterprise_id = enterprise ? enterprise.id : null
    form.value.department_id = null
    showEnterpriseOptions.value = false
  }

  /** 展开或收起所属部门选择列表 */
  const toggleDepartmentOptions = () => {
    if (!form.value.enterprise_id) {
      uni.showToast({ title: '请先选择所属企业', icon: 'none' })
      return
    }
    showEnterpriseOptions.value = false
    showDeptOptions.value = !showDeptOptions.value
  }

  /** 选择用户所属部门 */
  const selectDepartment = (department) => {
    form.value.department_id = department ? department.id : null
    showDeptOptions.value = false
  }

  /** 全选或取消全部功能权限 */
  const toggleAll = () => {
    /** 下一次全选状态 */
    const nextChecked = !allChecked.value
    permOptions.forEach(item => {
      form.value.perms[item.key] = nextChecked
    })
  }

  /** 保存用户及权限，后端在同一事务内完成持久化 */
  const saveUser = async () => {
    if (!form.value.username.trim()) {
      uni.showToast({ title: '请输入用户名', icon: 'none' })
      return
    }
    if (!isEdit.value && !form.value.password) {
      uni.showToast({ title: '请输入初始密码', icon: 'none' })
      return
    }
    if (form.value.role === 'user' && !form.value.department_id) {
      uni.showToast({ title: '普通用户必须选择所属部门', icon: 'none' })
      return
    }
    if (form.value.department_id) {
      /** 当前选择的部门 */
      const department = deptList.value.find(item => item.id === form.value.department_id)
      if (!department || department.enterprise_id !== form.value.enterprise_id) {
        uni.showToast({ title: '所属部门与企业不匹配，请重新选择', icon: 'none' })
        return
      }
    }

    try {
      const payload = {
        username: form.value.username.trim(),
        password: form.value.password,
        role: form.value.role,
        department_id: form.value.department_id,
        permissions: form.value.role === 'user' ? { ...form.value.perms } : {}
      }
      if (isEdit.value) {
        await postAdmin('/api/admin/users/update', { target_id: form.value.id, ...payload })
      } else {
        await postAdmin('/api/admin/users/add', payload)
      }
      await Promise.all([fetchUsers(), fetchEnterprises()])
      uni.showToast({ title: isEdit.value ? '用户信息已更新' : '用户已创建', icon: 'success' })
      closeModal()
    } catch (error) {
      showRequestError(error)
    }
  }

  /** 重新启用已禁用用户 */
  const handleEnable = (item) => {
    uni.showModal({
      title: '确认启用',
      content: `确定重新启用用户「${item.username}」吗？`,
      success: (result) => {
        if (!result.confirm) return
        postAdmin('/api/admin/users/update', {
          target_id: item.id,
          username: item.username,
          password: '',
          role: item.role,
          department_id: item.department_id,
          status: 'active',
          permissions: { ...(item.permissions || {}) }
        })
          .then(async () => {
            await fetchUsers()
            uni.showToast({ title: '用户已启用', icon: 'success' })
          })
          .catch(showRequestError)
      }
    })
  }

  /** 禁用用户，后端同时保护当前登录管理员 */
  const handleDelete = (item) => {
    if (Number(item.id) === Number(currentAdmin.value.id)) {
      uni.showToast({ title: '不能删除当前登录账号', icon: 'none' })
      return
    }
    uni.showModal({
      title: '确认删除',
      content: `确定删除用户「${item.username}」吗？`,
      success: (result) => {
        if (!result.confirm) return
        postAdmin('/api/admin/users/delete', { target_id: item.id })
          .then(async () => {
            await fetchUsers()
            uni.showToast({ title: '用户已禁用', icon: 'success' })
          })
          .catch(showRequestError)
      }
    })
  }

  return {
    showModal,
    isEdit,
    showPwd,
    showDeptOptions,
    showEnterpriseOptions,
    form,
    selectedEnterpriseName,
    availableDepartments,
    selectedDeptName,
    allChecked,
    closeUserOrganizationOptions,
    openAddModal,
    openEditModal,
    closeModal,
    toggleEnterpriseOptions,
    selectEnterprise,
    toggleDepartmentOptions,
    selectDepartment,
    toggleAll,
    saveUser,
    handleEnable,
    handleDelete
  }
}
