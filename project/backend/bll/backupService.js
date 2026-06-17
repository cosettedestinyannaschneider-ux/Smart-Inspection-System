const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const backupRecordDal = require('../dal/backupRecordDal')
const C = require('../common/Constants')
const { resolveUploadAbsolutePath } = require('../common/fileAccess')

/** 备份业务异常，供路由层返回明确业务提示 */
const backupError = (message) => {
  const error = new Error(message)
  error.isBackupError = true
  return error
}

/** 读取数据库连接配置，避免备份逻辑散落读取环境变量 */
const getDatabaseConfig = () => ({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ai_project',
})

/** 获取 mysqldump 可执行文件路径，必须由部署环境显式配置 */
const getMysqlDumpBin = () => String(process.env.MYSQLDUMP_BIN || '').trim()

/** 判断当前服务是否具备真实手动备份能力 */
const getAvailability = () => {
  const mysqldumpBin = getMysqlDumpBin()
  if (!mysqldumpBin || /replace_with|change_me/i.test(mysqldumpBin)) {
    return {
      available: false,
      reason: '未配置 MYSQLDUMP_BIN，无法创建真实数据库备份',
    }
  }

  return {
    available: true,
    reason: '',
  }
}

/** 确保备份目录存在，备份文件不进入 Git，只保留在本地 uploads/backups */
const ensureBackupDir = () => {
  const dir = path.join(C.UPLOAD_DIR, C.BACKUP_UPLOAD_SUBDIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 生成稳定可读且不会泄露敏感信息的备份文件名 */
const buildBackupFileName = () => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '_')
  return `ai_project_backup_${timestamp}.sql`
}

/** 过滤 mysqldump 标准错误，避免将密码或超长输出写入数据库 */
const normalizeErrorMessage = (stderr, fallback) => {
  const message = String(stderr || fallback || '数据库备份执行失败')
    .replace(/--password=[^\s]+/g, '--password=***')
    .replace(/-p[^\s]+/g, '-p***')
    .trim()
  return message.slice(0, 1000)
}

/** 使用 spawn 参数数组执行 mysqldump，避免 shell 字符串注入 */
const runMysqlDump = ({ mysqldumpBin, dbConfig, targetPath }) => new Promise((resolve, reject) => {
  const args = [
    `--host=${dbConfig.host}`,
    `--port=${dbConfig.port}`,
    `--user=${dbConfig.user}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--default-character-set=utf8mb4',
    dbConfig.database,
  ]

  const output = fs.createWriteStream(targetPath, { flags: 'w' })
  const child = spawn(mysqldumpBin, args, {
    shell: false,
    env: {
      ...process.env,
      MYSQL_PWD: dbConfig.password,
    },
    windowsHide: true,
  })

  let stderr = ''
  child.stdout.pipe(output, { end: false })
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString()
  })

  let closed = false
  let outputFinished = false
  let outputError = null
  let settled = false
  let exitCode = null

  const finishIfReady = () => {
    if (settled) return
    if (!closed || !outputFinished) return
    if (outputError) {
      settled = true
      reject(backupError(`写入备份文件失败：${outputError.message}`))
      return
    }
    if (exitCode === 0) {
      settled = true
      resolve()
      return
    }
    settled = true
    reject(backupError(normalizeErrorMessage(stderr, `mysqldump 退出码 ${exitCode}`)))
  }

  output.on('finish', () => {
    outputFinished = true
    finishIfReady()
  })

  output.on('error', (error) => {
    outputError = error
    outputFinished = true
    finishIfReady()
  })

  child.on('error', (error) => {
    output.destroy()
    if (settled) return
    settled = true
    reject(backupError(`无法启动 mysqldump：${error.message}`))
  })

  child.on('close', (code) => {
    exitCode = code
    closed = true
    output.end()
    finishIfReady()
  })
})

/** 将数据库记录转换为前端展示对象 */
const toClientRecord = (record, buildDownloadUrl) => {
  if (!record) return null
  const absolutePath = resolveUploadAbsolutePath(C.UPLOAD_DIR, record.file_path)
  const exists = !!absolutePath && fs.existsSync(absolutePath)
  return {
    id: Number(record.id),
    file_name: record.file_name,
    file_size: Number(record.file_size || 0),
    backup_type: record.backup_type || 'manual',
    status: record.status || 'pending',
    error_message: record.error_message || '',
    created_by: record.created_by ? Number(record.created_by) : null,
    created_by_username: record.created_by_username || '',
    started_at: record.started_at || null,
    completed_at: record.completed_at || null,
    created_at: record.created_at || null,
    has_file: exists,
    download_url: exists && record.status === 'completed' && buildDownloadUrl
      ? buildDownloadUrl(record)
      : null,
  }
}

const backupService = {
  /** 返回当前备份能力状态，前端据此展示可用/不可用 */
  getStatus() {
    return {
      ...getAvailability(),
      backup_dir: path.join('uploads', C.BACKUP_UPLOAD_SUBDIR).replace(/\\/g, '/'),
      automatic_policy: {
        enabled: false,
        label: '规划中',
      },
    }
  },

  /** 查询备份记录，下载链接由路由层注入短期文件访问票据 */
  async listRecords(buildDownloadUrl = null) {
    const rows = await backupRecordDal.findAll()
    return rows.map((row) => toClientRecord(row, buildDownloadUrl))
  },

  /** 创建真实手动数据库备份 */
  async createManualBackup({ userId }) {
    const availability = getAvailability()
    if (!availability.available) throw backupError(availability.reason)

    const dbConfig = getDatabaseConfig()
    const backupDir = ensureBackupDir()
    const fileName = buildBackupFileName()
    const absolutePath = path.join(backupDir, fileName)
    const storedPath = path.posix.join(C.BACKUP_UPLOAD_SUBDIR, fileName)
    const recordId = await backupRecordDal.createRunning({
      fileName,
      filePath: storedPath,
      backupType: 'manual',
      createdBy: userId || null,
    })

    try {
      await runMysqlDump({
        mysqldumpBin: getMysqlDumpBin(),
        dbConfig,
        targetPath: absolutePath,
      })

      const stat = fs.statSync(absolutePath)
      if (!stat.size) throw backupError('备份文件为空，请检查数据库连接与 mysqldump 配置')

      await backupRecordDal.markCompleted(recordId, stat.size)
      const completed = await backupRecordDal.findById(recordId)
      return toClientRecord(completed)
    } catch (error) {
      if (fs.existsSync(absolutePath)) {
        try { fs.unlinkSync(absolutePath) } catch (unlinkError) {
          console.warn('[backupService] remove failed backup file error:', unlinkError.message)
        }
      }
      await backupRecordDal.markFailed(recordId, error.message)
      throw error
    }
  },

  /** 获取可下载备份文件的绝对路径，只允许 completed 状态 */
  async getDownloadFile(id) {
    const record = await backupRecordDal.findById(Number(id || 0))
    if (!record) throw backupError('备份记录不存在')
    if (record.status !== 'completed') throw backupError('备份尚未成功完成，不能下载')

    const absolutePath = resolveUploadAbsolutePath(C.UPLOAD_DIR, record.file_path)
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      throw backupError('备份文件不存在或已被移除')
    }

    return {
      record,
      absolutePath,
    }
  },
}

module.exports = backupService
