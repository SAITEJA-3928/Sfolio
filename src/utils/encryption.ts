

import { SECRET_KEY } from "@/config";

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function encryptPassword(password: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  const iv = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(SECRET_KEY),
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    data
  );

  const encryptedArray = new Uint8Array(encryptedBuffer);

  return {
    encrypted: btoa(String.fromCharCode(...encryptedArray)),
    iv: btoa(String.fromCharCode(...iv)),
  };
}