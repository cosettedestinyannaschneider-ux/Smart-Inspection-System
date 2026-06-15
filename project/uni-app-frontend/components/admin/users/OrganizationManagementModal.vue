<template>
  <!-- 企业与部门组织管理弹窗 -->
  <view v-if="visible" class="modal-mask department-modal-mask" @click="$emit('close')">
    <view class="department-modal" @click.stop="">
      <view class="modal-header">
        <view>
          <text class="modal-title">企业与部门管理</text>
          <text class="modal-desc">企业下可维护多个部门，用户按企业和部门归属</text>
        </view>
        <text class="modal-close" @click="$emit('close')">×</text>
      </view>
      <view class="department-modal-body">
        <!-- 企业新增、重命名与选择 -->
        <view class="organization-section">
          <view class="enterprise-head-row">
            <text class="organization-title">企业列表</text>
            <view v-if="managedEnterprise" class="enterprise-manage-actions">
              <text class="action-link" @click="$emit('edit-enterprise', managedEnterprise)">重命名</text>
              <text class="action-link dangerous" @click="$emit('delete-enterprise', managedEnterprise)">删除</text>
            </view>
          </view>
          <view class="enterprise-editor">
            <input v-model="enterpriseForm.name" class="form-input" placeholder="请输入企业名称" />
            <view class="department-editor-actions">
              <view v-if="enterpriseForm.id" class="small-secondary-btn" @click="$emit('reset-enterprise')">取消</view>
              <view class="small-primary-btn" @click="$emit('save-enterprise')">{{ enterpriseForm.id ? '保存' : '新增' }}</view>
            </view>
          </view>
          <scroll-view scroll-x class="enterprise-tabs">
            <view class="enterprise-tabs-inner">
              <view
                v-for="enterprise in enterpriseList"
                :key="enterprise.id"
                class="enterprise-tab"
                :class="{ active: managedEnterpriseId === enterprise.id }"
                @click="$emit('select-enterprise', enterprise)"
              >
                {{ enterprise.name }}
              </view>
            </view>
          </scroll-view>
        </view>

        <!-- 当前企业下的部门新增或重命名表单 -->
        <view class="department-editor">
          <text class="organization-title">当前企业部门</text>
          <input v-model="departmentForm.name" class="form-input" :placeholder="managedEnterprise ? `为「${managedEnterprise.name}」新增部门` : '请先选择企业'" />
          <view class="department-editor-actions">
            <view v-if="departmentForm.id" class="small-secondary-btn" @click="$emit('reset-department')">取消</view>
            <view class="small-primary-btn" @click="$emit('save-department')">{{ departmentForm.id ? '保存' : '新增' }}</view>
          </view>
        </view>

        <!-- 已有部门列表，弹性撑满剩余空间 -->
        <scroll-view scroll-y class="department-list">
          <view v-if="managedDepartments.length === 0" class="empty-state">当前企业暂无部门</view>
          <view v-for="department in managedDepartments" :key="department.id" class="department-row">
            <view class="department-row-info">
              <text class="department-name">{{ department.name }}</text>
              <text class="department-count">有效关联 {{ getDepartmentUserCount(department.id) }} 个用户</text>
            </view>
            <view class="department-row-actions">
              <text class="action-link" @click="$emit('edit-department', department)">重命名</text>
              <text class="action-link dangerous" @click="$emit('delete-department', department)">删除</text>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
/** 企业与部门管理弹窗展示参数 */
defineProps({
  visible: { type: Boolean, default: false },
  enterpriseList: { type: Array, default: () => [] },
  managedEnterpriseId: { type: Number, default: null },
  managedEnterprise: { type: Object, default: null },
  managedDepartments: { type: Array, default: () => [] },
  enterpriseForm: { type: Object, required: true },
  departmentForm: { type: Object, required: true },
  getDepartmentUserCount: { type: Function, required: true }
})

/** 将组织管理操作发送给页面编排层 */
defineEmits([
  'close',
  'edit-enterprise',
  'delete-enterprise',
  'reset-enterprise',
  'save-enterprise',
  'select-enterprise',
  'reset-department',
  'save-department',
  'edit-department',
  'delete-department'
])
</script>

<style scoped>
/* 企业与部门管理弹窗 */
.modal-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(15,28,50,.46); box-sizing: border-box; }
.department-modal-mask { z-index: 4000; }
.department-modal { width: 560px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; background: #fff; border-radius: 18px; box-shadow: 0 24px 70px rgba(18,40,73,.24); }
.modal-header { padding: 22px 26px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #edf1f7; }
.modal-title { display: block; color: #172541; font-size: 21px; font-weight: 700; }
.modal-desc { display: block; margin-top: 5px; color: #909daf; font-size: 13px; }
.modal-close { color: #91a0b5; font-size: 26px; line-height: 1; }
.department-modal-body { flex: 1; min-height: 0; padding: 22px 26px 14px; display: flex; flex-direction: column; overflow: hidden; }
.organization-section { flex-shrink: 0; padding-bottom: 14px; border-bottom: 1px solid #edf1f7; }
.enterprise-head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.enterprise-head-row .organization-title { margin-bottom: 0; }
.organization-title { display: block; color: #33425b; font-size: 14px; font-weight: 700; }
.enterprise-manage-actions { display: flex; gap: 12px; }
.enterprise-editor { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.enterprise-editor .form-input { flex: 1; }
.enterprise-editor .department-editor-actions { flex-shrink: 0; margin-top: 0; }
.form-input { width: 100%; height: 42px; padding: 0 12px; border: 1px solid #e2e9f2; border-radius: 9px; background: #f9fbfd; color: #263651; font-size: 13px; box-sizing: border-box; }
.enterprise-tabs { width: 100%; white-space: nowrap; }
.enterprise-tabs-inner { display: inline-flex; gap: 8px; padding: 2px 0; }
.enterprise-tab { padding: 8px 12px; border-radius: 8px; background: #f2f5f9; color: #69778c; font-size: 12px; }
.enterprise-tab.active { background: #eaf3ff; color: #1677ff; font-weight: 600; }
.department-editor { flex-shrink: 0; padding: 14px 0; border-bottom: 1px solid #edf1f7; }
.department-editor .organization-title { margin-bottom: 8px; }
.department-editor-actions { margin-top: 8px; display: flex; justify-content: flex-end; gap: 8px; }
.small-secondary-btn, .small-primary-btn { height: 34px; padding: 0 14px; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 12px; }
.small-secondary-btn { background: #f1f4f8; color: #69778c; }
.small-primary-btn { background: #1677ff; color: #fff; }
.department-list { flex: 1; min-height: 0; margin-top: 4px; }
.department-row { min-height: 56px; padding: 10px 2px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid #edf1f7; box-sizing: border-box; }
.department-row-info { display: flex; flex-direction: column; min-width: 0; }
.department-name { color: #293852; font-size: 14px; font-weight: 600; }
.department-count { margin-top: 4px; color: #98a4b5; font-size: 11px; }
.department-row-actions { display: flex; flex-shrink: 0; gap: 14px; }
.action-link { color: #1677ff; font-size: 13px; }
.action-link.dangerous { color: #f05252; }
.empty-state { padding: 70px 20px; color: #9aa6b7; font-size: 14px; text-align: center; }

/* 微信小程序与小屏 H5 使用底部抽屉 */
@media screen and (max-width: 900px) {
  .modal-mask { padding: 0; align-items: flex-end; }
  .department-modal { width: 100%; max-height: 86vh; border-radius: 28rpx 28rpx 0 0; }
  .modal-header { padding: 30rpx 34rpx; }
  .modal-title { font-size: 34rpx; }
  .modal-desc { margin-top: 7rpx; font-size: 23rpx; }
  .modal-close { font-size: 44rpx; }
  .department-modal-body { padding: 22rpx 30rpx 24rpx; }
  .organization-section { padding-bottom: 16rpx; }
  .enterprise-head-row { margin-bottom: 12rpx; flex-wrap: wrap; gap: 8rpx; }
  .organization-title { font-size: 26rpx; }
  .enterprise-editor { display: block; margin-bottom: 12rpx; }
  .enterprise-editor .form-input { margin-bottom: 8rpx; }
  .enterprise-editor .department-editor-actions { justify-content: flex-start; }
  .form-input { height: 78rpx; padding: 0 20rpx; border-radius: 13rpx; font-size: 26rpx; }
  .enterprise-tabs-inner { gap: 12rpx; }
  .enterprise-tab { padding: 14rpx 18rpx; border-radius: 12rpx; font-size: 23rpx; }
  .enterprise-manage-actions { gap: 18rpx; }
  .department-editor { padding: 14rpx 0; }
  .department-editor-actions { margin-top: 12rpx; gap: 14rpx; }
  .small-secondary-btn, .small-primary-btn { height: 66rpx; padding: 0 20rpx; border-radius: 13rpx; font-size: 24rpx; }
  .department-list { max-height: none; flex: 1; min-height: 0; margin-top: 4rpx; }
  .department-row { min-height: 100rpx; padding: 18rpx 2rpx; gap: 20rpx; }
  .department-name { font-size: 27rpx; }
  .department-count { margin-top: 6rpx; font-size: 21rpx; }
  .department-row-actions { gap: 22rpx; }
  .action-link { font-size: 23rpx; }
  .empty-state { padding: 100rpx 20rpx; font-size: 26rpx; }
}
</style>
