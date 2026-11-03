import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const cost = 32_768;
const blockSize = 8;
const parallelization = 1;
const keyLength = 64;
const maxMemory = 64 * 1024 * 1024;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const key = await scrypt(password, salt, keyLength, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: maxMemory,
  });
  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt}$${Buffer.from(key).toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  const [algorithm, n, r, p, salt, expectedText, extra] = String(
    encoded || "",
  ).split("$");
  if (
    algorithm !== "scrypt" ||
    Number(n) !== cost ||
    Number(r) !== blockSize ||
    Number(p) !== parallelization ||
    !salt ||
    !expectedText ||
    extra !== undefined
  )
    return false;

  const expected = Buffer.from(expectedText, "base64url");
  if (expected.length !== keyLength) return false;
  const actual = Buffer.from(
    await scrypt(password, salt, keyLength, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: maxMemory,
    }),
  );
  return timingSafeEqual(actual, expected);
}
