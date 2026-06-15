# 稳定演示版本说明

本版本面向“安全生产社会化服务智检系统”的本地演示与阶段性提交，重点修复了 AI 隐患分析、多人/多图报告生成、Word/PDF 报告格式一致性和基础运行稳定性问题。

## 版本重点

- AI 隐患分析结果统一为结构化 JSON，包含隐患描述、隐患等级、检查依据、整改建议、责任划分和综合意见。
- 多张隐患图片可一次上传并按顺序生成多条隐患记录，报告中的图片与分析项按 `image_id` 对应。
- Word 报告优先套用 `backend/templates/hazard_report_template.docx` 模板，保留封面、声明、承诺书、目录、检查依据、隐患清单和综合意见结构。
- PDF 报告优先由同一份 Word 模板报告导出，保证 PDF 与 Word 版式尽量一致；如本机 Word 转换不可用，则降级为 PDFKit 生成的报告式 PDF。
- 检查依据支持结构化法规/标准条文，格式统一为 `《法规或标准名称》（编号）第X条：条文内容；`，并对重复依据进行合并。
- 数据库初始化补充了企业信息、会话关联和隐患图片关联表的兼容迁移，降低旧库升级失败风险。

## 报告生成链路

1. 前端上传隐患图片并调用 `/api/hazard/analyze`。
2. 后端将图片、企业信息和提示词发送给 AI 服务。
3. AI 返回结构化隐患分析结果。
4. `docService` 解析并规范化结果，生成统一报告数据。
5. Word 报告使用模板填充脚本 `backend/tools/fillReportTemplate.py` 生成。
6. PDF 报告优先调用 `backend/tools/convertWordToPdf.py` 将同一份 Word 导出为 PDF。

## 运行要求

- Node.js 与 npm 可正常运行后端和 uni-app 前端。
- MySQL 数据库可连接，并已按 `.env` 配置数据库账号、密码和数据库名。
- AI 模型配置可使用 `.env` 或系统内模型配置表。
- Windows 演示环境建议安装 Microsoft Word，并保证 Python 可导入 `win32com.client`，用于高质量 PDF 导出。

## 演示数据建议

- 仓库额外提供 [database/demo_seed.sql](./database/demo_seed.sql) 作为**可选**的最小演示数据。
- 该文件仅包含 1 个管理员、1 个普通用户、1 家演示企业和 1 个部门，适合本地评审快速验证页面与流程。
- 不建议将大量本地测试数据直接作为稳定版的一部分提交；长期维护应依赖建表脚本、兼容迁移和可选 seed。

## 常用验证命令

在项目根目录或对应子目录执行：

```powershell
node --check .\project\backend\server.js
node --check .\project\backend\bll\docService.js
node --check .\project\backend\bll\aiService.js
py -m py_compile .\project\backend\tools\fillReportTemplate.py
py -m py_compile .\project\backend\tools\convertWordToPdf.py
npm --prefix .\project\uni-app-frontend run build:h5
```

## 已验证结果

- Word 报告可按模板生成，正文检查依据为模板字体样式，图片可按隐患项嵌入。
- PDF 报告可通过 Word 导出生成，格式与 Word 模板保持一致。
- `检查依据` 已修复方框乱码、Markdown 残留、标准编号丢失、重复条款等问题。
- 多图上传后可生成多条隐患分析，并在报告中保留图片对应关系。

## 已知限制

- PDF 与 Word 高一致性依赖本机 Microsoft Word 和 `pywin32`；如果不可用，会自动降级为 PDFKit 版 PDF，版式会弱于 Word 导出版。
- AI 返回的法规条文仍需在正式交付前人工复核，避免模型误引或条文版本不一致。
- 当前版本适合作为演示稳定版，后续正式上线前建议继续补充自动化测试、CI、接口鉴权细化和生产部署文档。
