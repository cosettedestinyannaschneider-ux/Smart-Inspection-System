const crypto = require('crypto')

/**
 * 模型配置密钥加解密服务
 * 使用 AES-256-GCM 对 API Key 做对称加密，避免明文存储到数据库。
 */
const DEFAULT_ALGORITHM = 'aes-256-gcm'
const DEFAULT_PREFIX = 'enc_v1'
const IV_LENGTH = 12

/** 兼容旧明文数据：没有前缀的历史值视为未加密 */
const isEncryptedPayload = (value) => String(value || '').startsWith(`${DEFAULT_PREFIX}:`)

/** 检查当前环境是否已配置模型配置加密密钥 */
const hasModelConfigSecret = () => !!String(process.env.MODEL_CONFIG_SECRET || '').trim()

/** 通过环境变量派生固定长度密钥 */
const deriveSecretKey = () => {
  const rawSecret = String(process.env.MODEL_CONFIG_SECRET || '').trim()
  if (!rawSecret) {
    throw new Error('缺少 MODEL_CONFIG_SECRET，无法处理模型配置密钥')
  }
  return crypto.createHash('sha256').update(rawSecret, 'utf8').digest()
}

/** 加密 API Key，返回带版本前缀的可存储字符串 */
const encryptApiKey = (plainText) => {
  const text = String(plainText || '').trim()
  if (!text) throw new Error('API Key 不能为空')
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(DEFAULT_ALGORITHM, deriveSecretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [
    DEFAULT_PREFIX,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

/** 解密 API Key；历史明文值原样返回，便于“读时识别、写时迁移” */
const decryptApiKey = (storedValue) => {
  const payload = String(storedValue || '').trim()
  if (!payload) return ''
  if (!isEncryptedPayload(payload)) return payload

  const [, ivBase64, authTagBase64, encryptedBase64] = payload.split(':')
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error('模型配置密钥格式不正确')
  }

  const decipher = crypto.createDecipheriv(
    DEFAULT_ALGORITHM,
    deriveSecretKey(),
    Buffer.from(ivBase64, 'base64')
  )
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/** 生成脱敏值，仅返回前缀与尾部少量字符用于识别 */
const maskApiKey = (plainText) => {
  const value = String(plainText || '').trim()
  if (!value) return ''
  if (value.length <= 8) return '****'
  return `${value.slice(0, 4)}****${value.slice(-4)}`
}

module.exports = {
  hasModelConfigSecret,
  isEncryptedPayload,
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
}
