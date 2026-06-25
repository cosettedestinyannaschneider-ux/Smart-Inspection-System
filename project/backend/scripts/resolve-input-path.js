const fs = require('fs')
const path = require('path')

/** 解析命令行输入路径，兼容 npm --prefix 导致的工作目录变化 */
const resolveInputPath = (inputPath, fallbackPath) => {
  if (!inputPath) return fallbackPath

  const candidates = [
    path.resolve(process.cwd(), inputPath),
    path.resolve(__dirname, '../../..', inputPath),
  ]
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  return found || candidates[0]
}

module.exports = {
  resolveInputPath,
}
