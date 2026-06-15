<template>
  <AdminShell active-key="templates" title="报告模板" wide @ready="handleAdminReady">
    <view class="page-heading"><view><text class="heading-title">报告模板</text><text class="heading-desc">管理报告生成使用的 Word 模板</text></view><view class="primary-btn" @click="openAdd">＋ 上传模板</view></view>
    <view class="summary-grid"><view class="summary-card"><text class="summary-value">{{ list.length }}</text><text class="summary-label">模板总数</text></view><view class="summary-card"><text class="summary-value green">{{ defaultTemplate ? defaultTemplate.name : '未设置' }}</text><text class="summary-label">默认模板</text></view></view>
    <view v-if="list.length === 0" class="empty-card">暂无报告模板，请上传 DOCX 模板</view>
    <view v-else class="template-grid">
      <view v-for="item in list" :key="item.id" class="template-card" :class="{ active:item.is_default }">
        <view class="template-head"><view class="file-icon">DOCX</view><view class="template-copy"><text class="template-name">{{ item.name }}</text><text class="template-desc">{{ item.description || '暂无模板说明' }}</text></view><text v-if="item.is_default" class="default-tag">默认</text></view>
        <view class="template-meta"><text>{{ item.file_path || '未上传文件' }}</text><text>更新：{{ item.updated_at || '-' }}</text></view>
        <view class="card-actions"><text v-if="!item.is_default" class="action-link green" @click="setDefault(item)">设为默认</text><text class="action-link" @click="openEdit(item)">编辑</text><text class="action-link dangerous" @click="deleteTemplate(item)">删除</text></view>
      </view>
    </view>
    <!-- 模板表单直接渲染，保证微信端点击事件正常 -->
    <view v-if="showModal" class="modal-mask" @click="closeModal"><view class="modal-panel" @click.stop="">
      <view class="modal-header"><view><text class="modal-title">{{ isEdit ? '编辑报告模板' : '上传报告模板' }}</text><text class="modal-desc">仅支持 DOCX 格式模板文件</text></view><text class="modal-close" @click="closeModal">×</text></view>
      <view class="modal-body"><text class="form-label">模板名称</text><input v-model="form.name" class="form-input" placeholder="请输入模板名称" /><text class="form-label">模板说明</text><textarea v-model="form.description" class="form-textarea" placeholder="请输入模板适用场景" /><text class="form-label">模板文件</text><view class="file-area" @click="pickFile">{{ form.fileName || (isEdit ? '点击更换 DOCX 文件' : '点击选择 DOCX 文件') }}</view></view>
      <view class="modal-footer"><view class="secondary-btn" @click="closeModal">取消</view><view class="save-btn" @click="saveTemplate">保存模板</view></view>
    </view></view>
  </AdminShell>
</template>
<script setup>
import { ref, computed } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { createReportTemplates } from '../../common/admin-mock-data'
/** 当前管理员信息 */
const user=ref({})
/** 报告模板列表 */
const list=ref([])
/** 模板弹窗显示状态 */
const showModal=ref(false)
/** 当前是否为编辑模式 */
const isEdit=ref(false)
/** 创建空白模板表单 */
const createForm=()=>({id:null,name:'',description:'',fileName:'',fileObj:null})
/** 当前模板表单 */
const form=ref(createForm())
/** 当前默认模板 */
const defaultTemplate=computed(()=>list.value.find(item=>item.is_default)||null)
/** 公共框架鉴权完成后加载模板 */
const handleAdminReady=(admin)=>{user.value=admin;list.value=createReportTemplates()}
/** 打开新增模板弹窗 */
const openAdd=()=>{isEdit.value=false;form.value=createForm();showModal.value=true}
/** 打开编辑模板弹窗 */
const openEdit=(item)=>{isEdit.value=true;form.value={id:item.id,name:item.name,description:item.description,fileName:item.file_path,fileObj:null};showModal.value=true}
/** 关闭模板弹窗 */
const closeModal=()=>{showModal.value=false}
/** 选择 DOCX 模板文件 */
const pickFile=()=>{
  // #ifdef H5
  const input=document.createElement('input');input.type='file';input.accept='.docx';input.onchange=(event)=>{const file=event.target.files[0];if(file){form.value.fileObj=file;form.value.fileName=file.name}};input.click()
  // #endif
  // #ifndef H5
  wx.chooseMessageFile({count:1,type:'file',extension:['docx'],success:(result)=>{const file=result.tempFiles[0];if(file){form.value.fileObj=file;form.value.fileName=file.name}}})
  // #endif
}
/** 保存模板，后续对接模板新增或更新接口 */
const saveTemplate=()=>{if(!form.value.name.trim())return uni.showToast({title:'请输入模板名称',icon:'none'});if(!isEdit.value&&!form.value.fileName)return uni.showToast({title:'请选择 DOCX 文件',icon:'none'});if(isEdit.value){const item=list.value.find(row=>row.id===form.value.id);if(item)Object.assign(item,{name:form.value.name,description:form.value.description,file_path:form.value.fileName,updated_at:new Date().toISOString().slice(0,10)})}else list.value.push({id:Date.now(),name:form.value.name,description:form.value.description,file_path:form.value.fileName,is_default:false,updated_at:new Date().toISOString().slice(0,10)});uni.showToast({title:'模板已保存',icon:'success'});closeModal()}
/** 设置默认报告模板 */
const setDefault=(item)=>{list.value.forEach(row=>{row.is_default=row.id===item.id});uni.showToast({title:'默认模板已更新',icon:'success'})}
/** 删除非默认报告模板 */
const deleteTemplate=(item)=>{if(item.is_default)return uni.showToast({title:'默认模板不能删除',icon:'none'});uni.showModal({title:'确认删除',content:`确定删除“${item.name}”吗？`,success:(result)=>{if(result.confirm)list.value=list.value.filter(row=>row.id!==item.id)}})}
</script>
<style scoped>
.page-heading{margin-bottom:22px;display:flex;align-items:center;justify-content:space-between}.heading-title{display:block;color:#172541;font-size:28px;font-weight:700}.heading-desc{display:block;margin-top:6px;color:#8b98aa;font-size:14px}.primary-btn,.secondary-btn,.save-btn{height:40px;padding:0 16px;display:flex;align-items:center;justify-content:center;border-radius:9px;font-size:13px}.primary-btn,.save-btn{background:#1677ff;color:#fff}.secondary-btn{background:#f1f4f8;color:#69778c}.summary-grid{margin-bottom:18px;display:grid;grid-template-columns:1fr 2fr;gap:14px}.summary-card{padding:18px 20px;display:flex;flex-direction:column;background:#fff;border:1px solid #edf1f7;border-radius:14px}.summary-value{color:#1677ff;font-size:25px;font-weight:700}.summary-value.green{color:#18a66c;font-size:17px}.summary-label{margin-top:5px;color:#8b98aa;font-size:12px}.template-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.template-card{padding:18px;background:#fff;border:1px solid #edf1f7;border-radius:14px}.template-card.active{border-color:#a9ceff}.template-head{display:flex;align-items:center}.file-icon{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:#eaf3ff;color:#1677ff;font-size:9px;font-weight:700}.template-copy{flex:1;margin-left:11px;display:flex;flex-direction:column}.template-name{color:#24334e;font-size:14px;font-weight:700}.template-desc{margin-top:4px;color:#96a2b3;font-size:11px}.default-tag{padding:4px 9px;border-radius:20px;background:#eaf8f1;color:#18a66c;font-size:10px}.template-meta{margin-top:16px;display:flex;flex-direction:column;gap:5px;color:#9aa6b7;font-size:10px}.card-actions{margin-top:14px;padding-top:12px;display:flex;justify-content:flex-end;gap:14px;border-top:1px solid #edf1f7}.action-link{color:#1677ff;font-size:12px}.green{color:#18a66c}.dangerous{color:#f05252}.empty-card{padding:70px;background:#fff;border:1px dashed #dce5f0;border-radius:14px;color:#9aa6b6;text-align:center}
.modal-mask{position:fixed;top:0;right:0;bottom:0;left:0;z-index:5000;padding:24px;display:flex;align-items:center;justify-content:center;background:rgba(15,28,50,.46);box-sizing:border-box}.modal-panel{width:600px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;background:#fff;border-radius:18px}.modal-header{padding:22px 26px;display:flex;justify-content:space-between;border-bottom:1px solid #edf1f7}.modal-title{display:block;color:#172541;font-size:21px;font-weight:700}.modal-desc{display:block;margin-top:5px;color:#909daf;font-size:13px}.modal-close{color:#91a0b5;font-size:26px}.modal-body{padding:24px 26px}.modal-footer{padding:16px 26px;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #edf1f7}.form-label{display:block;margin-bottom:8px;color:#536179;font-size:13px;font-weight:600}.form-input,.form-textarea,.file-area{width:100%;margin-bottom:18px;padding:0 12px;border:1px solid #e2e9f2;border-radius:9px;background:#f9fbfd;box-sizing:border-box;font-size:13px}.form-input{height:42px}.form-textarea{height:90px;padding-top:12px}.file-area{padding:22px;color:#1677ff;text-align:center}
@media screen and (max-width:900px){.page-heading{margin-bottom:20rpx}.page-heading>view:first-child{display:none}.primary-btn,.secondary-btn,.save-btn{height:70rpx;padding:0 22rpx;border-radius:13rpx;font-size:23rpx}.summary-grid{grid-template-columns:1fr 2fr;gap:12rpx}.summary-card{padding:20rpx 14rpx;border-radius:18rpx}.summary-value{font-size:34rpx}.summary-value.green{font-size:25rpx}.summary-label{font-size:20rpx}.template-grid{grid-template-columns:1fr;gap:16rpx}.template-card{padding:24rpx;border-radius:20rpx}.file-icon{width:68rpx;height:68rpx;border-radius:17rpx;font-size:15rpx}.template-name{font-size:27rpx}.template-desc,.default-tag,.template-meta,.action-link{font-size:20rpx}.modal-mask{padding:0;align-items:flex-end}.modal-panel{width:100%;max-height:86vh;border-radius:28rpx 28rpx 0 0}.modal-header{padding:26rpx 32rpx}.modal-title{font-size:32rpx}.modal-desc{font-size:21rpx}.modal-close{font-size:44rpx}.modal-body{padding:24rpx 32rpx}.modal-footer{padding:20rpx 32rpx 28rpx}.modal-footer .secondary-btn,.modal-footer .save-btn{flex:1}.form-label{font-size:24rpx}.form-input{height:76rpx;font-size:24rpx}.form-textarea{height:150rpx;font-size:24rpx}.file-area{padding:35rpx;font-size:23rpx}}
</style>
