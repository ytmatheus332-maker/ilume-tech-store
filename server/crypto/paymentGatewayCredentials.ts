import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'

export const PAYMENT_CREDENTIALS_FORMAT_VERSION = 1
export const PAYMENT_CREDENTIALS_NONCE_BYTES = 12
export const PAYMENT_CREDENTIALS_TAG_BYTES = 16
export const PAYMENT_CREDENTIALS_KEY_BYTES = 32

const MAX_CREDENTIALS_BYTES = 64 * 1024
const MAX_CREDENTIALS_DEPTH = 128
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROVIDER_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/

export type PaymentCredentialCryptoErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_KEY_CONFIGURATION'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_ENVELOPE'
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_CREDENTIAL_PAYLOAD'

const SAFE_ERROR_MESSAGES: Record<PaymentCredentialCryptoErrorCode, string> = {
  INVALID_INPUT: 'Contexto ou credenciais inválidos.',
  INVALID_KEY_CONFIGURATION: 'Configuração de criptografia indisponível ou inválida.',
  UNSUPPORTED_VERSION: 'Versão de criptografia não suportada.',
  INVALID_ENVELOPE: 'Envelope criptográfico inválido.',
  AUTHENTICATION_FAILED: 'Não foi possível autenticar as credenciais criptografadas.',
  INVALID_CREDENTIAL_PAYLOAD: 'Conteúdo de credenciais inválido.',
}

export class PaymentCredentialCryptoError extends Error {
  readonly code: PaymentCredentialCryptoErrorCode

  constructor(code: PaymentCredentialCryptoErrorCode) {
    super(SAFE_ERROR_MESSAGES[code])
    this.name = 'PaymentCredentialCryptoError'
    this.code = code
  }
}

export type PaymentCredentialContext = Readonly<{
  configId: string
  providerId: string
  deploymentEnvironment: 'development' | 'preview' | 'production'
  credentialsRevision: number
}>

export type EncryptedPaymentCredentials = Readonly<{
  formatVersion: number
  keyVersion: number
  nonce: string
  ciphertext: string
  authTag: string
}>

type CredentialRecord = Record<string, unknown>

function fail(code: PaymentCredentialCryptoErrorCode): never {
  throw new PaymentCredentialCryptoError(code)
}

function ownDataProperty(value: object, key: string, errorCode: PaymentCredentialCryptoErrorCode): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !('value' in descriptor)) fail(errorCode)
  return descriptor.value
}

function isPlainRecord(value: unknown): value is CredentialRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function validateContext(context: PaymentCredentialContext): void {
  if (
    !isPlainRecord(context)
  ) {
    fail('INVALID_INPUT')
  }

  const configId = ownDataProperty(context, 'configId', 'INVALID_INPUT')
  const providerId = ownDataProperty(context, 'providerId', 'INVALID_INPUT')
  const deploymentEnvironment = ownDataProperty(context, 'deploymentEnvironment', 'INVALID_INPUT')
  const credentialsRevision = ownDataProperty(context, 'credentialsRevision', 'INVALID_INPUT')
  if (
    typeof configId !== 'string' ||
    !UUID_PATTERN.test(configId) ||
    typeof providerId !== 'string' ||
    !PROVIDER_PATTERN.test(providerId) ||
    typeof deploymentEnvironment !== 'string' ||
    !['development', 'preview', 'production'].includes(deploymentEnvironment) ||
    !Number.isSafeInteger(credentialsRevision) ||
    (credentialsRevision as number) < 1
  ) fail('INVALID_INPUT')
}

function parsePositiveVersion(value: string | undefined): number {
  if (!value || !/^[1-9][0-9]*$/.test(value)) {
    fail('INVALID_KEY_CONFIGURATION')
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > 2_147_483_647) {
    fail('INVALID_KEY_CONFIGURATION')
  }
  return parsed
}

function decodeStrictBase64(value: string | undefined, expectedBytes: number): Buffer {
  if (!value || !BASE64_PATTERN.test(value)) {
    fail('INVALID_KEY_CONFIGURATION')
  }

  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== expectedBytes || decoded.toString('base64') !== value) {
    decoded.fill(0)
    fail('INVALID_KEY_CONFIGURATION')
  }
  return decoded
}

function loadKey(keyVersion: number): Buffer {
  const encodedKey = process.env[`PAYMENT_GATEWAY_MASTER_KEY_V${keyVersion}`]
  return decodeStrictBase64(encodedKey, PAYMENT_CREDENTIALS_KEY_BYTES)
}

function getActiveKeyVersion(): number {
  return parsePositiveVersion(process.env.PAYMENT_GATEWAY_ACTIVE_KEY_VERSION)
}

function buildAad(
  context: PaymentCredentialContext,
  formatVersion: number,
  keyVersion: number,
): Buffer {
  // Array order and the domain/version prefix are part of format version 1.
  // Never change this serialization without introducing a new format version.
  const canonicalTuple = [
    'ILUME_PAYMENT_GATEWAY_CREDENTIALS',
    PAYMENT_CREDENTIALS_FORMAT_VERSION,
    context.configId.toLowerCase(),
    context.providerId,
    context.deploymentEnvironment,
    context.credentialsRevision,
    formatVersion,
    keyVersion,
  ]
  return Buffer.from(JSON.stringify(canonicalTuple), 'utf8')
}

function encodeCredentials(credentials: CredentialRecord): Buffer {
  if (!isPlainRecord(credentials)) {
    fail('INVALID_INPUT')
  }

  // Bound the JSON representation before constructing the complete serialized copy.
  // This is a best-effort input guard; it cannot prevent memory already used by the
  // caller to construct the object or all runtime costs of inspecting it.
  try {
    estimateJsonBytes(credentials)
  } catch (error) {
    if (error instanceof PaymentCredentialCryptoError) throw error
    fail('INVALID_INPUT')
  }

  let serialized: string | undefined
  try {
    serialized = JSON.stringify(credentials)
  } catch {
    fail('INVALID_INPUT')
  }

  if (!serialized) {
    fail('INVALID_INPUT')
  }

  const plaintext = Buffer.from(serialized, 'utf8')
  if (plaintext.length === 0 || plaintext.length > MAX_CREDENTIALS_BYTES) {
    plaintext.fill(0)
    fail('INVALID_INPUT')
  }
  return plaintext
}

function estimateJsonBytes(root: CredentialRecord): number {
  const activeObjects = new WeakSet<object>()
  let total = 0

  const add = (bytes: number) => {
    total += bytes
    if (total > MAX_CREDENTIALS_BYTES) fail('INVALID_INPUT')
  }

  const stringBytes = (value: string): number => {
    let bytes = 2 // surrounding quotes
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index)
      if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) {
        bytes += 2
      } else if (code < 0x20 || (code >= 0xd800 && code <= 0xdfff &&
        !(code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff))) {
        bytes += 6
      } else if (code >= 0xd800 && code <= 0xdbff) {
        bytes += 4
        index += 1
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        // A valid low surrogate is counted together with its high surrogate.
        bytes += 0
      } else if (code <= 0x7f) {
        bytes += 1
      } else if (code <= 0x7ff) {
        bytes += 2
      } else {
        bytes += 3
      }
      if (bytes + total > MAX_CREDENTIALS_BYTES) fail('INVALID_INPUT')
    }
    return bytes
  }

  const visit = (value: unknown, depth: number, inArray = false): void => {
    if (depth > MAX_CREDENTIALS_DEPTH) fail('INVALID_INPUT')
    if (value === null) {
      add(4)
      return
    }
    if (typeof value === 'string') {
      add(stringBytes(value))
      return
    }
    if (typeof value === 'boolean') {
      add(value ? 4 : 5)
      return
    }
    if (typeof value === 'number') {
      add(Number.isFinite(value) ? Buffer.byteLength(JSON.stringify(value), 'utf8') : 4)
      return
    }
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
      if (inArray) add(4) // JSON.stringify emits null for these array entries.
      return
    }
    if (typeof value !== 'object') fail('INVALID_INPUT')

    if (activeObjects.has(value)) fail('INVALID_INPUT')
    activeObjects.add(value)
    try {
      if (Array.isArray(value)) {
        if (Object.hasOwn(value, 'toJSON')) fail('INVALID_INPUT')
        add(2)
        for (let index = 0; index < value.length; index += 1) {
          if (index > 0) add(1)
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
          if (!descriptor) add(4)
          else if (!('value' in descriptor)) fail('INVALID_INPUT')
          else visit(descriptor.value, depth + 1, true)
        }
        return
      }

      if (!isPlainRecord(value) || Object.hasOwn(value, 'toJSON')) fail('INVALID_INPUT')
      add(2)
      const keys = Object.keys(value)
      let included = 0
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (!descriptor || !('value' in descriptor)) fail('INVALID_INPUT')
        const entry = descriptor.value
        if (entry === undefined || typeof entry === 'function' || typeof entry === 'symbol') continue
        if (included > 0) add(1)
        add(stringBytes(key))
        add(1) // colon
        visit(entry, depth + 1)
        included += 1
      }
      // Empty object has only its two braces; non-empty objects were counted likewise.
    } finally {
      activeObjects.delete(value)
    }
  }

  visit(root, 0)
  return total
}

function decodeEnvelopeBase64(value: unknown, expectedBytes?: number): Buffer {
  if (typeof value !== 'string' || !value || !BASE64_PATTERN.test(value)) {
    fail('INVALID_ENVELOPE')
  }

  const maxEncodedLength = Math.ceil(MAX_CREDENTIALS_BYTES / 3) * 4
  const expectedEncodedLength = expectedBytes === undefined
    ? undefined
    : Math.ceil(expectedBytes / 3) * 4
  if (
    value.length > maxEncodedLength ||
    (expectedEncodedLength !== undefined && value.length !== expectedEncodedLength)
  ) {
    fail('INVALID_ENVELOPE')
  }

  const decoded = Buffer.from(value, 'base64')
  if (
    decoded.toString('base64') !== value ||
    (expectedBytes !== undefined && decoded.length !== expectedBytes) ||
    decoded.length > MAX_CREDENTIALS_BYTES
  ) {
    decoded.fill(0)
    fail('INVALID_ENVELOPE')
  }
  return decoded
}

export function encryptPaymentCredentials(
  context: PaymentCredentialContext,
  credentials: CredentialRecord,
): EncryptedPaymentCredentials {
  validateContext(context)
  const formatVersion = PAYMENT_CREDENTIALS_FORMAT_VERSION
  const keyVersion = getActiveKeyVersion()
  const key = loadKey(keyVersion)
  let nonce: Buffer | undefined
  let plaintext: Buffer | undefined
  let ciphertext: Buffer | undefined
  let authTag: Buffer | undefined

  try {
    nonce = randomBytes(PAYMENT_CREDENTIALS_NONCE_BYTES)
    plaintext = encodeCredentials(credentials)
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: PAYMENT_CREDENTIALS_TAG_BYTES,
    })
    cipher.setAAD(buildAad(context, formatVersion, keyVersion))
    ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    authTag = cipher.getAuthTag()

    return {
      formatVersion,
      keyVersion,
      nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: authTag.toString('base64'),
    }
  } catch (error) {
    if (error instanceof PaymentCredentialCryptoError) {
      throw error
    }
    return fail('AUTHENTICATION_FAILED')
  } finally {
    key.fill(0)
    nonce?.fill(0)
    plaintext?.fill(0)
    ciphertext?.fill(0)
    authTag?.fill(0)
  }
}

export function decryptPaymentCredentials(
  context: PaymentCredentialContext,
  envelope: EncryptedPaymentCredentials,
): CredentialRecord {
  validateContext(context)

  if (
    !isPlainRecord(envelope) ||
    !Object.hasOwn(envelope, 'formatVersion') ||
    !Object.hasOwn(envelope, 'keyVersion') ||
    !Object.hasOwn(envelope, 'nonce') ||
    !Object.hasOwn(envelope, 'ciphertext') ||
    !Object.hasOwn(envelope, 'authTag')
  ) {
    fail('INVALID_ENVELOPE')
  }

  const formatVersion = ownDataProperty(envelope, 'formatVersion', 'INVALID_ENVELOPE')
  const keyVersion = ownDataProperty(envelope, 'keyVersion', 'INVALID_ENVELOPE')
  const nonceValue = ownDataProperty(envelope, 'nonce', 'INVALID_ENVELOPE')
  const ciphertextValue = ownDataProperty(envelope, 'ciphertext', 'INVALID_ENVELOPE')
  const authTagValue = ownDataProperty(envelope, 'authTag', 'INVALID_ENVELOPE')

  if (typeof formatVersion !== 'number' || !Number.isSafeInteger(formatVersion) || formatVersion < 1) {
    fail('INVALID_ENVELOPE')
  }
  if (formatVersion !== PAYMENT_CREDENTIALS_FORMAT_VERSION) {
    fail('UNSUPPORTED_VERSION')
  }

  if (
    typeof keyVersion !== 'number' ||
    !Number.isSafeInteger(keyVersion) ||
    keyVersion < 1 ||
    keyVersion > 2_147_483_647
  ) {
    fail('INVALID_ENVELOPE')
  }

  let nonce: Buffer | undefined
  let ciphertext: Buffer | undefined
  let authTag: Buffer | undefined
  let key: Buffer | undefined
  let plaintext = Buffer.alloc(0)

  try {
    nonce = decodeEnvelopeBase64(nonceValue, PAYMENT_CREDENTIALS_NONCE_BYTES)
    ciphertext = decodeEnvelopeBase64(ciphertextValue)
    authTag = decodeEnvelopeBase64(authTagValue, PAYMENT_CREDENTIALS_TAG_BYTES)
    if (ciphertext.length === 0) {
      fail('INVALID_ENVELOPE')
    }

    key = loadKey(keyVersion)
    const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
      authTagLength: PAYMENT_CREDENTIALS_TAG_BYTES,
    })
    decipher.setAAD(buildAad(context, formatVersion, keyVersion))
    decipher.setAuthTag(authTag)
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])

    if (plaintext.length === 0 || plaintext.length > MAX_CREDENTIALS_BYTES) {
      fail('INVALID_CREDENTIAL_PAYLOAD')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(plaintext.toString('utf8'))
    } catch {
      fail('INVALID_CREDENTIAL_PAYLOAD')
    }

    if (!isPlainRecord(parsed)) {
      fail('INVALID_CREDENTIAL_PAYLOAD')
    }
    return parsed
  } catch (error) {
    if (error instanceof PaymentCredentialCryptoError) {
      throw error
    }
    return fail('AUTHENTICATION_FAILED')
  } finally {
    key?.fill(0)
    nonce?.fill(0)
    ciphertext?.fill(0)
    authTag?.fill(0)
    plaintext.fill(0)
  }
}
