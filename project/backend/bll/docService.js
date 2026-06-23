const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  PageBreak,
} = require('docx')
const PDFDocument = require('pdfkit')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const reportTemplateService = require('./reportTemplateService')

const FONT = 'SimHei'
const A4_WIDTH = 11906
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: '999999' }
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 }

const DEFAULT_REPORT_TITLE = '安全生产隐患排查报告'
const DEFAULT_HAZARD_LEVEL = '一般隐患'
const DEFAULT_RESPONSIBILITY = '企业安全管理部门'
const CONFIDENTIALITY_CLAUSES = [
  '双方保证该保密信息仅用于与合作有关的用途或目的。',
  '双方各自保证对对方所提供的保密信息按本协议约定予以保密，并采取适用于对自己的保密信息同样的保护措施和审慎程度进行保密。',
  '严格执行国家有关法律、法规和有关安全生产文件及标准，采用资料核对和现场查证发现的客观事实为安全生产技术咨询服务的依据，对所检查场所及设施的准确性负责，严格做到客观公正、严谨务实、清廉自律。',
  '任何一方在提供保密信息时，如以书面形式提供，应注明“保密”等相关字样；如以口头或可视形式透露，应在透露前告知接受方为保密信息，并在告知后5日内以书面形式确认。',
  '双方保证保密信息仅可在各自一方从事该项目研究的负责人和雇员范围内知悉，并向相关人员提示保密义务。',
  '项目终止后，保密信息披露方有权向接受方提出书面要求将保密信息资料交还或按要求销毁。',
]
const SERVICE_COMMITMENTS = [
  '以法律法规为依据，以国家行业主管部门基本规范与行业标准为指南，确保安全生产社会化咨询工作质量，坚持独立、客观、科学、公正的原则。',
  '按规定的标准和程序实施安全生产社会化咨询服务，确保咨询服务的有效性和科学性。',
  '遵守保密规定，未经受审核方授权不向第三方透露相关技术、经济方面的机密。',
  '在明确项目性质、服务范围和职责后，充分沟通并做好安全生产社会化服务工作。',
  '根据企业要求合理安排咨询服务资源，及时解决服务过程中发现的问题。',
  '坚持诚信、力求发展、客户满意、社会满意的服务宗旨，持续改进服务质量。',
]

const normalizeText = (value) => String(value || '').replace(/\r/g, '').trim()

const normalizeReferenceValue = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    const name = normalizeText(value.name || value.title || value.standard_name)
    const code = normalizeText(value.code || value.standard_code || value.number)
    const clause = normalizeText(value.clause || value.article || value.item)
    const content = normalizeText(value.content || value.clause_content || value.text)
    if (!name && !code && !clause && !content) return ''
    const title = name
      ? (name.startsWith('《') ? name : `《${name}》`)
      : ''
    const codeText = code && title && !title.includes(code) ? `（${code}）` : (code && !title ? `（${code}）` : '')
    const clauseText = clause
      ? (/^第.+[条款项节]$/.test(clause) || /^[\d.]+$/.test(clause) === false ? clause : `第${clause}条`)
      : ''
    const prefix = `${title}${codeText}${clauseText}`
    return content ? `${prefix}：${content}` : prefix
  }
  return normalizeText(value)
}

const normalizeReferenceCode = (value) => normalizeText(value)
  .replace(/\bGB\s*\/\s*T\s*[- ]?\s*/i, 'GB/T ')
  .replace(/\bDB(\d+)\s*\/\s*T\s*[- ]?\s*/i, (_, number) => `DB${number}/T `)
  .replace(/\b(JGJ|AQ|TSG|XF|GA|JG|CJ|SY|GB)\s*-\s*/i, (_, prefix) => `${prefix.toUpperCase()} `)
  .replace(/\s+/g, ' ')
  .toUpperCase()
  .trim()

const referenceIdentity = (value) => {
  const text = normalizeReferenceValue(value)
  const title = text.match(/《([^》]+)》/)?.[1] || ''
  const code = normalizeReferenceCode(
    text.match(/\b(?:GB\/T|GB|JGJ|AQ|DB\d+\/T|TSG|XF|GA|JG|CJ|SY)[\s-]*[A-Z0-9./-]+-\d{4}\b/i)?.[0]
  )
  const clause = text.match(/第[一二三四五六七八九十百千万零〇两\d.]+[条款项节]/)?.[0] || ''
  if (code && clause) return `${code}|${clause}`
  if (title || clause) return `${title}|${clause}`
  return text.replace(/[《》（）()；;。：:\s]/g, '').slice(0, 80)
}

const mergeReferenceStandards = (primary, secondary) => {
  const seen = new Set()
  const result = []
  ;[primary, secondary].forEach((group) => {
    group.forEach((item) => {
      const text = normalizeReferenceValue(item)
      const key = referenceIdentity(text)
      if (!text || seen.has(key)) return
      seen.add(key)
      result.push(text)
    })
  })
  return result
}

const toImageList = (imagePath) => {
  if (Array.isArray(imagePath)) return imagePath.filter(Boolean)
  return imagePath ? [imagePath] : []
}

/**
 * 选择当前环境可用的 Python 命令，兼容 Windows 与 Linux 容器。
 */
const getPythonCommand = () => {
  if (process.platform === 'win32') return 'py'
  return process.env.PYTHON_BIN || 'python3'
}

const stripMarkdown = (text) => normalizeText(text)
  .replace(/^```[a-zA-Z]*\n?/gm, '')
  .replace(/```$/gm, '')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/^\s*[-*+]\s+/gm, '')
  .replace(/^\s*\d+[.)]\s+/gm, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/\*(.*?)\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const findSectionMatches = (text, sections) => {
  const matches = []
  for (const section of sections) {
    let best = null
    for (const label of section.labels) {
      const regex = new RegExp(
        `(^|\\n)\\s*(?:[#>*\\-\\d一二三四五六七八九十、.()（）\\s]*)${escapeRegExp(label)}\\s*[:：]?\\s*`,
        'im'
      )
      const match = regex.exec(text)
      if (match && (!best || match.index < best.index)) {
        best = { index: match.index, end: match.index + match[0].length, label }
      }
    }
    if (best) matches.push({ key: section.key, ...best })
  }
  return matches.sort((a, b) => a.index - b.index)
}

const extractSections = (text, sections) => {
  const matches = findSectionMatches(text, sections)
  const result = {}
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i]
    const next = matches[i + 1]
    const body = text.slice(current.end, next ? next.index : text.length).trim()
    result[current.key] = stripMarkdown(body)
  }
  return result
}

const dedupe = (list) => {
  const seen = new Set()
  return list.filter((item) => {
    const key = normalizeReferenceValue(item) || normalizeText(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const extractReferenceStandards = (...sources) => {
  const quoted = []
  const flat = sources.flat().map(normalizeReferenceValue).filter(Boolean)
  flat.forEach((text) => {
    const matches = text.match(/《[^》]{2,60}》/g)
    if (matches) quoted.push(...matches)
  })
  if (quoted.length) return dedupe(quoted)

  const split = []
  flat.forEach((text) => {
    text
      .split(/\n|；|;|。/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4)
      .forEach((item) => split.push(item))
  })
  return dedupe(split).slice(0, 6)
}

const normalizeArrayText = (value) => (Array.isArray(value)
  ? value.map((item) => normalizeText(item)).filter(Boolean)
  : [])

const normalizeRuleRefs = (rules = []) => (Array.isArray(rules) ? rules : [])
  .map((rule) => ({
    id: rule.id || rule.rule_id || null,
    name: normalizeText(rule.name || rule.rule_name),
    hazard_level: normalizeText(rule.hazard_level),
    evidence_sufficiency: normalizeText(rule.evidence_sufficiency),
    judgment_reason: normalizeText(rule.judgment_reason || rule.reason),
  }))
  .filter((rule) => rule.name)

const normalizeLegalRefs = (refs = []) => (Array.isArray(refs) ? refs : [])
  .map((ref) => ({
    name: normalizeText(ref.source_title || ref.name),
    code: normalizeText(ref.source_code || ref.code),
    clause: normalizeText(ref.clause_no || ref.clause),
    content: normalizeText(ref.content),
  }))
  .filter((ref) => ref.name || ref.content)

const normalizeItem = (item, index, enterprise) => ({
  image_id: Number(item.image_id) || index + 1,
  hazard_description: normalizeText(item.hazard_description || item.description || item.issue),
  hazard_level: normalizeText(item.hazard_level || item.level) || DEFAULT_HAZARD_LEVEL,
  basis: normalizeText(item.basis || item.reference || item.standard),
  suggestion: normalizeText(item.suggestion || item.measure || item.action),
  responsibility: normalizeText(item.responsibility || item.owner) || DEFAULT_RESPONSIBILITY,
  enterprise_name: normalizeText(item.enterprise_name || enterprise.name),
  location: normalizeText(item.location || enterprise.project_name || enterprise.region || enterprise.address),
  visible_facts: normalizeArrayText(item.visible_facts),
  uncertain_points: normalizeArrayText(item.uncertain_points),
  matched_rules: normalizeRuleRefs(item.matched_rules),
  legal_refs: normalizeLegalRefs(item.legal_refs),
  evidence_sufficiency: normalizeText(item.evidence_sufficiency),
  review_required: item.review_required === true,
})


const evidenceLabel = (value) => ({
  sufficient: '证据充分',
  partial: '证据部分充分',
  insufficient: '证据不足',
  not_applicable: '不适用',
}[String(value || '')] || '待人工核验')

const reviewLabel = (value) => (value ? '需人工确认' : '已进入人工确认流程')

const formatRulesSummary = (rules = []) => normalizeRuleRefs(rules)
  .map((rule, index) => `${index + 1}. ${rule.name}${rule.hazard_level ? `（${rule.hazard_level}）` : ''}`)
  .join('；')

const formatLegalRefsSummary = (refs = []) => normalizeLegalRefs(refs)
  .map((ref, index) => `${index + 1}. ${normalizeReferenceValue({ name: ref.name, code: ref.code, clause: ref.clause, content: ref.content })}`)
  .join('')

const enrichItemForReport = (item) => {
  const facts = normalizeArrayText(item.visible_facts)
  const uncertain = normalizeArrayText(item.uncertain_points)
  const rules = normalizeRuleRefs(item.matched_rules)
  const legalRefs = normalizeLegalRefs(item.legal_refs)
  const detailLines = []
  if (facts.length) detailLines.push(`可见事实：${facts.join('；')}`)
  if (rules.length) detailLines.push(`命中规则：${formatRulesSummary(rules)}`)
  if (item.evidence_sufficiency) detailLines.push(`证据充分性：${evidenceLabel(item.evidence_sufficiency)}`)
  if (uncertain.length) detailLines.push(`需补充资料：${uncertain.join('；')}`)
  if (legalRefs.length) detailLines.push(`法规条文依据：${formatLegalRefsSummary(legalRefs)}`)

  return {
    ...item,
    hazard_description: detailLines.length
      ? `${item.hazard_description || '现场隐患待复核'}\n${detailLines.join('\n')}`
      : item.hazard_description,
    suggestion: item.review_required
      ? `${item.suggestion || '建议结合现场情况补充具体整改措施。'}\n复核要求：该项为 AI 初判结果，需由安全管理人员确认后作为正式结论。`
      : item.suggestion,
  }
}
const parseImprovementDirections = (text) => {
  const lines = stripMarkdown(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return []

  return lines.slice(0, 4).map((line, index) => {
    const parts = line.split(/[:：]/)
    if (parts.length > 1) {
      const title = normalizeText(parts.shift())
      const content = normalizeText(parts.join('：'))
      return { title: title || `改进方向 ${index + 1}`, content: content || line }
    }
    return { title: `改进方向 ${index + 1}`, content: line }
  })
}

const buildFallbackOpinion = (items) => {
  const summary = items
    .map((item, index) => `${index + 1}. ${item.hazard_description || '现场隐患待复核'}`)
    .slice(0, 3)
    .join('\n')

  return {
    improvement_directions: [
      {
        title: '落实隐患整改闭环',
        content: '建议针对本次排查发现的问题建立整改台账，明确整改责任人、整改措施和完成时限，并在整改完成后组织复查验收。',
      },
      {
        title: '完善现场风险管控',
        content: '建议结合现场作业特点补充警示标识、隔离防护和操作规程，持续完善作业许可、巡检频次和关键岗位提醒机制。',
      },
      {
        title: '加强培训与常态化检查',
        content: '建议组织相关岗位开展法规标准宣贯、岗位操作培训和案例复盘，将本次隐患纳入班组日常检查和月度考核。',
      },
    ],
    general_suggestions: summary
      ? `本次排查发现的问题应尽快形成整改闭环。建议企业结合以下重点问题持续跟踪：\n${summary}\n并同步完善制度、培训和复查机制，防止同类问题重复发生。`
      : '建议企业结合本次排查结果，完善风险分级管控和隐患排查治理机制，明确整改责任、整改时限和复查要求，持续提升现场安全管理水平。',
  }
}

const parseResult = (resultText, enterprise) => {
  const cleaned = normalizeText(resultText)
  if (!cleaned) {
    return {
      items: [],
      referenceStandards: [],
      comprehensiveOpinion: null,
      rawText: '',
      isStructured: false,
      assessment: null,
    }
  }

  let normalized = cleaned
  if (normalized.startsWith('```json')) normalized = normalized.slice(7)
  else if (normalized.startsWith('```')) normalized = normalized.slice(3)
  if (normalized.endsWith('```')) normalized = normalized.slice(0, -3)
  normalized = normalized.trim()

  try {
    const data = JSON.parse(normalized)
    const items = Array.isArray(data?.items)
      ? data.items.map((item, index) => normalizeItem(item, index, enterprise))
      : (data && typeof data === 'object' && (
        data.hazard_description || data.basis || data.suggestion || data.hazard_level || data.responsibility
      ))
        ? [normalizeItem(data, 0, enterprise)]
        : []

    const opinion = data?.comprehensive_opinion
      ? {
          improvement_directions: Array.isArray(data.comprehensive_opinion.improvement_directions)
            ? data.comprehensive_opinion.improvement_directions
                .map((item, index) => ({
                  title: normalizeText(item.title) || `改进方向 ${index + 1}`,
                  content: normalizeText(item.content),
                }))
                .filter((item) => item.content)
            : [],
          general_suggestions: normalizeText(data.comprehensive_opinion.general_suggestions),
        }
      : null

    return {
      items,
      referenceStandards: dedupe(
        (Array.isArray(data?.reference_standards) ? data.reference_standards : [])
          .map((item) => normalizeReferenceValue(item))
          .filter(Boolean)
      ),
      comprehensiveOpinion: opinion,
      assessment: {
        scene_status: normalizeText(data.scene_status),
        scene_reason: normalizeText(data.scene_reason),
        hazard_level: normalizeText(data.hazard_level),
        evidence_sufficiency: normalizeText(data.evidence_sufficiency),
        review_required: data.review_required === true,
        report_allowed: data.report_allowed !== false,
        report_block_reason: normalizeText(data.report_block_reason),
        visible_facts: normalizeArrayText(data.visible_facts),
        uncertain_points: normalizeArrayText(data.uncertain_points),
        matched_rules: normalizeRuleRefs(data.matched_rules),
        legal_refs: normalizeLegalRefs(data.legal_refs),
      },
      rawText: '',
      isStructured: items.length > 0,
    }
  } catch (error) {
    const sectionData = extractSections(normalized, [
      { key: 'hazard_description', labels: ['隐患描述', '问题描述', '隐患情况', '分析结果'] },
      { key: 'basis', labels: ['排查依据', '依据', '法规依据', '标准依据'] },
      { key: 'suggestion', labels: ['整改建议', '整改措施', '处理建议', '建议'] },
      { key: 'hazard_level', labels: ['隐患等级', '风险等级'] },
      { key: 'responsibility', labels: ['责任划分', '责任部门', '责任单位', '责任人'] },
      { key: 'general_suggestions', labels: ['综合意见', '综合建议', '总体建议'] },
      { key: 'improvement_directions', labels: ['改进方向', '改进建议'] },
    ])

    const hasInspectionSections = ['hazard_description', 'basis', 'suggestion'].some((key) => normalizeText(sectionData[key]))

    const items = hasInspectionSections
      ? [normalizeItem({
          hazard_description: sectionData.hazard_description,
          basis: sectionData.basis,
          suggestion: sectionData.suggestion,
          hazard_level: sectionData.hazard_level,
          responsibility: sectionData.responsibility,
        }, 0, enterprise)]
      : []

    const opinion = sectionData.general_suggestions || sectionData.improvement_directions
      ? {
          improvement_directions: parseImprovementDirections(sectionData.improvement_directions),
          general_suggestions: normalizeText(sectionData.general_suggestions),
        }
      : null

    return {
      items,
      referenceStandards: extractReferenceStandards(sectionData.basis, normalized),
      comprehensiveOpinion: opinion,
      rawText: stripMarkdown(normalized),
      isStructured: items.length > 0,
      assessment: null,
    }
  }
}

const normalizeEnterprise = (enterprise = {}) => ({
  id: enterprise.id || null,
  name: normalizeText(enterprise.name) || '待补充企业名称',
  project_name: normalizeText(enterprise.project_name),
  region: normalizeText(enterprise.region) || '待补充',
  address: normalizeText(enterprise.address) || '待补充',
  contact: normalizeText(enterprise.contact) || '待补充',
  phone: normalizeText(enterprise.phone) || '待补充',
  industry: normalizeText(enterprise.industry) || '待补充',
  enterprise_type: normalizeText(enterprise.enterprise_type) || '待补充',
  scale: normalizeText(enterprise.scale) || '待补充',
  inspector_name: normalizeText(enterprise.inspector_name) || '待补充',
  inspection_date: normalizeText(enterprise.inspection_date),
})

const buildReportData = ({ prompt, result, imagePaths = [], enterprise }) => {
  const normalizedEnterprise = normalizeEnterprise(enterprise)
  const parsed = parseResult(result, normalizedEnterprise)
  const items = parsed.items.length
    ? parsed.items
    : [normalizeItem({
        hazard_description: parsed.rawText || normalizeText(prompt) || '本次分析未返回结构化隐患内容，请结合原始结果进一步复核。',
        basis: parsed.referenceStandards[0] || '',
        suggestion: '建议结合现场情况进一步核实隐患详情，补充法规依据、整改措施和责任划分后再行归档。',
        hazard_level: DEFAULT_HAZARD_LEVEL,
        responsibility: DEFAULT_RESPONSIBILITY,
      }, 0, normalizedEnterprise)]

  const enrichedItems = items.map(enrichItemForReport)

  const finalStandards = mergeReferenceStandards(
    parsed.referenceStandards,
    enrichedItems.flatMap((item) => [item.basis, ...normalizeLegalRefs(item.legal_refs).map((ref) => normalizeReferenceValue({ name: ref.name, code: ref.code, clause: ref.clause, content: ref.content }))])
  )

  const opinion = (
    parsed.comprehensiveOpinion
    && (
      (parsed.comprehensiveOpinion.improvement_directions || []).length
      || parsed.comprehensiveOpinion.general_suggestions
    )
  )
    ? {
        improvement_directions: (parsed.comprehensiveOpinion.improvement_directions || []).filter((item) => normalizeText(item.content)),
        general_suggestions: normalizeText(parsed.comprehensiveOpinion.general_suggestions),
      }
    : buildFallbackOpinion(items)

  return {
    prompt: normalizeText(prompt) || '无',
    enterprise: normalizedEnterprise,
    items: enrichedItems,
    referenceStandards: finalStandards,
    comprehensiveOpinion: opinion,
    rawText: parsed.isStructured ? '' : parsed.rawText,
    assessment: parsed.assessment || null,
    imagePaths: toImageList(imagePaths),
  }
}

const formatDateCN = (value) => {
  if (!value) {
    const now = new Date()
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
  }
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return normalizeText(value)
  return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日`
}

const paragraph = (text, options = {}) => new Paragraph({
  children: [
    new TextRun({
      text: String(text || ''),
      font: FONT,
      size: options.size || 24,
      bold: !!options.bold,
    }),
  ],
  alignment: options.alignment,
  spacing: options.spacing || { after: 120 },
  heading: options.heading,
})

const sectionHeading = (text, level = 1) => paragraph(text, {
  size: level === 1 ? 30 : 26,
  bold: true,
  heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
  spacing: level === 1 ? { before: 220, after: 160 } : { before: 180, after: 120 },
})

const valueTable = (rows, widths = [2200, 7160]) => new Table({
  width: { size: widths[0] + widths[1], type: WidthType.DXA },
  columnWidths: widths,
  rows: rows.map(([label, value], index) => new TableRow({
    children: [
      new TableCell({
        borders: BORDERS,
        width: { size: widths[0], type: WidthType.DXA },
        shading: index === 0 ? { fill: 'F5F7FA', type: ShadingType.CLEAR } : undefined,
        margins: CELL_MARGINS,
        children: [paragraph(label, { bold: true, size: 22 })],
      }),
      new TableCell({
        borders: BORDERS,
        width: { size: widths[1], type: WidthType.DXA },
        margins: CELL_MARGINS,
        children: [paragraph(value, { size: 22 })],
      }),
    ],
  })),
})

const inferDocxImageType = (filePath) => {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (ext === '.png') return 'png'
  if (ext === '.gif') return 'gif'
  if (ext === '.bmp') return 'bmp'
  return 'jpeg'
}

const makeImageParagraph = (filePath, width = 420, height = 300) => {
  if (!filePath || !fs.existsSync(filePath)) return null
  try {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new ImageRun({
          type: inferDocxImageType(filePath),
          data: fs.readFileSync(filePath),
          transformation: { width, height },
          altText: { title: '隐患图片', description: '', name: path.basename(filePath) },
        }),
      ],
    })
  } catch (error) {
    return null
  }
}

const writeWordReportFromTemplate = async ({ reportData, compilerUnit, auditorName, templatePath = null }) => {
  const fallbackTemplatePath = path.join(__dirname, '..', 'templates', 'hazard_report_template.docx')
  const resolvedTemplatePath = templatePath || fallbackTemplatePath
  const scriptPath = path.join(__dirname, '..', 'tools', 'fillReportTemplate.py')
  if (!fs.existsSync(resolvedTemplatePath) || !fs.existsSync(scriptPath)) return null

  const fileName = `report_${Date.now()}.docx`
  const wordPath = path.join('uploads', fileName)
  const fullPath = path.join(__dirname, '..', wordPath)
  const payloadPath = path.join(__dirname, '..', 'uploads', `report_payload_${Date.now()}.json`)

  const payload = {
    enterprise: reportData.enterprise,
    prompt: reportData.prompt,
    items: reportData.items,
    referenceStandards: reportData.referenceStandards,
    comprehensiveOpinion: reportData.comprehensiveOpinion,
    imagePaths: reportData.imagePaths,
    compilerUnit,
    auditorName,
    inspectionDate: formatDateCN(reportData.enterprise.inspection_date),
  }

  try {
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8')
    const result = spawnSync(getPythonCommand(), [scriptPath, resolvedTemplatePath, fullPath, payloadPath], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60000,
    })
    if (result.status === 0 && fs.existsSync(fullPath)) {
      return wordPath.replace(/\\/g, '/')
    }
    console.error('[docService] template report generation failed:', result.stderr || result.stdout)
    return null
  } catch (error) {
    console.error('[docService] template report generation error:', error)
    return null
  } finally {
    try { if (fs.existsSync(payloadPath)) fs.unlinkSync(payloadPath) } catch (error) { /* ignore */ }
  }
}

const getItemImagePath = (item, index, imagePaths) => {
  const imageIndex = Number(item.image_id) - 1
  if (imageIndex >= 0 && imageIndex < imagePaths.length) return imagePaths[imageIndex]
  return imagePaths[index] || null
}

const tableCell = (children, width, options = {}) => new TableCell({
  borders: BORDERS,
  width: { size: width, type: WidthType.DXA },
  margins: CELL_MARGINS,
  shading: options.shading,
  children: children.length ? children : [paragraph('', { size: 20 })],
})

const textCell = (text, width, options = {}) => tableCell([
  paragraph(text, {
    size: options.size || 20,
    bold: !!options.bold,
    alignment: options.alignment,
    spacing: { after: 60 },
  }),
], width, options)

const buildHazardEvidenceChildren = (item, imagePath) => {
  const children = [
    paragraph(item.hazard_description || '待补充', { size: 20, spacing: { after: 80 } }),
  ]
  const imageParagraph = makeImageParagraph(imagePath, 220, 165)
  if (imageParagraph) children.push(imageParagraph)
  return children
}

const buildHazardChecklistTable = ({ enterprise, items, imagePaths, referenceStandards }) => {
  const widths = [1050, 1050, 3300, 800, 2300, 860]
  const headers = ['企业', '地点', '现场存在问题（隐患描述及图片）', '隐患\n等级', '整改建议', '责任\n划分']
  const rows = [
    new TableRow({
      tableHeader: true,
      children: headers.map((header, index) => textCell(header, widths[index], {
        bold: true,
        alignment: AlignmentType.CENTER,
        shading: { fill: 'D9EAF7', type: ShadingType.CLEAR },
      })),
    }),
  ]

  items.forEach((item, index) => {
    const imagePath = getItemImagePath(item, index, imagePaths)
    rows.push(new TableRow({
      children: [
        textCell(item.enterprise_name || enterprise.name, widths[0], { size: 19 }),
        textCell(item.location || enterprise.project_name || enterprise.region || '现场', widths[1], { size: 19 }),
        tableCell(buildHazardEvidenceChildren(item, imagePath), widths[2]),
        textCell(item.hazard_level || DEFAULT_HAZARD_LEVEL, widths[3], {
          size: 19,
          alignment: AlignmentType.CENTER,
        }),
        textCell(item.suggestion || '建议结合现场情况补充具体整改措施。', widths[4], { size: 19 }),
        textCell(item.responsibility || DEFAULT_RESPONSIBILITY, widths[5], { size: 19 }),
      ],
    }))
  })

  if (!items.length) {
    rows.push(new TableRow({
      children: [
        textCell(enterprise.name, widths[0], { size: 19 }),
        textCell(enterprise.project_name || enterprise.region || '现场', widths[1], { size: 19 }),
        textCell('暂无隐患排查项目。', widths[2], { size: 19 }),
        textCell('-', widths[3], { size: 19, alignment: AlignmentType.CENTER }),
        textCell('-', widths[4], { size: 19 }),
        textCell('-', widths[5], { size: 19 }),
      ],
    }))
  }

  return new Table({
    width: { size: widths.reduce((sum, value) => sum + value, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows,
  })
}

const buildWordChildren = ({ prompt, enterprise, items, referenceStandards, comprehensiveOpinion, rawText, imagePaths }) => {
  const projectName = normalizeText(enterprise.project_name)
  const titlePrefix = projectName ? `${enterprise.name} ${projectName}` : enterprise.name
  const children = []

  children.push(paragraph(enterprise.name, {
    size: 32,
    bold: true,
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }))
  children.push(paragraph(projectName || '项目部', {
    size: 30,
    bold: true,
    alignment: AlignmentType.CENTER,
    spacing: { after: 360 },
  }))
  children.push(paragraph(DEFAULT_REPORT_TITLE, {
    size: 36,
    bold: true,
    alignment: AlignmentType.CENTER,
    spacing: { after: 900 },
  }))
  children.push(valueTable([
    ['编制单位', 'XXXX安全技术咨询有限公司'],
    ['编制人员', enterprise.inspector_name],
    ['审核人员', '待补充'],
    ['编制日期', formatDateCN(enterprise.inspection_date)],
    ['联系电话', enterprise.phone],
    ['电子邮箱', '待补充'],
  ]))
  children.push(new Paragraph({ children: [new PageBreak()] }))

  children.push(sectionHeading('保密公正性声明'))
  children.push(paragraph('为保证安全生产技术咨询服务工作的公正性与有效性，经双方协商，共同做以下承诺：'))
  CONFIDENTIALITY_CLAUSES.forEach((clause, index) => {
    children.push(paragraph(`${index + 1}. ${clause}`, { size: 22, spacing: { after: 80 } }))
  })
  children.push(paragraph('甲方：                              乙方：'))
  children.push(paragraph('签字（盖章）：                      签字（盖章）：'))
  children.push(paragraph('年   月   日                        年   月   日'))
  children.push(new Paragraph({ children: [new PageBreak()] }))

  children.push(sectionHeading('服 务 承 诺 书'))
  children.push(paragraph('为确保咨询服务质量到位，最大限度地满足客户要求，并为客户提供增值服务，现做出以下郑重承诺：'))
  SERVICE_COMMITMENTS.forEach((clause) => {
    children.push(paragraph(`★  ${clause}`, { size: 22, spacing: { after: 80 } }))
  })
  children.push(new Paragraph({ children: [new PageBreak()] }))

  children.push(sectionHeading('目  录'))
  ;[
    '一、隐患排查',
    '　　（一）隐患排查形式',
    '　　（二）检查依据',
    '　　（三）现场问题隐患及整改建议措施清单',
    '二、隐患排查综合意见',
    '　　（一）安全管理改进方向及建议',
    '　　（二）综合建议',
  ].forEach((line) => children.push(paragraph(line, { size: 24, spacing: { after: 80 } })))
  children.push(new Paragraph({ children: [new PageBreak()] }))

  children.push(paragraph(enterprise.name, {
    size: 30,
    bold: true,
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }))
  children.push(paragraph(projectName || '项目部', {
    size: 28,
    bold: true,
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }))
  children.push(paragraph(DEFAULT_REPORT_TITLE, {
    size: 32,
    bold: true,
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  }))

  children.push(sectionHeading('一、隐患排查'))
  children.push(sectionHeading('（一） 隐患排查形式', 2))
  children.push(paragraph('现场工作场所及安全办公区域检查。'))
  children.push(paragraph(`此次检查覆盖了${titlePrefix}所有场所。`))
  if (prompt) children.push(paragraph(`排查说明：${prompt}`, { size: 22 }))

  children.push(sectionHeading('（二） 检查依据', 2))
  referenceStandards.forEach((item, index) => {
    children.push(paragraph(`${index + 1}. ${item}；`, { size: 22, spacing: { after: 80 } }))
  })

  children.push(sectionHeading('（三） 现场问题隐患及整改建议措施清单', 2))
  children.push(buildHazardChecklistTable({ enterprise, items, imagePaths, referenceStandards }))
  children.push(new Paragraph({ children: [new PageBreak()] }))

  children.push(sectionHeading('二、隐患排查综合意见'))
  children.push(sectionHeading('（一） 安全管理改进方向及建议', 2))
  comprehensiveOpinion.improvement_directions.forEach((item, index) => {
    children.push(paragraph(`${index + 1}. ${item.title}`, { bold: true, size: 24 }))
    children.push(paragraph(item.content, { size: 22 }))
  })
  children.push(sectionHeading('（二） 综合建议', 2))
  children.push(paragraph(comprehensiveOpinion.general_suggestions, { size: 22 }))

  if (rawText) {
    children.push(sectionHeading('附：AI 原始分析内容'))
    rawText.split(/\n+/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      children.push(paragraph(line, { size: 22 }))
    })
  }

  return children
}

const writeWordReport = async ({ prompt, result, imagePaths = [], enterprise, compilerUnit, auditorName }) => {
  const reportData = buildReportData({ prompt, result, imagePaths, enterprise })
  const activeTemplatePath = await reportTemplateService.getDefaultTemplateAbsolutePath()
  const templateWordPath = await writeWordReportFromTemplate({
    reportData,
    compilerUnit,
    auditorName,
    templatePath: activeTemplatePath,
  })
  if (templateWordPath) return templateWordPath

  const fallbackTemplateWordPath = activeTemplatePath
    ? await writeWordReportFromTemplate({ reportData, compilerUnit, auditorName })
    : null
  if (fallbackTemplateWordPath) return fallbackTemplateWordPath

  const fileName = `report_${Date.now()}.docx`
  const wordPath = path.join('uploads', fileName)
  const fullPath = path.join(__dirname, '..', wordPath)

  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 24 } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 30, bold: true, font: FONT },
          paragraph: { spacing: { before: 220, after: 160 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: FONT },
          paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [{
      properties: { page: { size: { width: A4_WIDTH, height: 16838 } } },
      children: buildWordChildren({
        ...reportData,
        compilerUnit,
        auditorName,
      }),
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  fs.writeFileSync(fullPath, buffer)
  return wordPath.replace(/\\/g, '/')
}

const writePdfTextBlock = (doc, title, value) => {
  doc.fontSize(13).text(title, { continued: false })
  doc.moveDown(0.2)
  doc.fontSize(11).text(value || '待补充', { align: 'left' })
  doc.moveDown(0.6)
}

const writePdfSection = (doc, title) => {
  doc.moveDown(0.4)
  doc.fontSize(16).text(title)
  doc.moveDown(0.3)
}

const convertWordToPdf = (wordPath) => {
  const scriptPath = path.join(__dirname, '..', 'tools', 'convertWordToPdf.py')
  if (!fs.existsSync(scriptPath)) return null

  const absoluteWordPath = path.isAbsolute(wordPath)
    ? wordPath
    : path.join(__dirname, '..', wordPath)
  if (!fs.existsSync(absoluteWordPath)) return null

  const fileName = `report_${Date.now()}.pdf`
  const pdfPath = path.join('uploads', fileName)
  const absolutePdfPath = path.join(__dirname, '..', pdfPath)
  const result = spawnSync(getPythonCommand(), [scriptPath, absoluteWordPath, absolutePdfPath], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  })

  if (result.status === 0 && fs.existsSync(absolutePdfPath)) {
    return pdfPath.replace(/\\/g, '/')
  }
  console.error('[docService] Word to PDF conversion failed:', result.stderr || result.stdout)
  return null
}

const writePdfReportFromWordTemplate = async ({ prompt, result, imagePaths = [], enterprise, compilerUnit, auditorName }) => {
  try {
    const wordPath = await writeWordReport({
      prompt,
      result,
      imagePaths,
      enterprise,
      compilerUnit,
      auditorName,
    })
    const pdfPath = convertWordToPdf(wordPath)
    if (pdfPath) {
      const absoluteWordPath = path.isAbsolute(wordPath)
        ? wordPath
        : path.join(__dirname, '..', wordPath)
      try { if (fs.existsSync(absoluteWordPath)) fs.unlinkSync(absoluteWordPath) } catch (error) { /* ignore cleanup errors */ }
      return pdfPath
    }
  } catch (error) {
    console.error('[docService] template PDF generation failed:', error)
  }
  return null
}

const writePdfReport = async ({ prompt, result, imagePaths = [], enterprise, compilerUnit, auditorName }) => {
  const templatePdfPath = await writePdfReportFromWordTemplate({
    prompt,
    result,
    imagePaths,
    enterprise,
    compilerUnit,
    auditorName,
  })
  if (templatePdfPath) return templatePdfPath

  const reportData = buildReportData({ prompt, result, imagePaths, enterprise })
  const fileName = `report_${Date.now()}.pdf`
  const pdfPath = path.join('uploads', fileName)
  const fullPath = path.join(__dirname, '..', pdfPath)

  const pdfDoc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true })
  const stream = fs.createWriteStream(fullPath)
  const normalFontPath = 'C:/Windows/Fonts/simfang.ttf'
  const boldFontPath = 'C:/Windows/Fonts/simhei.ttf'
  const kaiFontPath = 'C:/Windows/Fonts/simkai.ttf'

  if (fs.existsSync(normalFontPath)) pdfDoc.registerFont('normal', normalFontPath)
  if (fs.existsSync(boldFontPath)) pdfDoc.registerFont('bold', boldFontPath)
  if (fs.existsSync(kaiFontPath)) pdfDoc.registerFont('kai', kaiFontPath)
  pdfDoc.font(fs.existsSync(normalFontPath) ? 'normal' : 'Helvetica')
  pdfDoc.pipe(stream)

  const projectName = normalizeText(reportData.enterprise.project_name)
  const titlePrefix = projectName ? `${reportData.enterprise.name} ${projectName}` : reportData.enterprise.name

  const useFont = (name) => {
    if (name === 'bold' && fs.existsSync(boldFontPath)) return pdfDoc.font('bold')
    if (name === 'kai' && fs.existsSync(kaiFontPath)) return pdfDoc.font('kai')
    if (fs.existsSync(normalFontPath)) return pdfDoc.font('normal')
    return pdfDoc.font('Helvetica')
  }
  const addPage = () => pdfDoc.addPage({ margin: 48, size: 'A4' })
  const writeTitle = (text, size = 16) => {
    useFont('bold').fontSize(size).text(text, { align: 'center' })
    pdfDoc.moveDown(0.7)
    useFont('normal')
  }
  const writePara = (text, options = {}) => {
    useFont(options.bold ? 'bold' : (options.kai ? 'kai' : 'normal'))
      .fontSize(options.size || 11)
      .text(text || '待补充', {
        align: options.align || 'left',
        indent: options.indent || 0,
        lineGap: options.lineGap ?? 5,
      })
    pdfDoc.moveDown(options.after ?? 0.45)
    useFont('normal')
  }
  const writeSectionTitle = (text) => {
    pdfDoc.moveDown(0.3)
    writePara(text, { bold: true, size: 15, after: 0.25 })
  }
  const drawTableRow = (cells, widths, options = {}) => {
    const startX = pdfDoc.x
    const startY = pdfDoc.y
    const padding = 5
    const heights = cells.map((cell, index) => {
      useFont(options.header ? 'bold' : 'normal').fontSize(options.size || 9)
      return pdfDoc.heightOfString(String(cell || ''), {
        width: widths[index] - padding * 2,
        lineGap: 2,
      }) + padding * 2
    })
    const rowHeight = Math.max(options.minHeight || 26, ...heights)
    if (startY + rowHeight > pdfDoc.page.height - pdfDoc.page.margins.bottom) {
      addPage()
    }
    let x = pdfDoc.x
    const y = pdfDoc.y
    cells.forEach((cell, index) => {
      pdfDoc.rect(x, y, widths[index], rowHeight).stroke()
      useFont(options.header ? 'bold' : 'normal')
        .fontSize(options.size || 9)
        .text(String(cell || ''), x + padding, y + padding, {
          width: widths[index] - padding * 2,
          lineGap: 2,
          align: options.align || 'left',
        })
      x += widths[index]
    })
    pdfDoc.x = startX
    pdfDoc.y = y + rowHeight
  }

  writeTitle(reportData.enterprise.name, 20)
  writeTitle(projectName || '项目部', 18)
  pdfDoc.moveDown(1.5)
  writeTitle(DEFAULT_REPORT_TITLE, 24)
  pdfDoc.moveDown(2)
  ;[
    ['编制单位', compilerUnit || 'XXXX安全技术咨询有限公司'],
    ['编制人员', reportData.enterprise.inspector_name],
    ['审核人员', auditorName || '待补充'],
    ['编制日期', formatDateCN(reportData.enterprise.inspection_date)],
    ['联系电话', reportData.enterprise.phone],
    ['电子邮箱', reportData.enterprise.email || '待补充'],
  ].forEach(([label, value]) => writePara(`${label}：${value || '待补充'}`, { size: 12, indent: 110, after: 0.35 }))

  addPage()
  writeTitle('保密公正性声明', 18)
  writePara('为保证安全生产技术咨询服务工作的公正性与有效性，经双方协商，共同做以下承诺：', { size: 11 })
  CONFIDENTIALITY_CLAUSES.forEach((clause, index) => {
    writePara(`${index + 1}. ${clause}`, { size: 10.5 })
  })
  pdfDoc.moveDown(1)
  writePara('甲方：                              乙方：', { size: 11 })
  writePara('签字（盖章）：                      签字（盖章）：', { size: 11 })
  writePara('年   月   日                        年   月   日', { size: 11 })

  addPage()
  writeTitle('服 务 承 诺 书', 18)
  writePara('为确保咨询服务质量到位，最大限度地满足客户要求，并为客户提供增值服务，现做出以下郑重承诺：', { size: 11 })
  SERVICE_COMMITMENTS.forEach((clause) => {
    writePara(`★  ${clause}`, { size: 10.5 })
  })

  addPage()
  writeTitle('目  录', 18)
  ;[
    '一、隐患排查',
    '    （一）隐患排查形式',
    '    （二）检查依据',
    '    （三）现场问题隐患及整改建议措施清单',
    '二、隐患排查综合意见',
    '    （一）安全管理改进方向及建议',
    '    （二）综合建议',
  ].forEach((line) => writePara(line, { size: 12, after: 0.25 }))

  addPage()
  writeTitle(reportData.enterprise.name, 17)
  writeTitle(projectName || '项目部', 16)
  writeTitle(DEFAULT_REPORT_TITLE, 18)
  writeSectionTitle('一、隐患排查')
  writeSectionTitle('（一）隐患排查形式')
  writePara(`本次隐患排查采用资料核对、现场照片识别与安全生产法规标准比对相结合的方式开展。排查说明：${reportData.prompt || '无'}`, { size: 11, indent: 22 })
  writeSectionTitle('（二）检查依据')
  reportData.referenceStandards.forEach((item, index) => {
    writePara(`${index + 1}. ${item.endsWith('；') ? item : `${item}；`}`, { size: 11, after: 0.25 })
  })

  writeSectionTitle('（三）现场问题隐患及整改建议措施清单')
  drawTableRow(
    ['企业\n地点', '现场存在问题（隐患描述及图片）', '隐患\n等级', '整改建议', '责任\n划分'],
    [58, 202, 48, 160, 55],
    { header: true, align: 'center', minHeight: 34, size: 8.6 }
  )
  reportData.items.forEach((item, index) => {
    drawTableRow([
      item.location || projectName || reportData.enterprise.region || '现场',
      item.hazard_description || '待补充',
      item.hazard_level || DEFAULT_HAZARD_LEVEL,
      item.suggestion || '建议结合现场情况补充具体整改措施。',
      item.responsibility || DEFAULT_RESPONSIBILITY,
    ], [58, 202, 48, 160, 55], { minHeight: 60, size: 8.4 })

    const imagePath = getItemImagePath(item, index, reportData.imagePaths)
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        if (pdfDoc.y > pdfDoc.page.height - 250) addPage()
        writePara(`隐患图片 ${index + 1}`, { kai: true, size: 10, align: 'center', after: 0.2 })
        pdfDoc.image(imagePath, pdfDoc.page.margins.left + 72, pdfDoc.y, { fit: [360, 210], align: 'center' })
        pdfDoc.y += 220
      } catch (error) {
        // ignore image rendering errors
      }
    }
  })

  addPage()
  writeSectionTitle('二、隐患排查综合意见')
  writeSectionTitle('（一）安全管理改进方向及建议')
  reportData.comprehensiveOpinion.improvement_directions.forEach((item, index) => {
    writePara(`${index + 1}. ${item.title}`, { bold: true, size: 11 })
    writePara(item.content, { size: 11, indent: 22 })
  })
  writeSectionTitle('（二）综合建议')
  writePara(reportData.comprehensiveOpinion.general_suggestions, { size: 11, indent: 22 })

  if (reportData.rawText) {
    writeSectionTitle('附：AI 原始分析内容')
    writePara(reportData.rawText, { size: 10 })
  }

  pdfDoc.end()

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(pdfPath.replace(/\\/g, '/')))
    stream.on('error', reject)
  })
}

const docService = {
  async generateTemplateReport({ enterprise, prompt, result, imagePaths = [], compilerUnit, auditorName }) {
    return writeWordReport({ enterprise, prompt, result, imagePaths, compilerUnit, auditorName })
  },

  async generateTemplatePDF({ enterprise, prompt, result, imagePaths = [], compilerUnit, auditorName, wordPath }) {
    if (wordPath) {
      const pdfPath = convertWordToPdf(wordPath)
      if (pdfPath) return pdfPath
    }
    return writePdfReport({ enterprise, prompt, result, imagePaths, compilerUnit, auditorName })
  },

  async generateWord(prompt, result, imagePath, options = {}) {
    return writeWordReport({
      prompt,
      result,
      imagePaths: toImageList(imagePath),
      enterprise: options.enterprise,
      compilerUnit: options.compilerUnit,
      auditorName: options.auditorName,
    })
  },

  async generatePDF(prompt, result, imagePath, options = {}) {
    if (options.wordPath) {
      const pdfPath = convertWordToPdf(options.wordPath)
      if (pdfPath) return pdfPath
    }
    return writePdfReport({
      prompt,
      result,
      imagePaths: toImageList(imagePath),
      enterprise: options.enterprise,
      compilerUnit: options.compilerUnit,
      auditorName: options.auditorName,
    })
  },
}

module.exports = docService
