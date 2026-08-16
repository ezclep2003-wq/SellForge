import crypto from "node:crypto";

function getKey() {
  const secret = process.env.PASSWORD_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error(
      "PASSWORD_ENCRYPTION_KEY não está configurada.",
    );
  }

  const key = Buffer.from(secret, "base64");

  if (key.length !== 32) {
    throw new Error(
      "PASSWORD_ENCRYPTION_KEY tem de ter 32 bytes em Base64.",
    );
  }

  return key;
}

export function encryptPassword(password: string) {
  const key = getKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    key,
    iv,
  );

  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptPassword(value: string) {
  const [ivValue, tagValue, encryptedValue] =
    value.split(".");

  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Password encriptada inválida.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivValue, "base64"),
  );

  decipher.setAuthTag(
    Buffer.from(tagValue, "base64"),
  );

  const decrypted = Buffer.concat([
    decipher.update(
      Buffer.from(encryptedValue, "base64"),
    ),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}