/*
used for domain separation of commitments and nullifiers

Without it:
A nullifier hash could accidentally collide with a commitment hash
Or be reused in future protocol versions
Or be misinterpreted in ZK circuits

With it:
Every hash has a clear semantic meaning
You can upgrade safely to:
MORA_NULLIFIER_V2
MORA_COMMITMENT_V2
Old data remains verifiable forever

*/
export const DOMAIN_NULLIFIER  = "MORA_NULLIFIER_V1"
export const DOMAIN_COMMITMENT = "MORA_COMMITMENT_V1"



export async function deriveMoraIdentitySecret(
  vmk: CryptoKey
): Promise<Uint8Array> {
  // HKDF requires key material imported for "HKDF". The VMK is an AES-GCM key,
  // so we export to raw bytes and re-import as HKDF key material. The VMK must
  // be extractable (it is when decrypted in the app).
  const raw = await crypto.subtle.exportKey("raw", vmk);
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    raw,
    "HKDF",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("MORA_USER_SECRET_V1"),
      info: new TextEncoder().encode("nullifier-root"),
    },
    hkdfKey,
    256 // bits = 32 bytes
  );

  return new Uint8Array(derivedBits);
}

// S: nullifer generation 
// Helper: SHA-256
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", data as any);
  return new Uint8Array(hash);
}

// Helper: encode number (question_id)
export function uint32BE(value: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, value, false);
  return new Uint8Array(buf);
}

// Nullifier derivation
export async function deriveNullifier(
  moraIdentitySecret: Uint8Array,
  questionId: number,
  epochId: string
): Promise<Uint8Array> {
  const domainBytes = new TextEncoder().encode(DOMAIN_NULLIFIER);
  const questionBytes = uint32BE(questionId);
  const epochBytes = new TextEncoder().encode(epochId);

  const totalLength =
    domainBytes.length +
    moraIdentitySecret.length +
    questionBytes.length +
    epochBytes.length;
  const data = new Uint8Array(totalLength);
  let offset = 0;
  data.set(domainBytes, offset);
  offset += domainBytes.length;
  data.set(moraIdentitySecret, offset);
  offset += moraIdentitySecret.length;
  data.set(questionBytes, offset);
  offset += questionBytes.length;
  data.set(epochBytes, offset);

  return sha256(data);
}
// E: nullifer generation 


// S: commitment generation 
// A = 0, B = 1
export type AnswerBit = 0 | 1;

export function generateCommitmentSalt(): Uint8Array {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return salt;
}

export async function deriveCommitment(
  answerBit: AnswerBit,
  salt: Uint8Array
): Promise<Uint8Array> {
  const domainBytes = new TextEncoder().encode(DOMAIN_COMMITMENT);

  const totalLength = domainBytes.length + 1 + salt.length;
  const data = new Uint8Array(totalLength);
  let offset = 0;
  data.set(domainBytes, offset);
  offset += domainBytes.length;
  data[offset] = answerBit;
  offset += 1;
  data.set(salt, offset);

  return sha256(data); // uses the same sha256 helper
}

// E: commitment generation 


// S: final commitment payload generation
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}


export type MoraResponsePayload = {
  question_id: number;
  epoch_id: string;
  nullifier: string;   // hex
  commitment: string;  // hex
};

export async function buildMoraResponsePayload(params: {
  moraIdentitySecret: Uint8Array;
  questionId: number;
  epochId: string;
  answerBit: 0 | 1;
}) : Promise<{
  payload: MoraResponsePayload;
  salt: Uint8Array; // keep client-side only
}> {
  const { moraIdentitySecret, questionId, epochId, answerBit } = params;

  /*
  What the nullifier enforces
  - 1 submission per user per question per epoch
  - Independent of the answer chosen
  */
  const nullifierBytes = await deriveNullifier(
    moraIdentitySecret,
    questionId,
    epochId
  );

  const salt = generateCommitmentSalt();

  const commitmentBytes = await deriveCommitment(answerBit, salt);

  return {
    payload: {
      question_id: questionId,
      epoch_id: epochId,
      nullifier: toHex(nullifierBytes),
      commitment: toHex(commitmentBytes),
    },
    salt, // do NOT send to backend
  };
}

// E: final commitment payload generation