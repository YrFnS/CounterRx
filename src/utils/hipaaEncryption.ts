/**
 * HIPAA Compliance Utilities
 * 
 * Provides encryption at rest for Protected Health Information (PHI)
 * using AES-256 encryption. All patient data, clinical notes, and
 * prescription information should be encrypted before storage.
 */

import CryptoJS from 'crypto-js';

// Encryption key should come from environment variables in production
// For now, we use a secure derivation from a master key
const MASTER_KEY = process.env.REACT_APP_HIPAA_MASTER_KEY || 'counterRx-hipaa-master-key-do-not-use-in-prod';
const SALT = 'counterRx-hipaa-salt-v1';

/**
 * Derive a 256-bit encryption key from the master key
 */
function deriveKey(): string {
  return CryptoJS.PBKDF2(MASTER_KEY, SALT, {
    keySize: 8, // 256 bits
    iterations: 10000
  }).toString();
}

/**
 * Encrypt PHI data before storage
 * @param data - The plaintext data to encrypt
 * @returns Encrypted ciphertext
 */
export function encryptPHI(data: string): string {
  if (!data) return data;
  
  const key = deriveKey();
  const encrypted = CryptoJS.AES.encrypt(data, key).toString();
  return encrypted;
}

/**
 * Decrypt PHI data for authorized access
 * @param ciphertext - The encrypted data
 * @returns Decrypted plaintext
 */
export function decryptPHI(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  
  try {
    const key = deriveKey();
    const bytes = CryptoJS.AES.decrypt(ciphertext, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt PHI:', error);
    throw new Error('PHI decryption failed - possible tampering or key mismatch');
  }
}

/**
 * Encrypt an entire object containing PHI fields
 * @param obj - Object with PHI fields
 * @param phiFields - Array of field names that contain PHI
 * @returns New object with PHI fields encrypted
 */
export function encryptPHIObject<T extends Record<string, any>>(
  obj: T,
  phiFields: (keyof T)[]
): T {
  const result = { ...obj };
  
  for (const field of phiFields) {
    if (obj[field] !== undefined && obj[field] !== null) {
      const value = String(obj[field]);
      (result as any)[field] = encryptPHI(value);
    }
  }
  
  return result;
}

/**
 * Decrypt an entire object containing encrypted PHI fields
 * @param obj - Object with encrypted PHI fields
 * @param phiFields - Array of field names that are encrypted
 * @returns New object with PHI fields decrypted
 */
export function decryptPHIObject<T extends Record<string, any>>(
  obj: T,
  phiFields: (keyof T)[]
): T {
  const result = { ...obj };
  
  for (const field of phiFields) {
    if (obj[field] !== undefined && obj[field] !== null) {
      try {
        (result as any)[field] = decryptPHI(String(obj[field]));
      } catch (error) {
        console.warn(`Failed to decrypt field ${String(field)}, keeping encrypted`);
      }
    }
  }
  
  return result;
}

/**
 * Hash sensitive data for audit trail (one-way, non-reversible)
 * @param data - Data to hash
 * @returns SHA-256 hash
 */
export function hashForAudit(data: string): string {
  return CryptoJS.SHA256(data).toString();
}

/**
 * Generate a secure random token for consent forms
 */
export function generateConsentToken(): string {
  const randomBytes = CryptoJS.lib.WordArray.random(32);
  return randomBytes.toString(CryptoJS.enc.Hex);
}

/**
 * Verify data integrity using HMAC
 * @param data - Data to sign
 * @param secret - Secret key for signing
 * @returns HMAC-SHA256 signature
 */
export function createIntegrityCheck(data: string, secret: string = MASTER_KEY): string {
  return CryptoJS.HmacSHA256(data, secret).toString();
}

/**
 * Verify data integrity
 * @param data - Original data
 * @param signature - Signature to verify
 * @param secret - Secret key used for signing
 * @returns True if signature is valid
 */
export function verifyIntegrity(data: string, signature: string, secret: string = MASTER_KEY): boolean {
  const expectedSignature = createIntegrityCheck(data, secret);
  return expectedSignature === signature;
}
