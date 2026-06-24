import { computed, ref } from 'vue'
import { createDefaultUserForm, permOptions } from './useUserManagement'

/**
 * 创建用户新增、编辑、权限和状态管理逻辑。
 * 当前业务中检查员不再绑定内部企业/部门，负责客户企业通过企业档案分配关系维护。
 * @param {Object} options 页面传入的接口方法
 */
export const useUserEditor = ({
  postAdmin,
  currentAdmin,
  fetchUsers,
  showRequestError
}) => {
  /** 用户弹窗显示状态 */
  const showModal = ref(false)
  /** 当前是否处于编辑模式 */
  const isEdit = ref(false)
  /** 密码可见状态 */
  const showPwd = ref(false)
  /** 当前用户表单 */
  const form = ref(createDefaultUserForm())

  /** 当前是否已选择全部功能权限 */
  const allChecked = computed(() => permOptions.every(item => form.value.perms[item.key]))

  /** 打开新增用户弹窗 */
  const openAddModal = () => {
    isEdit.value = false
    showPwd.value = false
    form.value = createDefaultUserForm()
    showModal.value = true
  }

  /** 打开编辑用户弹窗 */
  const openEditModal = (item) => {
    isEdit.value = true
    showPwd.value = false
    form.value = {
      id: item.id,
      username: item.username,
      password: '',
      role: item.role,
      department_id: null,
      perms: { ...(item.permissions || {}) }
    }
    showModal.value = true
  }

  /** 关闭用户编辑弹窗 */
  const closeModal = () => {
    showModal.value = false
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
    const username = String(form.value.username || '').trim()
    if (!username) {
      uni.showToast({ title: '请输入用户名', icon: 'none' })
      return
    }
    if (!isEdit.value && !form.value.password) {
      uni.showToast({ title: '请输入初始密码', icon: 'none' })
      return
    }

    try {
      const payload = {
        username,
        password: form.value.password,
        role: form.value.role,
        department_id: null,
        permissions: form.value.role === 'user' ? { ...form.value.perms } : {}
      }
      if (isEdit.value) {
        await postAdmin('/api/admin/users/update', { target_id: form.value.id, ...payload })
      } else {
        await postAdmin('/api/admin/users/add', payload)
      }
      await fetchUsers()
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
          department_id: null,
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
      uni.showToast({ title: '不能禁用当前登录账号', icon: 'none' })
      return
    }
    uni.showModal({
      title: '确认禁用',
      content: `确定禁用用户「${item.username}」吗？`,
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
    form,
    allChecked,
    openAddModal,
    openEditModal,
    closeModal,
    toggleAll,
    saveUser,
    handleEnable,
    handleDelete
  }
}