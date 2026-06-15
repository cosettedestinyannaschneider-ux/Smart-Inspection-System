<template>
  <AdminShell active-key="backup" title="数据备份" wide @ready="handleAdminReady">
    <view class="page-heading"><view><text class="heading-title">数据备份</text><text class="heading-desc">管理数据库手动备份、自动策略与备份记录</text></view><view class="primary-btn" :class="{ disabled:backingUp }" @click="manualBackup">{{ backingUp ? '备份中...' : '立即备份' }}</view></view>
    <view class="status-panel"><view class="status-icon">✓</view><view class="status-copy"><text class="status-title">最近备份正常</text><text class="status-desc">{{ records[0] ? records[0].created_at+' · '+records[0].filename : '暂无备份记录' }}</text></view><view class="status-stats"><view><text>{{ records.length }}</text><text>备份文件</text></view><view><text>{{ period }}</text><text>自动周期</text></view></view></view>
    <view class="backup-grid">
      <view class="config-card"><text class="card-title">自动备份策略</text><text class="card-desc">设置自动执行周期，后端定时任务将在指定周期创建备份。</text><text class="form-label">备份周期</text><picker :range="periodOptions" @change="changePeriod"><view class="period-picker">{{ period }}⌄</view></picker><view class="save-btn" @click="savePeriod">保存策略</view></view>
      <view class="config-card"><text class="card-title">备份安全说明</text><view class="notice-row"><text>存储位置</text><text>服务器本地备份目录</text></view><view class="notice-row"><text>备份内容</text><text>MySQL ai_project 完整数据库</text></view><view class="notice-row"><text>保留策略</text><text>建议后端保留最近 30 份</text></view><view class="warning-box">恢复数据库属于高风险操作，第三阶段前端暂不提供恢复按钮。</view></view>
    </view>
    <view class="record-panel"><view class="record-heading"><text>备份记录</text><text>{{ records.length }} 条</text></view><view v-if="records.length===0" class="empty-card">暂无备份记录</view><view v-for="item in records" :key="item.id" class="record-row"><view class="record-icon">DB</view><view class="record-copy"><text class="record-name">{{ item.filename }}</text><text class="record-meta">{{ item.type }} · {{ item.size }} · {{ item.created_at }}</text></view><text class="success-tag">{{ item.status==='success'?'成功':'失败' }}</text></view></view>
  </AdminShell>
</template>
<script setup>
import { ref } from 'vue'
import AdminShell from '../../components/admin/AdminShell.vue'
import { createBackupRecords } from '../../common/admin-mock-data'
/** 当前管理员信息 */
const user=ref({})
/** 自动备份周期 */
const period=ref('每周')
/** 自动备份周期选项 */
const periodOptions=['关闭自动备份','每日','每周','每月']
/** 备份记录列表 */
const records=ref([])
/** 手动备份执行状态 */
const backingUp=ref(false)
/** 公共框架鉴权完成后加载备份记录 */
const handleAdminReady=(admin)=>{user.value=admin;records.value=createBackupRecords()}
/** 修改自动备份周期 */
const changePeriod=(event)=>{period.value=periodOptions[event.detail.value]||'关闭自动备份'}
/** 保存自动备份策略，后续对接后端接口 */
const savePeriod=()=>uni.showToast({title:'备份策略已保存',icon:'success'})
/** 创建手动备份模拟记录，后续对接后端接口 */
const manualBackup=()=>{if(backingUp.value)return;backingUp.value=true;uni.showToast({title:'正在创建备份',icon:'loading'});setTimeout(()=>{const now=new Date();records.value.unshift({id:Date.now(),filename:`ai_project_backup_${now.toISOString().slice(0,10).replace(/-/g,'')}.sql.gz`,size:'2.5 MB',status:'success',type:'手动备份',created_at:now.toLocaleString('zh-CN')});backingUp.value=false;uni.showToast({title:'备份已完成',icon:'success'})},1200)}
</script>
<style scoped>
.page-heading{margin-bottom:22px;display:flex;align-items:center;justify-content:space-between}.heading-title{display:block;color:#172541;font-size:28px;font-weight:700}.heading-desc{display:block;margin-top:6px;color:#8b98aa;font-size:14px}.primary-btn,.save-btn{height:40px;padding:0 16px;display:flex;align-items:center;justify-content:center;border-radius:9px;background:#1677ff;color:#fff;font-size:13px}.primary-btn.disabled{opacity:.55}.status-panel{margin-bottom:16px;padding:20px;display:flex;align-items:center;gap:15px;border-radius:15px;background:linear-gradient(135deg,#1677ff,#4d9cff);color:#fff}.status-icon{width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:rgba(255,255,255,.2);font-size:24px}.status-copy{flex:1;display:flex;flex-direction:column}.status-title{font-size:17px;font-weight:700}.status-desc{margin-top:5px;color:rgba(255,255,255,.75);font-size:11px}.status-stats{display:flex;gap:28px}.status-stats>view{display:flex;flex-direction:column;align-items:center}.status-stats text:first-child{font-size:18px;font-weight:700}.status-stats text:last-child{margin-top:4px;color:rgba(255,255,255,.75);font-size:10px}
.backup-grid{margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px}.config-card,.record-panel{padding:20px;background:#fff;border:1px solid #edf1f7;border-radius:14px}.card-title{display:block;color:#24334e;font-size:16px;font-weight:700}.card-desc{display:block;margin:7px 0 18px;color:#96a2b3;font-size:11px;line-height:1.6}.form-label{display:block;margin-bottom:7px;color:#536179;font-size:12px;font-weight:600}.period-picker{height:40px;padding:0 12px;display:flex;align-items:center;border:1px solid #e2e9f2;border-radius:9px;background:#f9fbfd;color:#59677d;font-size:12px}.save-btn{margin-top:14px;width:100px}.notice-row{padding:10px 0;display:flex;justify-content:space-between;border-bottom:1px solid #edf1f7;color:#657389;font-size:11px}.warning-box{margin-top:14px;padding:11px;border-radius:8px;background:#fff7e8;color:#a76b00;font-size:10px;line-height:1.6}.record-heading{margin-bottom:12px;display:flex;justify-content:space-between;color:#24334e;font-size:15px;font-weight:700}.record-heading text:last-child{color:#9aa6b7;font-size:11px;font-weight:400}.record-row{padding:13px 0;display:flex;align-items:center;border-top:1px solid #edf1f7}.record-icon{width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:#eaf3ff;color:#1677ff;font-size:10px;font-weight:700}.record-copy{flex:1;margin-left:11px;display:flex;flex-direction:column}.record-name{color:#33425b;font-size:12px;font-weight:600}.record-meta{margin-top:4px;color:#9aa6b7;font-size:10px}.success-tag{padding:4px 9px;border-radius:20px;background:#eaf8f1;color:#18a66c;font-size:10px}.empty-card{padding:50px;color:#9aa6b7;text-align:center}
@media screen and (max-width:900px){.page-heading{margin-bottom:20rpx}.page-heading>view:first-child{display:none}.primary-btn,.save-btn{height:70rpx;padding:0 22rpx;border-radius:13rpx;font-size:23rpx}.status-panel{padding:24rpx;display:block;border-radius:22rpx}.status-icon{width:66rpx;height:66rpx;border-radius:18rpx}.status-copy{margin-top:16rpx}.status-title{font-size:29rpx}.status-desc{font-size:20rpx}.status-stats{margin-top:22rpx;justify-content:space-around}.status-stats text:first-child{font-size:30rpx}.status-stats text:last-child{font-size:19rpx}.backup-grid{grid-template-columns:1fr;gap:16rpx}.config-card,.record-panel{padding:24rpx;border-radius:20rpx}.card-title{font-size:28rpx}.card-desc,.form-label,.period-picker,.notice-row{font-size:21rpx}.period-picker{height:72rpx;border-radius:13rpx}.save-btn{width:100%;margin-top:18rpx}.warning-box{font-size:19rpx}.record-heading{font-size:27rpx}.record-heading text:last-child{font-size:20rpx}.record-row{padding:20rpx 0}.record-icon{width:62rpx;height:62rpx;border-radius:16rpx;font-size:17rpx}.record-name{font-size:22rpx}.record-meta,.success-tag{font-size:19rpx}}
</style>
