const path = require('path')

/**
 * 规范化数据库中保存的上传文件路径。
 * 兼容历史相对路径、带 uploads/ 前缀路径以及绝对路径。
 */
const normalizeStoredUploadPath = (storedPath) => String(storedPath || '')
  .trim()
  .replace(/\\/g, '/')

/**
 * 判断绝对路径是否仍位于上传目录之内，避免路径穿越。
 */
const isInsideUploadDir = (absolutePath, uploadDir) => {
  const root = path.resolve(uploadDir)
  const target = path.resolve(absolutePath)
  return target === root || target.startsWith(root + path.sep)
}

/**
 * 将数据库中的文件路径解析为服务器本地绝对路径。
 */
const resolveUploadAbsolutePath = (uploadDir, storedPath) => {
  const normalized = normalizeStoredUploadPath(storedPath)
  if (!normalized) return null

  if (path.isAbsolute(normalized)) {
    return isInsideUploadDir(normalized, uploadDir) ? path.resolve(normalized) : null
  }

  const relativePath = normalized.replace(/^\/+/, '').replace(/^uploads\//, '')
  const absolutePath = path.resolve(uploadDir, relativePath)
  return isInsideUploadDir(absolutePath, uploadDir) ? absolutePath : null
}

/**
 * 判断某个上传文件是否仍允许通过公开静态目录直接访问。
 * 隐患图片和报告文件必须改走受控接口。
 */
const isPublicStaticUploadPath = (requestPath, hazardUploadSubdir, blockedSubdirs = []) => {
  const normalized = normalizeStoredUploadPath(requestPath).replace(/^\/+/, '')
  if (!normalized) return false

  const deniedSubdirs = [hazardUploadSubdir, ...blockedSubdirs]
    .map((item) => normalizeStoredUploadPath(item).replace(/^\/+/, ''))
    .filter(Boolean)

  if (deniedSubdirs.some((subdir) => normalized === subdir || normalized.startsWith(`${subdir}/`))) {
    return false
  }

  const fileName = path.posix.basename(normalized).toLowerCase()
  if (fileName.startsWith('report_')) return false
  return true
}

/**
 * 统一拼接受控文件访问地址。
 */
const buildFileUrl = (pathname, token) => {
  if (!pathname) return null
  const accessToken = String(token || '').trim()
  if (!accessToken) return pathname
  const separator = pathname.includes('?') ? '&' : '?'
  return `${pathname}${separator}access_token=${encodeURIComponent(accessToken)}`
}

module.exports = {
  normalizeStoredUploadPath,
  resolveUploadAbsolutePath,
  isPublicStaticUploadPath,
  buildFileUrl,
}
