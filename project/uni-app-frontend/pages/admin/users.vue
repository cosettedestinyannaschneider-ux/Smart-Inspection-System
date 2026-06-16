<template>
  <AdminShell active-key="users" title="用户管理" wide @ready="handleAdminReady">
    <!-- 页面标题与主要操作 -->
    <view class="page-heading">
      <view>
        <text class="heading-title">用户管理</text>
        <text class="heading-desc">管理检查员账号、所属企业部门和功能权限</text>
      </view>
      <view class="primary-btn" @click="openAddModal">
        <text class="primary-icon">＋</text>
        <text>添加用户</text>
      </view>
    </view>

    <!-- 用户统计概览 -->
    <view class="summary-grid">
      <view v-for="item in summaryCards" :key="item.key" class="summary-card">
        <view class="summary-icon" :class="`theme-${item.theme}`">{{ item.symbol }}</view>
        <view class="summary-info">
          <text class="summary-value">{{ item.value }}</text>
          <text class="summary-label">{{ item.label }}</text>
        </view>
      </view>
    </view>

    <!-- 搜索与角色筛选 -->
    <view class="filter-panel">
      <view class="search-box">
        <text class="search-symbol">⌕</text>
        <input v-model="keyword" class="search-input" placeholder="搜索用户名、企业或部门" />
        <text v-if="keyword" class="clear-search" @click="keyword = ''">×</text>
      </view>
      <view class="role-filters">
        <view
          v-for="item in roleFilters"
          :key="item.key"
          class="filter-item"
          :class="{ active: activeRole === item.key }"
          @click="activeRole = item.key"
        >
          {{ item.label }}
        </view>
      </view>
      <view class="status-filters">
        <view
          v-for="item in statusFilters"
          :key="item.key"
          class="filter-item"
          :class="{ active: activeStatus === item.key }"
          @click="activeStatus = item.key"
        >
          {{ item.label }}
        </view>
      </view>
    </view>

    <!-- H5 宽屏用户表格 -->
    <view class="desktop-table-panel">
      <view class="table-header">
        <text class="col-user">用户</text>
        <text class="col-role">角色</text>
        <text class="col-dept">所属企业 / 部门</text>
        <text class="col-status">状态</text>
        <text class="col-date">注册时间</text>
        <text class="col-action">操作</text>
      </view>
      <view v-if="filteredUsers.length === 0" class="empty-state">未找到符合条件的用户</view>
      <view v-for="item in filteredUsers" :key="item.id" class="table-row">
        <view class="col-user user-cell">
          <view class="user-avatar">{{ item.username.slice(0, 1) }}</view>
          <view class="user-text">
            <text class="user-name">{{ item.username }}</text>
            <text class="user-id">用户 ID：{{ item.id }}</text>
          </view>
        </view>
        <view class="col-role">
          <text class="role-tag" :class="item.role === 'admin' ? 'tag-admin' : 'tag-user'">
            {{ item.role === 'admin' ? '管理员' : '检查员' }}
          </text>
        </view>
        <view class="col-dept org-text">
          <text class="enterprise-text">{{ item.enterprise_name || '未分配企业' }}</text>
          <text class="dept-text">{{ item.department_name || '未分配部门' }}</text>
        </view>
        <view class="col-status">
          <text class="status-tag" :class="item.status === 'disabled' ? 'tag-disabled' : 'tag-active'">
            {{ item.status === 'disabled' ? '已禁用' : '正常' }}
          </text>
        </view>
        <text class="col-date date-text">{{ item.created_at || '-' }}</text>
        <view class="col-action action-group">
          <text class="action-link" @click="openEditModal(item)">编辑</text>
          <text v-if="item.status === 'disabled'" class="action-link" @click="handleEnable(item)">启用</text>
          <text v-else class="action-link dangerous" @click="handleDelete(item)">禁用</text>
        </view>
      </view>
    </view>

    <!-- 微信小程序与小屏 H5 用户卡片 -->
    <view class="mobile-user-list">
      <view v-if="filteredUsers.length === 0" class="empty-state">未找到符合条件的用户</view>
      <view v-for="item in filteredUsers" :key="item.id" class="mobile-user-card">
        <view class="mobile-card-head">
          <view class="user-avatar">{{ item.username.slice(0, 1) }}</view>
          <view class="user-text">
            <view class="mobile-name-row">
              <text class="user-name">{{ item.username }}</text>
              <text class="role-tag" :class="item.role === 'admin' ? 'tag-admin' : 'tag-user'">
                {{ item.role === 'admin' ? '管理员' : '检查员' }}
              </text>
            </view>
            <text class="user-id">用户 ID：{{ item.id }}</text>
          </view>
        </view>
        <view class="mobile-meta-row">
          <text class="meta-label">所属企业</text>
          <text class="meta-value">{{ item.enterprise_name || '未分配企业' }}</text>
        </view>
        <view class="mobile-meta-row">
          <text class="meta-label">所属部门</text>
          <text class="meta-value">{{ item.department_name || '未分配部门' }}</text>
        </view>
        <view class="mobile-meta-row">
          <text class="meta-label">账号状态</text>
          <text class="meta-value" :class="{ 'status-disabled-text': item.status === 'disabled' }">{{ item.status === 'disabled' ? '已禁用' : '正常' }}</text>
        </view>
        <view class="mobile-meta-row">
          <text class="meta-label">注册时间</text>
          <text class="meta-value">{{ item.created_at || '-' }}</text>
        </view>
        <view class="mobile-actions">
          <view class="mobile-action-btn" @click="openEditModal(item)">编辑用户</view>
          <view v-if="item.status === 'disabled'" class="mobile-action-btn" @click="handleEnable(item)">启用账号</view>
          <view v-else class="mobile-action-btn dangerous" @click="handleDelete(item)">禁用账号</view>
        </view>
      </view>
    </view>

    <UserEditorModal
      :visible="showModal"
      :is-edit="isEdit"
      :show-pwd="showPwd"
      :show-enterprise-options="showEnterpriseOptions"
      :show-dept-options="showDeptOptions"
      :form="form"
      :enterprise-list="enterpriseList"
      :available-departments="availableDepartments"
      :selected-enterprise-name="selectedEnterpriseName"
      :selected-dept-name="selectedDeptName"
      :all-checked="allChecked"
      :perm-options="permOptions"
      @close="closeModal"
      @save="saveUser"
      @toggle-password="showPwd = !showPwd"
      @open-organization="openDepartmentModal"
      @toggle-enterprises="toggleEnterpriseOptions"
      @select-enterprise="selectEnterprise"
      @toggle-departments="toggleDepartmentOptions"
      @select-department="selectDepartment"
      @toggle-all="toggleAll"
    />

    <OrganizationManagementModal
      :visible="showDeptModal"
      :enterprise-list="enterpriseList"
      :managed-enterprise-id="managedEnterpriseId"
      :managed-enterprise="managedEnterprise"
      :managed-departments="managedDepartments"
      :enterprise-form="enterpriseForm"
      :department-form="departmentForm"
      :get-department-user-count="getDepartmentUserCount"
      @close="closeDepartmentModal"
      @edit-enterprise="editEnterprise"
      @delete-enterprise="deleteEnterprise"
      @reset-enterprise="resetEnterpriseForm"
      @save-enterprise="saveEnterprise"
      @select-enterprise="selectManagedEnterprise"
      @reset-department="resetDepartmentForm"
      @save-department="saveDepartment"
      @edit-department="editDepartment"
      @delete-department="deleteDepartment"
    />

    <OrganizationDeleteConfirm
      :state="organizationDeleteConfirm"
      @close="closeOrganizationDeleteConfirm"
      @confirm="confirmOrganizationDelete"
    />
  </AdminShell>
</template>

<script setup>
import { ref } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import UserEditorModal from '../../components/admin/users/UserEditorModal.vue'
import OrganizationManagementModal from '../../components/admin/users/OrganizationManagementModal.vue'
import OrganizationDeleteConfirm from '../../components/admin/users/OrganizationDeleteConfirm.vue'
import { createAdminOrganizationApi } from '../../common/api/admin-organization-api'
import {
  permOptions,
  roleFilters,
  statusFilters,
  useUserListPresentation
} from '../../composables/useUserManagement'
import { useOrganizationManagement } from '../../composables/useOrganizationManagement'
import { useUserEditor } from '../../composables/useUserEditor'

/** 当前已登录管理员 */
const user = ref({})
/** 用户列表数据 */
const userList = ref([])
/** 用户搜索关键词 */
const keyword = ref('')
/** 当前角色筛选条件 */
const activeRole = ref('all')
/** 调用阶段 B 管理员接口，统一通过 Bearer Token 识别管理员身份 */
const { postAdmin } = createAdminOrganizationApi()

/** 展示接口错误提示 */
const showRequestError = (error) => {
  uni.showToast({ title: error?.message || '操作失败', icon: 'none' })
}

/** 企业与部门组织管理状态和操作 */
const {
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
} = useOrganizationManagement({
  postAdmin,
  userList,
  getUserForm: () => form,
  fetchUsers: (...args) => fetchUsers(...args),
  showRequestError,
  closeUserOrganizationOptions: (...args) => closeUserOrganizationOptions(...args)
})

/** 用户新增、编辑、权限和启用禁用状态与操作 */
const {
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
} = useUserEditor({
  postAdmin,
  currentAdmin: user,
  enterpriseList,
  deptList,
  fetchUsers: (...args) => fetchUsers(...args),
  fetchEnterprises,
  showRequestError
})

/** 当前状态筛选条件 */
const activeStatus = ref('all')

/** 用户列表概览与筛选逻辑 */
const { summaryCards, filteredUsers } = useUserListPresentation({
  userList,
  keyword,
  activeRole,
  activeStatus
})

/** 公共管理员框架校验完成后加载页面数据 */
const handleAdminReady = (admin) => {
  user.value = admin
  fetchUsers()
  fetchEnterprises()
  fetchDepartments()
}

/** 加载真实用户列表 */
const fetchUsers = async () => {
  try {
    const response = await postAdmin('/api/admin/users/list')
    userList.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    showRequestError(error)
  }
}

</script>

<style scoped>
/* 页面标题与操作区域 */
.page-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.heading-title { display: block; color: #172541; font-size: 28px; font-weight: 700; }
.heading-desc { display: block; margin-top: 6px; color: #8b98aa; font-size: 14px; }
.primary-btn { height: 42px; padding: 0 18px; display: flex; align-items: center; gap: 6px; border-radius: 10px; background: #1677ff; color: #fff; font-size: 14px; box-shadow: 0 6px 16px rgba(22,119,255,.2); }
.primary-icon { font-size: 20px; }

/* 用户数据概览 */
.summary-grid { display: flex; gap: 16px; margin-bottom: 20px; }
.summary-card { flex: 1; padding: 18px 20px; display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; box-shadow: 0 4px 16px rgba(31,67,115,.04); }
.summary-icon { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; border-radius: 13px; color: #fff; font-size: 24px; font-weight: 700; }
.summary-info { display: flex; flex-direction: column; }
.summary-value { color: #172541; font-size: 26px; line-height: 1; font-weight: 700; }
.summary-label { margin-top: 7px; color: #8b98aa; font-size: 13px; }
.theme-blue { background: linear-gradient(145deg, #4d91ff, #2468ed); }
.theme-green { background: linear-gradient(145deg, #55d98d, #28bd6d); }
.theme-purple { background: linear-gradient(145deg, #a276ff, #7249ee); }
.theme-red { background: linear-gradient(145deg, #f77e7e, #e85555); }

/* 搜索与筛选面板 */
.filter-panel { margin-bottom: 20px; padding: 14px; display: flex; align-items: center; justify-content: space-between; gap: 18px; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; }
.search-box { flex: 1; max-width: 420px; height: 40px; padding: 0 12px; display: flex; align-items: center; gap: 8px; border: 1px solid #e5ebf3; border-radius: 10px; background: #f8fafe; box-sizing: border-box; }
.search-symbol { color: #91a0b5; font-size: 22px; }
.search-input { flex: 1; height: 38px; color: #273651; font-size: 14px; }
.clear-search { color: #99a6b8; font-size: 20px; }
.role-filters, .status-filters { display: flex; gap: 6px; }
.status-filters { margin-top: 8px; }
.filter-item { padding: 8px 14px; border-radius: 9px; color: #718096; font-size: 13px; }
.filter-item.active { background: #eaf3ff; color: #1677ff; font-weight: 600; }

/* H5 宽屏用户表格 */
.desktop-table-panel { overflow: hidden; background: #fff; border: 1px solid #edf1f7; border-radius: 14px; box-shadow: 0 4px 16px rgba(31,67,115,.04); }
.table-header, .table-row { display: flex; align-items: center; box-sizing: border-box; }
.table-header { min-height: 48px; padding: 0 20px; background: #f8fafe; color: #8b98aa; font-size: 13px; font-weight: 600; }
.table-row { min-height: 76px; padding: 10px 20px; border-top: 1px solid #edf1f7; }
.col-user { width: 25%; }
.col-role { width: 13%; }
.col-dept { width: 31%; }
.col-status { width: 10%; }
.col-date { width: 14%; }
.col-action { width: 13%; text-align: right; }
.status-tag { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; }
.tag-active { background: #e9f9f1; color: #17a66b; }
.tag-disabled { background: #fff0f1; color: #f05252; }
.status-disabled-text { color: #f05252; }
.user-cell { display: flex; align-items: center; gap: 11px; }
.user-avatar { width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: linear-gradient(145deg, #4d91ff, #2468ed); color: #fff; font-size: 17px; font-weight: 700; }
.user-text { min-width: 0; display: flex; flex-direction: column; }
.user-name { color: #1a2843; font-size: 15px; font-weight: 700; }
.user-id { margin-top: 3px; color: #a0acbc; font-size: 11px; }
.role-tag { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; }
.tag-admin { background: #f1ebff; color: #7048e8; }
.tag-user { background: #e8f4ff; color: #1677ff; }
.org-text { display: flex; flex-direction: column; }
.enterprise-text { color: #33425b; font-size: 13px; font-weight: 600; }
.dept-text { margin-top: 4px; color: #8d99aa; font-size: 12px; }
.date-text { color: #69778c; font-size: 13px; }
.action-group { display: flex; justify-content: flex-end; gap: 14px; }
.action-link { color: #1677ff; font-size: 13px; }
.action-link.dangerous { color: #f05252; }
.empty-state { padding: 70px 20px; color: #9aa6b7; font-size: 14px; text-align: center; }
.mobile-user-list { display: none; }

/* 微信小程序与小屏 H5 用户管理布局 */
@media screen and (max-width: 900px) {
  .page-heading { margin-bottom: 28rpx; }
  .heading-title { font-size: 34rpx; }
  .heading-desc { margin-top: 8rpx; font-size: 24rpx; }
  .primary-btn { height: 70rpx; padding: 0 24rpx; gap: 4rpx; border-radius: 14rpx; font-size: 25rpx; }
  .primary-icon { font-size: 32rpx; }
  .summary-grid { gap: 14rpx; margin-bottom: 24rpx; }
  .summary-card { padding: 20rpx 10rpx; flex-direction: column; gap: 10rpx; border-radius: 18rpx; }
  .summary-icon { width: 58rpx; height: 58rpx; border-radius: 16rpx; font-size: 30rpx; }
  .summary-info { align-items: center; }
  .summary-value { font-size: 36rpx; }
  .summary-label { margin-top: 7rpx; font-size: 22rpx; }
  .filter-panel { margin-bottom: 24rpx; padding: 18rpx; display: block; border-radius: 20rpx; }
  .search-box { max-width: none; height: 72rpx; padding: 0 18rpx; border-radius: 14rpx; }
  .search-symbol { font-size: 34rpx; }
  .search-input { height: 70rpx; font-size: 26rpx; }
  .clear-search { font-size: 34rpx; }
  .role-filters { margin-top: 16rpx; gap: 10rpx; }
  .filter-item { flex: 1; padding: 13rpx 8rpx; border-radius: 12rpx; font-size: 24rpx; text-align: center; }
  .desktop-table-panel { display: none; }
  .mobile-user-list { display: block; }
  .mobile-user-card { margin-bottom: 20rpx; padding: 26rpx; background: #fff; border: 1px solid #edf1f7; border-radius: 22rpx; box-shadow: 0 5rpx 18rpx rgba(31,67,115,.04); }
  .mobile-card-head { display: flex; align-items: center; padding-bottom: 22rpx; border-bottom: 1px solid #edf1f7; }
  .user-avatar { width: 72rpx; height: 72rpx; border-radius: 18rpx; font-size: 30rpx; }
  .user-text { flex: 1; margin-left: 20rpx; }
  .mobile-name-row { display: flex; align-items: center; gap: 14rpx; }
  .user-name { font-size: 29rpx; }
  .user-id { margin-top: 7rpx; font-size: 21rpx; }
  .role-tag { padding: 5rpx 14rpx; font-size: 20rpx; }
  .mobile-meta-row { margin-top: 18rpx; display: flex; justify-content: space-between; gap: 20rpx; }
  .meta-label { color: #9aa6b7; font-size: 23rpx; }
  .meta-value { color: #536179; font-size: 23rpx; text-align: right; }
  .mobile-actions { margin-top: 22rpx; padding-top: 20rpx; display: flex; gap: 14rpx; border-top: 1px solid #edf1f7; }
  .mobile-action-btn { flex: 1; height: 64rpx; display: flex; align-items: center; justify-content: center; border-radius: 13rpx; background: #edf5ff; color: #1677ff; font-size: 24rpx; }
  .mobile-action-btn.dangerous { background: #fff0f1; color: #f05252; }
  .empty-state { padding: 100rpx 20rpx; font-size: 26rpx; }
}
</style>
