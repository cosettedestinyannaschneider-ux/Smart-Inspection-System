-- ============================================================================
-- 智检系统 - 可选最小演示数据
-- 用途：本地演示或评审环境快速生成一套可登录、可查看的基础数据
-- 说明：
-- 1. 请先导入 schema.sql 或先启动后端让 schemaInit 完成建表/迁移。
-- 2. 本文件仅插入最小演示数据，不覆盖已有业务数据。
-- 3. 如当前库中已存在同名账号或企业，请先自行清理或修改名称后再导入。
-- ============================================================================

USE ai_project;

START TRANSACTION;

-- ----------------------------------------------------------------------------
-- 1. 管理员账号
-- 用户名：admin_demo
-- 密码：DemoAdmin123!
-- ----------------------------------------------------------------------------
INSERT INTO users (
  username, password, role, department_id, status, login_attempts, locked_until, last_login_at
)
SELECT
  'admin_demo',
  'scrypt$554565a20e4615e115d6b90bf2b706d5$4f5d8b8e293b8799d4b886abf8a281cf8b60feaaa35665a328af2af4e520636dab66b678f388810851728e1914e26097d071f344f5e716b54c9e176210e6a8de',
  'admin',
  NULL,
  'active',
  0,
  NULL,
  NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'admin_demo'
);

-- ----------------------------------------------------------------------------
-- 2. 演示企业
-- ----------------------------------------------------------------------------
INSERT INTO enterprises (
  user_id, name, region, address, contact, phone, industry, enterprise_type, scale,
  production_process, inspector_name, inspection_date, inspection_status, project_name, status
)
SELECT
  NULL,
  '演示建筑企业',
  '陕西省-西安市-雁塔区',
  '科技路 88 号',
  '张经理',
  '13800000001',
  '建筑施工',
  '有限责任公司',
  '中型',
  '房建施工、机电安装、装饰装修',
  'Anna',
  '2026-06-10',
  'pending',
  '安全生产隐患排查演示项目',
  'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM enterprises WHERE name = '演示建筑企业'
);

-- ----------------------------------------------------------------------------
-- 3. 演示部门
-- ----------------------------------------------------------------------------
INSERT INTO departments (enterprise_id, name)
SELECT e.id, '安全管理部'
FROM enterprises e
WHERE e.name = '演示建筑企业'
  AND NOT EXISTS (
    SELECT 1
    FROM departments d
    WHERE d.enterprise_id = e.id AND d.name = '安全管理部'
  );

-- ----------------------------------------------------------------------------
-- 4. 普通演示用户
-- 用户名：demo_user
-- 密码：DemoUser123!
-- ----------------------------------------------------------------------------
INSERT INTO users (
  username, password, role, department_id, status, login_attempts, locked_until, last_login_at
)
SELECT
  'demo_user',
  'scrypt$a8afa0800070fda38eb6edec67b6b8b9$2fd014482dbd3e3c9f931ae0e8a6cc4b76d7f4ed0a00ae890ae95fcb3c434d2a8b773e3651936378259634e50786abb3aa0a2eb39d7ef663f94cc0f6a71303cb',
  'user',
  d.id,
  'active',
  0,
  NULL,
  NULL
FROM departments d
JOIN enterprises e ON e.id = d.enterprise_id
WHERE e.name = '演示建筑企业'
  AND d.name = '安全管理部'
  AND NOT EXISTS (
    SELECT 1 FROM users WHERE username = 'demo_user'
  );

-- ----------------------------------------------------------------------------
-- 5. 演示用户权限
-- ----------------------------------------------------------------------------
INSERT INTO user_permissions (user_id, permission_key)
SELECT u.id, perm.permission_key
FROM users u
JOIN (
  SELECT 'enterprise:manage' AS permission_key
  UNION ALL SELECT 'image:manage'
  UNION ALL SELECT 'analysis:run'
  UNION ALL SELECT 'report:download'
  UNION ALL SELECT 'knowledge:view'
) perm
WHERE u.username = 'demo_user'
  AND NOT EXISTS (
    SELECT 1
    FROM user_permissions up
    WHERE up.user_id = u.id AND up.permission_key = perm.permission_key
  );

COMMIT;
