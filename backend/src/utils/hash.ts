/**
 * Parola hash'leme — node:crypto scrypt.
 *
 * Harici paket yok. Format: `scrypt$N$r$p$salt$hash`
 * Parametreler hash içine gömülür; doğrulama aynı değerleri okur.
 *
 * Senkron sürümler seed CLI'da (Aşama 1), asenkron sürümler giriş
 * rotalarında (Aşama 2a) kullanılır.
 */

import {
  randomBytes,
  scryptSync,
  scrypt as scryptAsync,
  timingSafeEqual,
} from 'node:crypto';

const N = 16384; // CPU/memory maliyeti
const R = 8; // blok boyutu
const P = 1; // paralellik
const KEY_LEN = 32;
const SALT_LEN = 16;

function serialize(salt: Buffer, hash: Buffer): string {
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function deserialize(encoded: string): {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
} {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    throw new Error('Geçersiz hash formatı');
  }
  return {
    N: Number(parts[1]),
    r: Number(parts[2]),
    p: Number(parts[3]),
    salt: Buffer.from(parts[4], 'base64'),
    hash: Buffer.from(parts[5], 'base64'),
  };
}

function doHash(salt: Buffer, password: string): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N, r: R, p: P });
}

/** Senkron hash — seed CLI içindir. */
export function hashPasswordSync(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = doHash(salt, password);
  return serialize(salt, hash);
}

/** Senkron doğrulama — seed/CLI testlerinde kullanılır. */
export function verifyPasswordSync(password: string, encoded: string): boolean {
  const { N: n, r, p, salt, hash } = deserialize(encoded);
  const candidate = scryptSync(password, salt, hash.length, { N: n, r, p });
  return timingSafeEqual(candidate, hash);
}

/** Asenkron hash — giriş rotaları içindir (Aşama 2a). */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SALT_LEN);
    scryptAsync(password, salt, KEY_LEN, { N, r: R, p: P }, (err, hash) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(serialize(salt, hash));
    });
  });
}

/** Asenkron doğrulama — giriş rotaları içindir (Aşama 2a). */
export function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let params;
    try {
      params = deserialize(encoded);
    } catch (err) {
      reject(err);
      return;
    }
    const { N: n, r, p, salt, hash } = params;
    scryptAsync(password, salt, hash.length, { N: n, r, p }, (err, candidate) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(timingSafeEqual(candidate, hash));
    });
  });
}