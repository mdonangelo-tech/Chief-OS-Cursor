/**
 * Encrypt/decrypt refresh tokens at rest.
 * Uses AES-256-GCM. Key must be 32 bytes (64 hex chars).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY (or TOKEN_ENCRYPTION_KEY) must be 32 bytes hex (64 chars). Run: openssl rand -hex 32"
    );
  }
  return Buffer.from(keyHex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted].join(":");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}
