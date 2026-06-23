const path = require('path')
const { validateLegalClauseCsvFile } = require('../bll/legalClauseValidationService')

/** 命令行校验正式法规条文 CSV，不连接数据库，不读取真实密钥 */
const main = () => {
  const inputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '../../database/legal_clause_official.csv')

  const summary = validateLegalClauseCsvFile(inputPath)
  console.log(JSON.stringify(summary, null, 2))

  if (!summary.passed) process.exitCode = 1
}

main()
