export const runtime = "edge";

export async function deriveKEK(
  password: string,
  saltBase64: string
): Promise<CryptoKey> {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 600_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function isPRFSupported(): Promise<boolean> {
  try {
    const caps = await PublicKeyCredential.getClientCapabilities();
    return caps["extension:prf"] === true;
  } catch {
    return false;
  }
}

export function base64URLToUint8(base64url: string): Uint8Array {
  return Uint8Array.from(
    atob(base64url.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );
}

function preparePublicKeyRequestOptions(
  options: any
): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: base64URLToUint8(options.challenge),
    allowCredentials: options.allowCredentials?.map((cred: any) => ({
      ...cred,
      id: base64URLToUint8(cred.id),
    })),
  };
}

export async function getCredentialsWithPrf(
  prfSaltUint8: Uint8Array,
  authenticationOptions: any
) {
  const publicKey = preparePublicKeyRequestOptions(authenticationOptions);

  const credential = await navigator.credentials.get({
    publicKey: {
      ...publicKey,
      extensions: {
        prf: {
          eval: {
            first: prfSaltUint8,
          },
        },
      },
    },
  });

  return credential;
}

export async function deriveKEKFromPRF(
  prfBytes: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    prfBytes,
    "HKDF",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("vault-hkdf-salt-v1"), // we can use this to rotate key later, i.e. use the same prf from the passkey but get a new hkdf key (bugs, future proofing, etc)
      info: new TextEncoder().encode("vault:kek:webauthn-pef:v1"), // this is like a label to identify what we are using this key for
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
