const fs = require('fs')
const path = require('path')
const knowledgeDal = require('../dal/knowledgeDal')
const knowledgeCategoryDal = require('../dal/knowledgeCategoryDal')
const knowledgeCategoryRelationDal = require('../dal/knowledgeCategoryRelationDal')
const knowledgeClauseDal = require('../dal/knowledgeClauseDal')
const { LEGAL_KNOWLEDGE_CATEGORY_NAMES } = require('../common/legalKnowledgeTaxonomy')

const LEGAL_CLAUSE_IMPORT_HEADER_ALIASES = {
  category: '分类',
  title: '法规名称',
  source_code: '文号/标准号',
  clause_no: '条款号',
  content: '条文内容',
  keywords: '关键词',
  source_url: '官方来源URL',
  issuing_authority: '发布机关',
  effective_date: '施行日期',
  current_status: '现行状态',
  remark: '备注',
}

const REQUIRED_HEADERS = [
  '分类',
  '法规名称',
  '文号/标准号',
  '条款号',
  '条文内容',
  '关键词',
  '官方来源URL',
  '发布机关',
  '施行日期',
  '现行状态',
  '备注',
]

const DOCUMENT_TYPE_VALUES = new Set(['法律', '行政法规', '部门规章', '规范性文件', '国家标准', '行业标准', '地方标准', '团体标准', '其他'])
const CURRENT_STATUS_VALUES = new Set(['现行有效', '已废止', '已修订', '征求意见', '未知'])

/** 创建法规导入异常，便于路由层返回明确错误 */
const importError = (message) => {
  const error = new Error(message)
  error.isKnowledgeError = true
  return error
}

/** 简单 CSV 解析器，支持双引号转义和逗号换行 */
const parseCsv = (text) => {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell)
      if (row.some((item) => String(item || '').trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some((item) => String(item || '').trim())) rows.push(row)
  return rows
}

/** 生成 CSV 单元格，保证模板和种子数据可被 Excel 打开 */
const toCsvCell = (value) => {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

/** 将对象数组序列化为 CSV 文本 */
const stringifyCsv = (rows = []) => [
  REQUIRED_HEADERS.map(toCsvCell).join(','),
  ...rows.map((row) => REQUIRED_HEADERS.map((header) => toCsvCell(row[header])).join(',')),
].join('\n')

/** 规范化表头，去除 UTF-8 BOM */
const normalizeHeader = (value) => String(value || '').replace(/^\uFEFF/, '').trim()

/** 解析 CSV 内容为对象行 */
const parseCsvRecords = (text) => {
  const rows = parseCsv(text)
  if (rows.length < 2) throw importError('CSV 至少需要表头和一行数据')

  const headers = rows[0].map(normalizeHeader)
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header))
  if (missingHeaders.length) {
    throw importError(`CSV 缺少必填表头：${missingHeaders.join('、')}`)
  }

  return rows.slice(1).map((row, index) => {
    const record = { __rowNumber: index + 2 }
    headers.forEach((header, headerIndex) => {
      record[header] = String(row[headerIndex] || '').trim()
    })
    return record
  })
}

/** 归一化日期，仅接受 YYYY-MM-DD */
const normalizeDate = (value) => {
  const text = String(value || '').trim()
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

/** 按标题猜测法规文件类型，CSV 未单列时作为演示导入默认值 */
const inferDocumentType = (title) => {
  const text = String(title || '')
  if (text.includes('法')) return '法律'
  if (text.includes('条例')) return '行政法规'
  if (text.includes('标准') || /^[A-Z]{1,8}\s*\d+/i.test(text)) return '国家标准'
  if (text.includes('规定') || text.includes('办法')) return '部门规章'
  return '其他'
}

/** 根据条文内容补充关键词，避免 CSV 关键词为空时完全不可检索 */
const buildKeywords = (content, explicitKeywords) => {
  const words = String(explicitKeywords || '')
    .split(/[，,;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (words.length) return Array.from(new Set(words)).slice(0, 20).join(',')

  const text = String(content || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
  const fallback = []
  for (let index = 0; index < text.length; index += 4) {
    const token = text.slice(index, index + 4)
    if (token.length >= 2) fallback.push(token)
  }
  return Array.from(new Set(fallback)).slice(0, 20).join(',')
}

/** 校验并转换单行 CSV 记录 */
const normalizeRecord = (record) => {
  const categoryName = record['分类']
  const title = record['法规名称']
  const sourceCode = record['文号/标准号']
  const clauseNo = record['条款号']
  const content = record['条文内容']
  const sourceUrl = record['官方来源URL']
  const issuingAuthority = record['发布机关']
  const effectiveDate = normalizeDate(record['施行日期'])
  const currentStatus = record['现行状态'] || '现行有效'

  if (!LEGAL_KNOWLEDGE_CATEGORY_NAMES.has(categoryName)) {
    throw importError(`第 ${record.__rowNumber} 行分类不属于固定 14 类：${categoryName || '空'}`)
  }
  if (!title) throw importError(`第 ${record.__rowNumber} 行缺少法规名称`)
  if (!sourceCode) throw importError(`第 ${record.__rowNumber} 行缺少文号/标准号`)
  if (!clauseNo) throw importError(`第 ${record.__rowNumber} 行缺少条款号`)
  if (!content) throw importError(`第 ${record.__rowNumber} 行缺少条文内容`)
  if (!sourceUrl) throw importError(`第 ${record.__rowNumber} 行缺少官方来源URL`)
  if (!issuingAuthority) throw importError(`第 ${record.__rowNumber} 行缺少发布机关`)
  if (record['施行日期'] && !effectiveDate) throw importError(`第 ${record.__rowNumber} 行施行日期格式必须为 YYYY-MM-DD`)
  if (!CURRENT_STATUS_VALUES.has(currentStatus)) throw importError(`第 ${record.__rowNumber} 行现行状态无效`)

  const documentType = inferDocumentType(title)
  if (!DOCUMENT_TYPE_VALUES.has(documentType)) throw importError(`第 ${record.__rowNumber} 行文件类型无效`)

  return {
    rowNumber: record.__rowNumber,
    categoryName,
    title,
    sourceCode,
    clauseNo,
    content,
    keywords: buildKeywords(content, record['关键词']),
    sourceUrl,
    issuingAuthority,
    documentType,
    effectiveDate,
    currentStatus,
    remark: record['备注'] || '',
  }
}

/** 获取固定分类映射 */
const loadCategoryMap = async () => {
  const categories = await knowledgeCategoryDal.findAll()
  return new Map(categories.map((category) => [category.name, category]))
}

/** 创建或复用 CSV 导入形成的法规文档记录 */
const ensureKnowledgeDocument = async (normalized, categoryId) => {
  const existing = await knowledgeDal.findBySourceIdentity({
    title: normalized.title,
    source_code: normalized.sourceCode,
    source_url: normalized.sourceUrl,
  })
  if (existing) return { knowledgeId: Number(existing.id), created: false }

  const knowledgeId = await knowledgeDal.create({
    title: normalized.title,
    file_path: `seed://${normalized.sourceCode}`,
    file_size: null,
    file_type: 'csv',
    description: normalized.remark || 'CSV 导入法规条文',
    category_id: categoryId,
    source_code: normalized.sourceCode,
    source_url: normalized.sourceUrl,
    issuing_authority: normalized.issuingAuthority,
    document_type: normalized.documentType,
    publish_date: null,
    effective_date: normalized.effectiveDate,
    current_status: normalized.currentStatus,
    verification_status: 'verified',
    parse_status: 'parsed',
    parse_message: 'CSV 导入条文',
  })
  await knowledgeCategoryRelationDal.replaceByKnowledgeId(knowledgeId, [categoryId])
  return { knowledgeId, created: true }
}

/** 导入 CSV 文本 */
const importCsvText = async (text) => {
  const records = parseCsvRecords(text)
  const categoryMap = await loadCategoryMap()
  const summary = {
    total_rows: records.length,
    imported_clauses: 0,
    skipped_duplicates: 0,
    created_knowledge: 0,
    failed_rows: [],
  }

  for (const record of records) {
    try {
      const normalized = normalizeRecord(record)
      const category = categoryMap.get(normalized.categoryName)
      if (!category) throw importError(`第 ${normalized.rowNumber} 行分类未初始化：${normalized.categoryName}`)

      const duplicate = await knowledgeClauseDal.findDuplicate({
        source_title: normalized.title,
        source_code: normalized.sourceCode,
        clause_no: normalized.clauseNo,
        content: normalized.content,
      })
      if (duplicate) {
        summary.skipped_duplicates += 1
        continue
      }

      const { knowledgeId, created } = await ensureKnowledgeDocument(normalized, Number(category.id))
      if (created) summary.created_knowledge += 1

      await knowledgeClauseDal.create(knowledgeId, {
        category_id: Number(category.id),
        source_title: normalized.title,
        source_code: normalized.sourceCode,
        source_url: normalized.sourceUrl,
        issuing_authority: normalized.issuingAuthority,
        document_type: normalized.documentType,
        publish_date: null,
        effective_date: normalized.effectiveDate,
        current_status: normalized.currentStatus,
        verification_status: 'verified',
        clause_no: normalized.clauseNo,
        content: normalized.content,
        keywords: normalized.keywords,
        sort: normalized.rowNumber,
        status: 'active',
      })
      summary.imported_clauses += 1
    } catch (error) {
      summary.failed_rows.push({
        row: record.__rowNumber,
        message: error.message || '导入失败',
      })
    }
  }

  return summary
}

/** 从文件路径导入 CSV */
const importCsvFile = async (filePath) => {
  const absolutePath = path.resolve(filePath)
  if (!fs.existsSync(absolutePath)) throw importError(`CSV 文件不存在：${absolutePath}`)
  return await importCsvText(fs.readFileSync(absolutePath, 'utf8'))
}

module.exports = {
  REQUIRED_HEADERS,
  LEGAL_CLAUSE_IMPORT_HEADER_ALIASES,
  stringifyCsv,
  parseCsvRecords,
  importCsvText,
  importCsvFile,
}
