import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
const PREFIX = "scrypt$";

export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(pin, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `${PREFIX}${salt.toString("hex")}$${key.toString("hex")}`;
}

export function isHashed(value: string): boolean {
  if (!value.startsWith(PREFIX)) return false;
  const parts = value.slice(PREFIX.length).split("$");
  return parts.length === 2 && parts[0].length === SALT_LEN * 2 && parts[1].length === KEY_LEN * 2;
}

export function verifyPin(pin: string, stored: string): boolean {
  if (!isHashed(stored)) {
    return pin === stored;
  }
  const [saltHex, keyHex] = stored.slice(PREFIX.length).split("$");
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  const actual = scryptSync(pin, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
