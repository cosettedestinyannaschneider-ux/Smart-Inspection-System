const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const db = require('../dal/db')
const schemaInit = require('../dal/schemaInit')
const C = require('../common/Constants')

const CONFIRM = process.argv.includes('--confirm')
const DEMO_PASSWORD = 'Demo@123456'

const preserveTables = [
  'ai_model_configs',
  'knowledge_categories',
  'knowledge',
  'knowledge_clauses',
  'knowledge_clause_drafts',
  'hazard_rules',
  'hazard_rule_clause_refs',
  'report_templates',
  'backup_records',
]

const cleanupTables = [
  'auth_sessions',
  'sessions',
  'inspection_report_external_refs',
  'inspection_report_rule_refs',
  'inspection_report_knowledge_refs',
  'inspection_report_images',
  'inspection_reports',
  'hazard_images',
  'inspection_tasks',
  'operation_logs',
  'action_logs',
  'enterprise_inspector_assignments',
  'user_permissions',
  'users',
  'departments',
  'enterprises',
]

const demoEnterprises = [
  ['西安城建施工项目部', '建筑施工安全', '陕西省-西安市-雁塔区', '西安市雁塔区科技路施工现场', '张工', '13800000001', '其他', '中型'],
  ['秦岭工贸制造有限公司', '工贸行业安全', '陕西省-西安市-未央区', '西安市未央区工业园', '李工', '13800000002', '有限责任公司', '中型'],
  ['长安商业综合体', '消防安全', '陕西省-西安市-高新区', '西安市高新区商业中心', '王经理', '13800000003', '有限责任公司', '大型'],
  ['渭北危化品仓储有限公司', '危险化学品与化工安全', '陕西省-咸阳市-秦都区', '咸阳市秦都区仓储园区', '赵工', '13800000004', '有限责任公司', '中型'],
  ['高新特种设备使用单位', '特种设备安全', '陕西省-西安市-高新区', '西安市高新区设备使用现场', '刘工', '13800000005', '其他', '小型'],
  ['雁塔职业健康示范工厂', '职业健康与劳动安全', '陕西省-西安市-雁塔区', '西安市雁塔区生产车间', '陈工', '13800000006', '有限责任公司', '小型'],
]

const assignmentPlan = {
  inspector_01: ['西安城建施工项目部', '长安商业综合体', '高新特种设备使用单位'],
  inspector_02: ['秦岭工贸制造有限公司', '渭北危化品仓储有限公司', '雁塔职业健康示范工厂'],
  inspector_03: ['西安城建施工项目部', '秦岭工贸制造有限公司', '长安商业综合体'],
}

const inspectorPermissions = ['image:manage', 'analysis:run', 'report:download', 'knowledge:view']

const hashPassword = (plainPassword) => new Promise((resolve, reject) => {
  const salt = crypto.randomBytes(C.PASSWORD_SALT_LENGTH).toString('hex')
  crypto.scrypt(plainPassword, salt, C.PASSWORD_HASH_LENGTH, (err, derivedKey) => {
    if (err) return reject(err)
    resolve('scrypt$' + salt + '$' + derivedKey.toString('hex'))
  })
})

const tableExists = async (conn, table) => {
  const [rows] = await conn.execute(
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    [table]
  )
  return rows.length > 0
}

const clearUploadDir = (relativeDir) => {
  const target = path.resolve(C.UPLOAD_DIR, relativeDir)
  const root = path.resolve(C.UPLOAD_DIR)
  if (!target.startsWith(root)) throw new Error('上传目录安全校验失败')
  if (!fs.existsSync(target)) return
  for (const entry of fs.readdirSync(target)) {
    fs.rmSync(path.join(target, entry), { recursive: true, force: true })
  }
}

const printPlan = () => {
  console.log('[reset-demo-db] 将保留表：')
  preserveTables.forEach((name) => console.log(`  - ${name}`))
  console.log('[reset-demo-db] 将清理表：')
  cleanupTables.forEach((name) => console.log(`  - ${name}`))
  console.log('[reset-demo-db] 将重建账号：demo_admin, inspector_01, inspector_02, inspector_03')
  console.log('[reset-demo-db] 默认密码：Demo@123456')
  console.log('[reset-demo-db] 将重建 6 个演示客户企业，并按固定规则分配给 3 个检查员。')
  if (!CONFIRM) console.log('[reset-demo-db] 当前为 dry-run。真正执行请追加 --confirm')
}

const main = async () => {
  printPlan()
  if (!CONFIRM) return

  await schemaInit.init()
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    await conn.execute('SET FOREIGN_KEY_CHECKS = 0')
    for (const table of cleanupTables) {
      if (await tableExists(conn, table)) await conn.execute(`TRUNCATE TABLE \`${table}\``)
    }
    await conn.execute('SET FOREIGN_KEY_CHECKS = 1')

    const passwordHash = await hashPassword(DEMO_PASSWORD)
    const [adminResult] = await conn.execute(
      "INSERT INTO users (username, password, role, status) VALUES (?, ?, 'admin', 'active')",
      ['demo_admin', passwordHash]
    )
    const adminId = adminResult.insertId

    const inspectorIds = {}
    for (const username of ['inspector_01', 'inspector_02', 'inspector_03']) {
      const [result] = await conn.execute(
        "INSERT INTO users (username, password, role, status) VALUES (?, ?, 'user', 'active')",
        [username, passwordHash]
      )
      inspectorIds[username] = result.insertId
      for (const permission of inspectorPermissions) {
        await conn.execute('INSERT INTO user_permissions (user_id, permission_key) VALUES (?, ?)', [result.insertId, permission])
      }
    }

    const enterpriseIds = {}
    for (const row of demoEnterprises) {
      const [name, industry, region, address, contact, phone, enterpriseType, scale] = row
      const [result] = await conn.execute(
        `INSERT INTO enterprises
         (name, industry, region, address, contact, phone, enterprise_type, scale, inspection_status, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'active')`,
        [name, industry, region, address, contact, phone, enterpriseType, scale]
      )
      enterpriseIds[name] = result.insertId
    }

    for (const [username, enterprises] of Object.entries(assignmentPlan)) {
      for (const enterpriseName of enterprises) {
        await conn.execute(
          "INSERT INTO enterprise_inspector_assignments (enterprise_id, inspector_id, status, assigned_by) VALUES (?, ?, 'active', ?)",
          [enterpriseIds[enterpriseName], inspectorIds[username], adminId]
        )
      }
    }

    await conn.commit()
    clearUploadDir(C.HAZARD_UPLOAD_SUBDIR)
    clearUploadDir(path.join('reports', 'word'))
    clearUploadDir(path.join('reports', 'pdf'))
    console.log('[reset-demo-db] 演示库重建完成。')
  } catch (error) {
    await conn.rollback()
    try { await conn.execute('SET FOREIGN_KEY_CHECKS = 1') } catch {}
    throw error
  } finally {
    conn.release()
    await db.end?.()
  }
}

main().catch((error) => {
  console.error('[reset-demo-db] 执行失败：', error)
  process.exit(1)
})
