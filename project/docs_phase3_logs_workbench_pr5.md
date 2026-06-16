# Phase 3 PR5 交付说明

## 变更目标

- 将管理员操作日志页面从 mock 数据切换为真实后端日志。
- 将管理员工作台统计卡片切换为真实可计算指标。
- 去除工作台伪造趋势展示，避免向演示和验收传递不可追溯的数据含义。

## 后端实现摘要

关键文件：

- [server.js](C:/tmp/smart-inspection-phase3-logs-workbench/project/backend/server.js)
- [logDal.js](C:/tmp/smart-inspection-phase3-logs-workbench/project/backend/dal/logDal.js)
- [adminWorkbenchService.js](C:/tmp/smart-inspection-phase3-logs-workbench/project/backend/bll/adminWorkbenchService.js)
- [enterpriseDal.js](C:/tmp/smart-inspection-phase3-logs-workbench/project/backend/dal/enterpriseDal.js)
- [hazardImageDal.js](C:/tmp/smart-inspection-phase3-logs-workbench/project/backend/dal/hazardImageDal.js)
- [historyDal.js](C:/tmp/smart-inspection-phase3-logs-workbench/project/backend/dal/historyDal.js)

新增与调整：

- 新增 `POST /api/admin/workbench/stats`
  - 返回企业总数、待分析图片数、报告总数、今日新增报告数。
- 调整 `POST /api/admin/logs/list`
  - 返回真实日志并补充页面直接可用的 `role`、`module`、`action`、`details` 字段。
- 登录、图片上传/删除/标注、AI 分析、报告编辑/删除、企业信息更新等日志写入补充 `req.ip`，确保管理员日志能看到真实 IP。

统计口径固定为：

- `enterprise_count`：`enterprises.status = 'active'` 的企业总数。
- `pending_image_count`：`hazard_images.status = 'active'` 且尚未关联任何 `inspection_report_images` 记录的图片数。
- `report_count`：`inspection_reports` 总数。
- `today_report_count`：数据库当前日期下的当日新增报告数。

日志展示口径固定为：

- `module` 不新增数据库字段，继续通过 `action` 映射。
- `details` 由后端统一格式化，前端不再维护操作码到中文说明的映射逻辑。

## 前端实现摘要

关键文件：

- [logs.vue](C:/tmp/smart-inspection-phase3-logs-workbench/project/uni-app-frontend/pages/admin/logs.vue)
- [workbench.vue](C:/tmp/smart-inspection-phase3-logs-workbench/project/uni-app-frontend/pages/workbench/workbench.vue)

主要调整：

- `pages/admin/logs.vue`
  - 改为真实请求 `POST /api/admin/logs/list`
  - 模块筛选项改为根据真实日志动态生成
  - 今日日志统计改为基于当前日期动态计算
- `pages/workbench/workbench.vue`
  - 改为真实请求 `POST /api/admin/workbench/stats`
  - 指标卡片扩展为 4 个
  - 移除伪造的“较昨日”趋势文案

## 数据库与配置

- 本 PR **不新增 DDL**。
- `project/database/schema.sql` **无需修改**。
- 不新增环境变量。

## 本地验证

后端检查：

```powershell
npm run check
```

前端构建：

```powershell
npm run build:h5
```

建议手动验证：

1. 管理员登录后进入工作台，确认四个统计值能正常加载。
2. 打开操作日志页，确认日志列表、今日日志数、管理员操作数和模块筛选工作正常。
3. 上传图片、执行分析、更新企业信息后刷新日志页，确认新增日志可见且详情可读。
4. 核对工作台“待分析图片数”会随着图片进入报告而减少。

## 风险与说明

- 本 PR 暂不实现日志分页和高级筛选，仍保留最近 500 条日志上限。
- `pending_image_count` 采用“未关联任何报告”的定义，适合当前阶段的真实统计；若后续业务引入独立分析任务状态，需要统一迁移统计口径。
- 工作台与日志页已接入真实后端，但模板管理、知识库管理、数据备份仍将在后续 PR 分阶段接入。
