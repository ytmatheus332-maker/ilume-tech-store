import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'
import {
  decryptPaymentCredentials,
  encryptPaymentCredentials,
  PaymentCredentialCryptoError,
  PAYMENT_CREDENTIALS_FORMAT_VERSION,
} from '../../server/crypto/paymentGatewayCredentials.ts'

const context = {
  configId: '8d14c2be-325f-4f5d-9a1c-6dcb0e8d2181',
  providerId: 'mercadopago',
  deploymentEnvironment: 'development',
  credentialsRevision: 3,
}

const envNames = [
  'PAYMENT_GATEWAY_ACTIVE_KEY_VERSION',
  'PAYMENT_GATEWAY_MASTER_KEY_V1',
  'PAYMENT_GATEWAY_MASTER_KEY_V2',
]
const originalEnv = new Map()

function keyBase64() {
  return randomBytes(32).toString('base64')
}

function expectCryptoError(fn, expectedCode) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof PaymentCredentialCryptoError)
    assert.equal(error.code, expectedCode)
    assert.doesNotMatch(error.message, /secret|token|ciphertext|plaintext|[A-Za-z0-9+/]{40,}/i)
    return true
  })
}

function encryptRawPayload(payload, cryptoContext = context, keyVersion = 1) {
  const key = Buffer.from(process.env[`PAYMENT_GATEWAY_MASTER_KEY_V${keyVersion}`], 'base64')
  const nonce = randomBytes(12)
  const formatVersion = PAYMENT_CREDENTIALS_FORMAT_VERSION
  const aad = Buffer.from(JSON.stringify([
    'ILUME_PAYMENT_GATEWAY_CREDENTIALS',
    PAYMENT_CREDENTIALS_FORMAT_VERSION,
    cryptoContext.configId.toLowerCase(),
    cryptoContext.providerId,
    cryptoContext.deploymentEnvironment,
    cryptoContext.credentialsRevision,
    formatVersion,
    keyVersion,
  ]))
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 })
  cipher.setAAD(aad)
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
  const authTag = cipher.getAuthTag()
  key.fill(0)
  return {
    formatVersion,
    keyVersion,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

beforeEach(() => {
  for (const name of envNames) {
    originalEnv.set(name, process.env[name])
    delete process.env[name]
  }
  process.env.PAYMENT_GATEWAY_ACTIVE_KEY_VERSION = '1'
  process.env.PAYMENT_GATEWAY_MASTER_KEY_V1 = keyBase64()
})

afterEach(() => {
  for (const name of envNames) {
    const value = originalEnv.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  originalEnv.clear()
})

test('criptografa e descriptografa credenciais com AES-256-GCM', () => {
  const credentials = { accessToken: 'test-token', clientId: 'client-123' }
  const encrypted = encryptPaymentCredentials(context, credentials)

  assert.equal(encrypted.formatVersion, PAYMENT_CREDENTIALS_FORMAT_VERSION)
  assert.equal(encrypted.keyVersion, 1)
  assert.equal(Buffer.from(encrypted.nonce, 'base64').length, 12)
  assert.equal(Buffer.from(encrypted.authTag, 'base64').length, 16)
  assert.deepEqual(decryptPaymentCredentials(context, encrypted), credentials)
  assert.equal(JSON.stringify(encrypted).includes('test-token'), false)
})

test('gera nonce distinto em criptografias sucessivas', () => {
  const first = encryptPaymentCredentials(context, { token: 'same' })
  const second = encryptPaymentCredentials(context, { token: 'same' })
  assert.notEqual(first.nonce, second.nonce)
})

test('descriptografa registros antigos com a chave correspondente após rotação', () => {
  const oldEnvelope = encryptPaymentCredentials(context, { token: 'old-version' })
  process.env.PAYMENT_GATEWAY_MASTER_KEY_V2 = keyBase64()
  process.env.PAYMENT_GATEWAY_ACTIVE_KEY_VERSION = '2'
  const newEnvelope = encryptPaymentCredentials(context, { token: 'new-version' })

  assert.equal(oldEnvelope.keyVersion, 1)
  assert.equal(newEnvelope.keyVersion, 2)
  assert.equal(decryptPaymentCredentials(context, oldEnvelope).token, 'old-version')
  assert.equal(decryptPaymentCredentials(context, newEnvelope).token, 'new-version')
})

test('rejeita ciphertext adulterado', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'tamper-test' })
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64')
  ciphertext[0] ^= 1
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, ciphertext: ciphertext.toString('base64') }),
    'AUTHENTICATION_FAILED',
  )
})

test('rejeita tag adulterada', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'tag-test' })
  const tag = Buffer.from(encrypted.authTag, 'base64')
  tag[0] ^= 1
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, authTag: tag.toString('base64') }),
    'AUTHENTICATION_FAILED',
  )
})

test('rejeita nonce adulterado', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'nonce-test' })
  const nonce = Buffer.from(encrypted.nonce, 'base64')
  nonce[0] ^= 1
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, nonce: nonce.toString('base64') }),
    'AUTHENTICATION_FAILED',
  )
})

test('rejeita nonce com tamanho incorreto', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'nonce-size' })
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, nonce: randomBytes(11).toString('base64') }),
    'INVALID_ENVELOPE',
  )
})

test('rejeita tag com tamanho incorreto', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'tag-size' })
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, authTag: randomBytes(15).toString('base64') }),
    'INVALID_ENVELOPE',
  )
})

test('rejeita ciphertext vazio e Base64 malformado', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'ciphertext-shape' })
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, ciphertext: '' }),
    'INVALID_ENVELOPE',
  )
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, ciphertext: '%%%=' }),
    'INVALID_ENVELOPE',
  )
})

test('rejeita Base64 não canônico no envelope', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'base64-test' })
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, nonce: `${encrypted.nonce}\n` }),
    'INVALID_ENVELOPE',
  )
})

test('rejeita envelope com campos ausentes ou tipos incorretos', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'envelope-shape' })
  const { authTag: _authTag, ...missingTag } = encrypted
  expectCryptoError(() => decryptPaymentCredentials(context, missingTag), 'INVALID_ENVELOPE')
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, keyVersion: '1' }),
    'INVALID_ENVELOPE',
  )
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, nonce: 12 }),
    'INVALID_ENVELOPE',
  )
  expectCryptoError(() => decryptPaymentCredentials(context, null), 'INVALID_ENVELOPE')
})

test('AAD vincula config_id', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'aad-config' })
  expectCryptoError(
    () => decryptPaymentCredentials({ ...context, configId: '0a14c2be-325f-4f5d-9a1c-6dcb0e8d2181' }, encrypted),
    'AUTHENTICATION_FAILED',
  )
})

test('AAD vincula provider_id', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'aad-provider' })
  expectCryptoError(
    () => decryptPaymentCredentials({ ...context, providerId: 'bravopay' }, encrypted),
    'AUTHENTICATION_FAILED',
  )
})

test('AAD vincula deployment_environment', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'aad-environment' })
  expectCryptoError(
    () => decryptPaymentCredentials({ ...context, deploymentEnvironment: 'preview' }, encrypted),
    'AUTHENTICATION_FAILED',
  )
})

test('AAD vincula credentials_revision', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'aad-revision' })
  expectCryptoError(
    () => decryptPaymentCredentials({ ...context, credentialsRevision: 4 }, encrypted),
    'AUTHENTICATION_FAILED',
  )
})

test('AAD vincula key_version mesmo quando ambas as chaves estão configuradas', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'aad-key-version' })
  process.env.PAYMENT_GATEWAY_MASTER_KEY_V2 = keyBase64()
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, keyVersion: 2 }),
    'AUTHENTICATION_FAILED',
  )
})

test('rejeita versão de formato não suportada e versão malformada', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'format-test' })
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, formatVersion: 2 }),
    'UNSUPPORTED_VERSION',
  )
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, formatVersion: '1' }),
    'INVALID_ENVELOPE',
  )
})

test('rejeita JSON inválido com autenticação GCM válida', () => {
  const encrypted = encryptRawPayload('{invalid-json')
  expectCryptoError(() => decryptPaymentCredentials(context, encrypted), 'INVALID_CREDENTIAL_PAYLOAD')
})

test('rejeita payload autenticado que não seja objeto JSON simples', () => {
  const encrypted = encryptRawPayload('[1,2,3]')
  expectCryptoError(() => decryptPaymentCredentials(context, encrypted), 'INVALID_CREDENTIAL_PAYLOAD')
})

test('rejeita payload acima de 64 KiB antes da serialização completa', () => {
  expectCryptoError(
    () => encryptPaymentCredentials(context, { credential: 'x'.repeat(64 * 1024) }),
    'INVALID_INPUT',
  )
})

test('rejeita objetos cíclicos, profundos e propriedades acessoras', () => {
  const cyclic = {}
  cyclic.self = cyclic
  expectCryptoError(() => encryptPaymentCredentials(context, cyclic), 'INVALID_INPUT')

  let deep = { value: true }
  for (let index = 0; index < 130; index += 1) deep = { child: deep }
  expectCryptoError(() => encryptPaymentCredentials(context, deep), 'INVALID_INPUT')

  const accessor = Object.defineProperty({}, 'token', { enumerable: true, get: () => 'secret' })
  expectCryptoError(() => encryptPaymentCredentials(context, accessor), 'INVALID_INPUT')
})

test('rejeita contexto malformado', () => {
  expectCryptoError(
    () => encryptPaymentCredentials({ ...context, configId: 12 }, { token: 'invalid-context' }),
    'INVALID_INPUT',
  )
  expectCryptoError(() => encryptPaymentCredentials(null, { token: 'invalid-context' }), 'INVALID_INPUT')
})

test('rejeita versões ativas ausentes ou inválidas', () => {
  for (const invalidVersion of [undefined, '', '0', '01', '-1', '1.0', 'abc', '999999999999999999999']) {
    if (invalidVersion === undefined) delete process.env.PAYMENT_GATEWAY_ACTIVE_KEY_VERSION
    else process.env.PAYMENT_GATEWAY_ACTIVE_KEY_VERSION = invalidVersion
    expectCryptoError(
      () => encryptPaymentCredentials(context, { token: 'bad-version' }),
      'INVALID_KEY_CONFIGURATION',
    )
  }
})

test('rejeita versão de chave desconhecida e chave antiga ausente', () => {
  const encrypted = encryptPaymentCredentials(context, { token: 'missing-old-key' })
  expectCryptoError(
    () => decryptPaymentCredentials(context, { ...encrypted, keyVersion: 9 }),
    'INVALID_KEY_CONFIGURATION',
  )
  delete process.env.PAYMENT_GATEWAY_MASTER_KEY_V1
  expectCryptoError(() => decryptPaymentCredentials(context, encrypted), 'INVALID_KEY_CONFIGURATION')
})

test('rejeita chave ausente, Base64 malformado e tamanhos de 31 ou 33 bytes', () => {
  delete process.env.PAYMENT_GATEWAY_MASTER_KEY_V1
  expectCryptoError(() => encryptPaymentCredentials(context, { token: 'missing-key' }), 'INVALID_KEY_CONFIGURATION')

  process.env.PAYMENT_GATEWAY_MASTER_KEY_V1 = 'not-base64!'
  expectCryptoError(() => encryptPaymentCredentials(context, { token: 'bad-base64' }), 'INVALID_KEY_CONFIGURATION')

  process.env.PAYMENT_GATEWAY_MASTER_KEY_V1 = randomBytes(31).toString('base64')
  expectCryptoError(() => encryptPaymentCredentials(context, { token: 'short-key' }), 'INVALID_KEY_CONFIGURATION')

  process.env.PAYMENT_GATEWAY_MASTER_KEY_V1 = randomBytes(33).toString('base64')
  expectCryptoError(() => encryptPaymentCredentials(context, { token: 'long-key' }), 'INVALID_KEY_CONFIGURATION')
})

test('rejeita payload que não é um objeto JSON simples', () => {
  expectCryptoError(() => encryptPaymentCredentials(context, { token: BigInt(1) }), 'INVALID_INPUT')
  expectCryptoError(() => encryptPaymentCredentials(context, []), 'INVALID_INPUT')
})
