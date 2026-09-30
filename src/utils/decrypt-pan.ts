import { CRYPTO_JS_ENCRYPTION_KEY } from "@/config";

const ENCRYPTED_PAN_PATTERN = /^[0-9a-f]+:[0-9a-f]+$/i;

function hexToBytes(hex: string) {
  const normalized = hex.trim();
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function deriveSecretKey(encryptionKey: string) {
  const encoded = new TextEncoder().encode(encryptionKey);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", digest, { name: "AES-CBC" }, false, ["decrypt"]);
}

export function isEncryptedPanValue(value?: string | null) {
  if (!value) return false;
  return ENCRYPTED_PAN_PATTERN.test(value.trim());
}

export async function decryptPanNumber(encryptedText: string) {
  const encryptionKey = CRYPTO_JS_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    throw new Error("Missing VITE_CRYPTO_JS_ENCRYPTION_KEY");
  }

  const parts = encryptedText.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted PAN format");
  }

  const iv = hexToBytes(parts[0]);
  const encryptedData = hexToBytes(parts[1]);
  const secretKey = await deriveSecretKey(encryptionKey);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    secretKey,
    encryptedData,
  );

  return new TextDecoder().decode(decryptedBuffer).trim().toUpperCase();
}

export async function resolvePanNumberDisplay(value?: string | null) {
  if (!value) return "—";
  if (!isEncryptedPanValue(value)) return value;
  try {
    return await decryptPanNumber(value);
  } catch {
    return "—";
  }
}
