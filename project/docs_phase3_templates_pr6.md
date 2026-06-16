# Phase 3 PR6 交付说明

## 变更目标

- 将管理员报告模板页面从前端 mock 数据切换为真实后端接口。
- 让默认报告模板真实接入 Word/PDF 报告生成链路，而不是只停留在管理页面展示。
- 封住模板文件的公开静态访问路径，统一改为鉴权后的受控下载。

## 后端实现摘要

关键文件：
- [server.js](C:/tmp/smart-inspection-phase3-templates-v2/project/backend/server.js)
- [reportTemplateService.js](C:/tmp/smart-inspection-phase3-templates-v2/project/backend/bll/reportTemplateService.js)
- [reportTemplateDal.js](C:/tmp/smart-inspection-phase3-templates-v2/project/backend/dal/reportTemplateDal.js)
- [docService.js](C:/tmp/smart-inspection-phase3-templates-v2/project/backend/bll/docService.js)
- [fileAccess.js](C:/tmp/smart-inspection-phase3-templates-v2/project/backend/common/fileAccess.js)
- [logDal.js](C:/tmp/smart-inspection-phase3-templates-v2/project/backend/dal/logDal.js)
- [schemaInit.js](C:/tmp/smart-inspection-phase3-templates-v2/project/backend/dal/schemaInit.js)

本轮落地内容：
- 新增真实模板接口：
  - `POST /api/admin/templates/list`
  - `POST /api/admin/templates/create`
  - `POST /api/admin/templates/save`
  - `POST /api/admin/templates/activate`
  - `POST /api/admin/templates/remove`
  - `GET /api/admin/templates/:template_id/file`
- 模板上传仅允许 `.docx`，并统一返回业务级错误提示。
- 默认模板切换改为事务化处理，保证同一时刻只有一个默认模板。
- 删除默认模板会被后端明确拒绝。
- 模板文件放入 `uploads/report-templates/`，并从公开静态目录中排除。
- Word 报告生成优先尝试数据库默认模板；若模板缺失或渲染失败，则回退到内置模板和原有程序化生成逻辑。

## 本轮补强与边界修复

这次在实现真实联调的同时，额外补了 3 个会影响稳定性与审计性的边界问题：

1. 模板上传失败后的临时文件清理
- 若上传文件已写入磁盘、但数据库写入失败，服务端现在会主动清理未落库的临时文件。
- 避免磁盘上残留“数据库中不存在”的孤儿模板文件。

2. 模板操作日志可读化
- 新增模板、更新模板、切换默认模板、删除模板四类操作，现已补入日志模块映射。
- 日志页面可直接显示“报告模板”模块与友好的中文详情，而不是回落成原始操作码。

3. 历史默认模板状态归一化
- 启动时除了修复“没有默认模板”的旧数据，也会修复“存在多个默认模板”的脏数据。
- 当前策略为保留最近更新的一条默认模板记录，其余自动取消默认状态。

## 前端实现摘要

关键文件：
- [templates.vue](C:/tmp/smart-inspection-phase3-templates-v2/project/uni-app-frontend/pages/admin/templates.vue)

本轮落地内容：
- 模板页改为真实请求后端接口，不再依赖 `common/admin-mock-data.js`。
- 支持模板列表刷新、上传、编辑、设为默认、删除和下载。
- H5 端使用 `fetch + FormData` 上传模板文件。
- 微信小程序端使用 `uni.uploadFile` 上传模板文件。
- 模板文件下载统一使用后端返回的 `download_url`，不再拼接公开上传路径。

## 数据库与配置

- 本轮无新增 DDL。
- `project/database/schema.sql` 无需修改。
- 无新增环境变量。

## 本地验证

后端检查：

```powershell
npm --prefix project/backend run check
```

前端构建：

```powershell
npm --prefix project/uni-app-frontend run build:h5
```

## 建议手动验证

1. 管理员进入“报告模板”页面，确认可看到真实模板列表、默认模板状态和文件状态。
2. 上传首个 DOCX 模板，确认其自动成为默认模板。
3. 编辑已有模板，仅修改名称和说明，确认不强制重新上传文件。
4. 替换模板文件后重新下载，确认拿到的是新文件。
5. 切换默认模板后生成一份新报告，确认新报告优先使用当前默认模板。
6. 删除默认模板时确认被后端拒绝，删除非默认模板时确认成功。
7. 查看管理员操作日志，确认模板新增、更新、切换默认、删除都能显示为“报告模板”模块，并带可读详情。

## 风险与说明

- 模板上传在 H5 与微信端走两套平台实现，仍需重点做双端手测。
- 若历史模板记录存在但磁盘文件已丢失，页面会显示“未上传”，此时报告生成将自动回退到内置模板。
- 本轮尚未引入模板版本历史、模板回滚与模板审批流，当前仅保证默认模板切换、模板保护和受控访问闭环。
