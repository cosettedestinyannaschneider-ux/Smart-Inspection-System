const fs = require('fs')
const path = require('path')
const {
  REQUIRED_HEADERS,
  parseCsvRecords,
} = require('./legalClauseImportService')
const { LEGAL_KNOWLEDGE_CATEGORY_NAMES } = require('../common/legalKnowledgeTaxonomy')

const CURRENT_STATUS_VALUES = new Set(['现行有效', '现行', '已废止', '已修订', '征求意见', '未知'])

/** 创建法规条文 CSV 校验问题 */
const createIssue = (level, row, field, message) => ({
  level,
  row,
  field,
  message,
})

/** 读取 CSV 第一行表头，支持带引号表头与 UTF-8 BOM */
const readHeaderLine = (text) => {
  const firstLine = String(text || '').split(/\r?\n/, 1)[0] || ''
  return firstLine
    .split(',')
    .map((header) => header.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim())
}

/** 判断官方来源 URL 是否满足正式条文库要求 */
const isOfficialUrlValid = (value) => {
  const text = String(value || '').trim()
  if (!text || text.toLowerCase().startsWith('local://')) return false
  return /^https?:\/\//i.test(text)
}

/** 校验法规条文 CSV 文本，不连接数据库，适合 CI 和导入前门禁 */
const validateLegalClauseCsvText = (text) => {
  const issues = []
  const headers = readHeaderLine(text)

  if (headers.length !== REQUIRED_HEADERS.length || REQUIRED_HEADERS.some((header, index) => headers[index] !== header)) {
    issues.push(createIssue(
      'error',
      1,
      '表头',
      `CSV 表头必须严格为：${REQUIRED_HEADERS.join('、')}`
    ))
  }

  let records = []
  try {
    records = parseCsvRecords(text)
  } catch (error) {
    issues.push(createIssue('error', 1, 'CSV', error.message || 'CSV 解析失败'))
    return {
      passed: false,
      total_rows: 0,
      error_count: issues.filter((issue) => issue.level === 'error').length,
      warning_count: issues.filter((issue) => issue.level === 'warning').length,
      issues,
    }
  }

  const duplicateKeys = new Map()
  records.forEach((record) => {
    const row = record.__rowNumber
    const category = record['分类']
    const title = record['法规名称']
    const sourceCode = record['文号/标准号']
    const clauseNo = record['条款号']
    const content = record['条文内容']
    const sourceUrl = record['官方来源URL']
    const currentStatus = record['现行状态']

    if (!LEGAL_KNOWLEDGE_CATEGORY_NAMES.has(category)) {
      issues.push(createIssue('error', row, '分类', `分类必须属于固定 14 类：${category || '空'}`))
    }
    if (!title) issues.push(createIssue('error', row, '法规名称', '法规名称不能为空'))
    if (!sourceCode) issues.push(createIssue('error', row, '文号/标准号', '文号/标准号不能为空'))
    if (!clauseNo) issues.push(createIssue('error', row, '条款号', '条款号不能为空'))
    if (!content) issues.push(createIssue('error', row, '条文内容', '条文内容不能为空'))
    if (!currentStatus || !CURRENT_STATUS_VALUES.has(currentStatus)) {
      issues.push(createIssue('error', row, '现行状态', '现行状态必须为：现行有效、现行、已废止、已修订、征求意见、未知'))
    }
    if (!isOfficialUrlValid(sourceUrl)) {
      issues.push(createIssue('error', row, '官方来源URL', '官方来源 URL 必须为 http/https，且不得使用 local://'))
    }
    if (content && content.length < 8) {
      issues.push(createIssue('warning', row, '条文内容', '条文内容少于 8 个字符，请人工确认是否为目录、标题或抽取残片'))
    }

    const duplicateKey = [title, sourceCode, clauseNo, content].join('\u0001')
    if (title && sourceCode && clauseNo && content) {
      if (duplicateKeys.has(duplicateKey)) {
        issues.push(createIssue(
          'error',
          row,
          '重复条款',
          `与第 ${duplicateKeys.get(duplicateKey)} 行重复`
        ))
      } else {
        duplicateKeys.set(duplicateKey, row)
      }
    }
  })

  const errorCount = issues.filter((issue) => issue.level === 'error').length
  const warningCount = issues.filter((issue) => issue.level === 'warning').length

  return {
    passed: errorCount === 0,
    total_rows: records.length,
    error_count: errorCount,
    warning_count: warningCount,
    issues,
  }
}

/** 校验法规条文 CSV 文件 */
const validateLegalClauseCsvFile = (filePath) => {
  const absolutePath = path.resolve(filePath)
  if (!fs.existsSync(absolutePath)) {
    return {
      passed: false,
      total_rows: 0,
      error_count: 1,
      warning_count: 0,
      issues: [createIssue('error', null, '文件', `CSV 文件不存在：${absolutePath}`)],
    }
  }
  return validateLegalClauseCsvText(fs.readFileSync(absolutePath, 'utf8'))
}

module.exports = {
  validateLegalClauseCsvText,
  validateLegalClauseCsvFile,
}
