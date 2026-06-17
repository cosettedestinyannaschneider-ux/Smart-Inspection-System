# 本地开发同步说明

本文件用于固定后续 PR 的本地协作方式，避免出现“GitHub 已合并，但本地仍在旧分支或需要反复重配”的情况。

## 1. 永远从 GitHub 主线开新分支

每次开始新任务前，先同步新仓库主线：

```powershell
git -C E:\University\Project\project1.0 fetch teamrepo
git -C E:\University\Project\project1.0 switch main
git -C E:\University\Project\project1.0 pull teamrepo main
```

再创建任务分支：

```powershell
git -C E:\University\Project\project1.0 switch -c codex/your-task-name
```

不要继续基于旧的 `merge-stable-report` 做新功能开发。

## 2. 哪些内容不会跟随 GitHub PR 自动同步

以下内容属于本地私有状态，不会进入 Git：

- `project/backend/.env`
- 本地 MySQL 数据库内容
- 后台 AI 模型配置
- 上传图片和报告文件
- 个人参考资料、PDF、Word、图片目录

因此，只要不删库、不覆盖 `.env`，这些配置就不需要每次重配。

## 3. 什么时候需要重新安装依赖

只有在 `package-lock.json` 或 `package.json` 变化时，才需要重新安装依赖：

```powershell
npm --prefix project/backend ci
npm --prefix project/uni-app-frontend ci
```

普通代码修改不需要重复安装依赖。

## 4. 什么时候需要处理数据库

优先使用增量迁移，不优先删库重建。

如果 PR 涉及 DDL，需要在 PR 描述里写清楚：

- 变更了哪张表
- 新增或修改了哪些字段
- 已同步更新 `project/database/schema.sql`
- 旧库是否由 `schemaInit` 自动兼容
- 是否需要手动执行 SQL

## 5. Windows PowerShell 导入 SQL

PowerShell 不支持直接使用 `<` 导入 SQL。推荐使用：

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --default-character-set=utf8mb4 -u root -p -e "source E:/University/Project/project1.0/project/database/schema.sql"
```

演示数据导入：

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --default-character-set=utf8mb4 -u root -p ai_project -e "source E:/University/Project/project1.0/project/database/demo_seed.sql"
```

必须保留 `--default-character-set=utf8mb4`，否则中文种子数据可能乱码或导入失败。

## 6. 合并 PR 后的本地流程

PR 合并后，本地只需要：

```powershell
git -C E:\University\Project\project1.0 fetch teamrepo
git -C E:\University\Project\project1.0 switch main
git -C E:\University\Project\project1.0 pull teamrepo main
```

如果本次 PR 没有依赖变化、没有 DDL 变化、没有环境变量变化，就不需要重新安装依赖、不需要重建数据库、不需要重写 `.env`。

## 7. 当前本地保留项

后续请继续保留：

- 当前可用的 `project/backend/.env`
- 当前已初始化的 `ai_project` 数据库
- 后台已经添加并启用的 AI 模型配置

除非明确需要验证全新部署，否则不再删库重建。

## 8. PR8 手动备份配置

数据备份页的真实手动备份依赖本机 `mysqldump`。合并 PR8 后不需要重建数据库，但需要在本地 `project/backend/.env` 中补充：

```env
MYSQLDUMP_BIN=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe
```

如果该路径和本机安装位置不同，请改成实际的 `mysqldump.exe` 绝对路径。未配置时，管理端备份页会明确显示“手动备份不可用”，不会创建伪备份记录。
