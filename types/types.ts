export const runtime = "edge";

export interface AppUser {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  kekSalt?: string;
  vmkIv?: string;
  encryptedVmk?: string;
  prfVmkIv?: string;
  prfEncryptedVmk?: string;
}

export interface StorageFile {
  id: string;
  size?: number | null;
  storage_type: number;
  created_at: string;
  metadata?: Record<string, any>;
  encrypted_file: unknown;
  file_iv: unknown;
  encrypted_dek: unknown;
  dek_iv: unknown;
}

export interface GameQuestionAnswer {
  id: number;
  text: string;
  reasoning?: string;
}

export interface GameQuestion {
  id: number;
  title?: string;
  img?: string;
  text: string;
  opens_at: string;
  closes_at: string;
  game_status: string;
  epoch_id: string;
  answers: GameQuestionAnswer[];
}
