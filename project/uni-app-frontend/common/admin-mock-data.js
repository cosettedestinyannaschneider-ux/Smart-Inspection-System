/** 创建知识库分类模拟数据 */
export const createKnowledgeCategories = () => [
  { id: 1, name: '煤矿安全', sort: 1 },
  { id: 2, name: '消防安全', sort: 2 },
  { id: 3, name: '建筑施工安全', sort: 3 },
  { id: 4, name: '危险化学品与化工安全', sort: 4 },
  { id: 5, name: '其他专项安全', sort: 5 }
]

/** 创建知识库条目模拟数据 */
export const createKnowledgeItems = () => [
  { id: 1, title: '中华人民共和国安全生产法', description: '2021年修订版', category_id: 1, file_path: '安全生产法.pdf', file_type: 'PDF', status: 'active', created_at: '2026-05-10' },
  { id: 2, title: '消防设施通用规范', description: 'GB 55036-2023', category_id: 2, file_path: '消防规范.pdf', file_type: 'PDF', status: 'active', created_at: '2026-05-16' },
  { id: 3, title: '建筑电气工程施工规范', description: '建筑施工电气安全规范', category_id: 3, file_path: '电气施工.docx', file_type: 'DOCX', status: 'active', created_at: '2026-05-21' }
]

/** 创建 AI 模型配置模拟数据 */
export const createAiModelConfigs = () => [
  { id: 1, name: '豆包视觉模型', provider: '豆包', base_url: 'https://ark.cn-beijing.volces.com/api/v3', model_name: 'doubao-vision-pro-32k', api_key_masked: 'ark-****8f2a', max_tokens: 4096, temperature: 0.7, timeout_ms: 60000, is_active: true },
  { id: 2, name: 'DeepSeek 对话模型', provider: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', model_name: 'deepseek-chat', api_key_masked: 'sk-****37bd', max_tokens: 8192, temperature: 0.5, timeout_ms: 30000, is_active: false }
]

/** 创建企业数据查询模拟数据 */
export const createEnterpriseQueryItems = () => [
  { id: 1, name: '示例建筑企业 A', username: '示例检查员 A', region: '示例省示例市', address: '示例地址 A', industry: '建筑施工', enterprise_type: '有限责任公司', scale: '中型', production_process: '房建施工、机电安装、装饰装修', contact: '示例联系人 A', phone: '13800000001', inspector_name: '示例排查员 A', inspection_date: '2026-06-01', inspection_status: '待整改', status: 'active', updated_at: '2026-06-09 10:20', image_count: 5, analysis_count: 3, report_count: 2, hazard_count: 7, pending_count: 2, rectified_count: 5, risk_level: '中风险', main_hazards: ['临时用电', '高处作业', '消防通道'], recent_images: ['临时配电箱.jpg', '脚手架作业.jpg'], recent_analyses: ['临时用电防护不规范', '高处作业防护缺失'], reports: [{ id: 101, title: '2026年6月排查报告', created_at: '2026-06-02', word_path: 'report_101.docx', pdf_path: 'report_101.pdf' }] },
  { id: 2, name: '示例化工企业 B', username: '示例检查员 B', region: '示例省示例市', address: '示例地址 B', industry: '危险化学品', enterprise_type: '股份有限公司', scale: '大型', production_process: '原料储存、化学反应、精馏分离、成品罐装', contact: '示例联系人 B', phone: '13800000002', inspector_name: '示例排查员 B', inspection_date: '2026-05-28', inspection_status: '排查中', status: 'active', updated_at: '2026-06-08 16:40', image_count: 8, analysis_count: 5, report_count: 3, hazard_count: 12, pending_count: 5, rectified_count: 7, risk_level: '高风险', main_hazards: ['危化品储存', '防爆设施', '有限空间'], recent_images: ['储罐区.jpg', '防爆电气.jpg'], recent_analyses: ['危化品储存间距不足', '防爆设施维护不到位'], reports: [{ id: 201, title: '2026年5月排查报告', created_at: '2026-05-29', word_path: 'report_201.docx', pdf_path: 'report_201.pdf' }] },
  { id: 3, name: '示例煤矿企业 C', username: '示例检查员 C', region: '示例省示例市', address: '示例地址 C', industry: '煤矿安全', enterprise_type: '国有企业', scale: '大型', production_process: '井下开采、通风、运输、洗选', contact: '示例联系人 C', phone: '13800000003', inspector_name: '示例排查员 C', inspection_date: '2026-04-15', inspection_status: '已完成', status: 'archived', updated_at: '2026-05-01 09:15', image_count: 12, analysis_count: 8, report_count: 4, hazard_count: 15, pending_count: 3, rectified_count: 12, risk_level: '高风险', main_hazards: ['通风管理', '机电设备', '运输作业'], recent_images: ['井下通风口.jpg'], recent_analyses: ['通风设施需要定期维护'], reports: [] }
]

/** 创建操作日志模拟数据 */
export const createActionLogs = () => [
  { id: 1, username: '检查员小王', role: '检查员', action: '登录系统', module: '认证', details: '登录成功', ip_address: '192.168.1.100', created_at: '2026-06-09 08:30' },
  { id: 2, username: '检查员小王', role: '检查员', action: '上传隐患图片', module: '隐患图片', details: '上传 3 张图片', ip_address: '192.168.1.100', created_at: '2026-06-09 08:45' },
  { id: 3, username: '检查员小王', role: '检查员', action: 'AI 隐患分析', module: 'AI 分析', details: '分析 3 张图片', ip_address: '192.168.1.100', created_at: '2026-06-09 08:50' },
  { id: 4, username: 'admin', role: '管理员', action: '更新模型配置', module: '系统管理', details: '切换当前 AI 模型', ip_address: '192.168.1.1', created_at: '2026-06-09 09:30' }
]

/** 创建报告模板模拟数据 */
export const createReportTemplates = () => [
  { id: 1, name: '标准排查报告模板', description: '适用于一般工贸企业', file_path: 'template_v1.docx', is_default: true, updated_at: '2026-06-01' },
  { id: 2, name: '化工行业专用模板', description: '适用于危险化学品企业', file_path: 'template_chem.docx', is_default: false, updated_at: '2026-05-20' }
]

/** 创建数据库备份记录模拟数据 */
export const createBackupRecords = () => [
  { id: 1, filename: 'ai_project_backup_20260609.sql.gz', size: '2.3 MB', status: 'success', type: '自动备份', created_at: '2026-06-09 08:00' },
  { id: 2, filename: 'ai_project_backup_20260602.sql.gz', size: '2.1 MB', status: 'success', type: '自动备份', created_at: '2026-06-02 08:00' }
]
