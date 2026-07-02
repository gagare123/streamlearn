import { scrypt, timingSafeEqual, randomBytes } from 'crypto'



function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(derivedKey)
    })
  })
}

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
} as const

const SALT_BYTES = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex')

  const hash = await scryptAsync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  })

  return `${salt}.${hash.toString('hex')}`
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split('.')
  if (parts.length !== 2) {
    await hashPassword(password)
    return false
  }

  const [salt, expectedHex] = parts as [string, string]

  let derivedHash: Buffer
  try {
    derivedHash = await scryptAsync(password, salt, SCRYPT_PARAMS.keylen, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
    })
  } catch {
    return false
  }

  let expectedBuf: Buffer
  try {
    expectedBuf = Buffer.from(expectedHex, 'hex')
  } catch {
    return false
  }

  if (derivedHash.length !== expectedBuf.length) return false

  return timingSafeEqual(derivedHash, expectedBuf)
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}