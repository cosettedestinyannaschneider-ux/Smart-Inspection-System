-- ============================================================================
-- 后端阶段 A：数据库迁移验证 SQL
-- 所有结果应结合“预期”列核对；冲突记录允许存在，但必须可追踪。
-- ============================================================================

-- 执行时必须显式指定目标数据库，例如：mysql ai_project < 本文件。

-- 1. 结构验证
SELECT
  'departments.enterprise_id 必须非空' AS check_name,
  COUNT(*) AS actual,
  0 AS expected
FROM departments
WHERE enterprise_id IS NULL
UNION ALL
SELECT
  '孤立部门数量',
  COUNT(*),
  0
FROM departments d
LEFT JOIN enterprises e ON e.id = d.enterprise_id
WHERE e.id IS NULL
UNION ALL
SELECT
  '重复企业名称数量',
  COUNT(*),
  0
FROM (
  SELECT name
  FROM enterprises
  GROUP BY name
  HAVING COUNT(*) > 1
) duplicated_enterprises
UNION ALL
SELECT
  '孤立用户部门数量',
  COUNT(*),
  0
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
WHERE u.department_id IS NOT NULL
  AND d.id IS NULL
UNION ALL
SELECT
  '企业内重复部门名称数量',
  COUNT(*),
  0
FROM (
  SELECT enterprise_id, name
  FROM departments
  GROUP BY enterprise_id, name
  HAVING COUNT(*) > 1
) duplicated_departments
UNION ALL
SELECT
  '重复用户权限数量',
  COUNT(*),
  0
FROM (
  SELECT user_id, permission_key
  FROM user_permissions
  GROUP BY user_id, permission_key
  HAVING COUNT(*) > 1
) duplicated_permissions
UNION ALL
SELECT
  '孤立用户权限数量',
  COUNT(*),
  0
FROM user_permissions up
LEFT JOIN users u ON u.id = up.user_id
WHERE u.id IS NULL;

-- 2. 字段与表存在性验证
SELECT
  table_name,
  column_name,
  is_nullable,
  column_type
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND (
    (table_name = 'departments' AND column_name = 'enterprise_id')
    OR (table_name = 'enterprises' AND column_name IN ('user_id', 'inspection_status'))
    OR (table_name = 'ai_model_configs' AND column_name = 'provider')
  )
ORDER BY table_name, ordinal_position;

SELECT
  table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('user_permissions', 'backup_records', 'phase_a_migration_conflicts')
ORDER BY table_name;

-- 3. 组织关系与权限验证
SELECT
  e.id AS enterprise_id,
  e.name AS enterprise_name,
  COUNT(DISTINCT d.id) AS department_count,
  COUNT(DISTINCT u.id) AS user_count
FROM enterprises e
LEFT JOIN departments d ON d.enterprise_id = e.id
LEFT JOIN users u ON u.department_id = d.id
GROUP BY e.id, e.name
ORDER BY e.id;

SELECT
  u.role,
  COUNT(DISTINCT u.id) AS user_count,
  COUNT(up.permission_key) AS permission_count
FROM users u
LEFT JOIN user_permissions up ON up.user_id = u.id
GROUP BY u.role
ORDER BY u.role;

-- 4. 业务数据关联与人工确认清单
SELECT
  'hazard_images' AS source_table,
  COUNT(*) AS total_count,
  SUM(enterprise_id IS NULL) AS unresolved_count
FROM hazard_images
UNION ALL
SELECT
  'inspection_reports',
  COUNT(*),
  SUM(enterprise_id IS NULL)
FROM inspection_reports;

SELECT
  conflict_type,
  source_table,
  COUNT(*) AS conflict_count
FROM phase_a_migration_conflicts
GROUP BY conflict_type, source_table
ORDER BY conflict_type, source_table;

-- 5. 外键验证：enterprises.user_id 不应再存在到 users 的外键。
SELECT
  k.table_name,
  k.column_name,
  k.constraint_name,
  k.referenced_table_name,
  r.delete_rule,
  r.update_rule
FROM information_schema.key_column_usage k
JOIN information_schema.referential_constraints r
  ON r.constraint_schema = k.constraint_schema
 AND r.constraint_name = k.constraint_name
 AND r.table_name = k.table_name
WHERE k.constraint_schema = DATABASE()
  AND k.table_name IN ('enterprises', 'departments', 'users', 'user_permissions', 'backup_records')
ORDER BY k.table_name, k.constraint_name;
