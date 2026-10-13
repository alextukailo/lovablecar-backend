import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const encoded = process.env.OIDC_PROOF_ENCRYPTION_KEY;

  if (!encoded) {
    throw new Error('OIDC_PROOF_ENCRYPTION_KEY is missing');
  }

  const key = Buffer.from(encoded, 'base64');

  if (key.length !== 32) {
    throw new Error('OIDC encryption key must be 32 bytes');
  }

  return key;
}

export function encryptOidcProof(value: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

export function decryptOidcProof(encoded: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(encoded, 'base64url');

  if (data.length < IV_LENGTH + 16 + 1) {
    throw new Error('Invalid encrypted OIDC proof');
  }

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = data.subarray(IV_LENGTH + 16);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
