<template>
  <!-- 用户新增与编辑弹窗，保持 H5 居中和微信端底部抽屉交互 -->
  <view v-if="visible" class="modal-mask" @click="$emit('close')">
    <view class="modal-panel" @click.stop="">
      <view class="modal-header">
        <view>
          <text class="modal-title">{{ isEdit ? '编辑用户' : '添加用户' }}</text>
          <text class="modal-desc">{{ isEdit ? '修改账号信息与权限配置' : '创建新的系统用户账号' }}</text>
        </view>
        <text class="modal-close" @click="$emit('close')">×</text>
      </view>

      <scroll-view scroll-y class="modal-body">
        <!-- 基础账号信息 -->
        <view class="form-section">
          <text class="section-title">基础信息</text>
          <view class="form-grid">
            <view class="form-item">
              <text class="form-label">用户名</text>
              <input class="form-input" v-model="form.username" placeholder="请输入用户名" />
            </view>
            <view class="form-item">
              <text class="form-label">{{ isEdit ? '新密码（留空不修改）' : '初始密码' }}</text>
              <view class="pwd-wrap">
                <input class="form-input pwd-input" :password="!showPwd" v-model="form.password" :placeholder="isEdit ? '留空不修改' : '请输入初始密码'" />
                <text class="pwd-toggle" @click="$emit('toggle-password')">{{ showPwd ? '隐藏' : '显示' }}</text>
              </view>
            </view>
            <view class="form-item">
              <view class="form-label-row">
                <text class="form-label">所属企业</text>
                <text class="manage-dept-link" @click="$emit('open-organization')">管理企业与部门</text>
              </view>
              <!-- 使用自定义企业选择器，避免 H5 弹窗内原生 picker 点击无响应 -->
              <view class="department-selector">
                <view class="picker-val" :class="{ selected: selectedEnterpriseName }" @click="$emit('toggle-enterprises')">
                  <text>{{ selectedEnterpriseName || '请选择所属企业' }}</text>
                  <text class="picker-arrow">{{ showEnterpriseOptions ? '⌃' : '⌄' }}</text>
                </view>
                <view v-if="showEnterpriseOptions" class="department-options">
                  <view class="department-option" :class="{ active: !form.enterprise_id }" @click="$emit('select-enterprise', null)">
                    不分配企业
                  </view>
                  <view
                    v-for="enterprise in enterpriseList"
                    :key="enterprise.id"
                    class="department-option"
                    :class="{ active: form.enterprise_id === enterprise.id }"
                    @click="$emit('select-enterprise', enterprise)"
                  >
                    {{ enterprise.name }}
                  </view>
                </view>
              </view>
            </view>
            <view class="form-item">
              <text class="form-label">所属部门</text>
              <!-- 部门选项严格根据已选择企业进行过滤 -->
              <view class="department-selector">
                <view class="picker-val" :class="{ selected: selectedDeptName, disabled: !form.enterprise_id }" @click="$emit('toggle-departments')">
                  <text>{{ form.enterprise_id ? (selectedDeptName || '请选择所属部门') : '请先选择所属企业' }}</text>
                  <text class="picker-arrow">{{ showDeptOptions ? '⌃' : '⌄' }}</text>
                </view>
                <view v-if="showDeptOptions" class="department-options">
                  <view class="department-option" :class="{ active: !form.department_id }" @click="$emit('select-department', null)">
                    不分配部门
                  </view>
                  <view
                    v-for="department in availableDepartments"
                    :key="department.id"
                    class="department-option"
                    :class="{ active: form.department_id === department.id }"
                    @click="$emit('select-department', department)"
                  >
                    {{ department.name }}
                  </view>
                </view>
              </view>
            </view>
            <view class="form-item">
              <text class="form-label">用户角色</text>
              <view class="role-selector">
                <view class="role-option" :class="{ active: form.role === 'user' }" @click="form.role = 'user'">普通用户</view>
                <view class="role-option" :class="{ active: form.role === 'admin' }" @click="form.role = 'admin'">管理员</view>
              </view>
            </view>
          </view>
        </view>

        <!-- 普通用户功能权限 -->
        <view v-if="form.role === 'user'" class="form-section permission-section">
          <view class="section-heading">
            <view>
              <text class="section-title">功能权限</text>
              <text class="section-desc">选择该用户允许使用的业务功能</text>
            </view>
            <view class="select-all" :class="{ active: allChecked }" @click="$emit('toggle-all')">
              {{ allChecked ? '取消全选' : '全选权限' }}
            </view>
          </view>
          <view class="permission-grid">
            <view
              v-for="item in permOptions"
              :key="item.key"
              class="permission-card"
              :class="{ active: form.perms[item.key] }"
              @click="form.perms[item.key] = !form.perms[item.key]"
            >
              <view class="permission-check">{{ form.perms[item.key] ? '✓' : '' }}</view>
              <view class="permission-info">
                <text class="permission-name">{{ item.label }}</text>
                <text class="permission-desc">{{ item.description }}</text>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>

      <view class="modal-footer">
        <view class="secondary-btn" @click="$emit('close')">取消</view>
        <view class="save-btn" @click="$emit('save')">{{ isEdit ? '保存修改' : '创建用户' }}</view>
      </view>
    </view>
  </view>
</template>

<script setup>
/** 用户编辑弹窗展示参数 */
defineProps({
  visible: { type: Boolean, default: false },
  isEdit: { type: Boolean, default: false },
  showPwd: { type: Boolean, default: false },
  showEnterpriseOptions: { type: Boolean, default: false },
  showDeptOptions: { type: Boolean, default: false },
  form: { type: Object, required: true },
  enterpriseList: { type: Array, default: () => [] },
  availableDepartments: { type: Array, default: () => [] },
  selectedEnterpriseName: { type: String, default: '' },
  selectedDeptName: { type: String, default: '' },
  allChecked: { type: Boolean, default: false },
  permOptions: { type: Array, default: () => [] }
})

/** 将用户编辑操作发送给页面编排层 */
defineEmits([
  'close',
  'save',
  'toggle-password',
  'open-organization',
  'toggle-enterprises',
  'select-enterprise',
  'toggle-departments',
  'select-department',
  'toggle-all'
])
</script>

<style scoped>
/* 用户编辑弹窗 */
.modal-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(15,28,50,.46); box-sizing: border-box; }
.modal-panel { width: 720px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; background: #fff; border-radius: 18px; box-shadow: 0 24px 70px rgba(18,40,73,.24); }
.modal-header { padding: 22px 26px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #edf1f7; }
.modal-title { display: block; color: #172541; font-size: 21px; font-weight: 700; }
.modal-desc { display: block; margin-top: 5px; color: #909daf; font-size: 13px; }
.modal-close { color: #91a0b5; font-size: 26px; line-height: 1; }
.modal-body { flex: 1; max-height: 65vh; padding: 24px 26px; box-sizing: border-box; }
.form-section + .form-section { margin-top: 26px; padding-top: 24px; border-top: 1px solid #edf1f7; }
.section-title { display: block; color: #24334e; font-size: 16px; font-weight: 700; }
.section-desc { display: block; margin-top: 4px; color: #96a2b3; font-size: 12px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.form-grid { margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.form-label { display: block; margin-bottom: 8px; color: #536179; font-size: 13px; font-weight: 600; }
.form-label-row { display: flex; align-items: center; justify-content: space-between; }
.manage-dept-link { margin-bottom: 8px; color: #1677ff; font-size: 12px; }
.form-input, .picker-val { width: 100%; height: 42px; padding: 0 12px; border: 1px solid #e2e9f2; border-radius: 9px; background: #f9fbfd; color: #263651; font-size: 13px; box-sizing: border-box; }
.department-selector { position: relative; }
.picker-val { display: flex; align-items: center; justify-content: space-between; color: #9aa6b7; }
.picker-val.selected { color: #263651; }
.picker-val.disabled { color: #b4bdca; background: #f3f5f8; }
.picker-arrow { color: #8f9caf; font-size: 17px; }
.department-options { position: absolute; top: 48px; right: 0; left: 0; z-index: 20; max-height: 190px; overflow-y: auto; padding: 6px; border: 1px solid #e2e9f2; border-radius: 10px; background: #fff; box-shadow: 0 12px 30px rgba(31,67,115,.15); }
.department-option { padding: 10px 11px; border-radius: 7px; color: #536179; font-size: 13px; }
.department-option.active { background: #edf5ff; color: #1677ff; font-weight: 600; }
.pwd-wrap { position: relative; }
.pwd-input { padding-right: 58px; }
.pwd-toggle { position: absolute; right: 12px; top: 13px; color: #1677ff; font-size: 12px; }
.role-selector { height: 42px; padding: 3px; display: flex; gap: 4px; border: 1px solid #e2e9f2; border-radius: 9px; background: #f9fbfd; box-sizing: border-box; }
.role-option { flex: 1; display: flex; align-items: center; justify-content: center; border-radius: 7px; color: #7d899b; font-size: 13px; }
.role-option.active { background: #fff; color: #1677ff; font-weight: 600; box-shadow: 0 2px 7px rgba(31,67,115,.1); }
.select-all { padding: 7px 12px; border-radius: 8px; background: #edf5ff; color: #1677ff; font-size: 12px; }
.select-all.active { background: #e9f9f1; color: #17a66b; }
.permission-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.permission-card { padding: 13px; display: flex; align-items: flex-start; gap: 10px; border: 1px solid #e5ebf3; border-radius: 10px; background: #fbfcfe; box-sizing: border-box; }
.permission-card.active { border-color: #9fc9ff; background: #f0f7ff; }
.permission-check { width: 18px; height: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid #cfd8e5; border-radius: 5px; color: #fff; font-size: 11px; }
.permission-card.active .permission-check { border-color: #1677ff; background: #1677ff; }
.permission-info { display: flex; flex-direction: column; }
.permission-name { color: #33425b; font-size: 13px; font-weight: 600; }
.permission-desc { margin-top: 4px; color: #95a1b2; font-size: 11px; line-height: 1.5; }
.modal-footer { padding: 16px 26px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #edf1f7; }
.secondary-btn, .save-btn { min-width: 92px; height: 38px; display: flex; align-items: center; justify-content: center; border-radius: 9px; font-size: 13px; }
.secondary-btn { background: #f1f4f8; color: #69778c; }
.save-btn { background: #1677ff; color: #fff; }

/* 微信小程序与小屏 H5 使用底部抽屉 */
@media screen and (max-width: 900px) {
  .modal-mask { padding: 0; align-items: flex-end; }
  .modal-panel { width: 100%; max-height: 90vh; border-radius: 28rpx 28rpx 0 0; }
  .modal-header { padding: 30rpx 34rpx; }
  .modal-title { font-size: 34rpx; }
  .modal-desc { margin-top: 7rpx; font-size: 23rpx; }
  .modal-close { font-size: 44rpx; }
  .modal-body { max-height: 67vh; padding: 28rpx 34rpx; }
  .form-section + .form-section { margin-top: 32rpx; padding-top: 30rpx; }
  .section-title { font-size: 29rpx; }
  .section-desc { margin-top: 6rpx; font-size: 22rpx; }
  .section-heading { margin-bottom: 20rpx; }
  .form-grid { margin-top: 22rpx; display: block; }
  .form-item { margin-bottom: 24rpx; }
  .form-label { margin-bottom: 11rpx; font-size: 25rpx; }
  .manage-dept-link { margin-bottom: 11rpx; font-size: 23rpx; }
  .form-input, .picker-val { height: 78rpx; padding: 0 20rpx; border-radius: 13rpx; font-size: 26rpx; }
  .picker-arrow { font-size: 30rpx; }
  .department-options { top: 88rpx; max-height: 350rpx; padding: 10rpx; border-radius: 16rpx; }
  .department-option { padding: 20rpx; border-radius: 12rpx; font-size: 25rpx; }
  .pwd-input { padding-right: 100rpx; }
  .pwd-toggle { right: 20rpx; top: 25rpx; font-size: 23rpx; }
  .role-selector { height: 78rpx; padding: 5rpx; border-radius: 13rpx; }
  .role-option { border-radius: 10rpx; font-size: 25rpx; }
  .select-all { padding: 11rpx 17rpx; border-radius: 12rpx; font-size: 22rpx; }
  .permission-grid { grid-template-columns: 1fr; gap: 14rpx; }
  .permission-card { padding: 20rpx; gap: 16rpx; border-radius: 16rpx; }
  .permission-check { width: 34rpx; height: 34rpx; border-radius: 8rpx; font-size: 20rpx; }
  .permission-name { font-size: 25rpx; }
  .permission-desc { margin-top: 6rpx; font-size: 21rpx; }
  .modal-footer { padding: 22rpx 34rpx 28rpx; gap: 16rpx; }
  .secondary-btn, .save-btn { flex: 1; height: 76rpx; border-radius: 14rpx; font-size: 27rpx; }
}
</style>
