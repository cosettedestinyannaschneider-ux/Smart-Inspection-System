const fs = require('fs')
const path = require('path')
const pdfParse = require('pdf-parse')
const JSZip = require('jszip')

/** 单个文档最多自动生成的条款数量，避免大文档导入时写入过量数据 */
const MAX_AUTO_CLAUSES = 300
/** 单条条款最大内容长度，超长内容保留前段并交给人工复核 */
const MAX_CLAUSE_CONTENT_LENGTH = 4000

/** 归一化抽取出的文本，减少空白符和不可见字符对条款切分的影响 */
const normalizeText = (text) => String(text || '')
  .replace(/\u0000/g, '')
  .replace(/\r/g, '\n')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

/** 解码 XML 实体，满足 DOCX 主文档文本提取 */
const decodeXmlEntity = (text) => String(text || '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")

/** 从 DOCX 的 document.xml 中抽取段落文本 */
const extractDocxText = async (absolutePath) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(absolutePath))
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) return ''

  const paragraphs = documentXml
    .split(/<\/w:p>/)
    .map((paragraphXml) => {
      const matches = Array.from(paragraphXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
      return matches.map((match) => decodeXmlEntity(match[1])).join('')
    })
    .map((line) => line.trim())
    .filter(Boolean)

  return normalizeText(paragraphs.join('\n'))
}

/** 从 PDF 中抽取文本 */
const extractPdfText = async (absolutePath) => {
  const parsed = await pdfParse(fs.readFileSync(absolutePath))
  return normalizeText(parsed.text || '')
}

/** 尝试从标题或描述中提取法规编号，作为 source_code 的初始值 */
const inferSourceCode = (sourceTitle, description) => {
  const text = `${sourceTitle || ''} ${description || ''}`
  const match = text.match(/([A-Z]{1,6}\/?T?\s*\d{1,6}(?:[-.]\d{1,6})?|GB\s*\d{1,6}(?:[-.]\d{1,6})?|AQ\s*\d{1,6}(?:[-.]\d{1,6})?)/i)
  return match ? match[1].replace(/\s+/g, '') : null
}

/** 为条款生成简单关键词，第一阶段使用 MySQL 关键词检索，不引入向量库 */
const buildKeywords = (content) => {
  const normalized = String(content || '').replace(/[，。；：、,.!?！？;:()[\]【】《》"'“”]/g, ' ')
  const whitespaceTokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 30)

  // 中文法规文本常常没有空格，按短词窗口补充关键词，便于 MySQL LIKE 检索命中。
  const compactChineseText = normalized.replace(/[^\u4e00-\u9fa5]/g, '')
  const chineseTokens = []
  for (let index = 0; index < compactChineseText.length; index += 4) {
    const token = compactChineseText.slice(index, index + 4)
    if (token.length >= 2) chineseTokens.push(token)
  }

  return Array.from(new Set([...whitespaceTokens, ...chineseTokens])).slice(0, 20).join(',')
}

/** 识别条款号，优先覆盖中文法规常见“第X条”和数字编号 */
const parseClauseNo = (content, fallbackIndex) => {
  const text = String(content || '').trim()
  const match = text.match(/^(第[一二三四五六七八九十百千万零〇两\d]+条|[0-9]+(?:\.[0-9]+){0,4}|[一二三四五六七八九十]+[、.．])\s*/)
  return match ? match[1] : `AUTO-${fallbackIndex}`
}

/** 判断一行文本是否像新条款开头 */
const isClauseStart = (line) => /^(第[一二三四五六七八九十百千万零〇两\d]+条|[0-9]+(?:\.[0-9]+){0,4}\s+|[一二三四五六七八九十]+[、.．])/.test(line)

/** 将完整文本切分为条款候选 */
const splitTextToClauseContents = (text) => {
  const lines = normalizeText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const clauses = []
  let current = []

  for (const line of lines) {
    if (isClauseStart(line) && current.length) {
      clauses.push(current.join('\n'))
      current = [line]
    } else {
      current.push(line)
    }
  }

  if (current.length) clauses.push(current.join('\n'))

  // 如果文档没有明显条款编号，则退化为按段落切分，保证仍可用于后续人工整理。
  const normalizedClauses = clauses.length <= 1
    ? lines
    : clauses

  return normalizedClauses
    .map((item) => item.trim())
    .filter((item) => item.length >= 20)
    .slice(0, MAX_AUTO_CLAUSES)
}

/** 抽取并构造 knowledge_clauses 入库数据 */
const extractClauses = async ({
  absolutePath,
  fileType,
  knowledgeId,
  categoryId,
  sourceTitle,
  description,
}) => {
  const normalizedType = String(fileType || path.extname(absolutePath).replace('.', '')).toLowerCase()

  if (normalizedType === 'doc') {
    return {
      status: 'skipped',
      reason: 'DOC 旧格式暂不自动抽取条款，仅保留文件级管理',
      clauses: [],
    }
  }

  let text = ''
  if (normalizedType === 'pdf') {
    text = await extractPdfText(absolutePath)
  } else if (normalizedType === 'docx') {
    text = await extractDocxText(absolutePath)
  } else {
    return {
      status: 'skipped',
      reason: '当前文件类型暂不支持自动条款抽取',
      clauses: [],
    }
  }

  if (!text) {
    return {
      status: 'failed',
      reason: '未能从文件中抽取到可用文本',
      clauses: [],
    }
  }

  const sourceCode = inferSourceCode(sourceTitle, description)
  const contents = splitTextToClauseContents(text)
  const clauses = contents.map((content, index) => {
    const normalizedContent = content.slice(0, MAX_CLAUSE_CONTENT_LENGTH)
    return {
      knowledge_id: knowledgeId,
      category_id: categoryId || null,
      source_title: sourceTitle || '',
      source_code: sourceCode,
      clause_no: parseClauseNo(normalizedContent, index + 1),
      content: normalizedContent,
      keywords: buildKeywords(normalizedContent),
      sort: index + 1,
      status: 'active',
    }
  })

  return {
    status: clauses.length ? 'parsed' : 'failed',
    reason: clauses.length ? '' : '未识别到可用条款段落',
    clauses,
  }
}

module.exports = {
  extractClauses,
}
