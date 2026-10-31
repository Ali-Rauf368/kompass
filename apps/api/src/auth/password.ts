import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const KEY_LENGTH = 64;
const PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1 };

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, KEY_LENGTH, PARAMS, (err, key) => (err ? reject(err) : resolve(key))));
}

/** scrypt with a random salt; stored as `scrypt$<salt>$<hash>` (base64) so parameters can change later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${(await derive(password, salt)).toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
