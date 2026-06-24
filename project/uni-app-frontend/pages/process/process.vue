<template>
  <view class="app-container">
    <!-- 侧边栏：PC端显示，移动端可切换 -->
    <view class="sidebar" :class="{ 'sidebar-active': showSidebar }">
      <view class="sidebar-brand">
        <view class="sidebar-logo">智检</view>
        <view class="sidebar-brand-copy">
          <text class="sidebar-title">智检系统</text>
          <text class="sidebar-subtitle">安全检查助手</text>
        </view>
      </view>
      <view class="new-chat-btn" @click="startNewChat">
        <text class="icon">+</text>
        <text>开启新对话</text>
      </view>

      <scroll-view scroll-y class="history-list">
        <view
          v-for="session in sessionList"
          :key="session.session_id"
          class="history-item"
          :class="{ 'item-active': currentSessionId === session.session_id }"
          @click="loadSession(session.session_id)"
        >
          <text class="history-title">{{ session.title }}</text>
          <text class="delete-icon" @click.stop="deleteSession(session.session_id)">×</text>
        </view>
      </scroll-view>

      <view class="sidebar-footer">
        <view class="footer-btns">
          <view v-if="user.role !== 'admin'" class="footer-btn action-btn" @click="showEnterpriseModal = true">
            <text>客户企业</text>
          </view>
          <view v-if="user.role !== 'admin'" class="footer-btn action-btn" @click="openHazardImageModal">
            <text>图片记录</text>
          </view>
        </view>
        <view class="user-info" @click="toggleUserMenu">
          <view class="avatar">{{ userInitial }}</view>
          <view class="user-copy">
            <text class="username">{{ user.username || '用户' }}</text>
            <text class="user-role">{{ user.role === 'admin' ? '管理员' : '检查员' }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 主内容区 -->
    <view class="main-content">
      <!-- 顶部状态栏 -->
      <view class="header">
        <view class="menu-toggle" @click="showSidebar = !showSidebar">菜单</view>
        <text class="header-title">{{ currentSessionTitle || '智检助手' }}</text>
        <view class="header-btns">
          <button class="mini-btn admin-btn" v-if="user.role === 'admin'" @click="goToAdmin">系统管理</button>
          <button class="mini-btn logout-btn" @click="handleLogout">退出</button>
        </view>
      </view>

      <view class="chat-flow-container">
        <scroll-view
          scroll-y
          class="chat-flow"
          :scroll-into-view="lastMessageId"
          scroll-with-animation
        >
          <view v-if="messages.length === 0" class="welcome-guide">
            <text class="welcome-title">您好，我是智检助手。请上传现场隐患图片或输入描述，我将为您进行安全检查分析。</text>
            <view class="guide-cards">
              <view class="guide-card" @click="prompt = '请根据最新的安全生产标准，结合已选隐患照片进行分析'">
                <text class="guide-card-title">智能隐患排查</text>
                <text class="guide-card-desc">分析照片和现场描述</text>
              </view>
              <view class="guide-card" @click="prompt = '请解释安全生产法中关于企业主体责任的相关规定'">
                <text class="guide-card-title">查阅安全规范</text>
                <text class="guide-card-desc">咨询法规条款与依据</text>
              </view>
            </view>
          </view>

          <view v-for="(msg, index) in messages" :key="index" :id="'msg-' + index" class="message-wrapper">
            <!-- 用户消息 -->
            <view v-if="msg.role === 'user'" class="message-user">
              <view class="message-bubble">
                <image v-if="msg.image" :src="msg.image" mode="aspectFit" class="message-image" @click="previewImage(msg.image)" />
                <view v-if="msg.images && msg.images.length" class="message-image-grid">
                  <image
                    v-for="img in msg.images"
                    :key="img.id || img.url"
                    :src="img.url"
                    mode="aspectFill"
                    class="message-thumb"
                    @click="previewImage(img.url)"
                  />
                </view>
                <text class="message-text">{{ msg.content }}</text>
              </view>
              <view class="user-avatar-mini">{{ userInitial }}</view>
            </view>
            <!-- AI 消息 -->
            <view v-else class="message-ai">
              <view class="ai-avatar">智</view>
              <view class="message-bubble" :class="{ 'report-bubble': parseStructuredData(msg.content) || msg.isEditing }">
                <view v-if="msg.loading" class="thinking-state">
                  <text class="thinking-dot"></text>
                  <view class="thinking-copy">
                    <text class="thinking-title">正在分析</text>
                    <text class="thinking-desc">识别图片并生成报告，请稍候...</text>
                  </view>
                </view>
                <!-- 9.6 结构化输出渲染与编辑 -->
                <view v-else-if="parseStructuredData(msg.content)" class="structured-result">
                  <view class="struct-header">
                    <text class="struct-title">分析结果</text>
                    <text class="struct-subtitle">{{ parseStructuredData(msg.content).mode === 'multi' ? '多图隐患分析' : '单项隐患分析' }}</text>
                  </view>
                  <view
                    v-if="parseStructuredData(msg.content).scene_status || parseStructuredData(msg.content).report_allowed === false"
                    class="assessment-panel"
                    :class="{ blocked: parseStructuredData(msg.content).report_allowed === false }"
                  >
                    <view class="assessment-top">
                      <text class="assessment-title">规则初判摘要</text>
                      <text class="assessment-status" :class="sceneStatusClass(parseStructuredData(msg.content).scene_status)">
                        {{ sceneStatusText(parseStructuredData(msg.content).scene_status) }}
                      </text>
                    </view>
                    <view class="assessment-tags">
                      <text class="assessment-tag">等级：{{ parseStructuredData(msg.content).hazard_level || '需人工复核' }}</text>
                      <text class="assessment-tag">证据：{{ evidenceText(parseStructuredData(msg.content).evidence_sufficiency) }}</text>
                      <text class="assessment-tag">{{ parseStructuredData(msg.content).review_required ? '需人工确认' : '可进入报告' }}</text>
                    </view>
                    <text v-if="parseStructuredData(msg.content).scene_reason" class="assessment-reason">{{ parseStructuredData(msg.content).scene_reason }}</text>
                    <text v-if="parseStructuredData(msg.content).report_allowed === false" class="assessment-block">{{ parseStructuredData(msg.content).report_block_reason || '当前结果不生成正式报告。' }}</text>
                    <view v-if="parseStructuredData(msg.content).visible_facts.length" class="fact-row">
                      <text v-for="(fact, factIndex) in parseStructuredData(msg.content).visible_facts.slice(0, 6)" :key="factIndex" class="fact-chip">{{ fact }}</text>
                    </view>
                    <view v-if="parseStructuredData(msg.content).matched_rules.length" class="rule-row">
                      <text v-for="rule in parseStructuredData(msg.content).matched_rules.slice(0, 4)" :key="rule.id || rule.name" class="rule-chip">{{ rule.name }}</text>
                    </view>
                  </view>
                  <view v-if="!msg.isEditing">
                     <view v-if="parseStructuredData(msg.content).mode === 'single'">
                       <view class="struct-grid">
                       <view class="struct-section">
                         <text class="struct-label">隐患描述：</text>
                         <text class="struct-value">{{ parseStructuredData(msg.content).hazard_description }}</text>
                       </view>
                       <view class="struct-section">
                         <text class="struct-label">排查依据：</text>
                         <text class="struct-value">{{ parseStructuredData(msg.content).basis }}</text>
                       </view>
                       <view class="struct-section">
                         <text class="struct-label">整改建议：</text>
                         <text class="struct-value">{{ parseStructuredData(msg.content).suggestion }}</text>
                       </view>
                       </view>
                     </view>
                     <view v-else class="struct-list">
                       <view v-for="(item, idx) in parseStructuredData(msg.content).items" :key="idx" class="struct-card">
                         <text class="struct-heading">隐患分析 {{ idx + 1 }}<text v-if="item.image_id"> · 图片 {{ item.image_id }}</text></text>
                         <view class="struct-section">
                           <text class="struct-label">隐患描述：</text>
                           <text class="struct-value">{{ item.hazard_description }}</text>
                         </view>
                         <view class="struct-section">
                           <text class="struct-label">排查依据：</text>
                           <text class="struct-value">{{ item.basis }}</text>
                         </view>
                         <view class="struct-section">
                           <text class="struct-label">整改建议：</text>
                           <text class="struct-value">{{ item.suggestion }}</text>
                         </view>
                       </view>
                     </view>
                    <view v-if="getDisplayKnowledgeRefs(msg).length || parseStructuredData(msg.content).reference_standards.length" class="reference-panel">
                      <view class="reference-header">
                        <text class="reference-title">引用依据</text>
                        <text class="reference-subtitle">{{ getDisplayKnowledgeRefs(msg).length ? '来自本地知识库命中条款' : '来自 AI 返回的待复核依据' }}</text>
                      </view>
                      <view v-for="(ref, refIndex) in getDisplayKnowledgeRefs(msg)" :key="'knowledge-ref-' + refIndex" class="reference-item">
                        <text class="reference-name">{{ formatKnowledgeRefTitle(ref) }}</text>
                        <text class="reference-content">{{ ref.content || '条款内容为空' }}</text>
                        <text v-if="ref.match_keyword" class="reference-keyword">命中关键词：{{ ref.match_keyword }}</text>
                      </view>
                      <view v-if="!getDisplayKnowledgeRefs(msg).length">
                        <view v-for="(ref, refIndex) in parseStructuredData(msg.content).reference_standards" :key="'standard-ref-' + refIndex" class="reference-item weak">
                          <text class="reference-name">{{ formatReferenceStandardTitle(ref) }}</text>
                          <text class="reference-content">{{ ref.content || '需人工复核具体条款' }}</text>
                        </view>
                      </view>
                    </view>
                    <view class="struct-actions">
                      <button class="mini-btn edit-btn" @click="startEditResult(msg)">编辑修改</button>
                      <button v-if="canConfirmReport(msg)" class="mini-btn save-btn" :disabled="reviewingResult" @click="confirmReport(msg)">确认生成报告</button>
                      <button v-if="canRejectReport(msg)" class="mini-btn struct-cancel-btn" :disabled="reviewingResult" @click="rejectReport(msg)">退回复核</button>
                    </view>
                  </view>
                  <view v-else class="struct-edit-form">
                    <view v-if="msg.editData.mode === 'single'" class="struct-grid edit-grid">
                       <view class="struct-section">
                         <text class="struct-label">隐患描述：</text>
                         <textarea class="struct-textarea" v-model="msg.editData.hazard_description"></textarea>
                       </view>
                       <view class="struct-section">
                         <text class="struct-label">排查依据：</text>
                         <textarea class="struct-textarea" v-model="msg.editData.basis"></textarea>
                       </view>
                       <view class="struct-section">
                         <text class="struct-label">整改建议：</text>
                         <textarea class="struct-textarea" v-model="msg.editData.suggestion"></textarea>
                       </view>
                     </view>
                     <view v-else class="struct-list">
                       <view v-for="(item, idx) in msg.editData.items" :key="idx" class="struct-card">
                         <text class="struct-heading">隐患分析 {{ idx + 1 }}<text v-if="item.image_id"> · 图片 {{ item.image_id }}</text></text>
                         <view class="struct-section">
                           <text class="struct-label">隐患描述：</text>
                           <textarea class="struct-textarea" v-model="item.hazard_description"></textarea>
                         </view>
                         <view class="struct-section">
                           <text class="struct-label">排查依据：</text>
                           <textarea class="struct-textarea" v-model="item.basis"></textarea>
                         </view>
                         <view class="struct-section">
                           <text class="struct-label">整改建议：</text>
                           <textarea class="struct-textarea" v-model="item.suggestion"></textarea>
                         </view>
                       </view>
                     </view>
                    <view class="struct-actions">
                      <button class="mini-btn struct-cancel-btn" @click="cancelEditResult(msg)">取消</button>
                      <button class="mini-btn save-btn" :disabled="savingResult" @click="saveEditResult(msg)">保存</button>
                    </view>
                  </view>
                </view>
                <text v-else class="message-text" selectable>{{ msg.content }}</text>

                <view v-if="msg.wordPath || msg.pdfPath" class="file-links">
                  <text class="file-link" @click="handleDownload(msg.wordPath, 'word', msg)">Word 报告</text>
                  <text class="file-link" @click="handleDownload(msg.pdfPath, 'pdf', msg)">PDF 报告</text>
                </view>
              </view>
            </view>
          </view>
          <view id="bottom-anchor" style="height: 20px;"></view>
        </scroll-view>
      </view>

      <!-- 底部输入区 -->
      <view class="input-container">
        <view v-if="user.role !== 'admin'" class="inspection-task-panel" :class="{ ready: currentInspectionTask }">
          <view class="task-panel-main">
            <text class="task-panel-kicker">本次检查归档</text>
            <text class="task-panel-title">{{ currentEnterpriseName || '请先选择被检查客户企业' }}</text>
            <text class="task-panel-desc">{{ currentTaskSummary }}</text>
          </view>
          <view class="task-panel-actions">
            <button class="task-tab-btn primary" @click="showEnterpriseModal = true">客户企业</button>
            <button class="task-tab-btn dark" :disabled="!currentEnterpriseId || taskCreating" @click="startInspectionTask">{{ currentInspectionTask ? '新建任务' : '创建任务' }}</button>
            <button class="task-tab-btn" :disabled="!currentInspectionTask" @click="openHazardImageModal">图片记录</button>
            <button v-if="currentInspectionTask" class="task-tab-btn muted" @click="completeInspectionTask">完成任务</button>
          </view>
        </view>
        <view class="input-wrapper" :class="{ disabled: user.role !== 'admin' && !currentInspectionTask }">
          <view v-if="selectedHazardImages.length" class="selected-preview">
            <scroll-view scroll-x class="selected-preview-scroll">
              <view class="selected-preview-row">
                <view v-for="img in selectedHazardImages" :key="img.id" class="selected-preview-item">
                  <image class="selected-preview-image" :src="fileUrl(img.file_path)" mode="aspectFill" @click="previewImage(fileUrl(img.file_path))" />
                  <view class="selected-preview-meta">
                    <text class="selected-preview-name">{{ img.original_name || ('图片 #' + img.id) }}</text>
                    <text class="selected-preview-sub">{{ formatFileSize(img.file_size) }}</text>
                  </view>
                  <text class="selected-preview-remove" @click="removeSelectedHazard(img.id)">×</text>
                </view>
              </view>
            </scroll-view>
          </view>
          <textarea
            class="chat-input"
            v-model="prompt"
            :placeholder="currentInspectionTask ? '输入现场描述、整改要求或安全生产问题...' : '请先在下方选择客户企业并创建检查任务'"
            :maxlength="1000"
            @confirm="handleSend"
            fixed
          />
          <view class="input-toolbar">
            <view class="toolbar-left">
              <view class="attachment-btn" :class="{ disabled: user.role !== 'admin' && !currentInspectionTask }" @click="handlePickImage">
                <text>{{ selectedHazardIds.length ? '图片已选' : '上传图片' }}</text>
              </view>
              <!-- 模型选择 -->
              <picker class="model-picker" :range="modelList" range-key="label" :value="selectedModelIndex" @change="onModelChange">
                <view class="model-selector">
                  <view class="model-copy">
                    <text class="model-name-text">{{ selectedModelName }}</text>
                    <text v-if="selectedModelCode" class="model-code-text">{{ selectedModelCode }}</text>
                  </view>
                  <text class="model-arrow">切换</text>
                </view>
              </picker>
              <view v-if="selectedHazardIds.length" class="selected-hazard-tip">
                <text>已选 {{ selectedHazardIds.length }} 张</text>
                <text class="clear-link" @click="clearSelectedHazards">清空</text>
              </view>
            </view>
            <button
              class="send-btn"
              :disabled="!loading && (!canSendMessage || (!prompt && selectedHazardIds.length === 0))"
              @click="loading ? stopCurrentRequest() : handleSend()"
            >
              {{ loading ? '停止' : '发送' }}
            </button>
          </view>
        </view>
      </view>
    </view>

    <!-- 企业信息弹窗：重构为专业表单风格 -->
    <view v-if="showEnterpriseModal && user.role !== 'admin'" class="form-modal-mask">
      <view class="form-modal-content">
        <!-- 弹窗头部：带返回按钮 -->
        <view class="form-header">
          <text class="modal-back-btn" @click="showEnterpriseModal = false">‹</text>
          <text class="header-title">被检查客户企业</text>
        </view>

        <!-- 表单主体：滚动区域 -->
        <scroll-view scroll-y class="form-body">
          <view class="form-section">
            <view class="form-section-title">
              <text>基础档案</text>
              <text>用于报告抬头、企业归属和后续统计</text>
            </view>
            <!-- 企业名称 -->
            <view class="form-item">
              <view class="item-label">
                <text class="required">*</text>
                <text>企业名称</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.name" placeholder="请输入企业全称" placeholder-class="placeholder" />
            </view>

            <!-- 所在地区 (滑动选择) -->
            <view class="form-item">
              <view class="item-label">
                <text class="required">*</text>
                <text>所在地区</text>
              </view>
              <!-- #ifndef H5 -->
              <picker class="picker-container" mode="region" @change="onRegionChange" :value="enterpriseForm.region?.split('-')">
                <view class="picker-value" :class="{ 'placeholder': !enterpriseForm.region }">
                  {{ enterpriseForm.region || '请选择省/市/区' }}
                  <text class="arrow">></text>
                </view>
              </picker>
              <!-- #endif -->
              <!-- #ifdef H5 -->
              <input class="item-input" v-model="enterpriseForm.region" placeholder="请输入省-市-区（例如：陕西省-西安市-雁塔区）" placeholder-class="placeholder" />
              <!-- #endif -->
            </view>

            <!-- 详细地址 -->
            <view class="form-item">
              <view class="item-label">
                <text class="required">*</text>
                <text>详细地址</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.address" placeholder="请输入街道/门牌号等" placeholder-class="placeholder" />
            </view>

            <!-- 项目名称 -->
            <view class="form-item border-none">
              <view class="item-label">
                <text>项目名称</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.project_name" placeholder="请输入项目名称（选填）" placeholder-class="placeholder" />
            </view>
          </view>

          <view class="form-section">
            <view class="form-section-title">
              <text>企业属性</text>
              <text>用于风险统计和报告补充信息</text>
            </view>
            <view class="form-item">
              <view class="item-label">
                <text>所属行业</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.industry" placeholder="例如：建筑施工" placeholder-class="placeholder" />
            </view>
            <view class="form-item">
              <view class="item-label">
                <text>企业类型</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.enterprise_type" placeholder="例如：有限责任公司" placeholder-class="placeholder" />
            </view>
            <view class="form-item border-none">
              <view class="item-label">
                <text>企业规模</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.scale" placeholder="例如：中型" placeholder-class="placeholder" />
            </view>
          </view>

          <view class="form-section">
            <view class="form-section-title">
              <text>联系与检查</text>
              <text>用于现场排查记录和报告签发信息</text>
            </view>
            <!-- 联系人 -->
            <view class="form-item">
              <view class="item-label">
                <text class="required">*</text>
                <text>联系人</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.contact" placeholder="请输入负责人姓名" placeholder-class="placeholder" />
            </view>

            <!-- 联系电话 -->
            <view class="form-item">
              <view class="item-label">
                <text class="required">*</text>
                <text>联系电话</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.phone" placeholder="请输入联系方式" type="number" placeholder-class="placeholder" />
            </view>
            <view class="form-item border-none">
              <view class="item-label">
                <text>现场排查人员</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.inspector_name" placeholder="请输入排查人员姓名" placeholder-class="placeholder" />
            </view>
          </view>

          <view class="form-section">
            <view class="form-section-title">
              <text>排查补充</text>
              <text>用于报告正文和后续复查记录</text>
            </view>
            <view class="form-item">
              <view class="item-label">
                <text>排查日期</text>
              </view>
              <input class="item-input" v-model="enterpriseForm.inspection_date" placeholder="例如：2026-06-17" placeholder-class="placeholder" />
            </view>
            <view class="form-item form-item-vertical border-none">
              <view class="item-label">
                <text>生产工艺/现场概况</text>
              </view>
              <textarea
                class="item-textarea"
                v-model="enterpriseForm.production_process"
                placeholder="可填写主要生产流程、施工阶段、重点区域等"
                placeholder-class="placeholder"
              />
            </view>
          </view>
        </scroll-view>

        <!-- 底部操作区：提交与保存 -->
        <view class="form-footer">
          <button class="footer-action-btn primary-btn" :disabled="enterpriseSaving" @click="saveEnterpriseInfo">{{ enterpriseSaving ? '提交中...' : '提交信息' }}</button>
          <button class="footer-action-btn secondary-btn" @click="resetEnterpriseDraft">新建空白企业</button>
          <button class="footer-action-btn secondary-btn" @click="showEnterpriseModal = false">暂不提交</button>
        </view>
      </view>
    </view>

    <!-- 隐患图片弹窗：上传/查看/删除 -->
    <view v-if="showHazardImageModal && user.role !== 'admin'" class="form-modal-mask">
      <view class="form-modal-content">
        <view class="form-header">
          <text class="modal-back-btn" @click="showHazardImageModal = false">‹</text>
          <text class="header-title">隐患图片上传</text>
        </view>

        <view class="hazard-toolbar">
          <view class="hazard-toolbar-main">
            <button class="footer-action-btn primary-btn" :disabled="hazardUploading || !currentInspectionTask" @click="pickHazardImages">
              {{ hazardUploading ? '上传中...' : (currentInspectionTask ? '选择图片上传' : '请先创建检查任务') }}
            </button>
            <button v-if="hazardFailedPaths.length" class="footer-action-btn primary-btn" :disabled="hazardUploading" @click="retryFailedUploads">
              重试失败({{ hazardFailedPaths.length }})
            </button>
            <button class="footer-action-btn secondary-btn" @click="fetchHazardImages">刷新列表</button>
          </view>
          <view v-if="selectedHazardIds.length" class="hazard-selected-info">
            <text>已选 {{ selectedHazardIds.length }} 张</text>
            <text class="hazard-clear" @click="clearSelectedHazards">清空</text>
          </view>
        </view>

        <scroll-view scroll-y class="hazard-body">
          <view v-if="hazardImageList.length === 0" class="empty-tip">暂无图片，请先上传</view>
          <view v-else class="hazard-grid">
            <view v-for="img in hazardImageList" :key="img.id" class="hazard-item">
              <view class="hazard-thumb-wrap">
                <image class="hazard-thumb" :src="fileUrl(img.file_path)" mode="aspectFill" @click="previewImage(fileUrl(img.file_path))" />
                <text class="hazard-status">{{ selectedHazardIds.includes(img.id) ? '已选' : '待选' }}</text>
              </view>
              <view
                class="hazard-select"
                :class="{ active: selectedHazardIds.includes(img.id) }"
                @click.stop="toggleHazardSelect(img)"
              >
                <text v-if="selectedHazardIds.includes(img.id)" class="hazard-select-icon">✓</text>
              </view>
              <view class="hazard-meta">
                <view class="hazard-copy">
                  <text class="hazard-name">{{ img.original_name || ('图片 #' + img.id) }}</text>
                  <text class="hazard-sub">{{ formatFileSize(img.file_size) }} · {{ formatDateTime(img.created_at) }}</text>
                </view>
                <view class="hazard-card-actions">
                  <button class="hazard-action" @click.stop="toggleHazardSelect(img)">{{ selectedHazardIds.includes(img.id) ? '取消' : '选择' }}</button>
                  <button class="hazard-del" @click.stop="deleteHazardImage(img)">删除</button>
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 删除确认弹窗：H5 下避免 uni.showModal 被遮罩层盖住 -->
    <view v-if="showHazardDeleteConfirm" class="confirm-mask" @click="showHazardDeleteConfirm = false">
      <view class="confirm-card" @click.stop="">
        <text class="confirm-title">确认删除</text>
        <text class="confirm-content">删除后无法恢复，且可能影响关联分析/报告</text>
        <view class="confirm-actions">
          <button class="confirm-btn cancel" @click="showHazardDeleteConfirm = false">取消</button>
          <button class="confirm-btn danger" :disabled="hazardDeleting" @click="confirmDeleteHazardImage">删除</button>
        </view>
      </view>
    </view>

    <!-- 移动端侧边栏遮罩 -->
    <view v-if="showSidebar" class="sidebar-mask" @click="showSidebar = false"></view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { apiUrl, clearLoginSession, downloadFile, fileUrl, getAccessToken, getStoredUser, request, requestTask, uploadFile } from '../../common/api-config'

const user = ref({})
const prompt = ref('')
const imagePath = ref('')
const messages = ref([])
const loading = ref(false)
const currentSessionId = ref(null)
const currentSessionTitle = ref('新对话')
const sessionList = ref([])
const showSidebar = ref(false)
const lastMessageId = ref('')
const showEnterpriseModal = ref(false)
const createEmptyEnterpriseForm = () => ({
  name: '',
  region: '',
  address: '',
  contact: '',
  phone: '',
  project_name: '',
  industry: '',
  enterprise_type: '',
  scale: '',
  production_process: '',
  inspector_name: '',
  inspection_date: '',
})
const enterpriseForm = ref(createEmptyEnterpriseForm())

/** 将日期输入统一为 YYYY-MM-DD，兼容后端 DATE 字段 */
const toDateOnly = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10)
  const text = String(value).trim()
  const match = text.match(/^\d{4}-\d{2}-\d{2}/)
  if (match) return match[0]
  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}
const showHazardImageModal = ref(false)
const hazardImageList = ref([])
const hazardUploading = ref(false)
const hazardFailedPaths = ref([])
const showHazardDeleteConfirm = ref(false)
const hazardDeleting = ref(false)
const pendingHazardDelete = ref(null)
const savingResult = ref(false)
const reviewingResult = ref(false)
const selectedHazardIds = ref([])
const currentEnterpriseId = ref(null)
const currentInspectionTask = ref(null)
const inspectionTaskList = ref([])
const taskCreating = ref(false)
const enterpriseSaving = ref(false)
const currentRequestTask = ref(null)
const modelList = ref([])
const selectedModelId = ref(null)
const selectedModelIndex = ref(0)
let pendingAssistantMessage = null

/** 当前用户头像显示内容，避免用户侧消息没有身份标识 */
const userInitial = computed(() => String(user.value?.username || 'U').slice(0, 1).toUpperCase())

/** 当前模型配置名称，和模型 ID 分开展示，避免重复长文本挤压输入区 */
const selectedModel = computed(() => modelList.value[selectedModelIndex.value] || modelList.value[0] || { label: '默认模型', code: '' })
const selectedModelName = computed(() => selectedModel.value.label || '默认模型')
const selectedModelCode = computed(() => {
  const label = String(selectedModel.value.label || '').trim().toLowerCase()
  const code = String(selectedModel.value.code || '').trim()
  return code && code.toLowerCase() !== label ? code : ''
})

/** 当前输入区已选图片，直接展示缩略图，避免用户只能去图片记录里确认 */
/** 当前被检查客户企业名称 */
const currentEnterpriseName = computed(() => currentInspectionTask.value?.enterprise_name || enterpriseForm.value?.name || '')

/** 当前检查任务摘要，给检查员明确知道图片会归档到哪里 */
const currentTaskSummary = computed(() => {
  if (!currentEnterpriseId.value) return '步骤 1：选择或新建客户企业。未完成前不能上传图片和发起分析。'
  if (!currentInspectionTask.value) return '步骤 2：创建检查任务。任务建立后，图片和报告会自动归档到该客户企业。'
  const task = currentInspectionTask.value
  return (task.task_no || '未编号任务') + ' · ' + (task.inspection_date || '未填写日期') + ' · ' + (task.status === 'completed' ? '已完成' : '进行中')
})

/** 没有检查任务时禁止上传和分析，防止图片脱离客户企业归档 */
const canSendMessage = computed(() => user.value?.role === 'admin' || !!currentInspectionTask.value)

const selectedHazardImages = computed(() => {
  const recordMap = new Map(hazardImageList.value.map((img) => [Number(img.id), img]))
  return selectedHazardIds.value
    .map((id) => recordMap.get(Number(id)))
    .filter(Boolean)
})

/** 将图片记录转为聊天气泡中的轻量预览数据 */
const mapHazardImagesForMessage = (ids) => {
  const recordMap = new Map(hazardImageList.value.map((img) => [Number(img.id), img]))
  return ids
    .map((id) => recordMap.get(Number(id)))
    .filter(Boolean)
    .map((img) => ({
      id: Number(img.id),
      url: fileUrl(img.file_path),
      name: img.original_name || `图片 #${img.id}`,
    }))
}

/** 格式化图片文件大小，避免图片记录列表只显示文件名 */
const formatFileSize = (value) => {
  const size = Number(value || 0)
  if (!size) return '大小未知'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/** 格式化上传时间，数据库为空时保持简洁占位 */
const formatDateTime = (value) => {
  if (!value) return '时间未知'
  const text = String(value).replace('T', ' ').replace(/\.\d+Z?$/, '')
  return text.length > 16 ? text.slice(0, 16) : text
}

/** 将后端返回的引用依据归一化，兼容下划线字段和 AI 返回字段 */
const normalizeKnowledgeRefs = (refs) => {
  if (!Array.isArray(refs)) return []
  return refs
    .map((ref) => ({
      source_title: ref.source_title || ref.name || ref.title || '',
      source_code: ref.source_code || ref.code || '',
      clause_no: ref.clause_no || ref.clause || '',
      content: ref.content || ref.text || '',
      match_keyword: ref.match_keyword || '',
    }))
    .filter((ref) => ref.source_title || ref.source_code || ref.clause_no || ref.content)
}

/** 格式化本地知识库引用标题 */
const formatKnowledgeRefTitle = (ref) => {
  const title = ref?.source_title ? `《${ref.source_title}》` : '未命名依据'
  const code = ref?.source_code ? `（${ref.source_code}）` : ''
  const clause = ref?.clause_no ? `${ref.clause_no}` : ''
  return `${title}${code}${clause}`
}

/** 格式化 AI JSON 中的 reference_standards 标题 */
const formatReferenceStandardTitle = (ref) => {
  const name = ref?.name ? `《${ref.name}》` : '待复核依据'
  const code = ref?.code ? `（${ref.code}）` : ''
  const clause = ref?.clause ? `${ref.clause}` : ''
  return `${name}${code}${clause}`
}

/** 获取当前消息可展示的引用依据，优先使用后端保存的本地知识库快照 */
const getDisplayKnowledgeRefs = (msg) => normalizeKnowledgeRefs(msg?.knowledgeRefs || msg?.knowledge_refs || [])

/** 将规则驱动初判字段附加到结构化展示数据 */
const attachAssessmentFields = (target, data) => ({
  ...target,
  scene_status: data.scene_status || '',
  scene_reason: data.scene_reason || '',
  visible_facts: Array.isArray(data.visible_facts) ? data.visible_facts : [],
  uncertain_points: Array.isArray(data.uncertain_points) ? data.uncertain_points : [],
  matched_rules: Array.isArray(data.matched_rules) ? data.matched_rules : [],
  legal_refs: Array.isArray(data.legal_refs) ? data.legal_refs : [],
  evidence_sufficiency: data.evidence_sufficiency || '',
  hazard_level: data.hazard_level || '',
  review_required: !!data.review_required,
  report_allowed: data.report_allowed,
  report_block_reason: data.report_block_reason || '',
  review_status: data.review_status || '',
})

/** 场景状态展示文案 */
const sceneStatusText = (status) => {
  const map = {
    related: '业务场景',
    unrelated: '非业务图片',
    non_business: '非业务图片',
    irrelevant: '非业务图片',
    uncertain: '需复核场景',
  }
  return map[String(status || 'uncertain')] || '需复核场景'
}

/** 场景状态样式 */
const sceneStatusClass = (status) => `scene-${String(status || 'uncertain')}`

/** 证据充分性展示文案 */
const evidenceText = (status) => {
  const map = {
    sufficient: '充分',
    partial: '部分充分',
    insufficient: '不足',
    not_applicable: '不适用',
  }
  return map[String(status || 'insufficient')] || '不足'
}

// 尝试解析结构化数据 (9.6 智能隐患分析模块)
const parseStructuredData = (content) => {
  if (!content) return null
  try {
    let text = content.trim()
    if (text.startsWith('```json')) {
      text = text.substring(7)
    } else if (text.startsWith('```')) {
      text = text.substring(3)
    }
    if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3)
    }
    const data = JSON.parse(text)
    // 兼容两种结构：
    // 1) 单条结构化：{ hazard_description, basis, suggestion }
    // 2) 多图结构化：{ items: [{ image_id, hazard_description, basis, suggestion }] }
    if (data && typeof data === 'object') {
      if (Array.isArray(data.items)) {
        return attachAssessmentFields({
          mode: 'multi',
          items: data.items,
          reference_standards: Array.isArray(data.reference_standards) ? data.reference_standards : [],
          comprehensive_opinion: data.comprehensive_opinion || null,
        }, data)
      }
      if (data.hazard_description) {
        return attachAssessmentFields({
          mode: 'single',
          hazard_description: data.hazard_description,
          basis: data.basis || '',
          suggestion: data.suggestion || '',
          reference_standards: Array.isArray(data.reference_standards) ? data.reference_standards : [],
          comprehensive_opinion: data.comprehensive_opinion || null,
        }, data)
      }
    }
  } catch (e) {
    // 解析失败则视为普通文本
  }
  return null
}

/** 保存编辑结果时保留规则初判字段，避免编辑正文后丢失依据追溯和报告拦截状态 */
const buildAssessmentFieldsForSave = (data = {}) => ({
  scene_status: data.scene_status || '',
  scene_reason: data.scene_reason || '',
  visible_facts: Array.isArray(data.visible_facts) ? data.visible_facts : [],
  uncertain_points: Array.isArray(data.uncertain_points) ? data.uncertain_points : [],
  matched_rules: Array.isArray(data.matched_rules) ? data.matched_rules : [],
  legal_refs: Array.isArray(data.legal_refs) ? data.legal_refs : [],
  evidence_sufficiency: data.evidence_sufficiency || '',
  hazard_level: data.hazard_level || '',
  review_required: !!data.review_required,
  report_allowed: data.report_allowed,
  report_block_reason: data.report_block_reason || '',
  review_status: data.review_status || '',
})

const canConfirmReport = (msg) => {
  if (!msg?.id || msg.wordPath || msg.pdfPath) return false
  if (msg.reportAllowed === false || msg.report_allowed === false) return false
  return ['pending', 'needs_review', ''].includes(String(msg.reviewStatus || msg.review_status || ''))
}

const canRejectReport = (msg) => !!msg?.id && !['needs_review', 'rejected'].includes(String(msg.reviewStatus || msg.review_status || ''))

const applyReviewResponse = (msg, data = {}) => {
  msg.reviewStatus = data.review_status || msg.reviewStatus
  msg.review_required = data.review_required
  msg.reviewRequired = data.review_required
  msg.reportAllowed = data.report_allowed ?? msg.reportAllowed
  msg.report_allowed = data.report_allowed ?? msg.report_allowed
  msg.reportBlockReason = data.report_block_reason || msg.reportBlockReason
  msg.report_block_reason = data.report_block_reason || msg.report_block_reason
  msg.wordPath = data.wordPath || null
  msg.pdfPath = data.pdfPath || null
}

const confirmReport = (msg) => {
  if (!msg.id || reviewingResult.value) return
  reviewingResult.value = true
  request({
    url: apiUrl('/api/history/review/confirm'),
    method: 'POST',
    data: { id: msg.id },
  }).then((res) => {
    if (res.data?.success) {
      applyReviewResponse(msg, res.data)
      uni.showToast({ title: '正式报告已生成', icon: 'success' })
    } else {
      uni.showToast({ title: res.data?.message || '确认失败', icon: 'none' })
    }
  }).catch(() => {
    uni.showToast({ title: '网络错误，请稍后重试', icon: 'none' })
  }).finally(() => {
    reviewingResult.value = false
  })
}

const rejectReport = (msg) => {
  if (!msg.id || reviewingResult.value) return
  reviewingResult.value = true
  request({
    url: apiUrl('/api/history/review/reject'),
    method: 'POST',
    data: { id: msg.id, comment: '前端人工退回复核' },
  }).then((res) => {
    if (res.data?.success) {
      applyReviewResponse(msg, res.data)
      uni.showToast({ title: '已退回复核', icon: 'success' })
    } else {
      uni.showToast({ title: res.data?.message || '退回失败', icon: 'none' })
    }
  }).catch(() => {
    uni.showToast({ title: '网络错误，请稍后重试', icon: 'none' })
  }).finally(() => {
    reviewingResult.value = false
  })
}
// 开始编辑结果
const startEditResult = (msg) => {
  const data = parseStructuredData(msg.content)
  if (data) {
    msg.isEditing = true
    msg.editData = JSON.parse(JSON.stringify(data))
  }
}

// 取消编辑结果
const cancelEditResult = (msg) => {
  msg.isEditing = false
  msg.editData = null
}

// 保存编辑结果
const saveEditResult = (msg) => {
  if (!msg.id) return uni.showToast({ title: '无法保存，缺少记录ID', icon: 'none' })
  savingResult.value = true
  const originalData = parseStructuredData(msg.content) || {}
  const assessmentFields = buildAssessmentFieldsForSave(originalData)
  const payload = msg.editData?.mode === 'multi'
    ? {
        items: msg.editData.items,
        reference_standards: originalData.reference_standards || [],
        comprehensive_opinion: originalData.comprehensive_opinion || null,
        ...assessmentFields,
      }
    : {
        hazard_description: msg.editData.hazard_description,
        basis: msg.editData.basis,
        suggestion: msg.editData.suggestion,
        reference_standards: originalData.reference_standards || [],
        comprehensive_opinion: originalData.comprehensive_opinion || null,
        ...assessmentFields,
      }
  const newContent = JSON.stringify(payload, null, 2)
  request({
    url: apiUrl('/api/history/update-result'),
    method: 'POST',
    data: {
      id: msg.id,
      result: newContent
    },
  }).then((res) => {
      if (res.data.success) {
        msg.content = newContent
        msg.isEditing = false
        msg.editData = null
        applyReviewResponse(msg, res.data)
        msg.wordPath = null
        msg.pdfPath = null
        uni.showToast({ title: '保存成功', icon: 'success' })
      } else {
        uni.showToast({ title: res.data.message || '保存失败', icon: 'none' })
      }
    }).catch(() => {
      uni.showToast({ title: '网络错误，请稍后重试', icon: 'none' })
    }).finally(() => {
      savingResult.value = false
    })
}

onMounted(() => {
  const storedUser = getStoredUser()
  if (storedUser && storedUser.id) {
    user.value = storedUser
    fetchModelList()
    fetchSessions()
    fetchEnterpriseInfo()
    fetchHazardImages()
  } else {
    clearLoginSession()
    uni.reLaunch({ url: '/pages/login/login' })
  }
})

/**
 * 打开隐患图片弹窗
 * 弹窗内支持上传、预览、删除与刷新列表
 */
const openHazardImageModal = () => {
  showHazardImageModal.value = true
  fetchHazardImages()
}

/**
 * 获取隐患图片列表
 * @returns {void}
 */
const fetchHazardImages = () => {
  if (!user.value?.id) return
  const query = currentInspectionTask.value?.id ? '?inspection_task_id=' + currentInspectionTask.value.id : ''
  return request({
    url: apiUrl('/api/hazard/images/list' + query),
    method: 'GET',
  }).then((res) => {
    if (res.data?.success) hazardImageList.value = res.data.data || []
  }).catch(() => {})
}

/**
 * 选择图片并上传（支持多选）
 * @returns {void}
 */
const pickHazardImages = () => {
  if (hazardUploading.value) return
  uni.chooseImage({
    count: 9,
    success: async (res) => {
      const files = res.tempFilePaths || []
      if (!files.length) return
      hazardFailedPaths.value = []
      await uploadHazardImages(files)
    }
  })
}

/**
 * 逐个上传图片，提供明确的加载反馈与失败提示（9.5 性能/交互要求）
 * @param {string[]} filePaths
 * @returns {Promise<void>}
 */
const uploadHazardImages = async (filePaths) => {
  hazardUploading.value = true
  uni.showLoading({ title: '上传中...' })
  const uploadedIds = []

  try {
    for (const fp of filePaths) {
      const ok = await new Promise((resolve) => {
        const task = uploadFile({
          url: apiUrl('/api/hazard/images/upload'),
          filePath: fp,
          name: 'files',
          formData: { inspection_task_id: currentInspectionTask.value?.id || '' },
          success: (res) => {
            let data
            try {
              data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            } catch (e) {
              data = null
            }
            if (res.statusCode >= 200 && res.statusCode < 300 && data && data.success) {
              const created = Array.isArray(data.data) ? data.data : []
              created.forEach((item) => {
                if (item?.id) uploadedIds.push(Number(item.id))
              })
              resolve(true)
            } else {
              resolve(false)
            }
          },
          fail: () => resolve(false)
        })
      })
      if (!ok) hazardFailedPaths.value.push(fp)
    }
    await fetchHazardImages()
    if (hazardFailedPaths.value.length) {
      uni.showToast({ title: `部分失败：${hazardFailedPaths.value.length} 张`, icon: 'none' })
    } else {
      uni.showToast({ title: '上传完成', icon: 'success' })
    }
  } finally {
    uni.hideLoading()
    hazardUploading.value = false
  }

  return uploadedIds
}

/**
 * 重试失败的上传任务
 * @returns {Promise<void>}
 */
const retryFailedUploads = async () => {
  const pending = hazardFailedPaths.value.slice()
  if (!pending.length) return
  hazardFailedPaths.value = []
  await uploadHazardImages(pending)
}

/**
 * 删除隐患图片（包含二次确认）
 * @param {{id:number, file_path:string}} img
 * @returns {void}
 */
const deleteHazardImage = (img) => {
  pendingHazardDelete.value = img
  showHazardDeleteConfirm.value = true
}

/**
 * 确认删除隐患图片
 * @returns {void}
 */
const confirmDeleteHazardImage = () => {
  const img = pendingHazardDelete.value
  if (!img?.id || hazardDeleting.value) return
  hazardDeleting.value = true

  request({
    url: apiUrl('/api/hazard/images/delete'),
    method: 'POST',
    data: { id: img.id },
  }).then((res) => {
      if (res.data?.success) {
        uni.showToast({ title: '已删除' })
        fetchHazardImages()
        showHazardDeleteConfirm.value = false
        pendingHazardDelete.value = null
      } else {
        uni.showToast({ title: res.data?.message || '删除失败', icon: 'none' })
      }
    }).catch(() => {
      uni.showToast({ title: '网络错误，请稍后重试', icon: 'none' })
    }).finally(() => {
      hazardDeleting.value = false
    })
}

/**
 * 处理省市区滑动选择
 * 将选择的数组拼接为 陕西省-西安市-雁塔区 格式存储
 */
const onRegionChange = (e) => {
  enterpriseForm.value.region = e.detail.value.join('-')
}

/**
 * 获取企业基础信息
 * 检查员登录后自动调用，用于在侧边栏和报告生成中回显
 */
// 获取可用模型列表
const fetchModelList = () => {
  request({
    url: apiUrl('/api/models/list'),
    method: 'GET',
  }).then((res) => {
      const data = res.data?.data || res.data || []
      if (Array.isArray(data) && data.length) {
        modelList.value = data.map((m) => ({
          id: m.id,
          label: m.name || m.model_name || '未命名模型',
          code: m.model_name || '',
          isActive: !!m.is_active,
        }))
        const activeIndex = modelList.value.findIndex((item) => item.isActive)
        selectedModelIndex.value = activeIndex >= 0 ? activeIndex : 0
        selectedModelId.value = modelList.value[selectedModelIndex.value]?.id || null
      } else {
        modelList.value = [{ id: null, label: '环境默认模型', code: '服务端 .env 兜底' }]
        selectedModelIndex.value = 0
        selectedModelId.value = null
      }
    }).catch(() => {
      modelList.value = [{ id: null, label: '环境默认模型', code: '服务端 .env 兜底' }]
      selectedModelIndex.value = 0
      selectedModelId.value = null
    })
}

// 模型切换
const onModelChange = (e) => {
  selectedModelIndex.value = e.detail.value
  selectedModelId.value = modelList.value[e.detail.value]?.id || null
}

/** 当前用户所属企业 ID，用于隐患图片上传和 AI 分析时自动关联 */
/** 初始化客户企业信息：优先从最近任务恢复检查对象，旧接口仅作为兼容兜底 */
const fetchEnterpriseInfo = () => {
  request({
    url: apiUrl('/api/enterprise/get'),
    method: 'POST',
  }).then((res) => {
    if (res.data.success) {
      const d = res.data
      const enterpriseData = d.data && typeof d.data === 'object' && Object.keys(d.data).length ? d.data : d
      if (enterpriseData?.id) {
        enterpriseForm.value = { ...createEmptyEnterpriseForm(), ...enterpriseData }
        currentEnterpriseId.value = enterpriseData.id || null
      }
    }
  }).catch(() => {})
}

/** 获取当前检查员最近任务，进入页面时自动恢复正在进行的任务 */
const resetEnterpriseDraft = () => {
  currentEnterpriseId.value = null
  currentInspectionTask.value = null
  selectedHazardIds.value = []
  hazardImageList.value = []
  enterpriseForm.value = {
    ...createEmptyEnterpriseForm(),
    inspection_date: new Date().toISOString().slice(0, 10),
  }
}

const fetchInspectionTasks = () => {
  return request({
    url: apiUrl('/api/inspection-tasks/list'),
    method: 'POST',
    data: { limit: 20 },
  }).then((res) => {
    if (!res.data?.success) return
    inspectionTaskList.value = res.data.data || []
    const active = inspectionTaskList.value.find((task) => task.status === 'active')
    if (active && !currentInspectionTask.value) {
      currentInspectionTask.value = active
      currentEnterpriseId.value = active.enterprise_id
      enterpriseForm.value = {
        ...enterpriseForm.value,
        id: active.enterprise_id,
        name: active.enterprise_name || enterpriseForm.value.name,
        industry: active.enterprise_industry || enterpriseForm.value.industry,
        region: active.enterprise_region || enterpriseForm.value.region,
      }
    }
  }).catch(() => {})
}

const saveEnterpriseInfo = () => {
  if (enterpriseSaving.value) return
  // 基础表单校验
  if (!enterpriseForm.value.name) return uni.showToast({ title: '请输入企业名称', icon: 'none' })
  if (!enterpriseForm.value.region) return uni.showToast({ title: '请选择所在地区', icon: 'none' })
  if (!enterpriseForm.value.address) return uni.showToast({ title: '请输入详细地址', icon: 'none' })
  if (!enterpriseForm.value.contact) return uni.showToast({ title: '请输入联系人', icon: 'none' })
  if (!enterpriseForm.value.phone) return uni.showToast({ title: '请输入联系电话', icon: 'none' })
  enterpriseSaving.value = true
  uni.showLoading({ title: '保存中...' })
  request({
    url: apiUrl('/api/client-enterprises/upsert'),
    method: 'POST',
    data: { ...enterpriseForm.value, inspection_date: toDateOnly(enterpriseForm.value.inspection_date), id: currentEnterpriseId.value || enterpriseForm.value.id || null },
  }).then((res) => {
      uni.hideLoading()
      if (res.data.success) {
        const saved = res.data.data || res.data
        if (saved?.id) {
          currentEnterpriseId.value = saved.id
          enterpriseForm.value = { ...enterpriseForm.value, ...saved, inspection_date: toDateOnly(saved.inspection_date || enterpriseForm.value.inspection_date) }
          currentInspectionTask.value = null
          selectedHazardIds.value = []
          hazardImageList.value = []
        }
        uni.showToast({ title: '企业已保存，请创建任务' })
        showEnterpriseModal.value = false // 保存成功后关闭弹窗
        fetchInspectionTasks()
      }
    }).catch(() => {
      uni.hideLoading()
      uni.showToast({ title: '网络请求失败，请稍后重试', icon: 'none' })
    }).finally(() => {
      enterpriseSaving.value = false
    })
}

// 获取会话列表

/** 创建新的检查任务，新上传图片会自动归档到该任务 */
const startInspectionTask = async () => {
  if (!currentEnterpriseId.value) return uni.showToast({ title: '请先保存客户企业', icon: 'none' })
  if (taskCreating.value) return
  taskCreating.value = true
  try {
    const res = await request({
      url: apiUrl('/api/inspection-tasks/start'),
      method: 'POST',
      data: {
        enterprise_id: currentEnterpriseId.value,
        inspection_date: toDateOnly(enterpriseForm.value.inspection_date),
        location: enterpriseForm.value.address || enterpriseForm.value.region || '',
        requirement: prompt.value || '现场安全检查',
        remark: enterpriseForm.value.project_name || '',
      },
    })
    if (res.data?.success) {
      currentInspectionTask.value = res.data.data
      selectedHazardIds.value = []
      hazardImageList.value = []
      await fetchInspectionTasks()
      await fetchHazardImages()
      uni.showToast({ title: '检查任务已创建', icon: 'success' })
    } else {
      uni.showToast({ title: res.data?.msg || '创建任务失败', icon: 'none' })
    }
  } finally {
    taskCreating.value = false
  }
}

/** 完成当前任务，完成后需要新建任务才能继续上传 */
const completeInspectionTask = async () => {
  if (!currentInspectionTask.value) return
  const res = await request({
    url: apiUrl('/api/inspection-tasks/complete'),
    method: 'POST',
    data: { inspection_task_id: currentInspectionTask.value.id },
  })
  if (res.data?.success) {
    currentInspectionTask.value = null
    selectedHazardIds.value = []
    hazardImageList.value = []
    await fetchInspectionTasks()
    uni.showToast({ title: '任务已完成', icon: 'success' })
  } else {
    uni.showToast({ title: res.data?.msg || '操作失败', icon: 'none' })
  }
}
const fetchSessions = () => {
  request({
    url: apiUrl('/api/sessions'),
  }).then((res) => {
      if (res.data.success) {
        sessionList.value = res.data.data
      }
    }).catch(() => {})
}

// 加载特定会话
const loadSession = (sessionId) => {
  currentSessionId.value = sessionId
  const session = sessionList.value.find(s => s.session_id === sessionId)
  currentSessionTitle.value = session ? session.title : '对话详情'

  request({
    url: apiUrl(`/api/session/${sessionId}`),
  }).then((res) => {
      if (res.data.success) {
        messages.value = res.data.data.map(item => [
          { role: 'user', content: item.prompt, image: item.image_path ? fileUrl(item.image_path) : null },
          {
            id: item.id,
            role: 'assistant',
            content: item.result,
            wordPath: item.wordPath || item.word_path,
            pdfPath: item.pdfPath || item.pdf_path,
            knowledgeRefs: normalizeKnowledgeRefs(item.knowledge_refs),
            reviewStatus: item.review_status,
            review_required: item.review_required,
            reportAllowed: item.report_allowed,
            reportBlockReason: item.report_block_reason,
            isEditing: false,
            editData: null
          }
        ]).flat()
        scrollToBottom()
      }
    }).catch(() => {})
  if (uni.getSystemInfoSync().windowWidth < 768) showSidebar.value = false
}

// 开启新对话
const startNewChat = () => {
  currentSessionId.value = null
  currentSessionTitle.value = '新对话'
  messages.value = []
  prompt.value = ''

  selectedHazardIds.value = []
  if (uni.getSystemInfoSync().windowWidth < 768) showSidebar.value = false
}

// 删除会话
const deleteSession = (sessionId) => {
  uni.showModal({
    title: '确认删除',
    content: '删除后无法找回对话内容',
    success: (res) => {
      if (res.confirm) {
        request({
          url: apiUrl('/api/session/delete'),
          method: 'POST',
          data: { session_id: sessionId },
        }).then(() => {
            fetchSessions()
            if (currentSessionId.value === sessionId) startNewChat()
        }).catch(() => {})
      }
    }
  })
}

// 处理 AI 对话
// 发送/分析入口（9.5+9.6：支持单图/多图隐患分析，且可手动停止请求）
const handleSend = () => {
  if (loading.value) return
  if (!prompt.value && selectedHazardIds.value.length === 0) return
  if (!canSendMessage.value) {
    uni.showToast({ title: '请先选择客户企业并创建检查任务', icon: 'none' })
    showEnterpriseModal.value = true
    return
  }

  const currentPrompt = prompt.value

  const selectedIds = selectedHazardIds.value.slice()
  const selectedImages = mapHazardImagesForMessage(selectedIds)
  const suffix = selectedIds.length ? `\n（已选择隐患照片：${selectedIds.length} 张）` : ''
  const userMsg = {
    role: 'user',
    content: `${currentPrompt || ''}${suffix}`.trim(),
    image: '',
    images: selectedImages,
  }
  messages.value.push(userMsg)
  pendingAssistantMessage = {
    role: 'assistant',
    content: '',
    loading: true,
    isEditing: false,
    editData: null,
  }
  messages.value.push(pendingAssistantMessage)

  prompt.value = ''

  selectedHazardIds.value = []
  loading.value = true
  scrollToBottom()

  currentRequestTask.value = null

  if (selectedIds.length) {
    // 多图隐患分析（9.5 + 9.6）：使用已上传的隐患照片进行一次性分析
    const reqTask = requestTask({
      url: apiUrl('/api/hazard/analyze'),
      method: 'POST',
      data: {
        prompt: currentPrompt,
        session_id: currentSessionId.value,
        image_ids: selectedIds,
        inspection_task_id: currentInspectionTask.value?.id || null,
        model_id: selectedModelId.value || '',
      },
      success: (res) => handleResponse(res.data),
      fail: (error) => handleError(error),
      complete: () => {
        currentRequestTask.value = null
        loading.value = false
      }
    })
    currentRequestTask.value = reqTask
    return
  }

  // 纯文本对话：沿用 /api/process
  const reqTask = requestTask({
    url: apiUrl('/api/process'),
    method: 'POST',
    data: {
      prompt: currentPrompt,
      session_id: currentSessionId.value,
      model_id: selectedModelId.value || '',
    },
    success: (res) => handleResponse(res.data),
    fail: (error) => handleError(error),
    complete: () => {
      currentRequestTask.value = null
      loading.value = false
    }
  })
  currentRequestTask.value = reqTask
}

const handleResponse = (data) => {
  if (!data) {
    uni.showToast({ title: '服务器返回异常', icon: 'none' })
    return
  }

  if (data.success) {
    const assistantMessage = {
      id: data.id,
      role: 'assistant',
      content: data.result,
      wordPath: data.wordPath,
      pdfPath: data.pdfPath,
      knowledgeRefs: normalizeKnowledgeRefs(data.knowledge_refs),
      reviewStatus: data.review_status,
      review_required: data.review_required,
      reportAllowed: data.report_allowed,
      reportBlockReason: data.report_block_reason,
      isEditing: false,
      editData: null
    }
    if (pendingAssistantMessage) {
      Object.assign(pendingAssistantMessage, assistantMessage, { loading: false })
    } else {
      messages.value.push(assistantMessage)
    }
    pendingAssistantMessage = null
    currentSessionId.value = data.sessionId
    fetchSessions()
    scrollToBottom()
  } else {
    if (pendingAssistantMessage) {
      Object.assign(pendingAssistantMessage, {
        loading: false,
        content: data.msg || data.message || 'AI 分析失败，请检查模型配置或稍后重试。',
      })
      pendingAssistantMessage = null
      scrollToBottom()
    }
    uni.showToast({ title: data.msg || data.message || '处理失败', icon: 'none' })
  }
}

const handleError = (err) => {
  console.error('Request Error:', err)
  if (pendingAssistantMessage) {
    Object.assign(pendingAssistantMessage, {
      loading: false,
      content: '请求失败：网络连接超时或模型服务暂时不可用，请检查模型配置后重试。',
    })
    pendingAssistantMessage = null
    scrollToBottom()
  }
  uni.showToast({ title: '网络连接超时或错误', icon: 'none' })
}

// 手动停止本次请求（模拟豆包的“停止生成/停止分析”体验）
const stopCurrentRequest = () => {
  if (!loading.value) return
  try {
    currentRequestTask.value?.abort?.()
  } catch (e) {}
  if (pendingAssistantMessage) {
    Object.assign(pendingAssistantMessage, {
      loading: false,
      content: '已停止本次生成。',
    })
    pendingAssistantMessage = null
  }
  currentRequestTask.value = null
  loading.value = false
  uni.showToast({ title: '已停止', icon: 'none' })
}

// 多图分析选择：切换选中状态
const toggleHazardSelect = (img) => {
  if (!img?.id) return
  const id = Number(img.id)
  const idx = selectedHazardIds.value.indexOf(id)
  if (idx >= 0) selectedHazardIds.value.splice(idx, 1)
  else selectedHazardIds.value.push(id)
}

// 清空多图分析选择
const clearSelectedHazards = () => {
  selectedHazardIds.value = []
}

// 移除单张已选图片，保留其他图片继续分析
const removeSelectedHazard = (id) => {
  const targetId = Number(id)
  selectedHazardIds.value = selectedHazardIds.value.filter((item) => Number(item) !== targetId)
}

const scrollToBottom = () => {
  nextTick(() => {
    // 强制触发重绘以确保滚动生效
    lastMessageId.value = ''
    setTimeout(() => {
      lastMessageId.value = 'bottom-anchor'
    }, 50)
  })
}

const handlePickImage = () => {
  uni.chooseImage({
    count: 9,
    success: async (res) => {
      const files = res.tempFilePaths || []
      if (!files.length) return
      hazardFailedPaths.value = []
      const uploadedIds = await uploadHazardImages(files)
      if (uploadedIds.length) {
        selectedHazardIds.value = Array.from(new Set([
          ...selectedHazardIds.value,
          ...uploadedIds,
        ]))

      }
    }
  })
}

const previewImage = (url) => {
  uni.previewImage({ urls: [url] })
}

const handleDownload = async (path, format = 'pdf', msg = {}) => {
  if (!path && !msg?.id) return
  const url = msg?.id ? apiUrl(`/api/files/reports/${msg.id}/${format}`) : fileUrl(path)
  // #ifdef H5
  try {
    const response = await fetch(url, {
      headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
    })
    if (!response.ok) throw new Error('下载失败')
    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.msg || payload?.message || '报告下载失败')
    }
    const blob = await response.blob()
    if (String(blob.type || '').includes('application/json')) {
      const payload = JSON.parse(await blob.text().catch(() => '{}'))
      throw new Error(payload?.msg || payload?.message || '报告下载失败')
    }
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `inspection-report.${format === 'word' ? 'docx' : 'pdf'}`
    link.click()
    URL.revokeObjectURL(objectUrl)
  } catch (error) {
    uni.showToast({ title: error?.message || '报告下载失败，请刷新后重试', icon: 'none' })
  }
  // #endif
  // #ifndef H5
  downloadFile({
    url,
    success: (res) => {
      uni.openDocument({ filePath: res.tempFilePath })
    }
  })
  // #endif
}

const handleLogout = () => {
  request({
    url: apiUrl('/api/logout'),
    method: 'POST',
  }).finally(() => {
    clearLoginSession()
    uni.reLaunch({ url: '/pages/login/login' })
  })
}

const toggleUserMenu = () => {
  // 可以在这里实现用户菜单弹出逻辑，或者暂时留空
  console.log('Toggle user menu')
}

const goToAdmin = () => {
  uni.showActionSheet({
    itemList: ['用户管理', '知识库管理', 'AI模型配置', '操作日志', '企业数据查询', '报告模板', '数据备份'],
    success: (res) => {
      const pages = ['users', 'knowledge', 'model-config', 'logs', 'enterprises', 'templates', 'backup']
      const page = pages[res.tapIndex]
      if (page) uni.navigateTo({ url: `/pages/admin/${page}` })
    }
  })
}
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  background-color: #ffffff;
  overflow: hidden;
}

/* 侧边栏样式 */
.sidebar {
  width: 268px;
  background-color: #f7f8fa;
  color: #202123;
  display: flex;
  flex-direction: column;
  padding: 14px 12px;
  transition: transform 0.3s;
  z-index: 100;
  border-right: 1px solid #eceff3;
  box-sizing: border-box;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 16px;
}

.sidebar-logo {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #202123;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.sidebar-brand-copy {
  display: flex;
  flex-direction: column;
}

.sidebar-title {
  color: #202123;
  font-size: 15px;
  font-weight: 700;
}

.sidebar-subtitle {
  margin-top: 3px;
  color: #8a919c;
  font-size: 12px;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    height: 100%;
    transform: translateX(-100%);
  }
  .sidebar-active {
    transform: translateX(0);
  }
}

.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  margin-bottom: 16px;
  cursor: pointer;
  transition: background 0.2s;
  color: #202123;
  font-size: 14px;
  background: #ffffff;
}

.new-chat-btn:hover {
  background-color: #f1f3f5;
}

.new-chat-btn .icon {
  font-size: 20px;
}

.history-list {
  flex: 1;
}

.history-item {
  padding: 10px 11px;
  margin-bottom: 4px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  color: #404856;
}

.history-item:hover {
  background-color: #eef0f3;
}

.item-active {
  background-color: #e7f0ff;
  color: #155ec5;
}

.history-title {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.delete-icon {
  padding: 0 5px;
  color: #8a919c;
  opacity: 0;
  transition: opacity 0.2s;
}

.history-item:hover .delete-icon {
  opacity: 1;
}

.sidebar-footer {
  padding-top: 12px;
  border-top: 1px solid #eceff3;
  margin-top: auto; /* 确保它贴紧底部 */
}

.user-info {
  display: flex;
  align-items: center;
  padding: 10px;
  margin-top: 6px;
  border-radius: 8px;
  transition: background 0.2s;
}
.user-info:hover { background-color: #eef0f3; }

.avatar {
  width: 34px;
  height: 34px;
  background-color: #202123;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  font-weight: 700;
}

.user-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.username {
  max-width: 150px;
  color: #202123;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.user-role {
  color: #8a919c;
  font-size: 12px;
}

.footer-btns {
  margin-bottom: 5px;
}
.footer-btn {
  display: flex;
  align-items: center;
  padding: 10px 11px;
  border-radius: 8px;
  cursor: pointer;
  color: #404856;
  font-size: 14px;
  transition: background 0.2s;
}
.action-btn {
  background-color: transparent;
  margin-bottom: 4px;
}
.footer-btn:hover {
  background-color: #eef0f3;
}

/* -----------------------------------------------------------
   企业信息管理专业表单样式 (高度还原移动端请假表单风格)
----------------------------------------------------------- */
.form-modal-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: #ffffff;
  z-index: 3000;
  display: flex;
  flex-direction: column;
}

.form-modal-content {
  background: #ffffff;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 弹窗头部：带返回按钮 */
.form-header {
  height: 64px;
  background: #ffffff;
  display: flex;
  align-items: center;
  padding: 0 24px;
  position: relative;
  flex-shrink: 0;
  border-bottom: 1px solid #eceff3;
  box-sizing: border-box;
}

.header-title {
  font-size: 20px;
  font-weight: 600;
  color: #202123;
  flex: 1;
  text-align: center;
}

.modal-back-btn {
  position: absolute;
  left: 20px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #f7f8fa;
  color: #59606b;
  font-size: 26px;
  line-height: 1;
}

/* 表单主体 */
.form-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
  box-sizing: border-box;
}

/* 分组块样式 (白色卡片) */
.form-section {
  background: #ffffff;
  border: 1px solid #eceff3;
  border-radius: 10px;
  padding: 6px 20px;
  margin: 0 auto 14px;
  max-width: 900px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 24px;
  box-sizing: border-box;
}

.form-section-title {
  padding: 16px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  grid-column: 1 / -1;
}

.form-section-title text:first-child {
  color: #202123;
  font-size: 15px;
  font-weight: 700;
}

.form-section-title text:last-child {
  color: #8a919c;
  font-size: 12px;
}

/* 单个表单项 */
.form-item {
  display: flex;
  align-items: center;
  min-height: 58px;
  padding: 10px 0;
  border-bottom: 1px solid #eceff3;
  box-sizing: border-box;
  min-width: 0;
}

.border-none {
  border-bottom: none;
}

.form-item:nth-last-child(2) {
  border-bottom: none;
}

.item-label {
  width: 128px;
  flex-shrink: 0;
  font-size: 14px;
  color: #404856;
  display: flex;
  align-items: center;
}

.required {
  color: #202123;
  margin-right: 4px;
  font-size: 16px;
}

.item-input {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border-radius: 7px;
  background: #ffffff;
  border: 1px solid #dfe3e8;
  font-size: 14px;
  color: #202123;
  text-align: left;
  box-sizing: border-box;
}

.placeholder {
  color: #bbbbbb;
  font-size: 15px;
}

/* 地区选择器展示样式 */
.picker-container {
  flex: 1;
  display: flex;
  justify-content: flex-end;
}

.picker-value {
  font-size: 15px;
  color: #333333;
  display: flex;
  align-items: center;
}

.picker-value.placeholder {
  color: #bbbbbb;
}

.arrow {
  margin-left: 6px;
  color: #cccccc;
  font-size: 16px;
}

/* 多行文本输入区 */
.form-item-vertical {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 16px 0;
  grid-column: 1 / -1;
}

.form-item-vertical .item-label {
  width: 100%;
  margin-bottom: 10px;
}

.item-textarea {
  width: 100%;
  height: 110px;
  padding: 12px;
  background: #ffffff;
  border: 1px solid #dfe3e8;
  border-radius: 7px;
  font-size: 14px;
  color: #202123;
  line-height: 1.6;
  box-sizing: border-box;
}

/* 底部操作区 */
.form-footer {
  padding: 16px 24px 24px;
  background: #ffffff;
  display: flex;
  justify-content: center;
  gap: 14px;
}

.footer-action-btn {
  width: 220px;
  height: 44px;
  line-height: 44px;
  border-radius: 8px;
  font-size: 15px;
  text-align: center;
  border: none;
}

.primary-btn {
  background: #202123;
  color: #ffffff;
}

.secondary-btn {
  background: #ffffff;
  color: #202123;
  border: 1px solid #dfe3e8;
}

.primary-btn:active, .secondary-btn:active {
  opacity: 0.8;
}

.hazard-toolbar {
  padding: 18px 20px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.hazard-toolbar-main {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.hazard-body {
  flex: 1;
  padding: 0 20px 24px;
  box-sizing: border-box;
}

.empty-tip {
  text-align: center;
  color: #999;
  padding: 30px 0;
  font-size: 14px;
}

.hazard-grid {
  max-width: 900px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.hazard-item {
  background: #fff;
  border: 1px solid #eceff3;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  box-shadow: none;
}

.hazard-thumb-wrap {
  position: relative;
  height: 156px;
  background: #f1f3f5;
}

.hazard-thumb {
  width: 100%;
  height: 156px;
  display: block;
}

.hazard-status {
  position: absolute;
  left: 10px;
  top: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(32,33,35,.78);
  color: #fff;
  font-size: 12px;
}

.hazard-meta {
  padding: 12px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.hazard-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hazard-name {
  font-size: 13px;
  font-weight: 600;
  color: #202123;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hazard-sub {
  color: #8b98aa;
  font-size: 12px;
}

.hazard-card-actions {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
}

.hazard-action,
.hazard-del {
  background: transparent;
  border: 1px solid #dfe3e8;
  border-radius: 7px;
  padding: 0 8px;
  height: 28px;
  line-height: 28px;
  font-size: 12px;
}

.hazard-action {
  color: #202123;
  background: #f7f8fa;
}

.hazard-del {
  color: #e05252;
  background: #fff7f7;
}

.confirm-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 3200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.confirm-card {
  width: 100%;
  max-width: 320px;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
}

.confirm-title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #111;
  margin-bottom: 8px;
  text-align: center;
}

.confirm-content {
  display: block;
  font-size: 13px;
  color: #666;
  line-height: 1.6;
  margin-bottom: 14px;
}

.confirm-actions {
  display: flex;
  gap: 12px;
}

.confirm-btn {
  flex: 1;
  height: 40px;
  line-height: 40px;
  border-radius: 10px;
  font-size: 14px;
  border: none;
}

.confirm-btn.cancel {
  background: #f1f3f5;
  color: #111;
}

.confirm-btn.danger {
  background: #ff4d4f;
  color: #fff;
}

/* --- 原有主内容样式 --- */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden; /* 防止主区域溢出 */
}

.header {
  height: 54px;
  display: flex;
  align-items: center;
  padding: 0 18px;
  background-color: #fff;
  border-bottom: 1px solid #eceff3;
  flex-shrink: 0; /* 禁止头部压缩 */
}

.menu-toggle {
  min-width: 42px;
  height: 30px;
  margin-right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: #59606b;
  background: #f7f8fa;
  font-size: 12px;
  cursor: pointer;
}

.header-title {
  flex: 1;
  color: #202123;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
}

.chat-flow-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: #ffffff;
}

.chat-flow {
  height: 100%;
}

.welcome-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 12vh;
  padding: 0 24px;
  text-align: center;
}

.welcome-title {
  max-width: 680px;
  color: #202123;
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 24px;
  line-height: 1.5;
}

.guide-cards {
  display: flex;
  gap: 10px;
}

.guide-card {
  width: 210px;
  min-height: 74px;
  padding: 14px 16px;
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #404856;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  text-align: left;
  box-sizing: border-box;
}

.guide-card:hover {
  background-color: #f7f8fa;
}

.guide-card-title {
  color: #202123;
  font-size: 15px;
  font-weight: 600;
}

.guide-card-desc {
  color: #758398;
  font-size: 12px;
  line-height: 1.5;
}

.message-wrapper {
  padding: 14px max(24px, calc((100% - 860px) / 2));
  width: 100%;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .message-wrapper {
    padding: 15px 5%;
  }
}

.message-user {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 10px;
}

.message-ai {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  width: 100%;
}

.ai-avatar {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background-color: #202123;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.user-avatar-mini {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #202123;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.message-bubble {
  max-width: min(720px, calc(100vw - 420px));
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 15px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  word-break: break-word;
  box-sizing: border-box;
}

.report-bubble {
  width: min(780px, calc(100vw - 420px));
  max-width: min(780px, calc(100vw - 420px));
  padding: 0;
  overflow: hidden;
}

.message-user .message-bubble {
  background-color: #f1f3f5;
  color: #202123;
}

.message-ai .message-bubble {
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  min-width: 0;
}

.message-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.message-image {
  max-width: 200px;
  max-height: 200px;
  display: block;
  margin-bottom: 10px;
  border-radius: 5px;
}

.message-image-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  max-width: 360px;
}

.message-thumb {
  width: 78px;
  height: 78px;
  border-radius: 8px;
  background: #e9edf2;
  display: block;
}

.file-links {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.file-link {
  padding: 5px 9px;
  border-radius: 7px;
  background: #f7f8fa;
  color: #202123;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #e5e7eb;
}

/* 输入框样式 */
.input-container {
  padding: 10px max(24px, calc((100% - 860px) / 2)) 18px;
  background: #ffffff;
  flex-shrink: 0; /* 禁止输入框压缩 */
}

@media (max-width: 768px) {
  .input-container {
    padding: 10px 5% 20px;
  }
}

.input-wrapper {
  background: white;
  border: 1px solid #dfe3e8;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 2px 10px rgba(15,28,50,0.06);
}

.selected-preview {
  width: 100%;
  padding-bottom: 2px;
}

.selected-preview-scroll {
  width: 100%;
  white-space: nowrap;
}

.selected-preview-row {
  display: inline-flex;
  gap: 10px;
  min-width: 100%;
}

.selected-preview-item {
  position: relative;
  width: 184px;
  height: 70px;
  padding: 8px 28px 8px 8px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 10px;
  background: #f7f8fa;
  border: 1px solid #e5e7eb;
  box-sizing: border-box;
  vertical-align: top;
}

.selected-preview-image {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #e9edf2;
  display: block;
}

.selected-preview-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.selected-preview-name {
  max-width: 88px;
  color: #202123;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.selected-preview-sub {
  color: #8b98aa;
  font-size: 11px;
}

.selected-preview-remove {
  position: absolute;
  right: 8px;
  top: 7px;
  width: 18px;
  height: 18px;
  line-height: 17px;
  text-align: center;
  border-radius: 50%;
  background: #ffffff;
  color: #59606b;
  border: 1px solid #dfe3e8;
  font-size: 14px;
  cursor: pointer;
}

.attachment-btn {
  min-width: 72px;
  height: 34px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #f7f8fa;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  color: #404856;
  font-size: 12px;
  font-weight: 600;
  box-sizing: border-box;
}

.chat-input {
  width: 100%;
  height: 78px;
  min-height: 78px;
  max-height: 132px;
  padding: 6px 4px;
  border: 0;
  background: transparent;
  font-size: 15px;
  line-height: 1.6;
  word-break: break-word;
  box-sizing: border-box;
  overflow-y: auto;
}

.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.selected-hazard-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  height: 34px;
  border-radius: 8px;
  background: #f7fafc;
  border: 1px solid #e5e7eb;
  font-size: 12px;
  color: #555;
  box-sizing: border-box;
}

.clear-link {
  color: #202123;
  font-weight: 600;
}

.send-btn {
  width: 74px;
  height: 36px;
  background-color: #202123;
  color: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.2s;
  font-size: 13px;
}

.btn-disabled {
  background-color: #acacbe;
  cursor: not-allowed;
}

.footer-tip {
  display: block;
  text-align: center;
  font-size: 11px;
  color: #8e8ea0;
  margin-top: 10px;
}

.sidebar-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 90;
}

/* 9.6 结构化输出样式 */
.assessment-panel {
  margin-bottom: 14px;
  padding: 14px;
  background: #f8fbff;
  border: 1px solid #dbeafe;
  border-radius: 10px;
}

.assessment-panel.blocked {
  background: #fff8eb;
  border-color: #fed7aa;
}

.assessment-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.assessment-title {
  color: #172541;
  font-size: 14px;
  font-weight: 700;
}

.assessment-status,
.assessment-tag,
.fact-chip,
.rule-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
}

.assessment-status {
  padding: 5px 8px;
  background: #e8f2ff;
  color: #1677ff;
  font-weight: 700;
}

.assessment-status.scene-unrelated,
.assessment-status.scene-non_business,
.assessment-status.scene-irrelevant {
  background: #fff1f0;
  color: #d93025;
}

.assessment-tags,
.fact-row,
.rule-row {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.assessment-tag {
  padding: 5px 8px;
  background: #eef2f7;
  color: #52627b;
}

.assessment-reason,
.assessment-block {
  display: block;
  margin-top: 10px;
  color: #52627b;
  font-size: 12px;
  line-height: 1.6;
}

.assessment-block {
  color: #b45309;
}

.fact-chip {
  padding: 6px 8px;
  background: #fff;
  color: #334155;
  border: 1px solid #e2e8f0;
}

.rule-chip {
  padding: 6px 8px;
  background: #eefbf4;
  color: #17835b;
}
.structured-result {
  background: #ffffff;
  padding: 0;
  box-shadow: none;
}

.struct-header {
  padding: 14px 16px;
  border-bottom: 1px solid #eceff3;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.struct-title {
  color: #202123;
  font-size: 15px;
  font-weight: 600;
}

.struct-subtitle {
  color: #758398;
  font-size: 12px;
}

.struct-grid,
.struct-list {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.struct-card {
  padding: 0;
  border-radius: 0;
  background: #ffffff;
  border: 0;
}

.struct-section {
  padding: 10px 0;
  border-radius: 0;
  background: #ffffff;
  border-bottom: 1px solid #eceff3;
}

.struct-card .struct-section + .struct-section {
  margin-top: 10px;
}

.struct-label {
  font-weight: 700;
  color: #202123;
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
}

.model-picker {
  flex-shrink: 0;
}

.model-selector {
  min-width: 180px;
  max-width: 240px;
  height: 38px;
  padding: 0 10px 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border-radius: 8px;
  background: #f7f8fa;
  border: 1px solid #e5e7eb;
  color: #404856;
  font-size: 12px;
  box-sizing: border-box;
}

.model-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.model-name-text {
  color: #202123;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.model-code-text {
  margin-top: 1px;
  color: #8b98aa;
  font-size: 10px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.model-arrow {
  flex-shrink: 0;
  font-size: 10px;
}

.struct-heading {
  display: block;
  color: #202123;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 10px;
}

.struct-value {
  display: block;
  color: #4d5c72;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.reference-panel {
  margin: 0 14px 14px;
  padding: 12px 14px;
  border: 1px solid #e4e9f1;
  border-radius: 8px;
  background: #f8fafc;
}

.reference-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.reference-title {
  color: #202123;
  font-size: 13px;
  font-weight: 700;
}

.reference-subtitle {
  color: #7c8798;
  font-size: 11px;
}

.reference-item {
  padding: 10px 0;
  border-top: 1px solid #e6ebf2;
}

.reference-item:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.reference-item.weak {
  color: #697386;
}

.reference-name {
  display: block;
  color: #2d3b50;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.reference-content,
.reference-keyword {
  display: block;
  margin-top: 5px;
  color: #526078;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.reference-keyword {
  color: #7c8798;
  font-size: 11px;
}

.struct-textarea {
  width: 100%;
  height: 112px;
  min-height: 112px;
  padding: 10px 12px;
  border: 1px solid #dfe3e8;
  border-radius: 7px;
  background: #ffffff;
  font-size: 14px;
  color: #202123;
  box-sizing: border-box;
  line-height: 1.6;
  overflow-y: auto;
}

.struct-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 14px 14px;
  margin-top: 0;
}

.mini-btn {
  min-width: 76px;
  height: 32px;
  line-height: 32px;
  padding: 0 12px;
  font-size: 12px;
  border-radius: 8px;
  cursor: pointer;
  border: none;
}

.edit-btn {
  background: #f7f8fa;
  color: #202123;
  border: 1px solid #dfe3e8;
}

.struct-cancel-btn {
  background: #f2f5f8;
  color: #526078;
}

.save-btn {
  background: #202123;
  color: white;
}

.thinking-state {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #526078;
  font-size: 14px;
  line-height: 1.6;
}

.thinking-copy {
  display: flex;
  flex-direction: column;
}

.thinking-title {
  color: #202123;
  font-size: 14px;
  font-weight: 700;
}

.thinking-desc {
  color: #758398;
  font-size: 12px;
}

.thinking-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #202123;
  animation: pulse 1s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% { opacity: .35; transform: scale(.85); }
  50% { opacity: 1; transform: scale(1.15); }
}

/* 9.5 多图选择：隐患图片选中态展示 */
.hazard-selected-info {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  background: #fff;
  border: 1px solid #dfe3e8;
  font-size: 12px;
  color: #526078;
}

.hazard-clear {
  color: #202123;
  font-weight: 600;
}

.hazard-select {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.9);
  background: rgba(0,0,0,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hazard-select.active {
  background: rgba(32,33,35,0.85);
  border-color: rgba(32,33,35,1);
}

.hazard-select-icon {
  color: #fff;
  font-size: 14px;
  line-height: 1;
}

@media (max-width: 768px) {
  .form-body {
    padding: 12px;
  }
  .form-section {
    grid-template-columns: 1fr;
    padding: 6px 14px;
  }
  .form-item {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 12px 0;
  }
  .item-label {
    width: 100%;
  }
  .form-footer {
    padding: 12px;
  }
  .footer-action-btn {
    width: auto;
    flex: 1;
  }
  .hazard-toolbar {
    align-items: stretch;
    justify-content: flex-start;
  }
  .hazard-toolbar-main {
    width: 100%;
  }
  .hazard-toolbar-main .footer-action-btn {
    flex: 1;
    min-width: 130px;
  }
  .hazard-grid {
    grid-template-columns: 1fr;
  }
  .welcome-guide {
    margin-top: 8vh;
  }
  .welcome-title {
    font-size: 18px;
  }
  .guide-cards {
    width: 100%;
    flex-direction: column;
  }
  .guide-card {
    width: 100%;
  }
  .message-bubble {
    max-width: calc(100vw - 72px);
    font-size: 14px;
  }
  .report-bubble {
    width: calc(100vw - 72px);
    max-width: calc(100vw - 72px);
  }
  .message-user .message-bubble {
    max-width: calc(100vw - 92px);
  }
  .message-image-grid {
    max-width: calc(100vw - 132px);
  }
  .message-thumb {
    width: 64px;
    height: 64px;
  }
  .input-wrapper {
    align-items: stretch;
  }
  .input-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .toolbar-left {
    width: 100%;
  }
  .attachment-btn {
    flex-shrink: 0;
  }
  .model-picker {
    flex: 1;
    min-width: 0;
  }
  .model-selector {
    max-width: none;
    width: 100%;
  }
  .selected-hazard-tip {
    width: 100%;
  }
  .selected-preview-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .selected-preview-item {
    width: 100%;
  }
  .selected-preview-name {
    max-width: calc(100vw - 168px);
  }
  .chat-input {
    width: 100%;
    height: 92px;
    min-height: 92px;
  }
  .send-btn {
    width: 100%;
  }
  .structured-result {
    padding: 0;
  }
  .struct-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .struct-grid,
  .struct-list {
    padding: 10px;
  }
  .struct-section,
  .struct-card {
    padding: 10px;
  }
  .reference-panel {
    margin: 0 10px 10px;
  }
  .reference-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
  .struct-textarea {
    height: 128px;
    min-height: 128px;
  }
}

/* PR21：检查任务面板，放在输入区上方，确保检查员明确先选企业再上传图片 */
.inspection-task-panel {
  max-width: 860px;
  margin: 0 auto 10px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid #dfe3e8;
  border-radius: 12px;
  background: #f7f8fa;
  box-sizing: border-box;
}
.inspection-task-panel.ready {
  background: #ffffff;
  border-color: #cdd5df;
}
.task-panel-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.task-panel-kicker {
  color: #6b7280;
  font-size: 12px;
}
.task-panel-title {
  color: #202123;
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-panel-desc {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
}
.task-panel-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.task-tab-btn {
  min-width: 82px;
  height: 34px;
  line-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #dfe3e8;
  background: #ffffff;
  color: #202123;
  font-size: 12px;
}
.task-tab-btn.primary {
  border-color: #202123;
}
.task-tab-btn.dark {
  background: #202123;
  color: #ffffff;
  border-color: #202123;
}
.task-tab-btn.muted {
  background: #f2f5f8;
  color: #526078;
}
.task-tab-btn[disabled],
.attachment-btn.disabled {
  opacity: .5;
}
.input-wrapper.disabled {
  border-color: #e5e7eb;
  background: #fbfbfc;
}
</style>
