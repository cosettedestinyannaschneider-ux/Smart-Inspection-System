const fs = require('fs')
const path = require('path')

/**
 * 递归收集目录下的 JS 文件，跳过依赖和上传目录。
 */
function collectJsFiles(rootDir, result = []) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  entries.forEach((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'uploads') return
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, result)
      return
    }
    if (entry.isFile() && entry.name.endsWith('.js')) result.push(fullPath)
  })
  return result
}

const files = collectJsFiles(path.join(__dirname, '..'))
let hasError = false

files.forEach((filePath) => {
  try {
    new Function(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    hasError = true
    console.error(`[syntax-check] ${filePath}`)
    console.error(error.message)
  }
})

if (hasError) process.exit(1)
console.log(`[syntax-check] passed: ${files.length} files`)
