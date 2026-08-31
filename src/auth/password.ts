import { hash, verify } from "@node-rs/argon2";

// Argon2id mit Bibliotheks-Defaults (OWASP-konform).
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}
