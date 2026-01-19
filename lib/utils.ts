import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const runtime = "edge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
