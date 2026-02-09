import { supabase } from "@/lib/supabase";
import { getEpochIdForDay } from "@/lib/game-epoch";

/**
 * Helper utilities for test activity automation
 */

export interface TestUser {
  id: string;
  username: string;
  email: string | null;
}

export interface ActiveArciumQuestion {
  id: number;
  epoch_id: string;
  arcium_poll_id: number | null;
}

/**
 * Get all test users (identified by tester@tester.com email)
 */
export async function getTestUsers(): Promise<TestUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, email")
    .eq("email", "tester@tester.com");

  if (error) {
    console.error("Error fetching test users:", error);
    return [];
  }

  return (data || []) as TestUser[];
}

/**
 * Get the current ACTIVE_ARCIUM question
 */
export async function getActiveArciumQuestion(): Promise<ActiveArciumQuestion | null> {
  const { data, error } = await supabase
    .from("questions_repo")
    .select("id, epoch_id, arcium_poll_id")
    .eq("game_status", "ACTIVE_ARCIUM")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching active ARCIUM question:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    epoch_id: data.epoch_id || getEpochIdForDay(new Date()),
    arcium_poll_id: data.arcium_poll_id || null,
  };
}

/**
 * Get user's total XP using RPC function
 */
export async function getUserTotalXp(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_user_total_xp", {
    p_user_id: userId,
  });

  if (error) {
    console.error(`Error fetching XP for user ${userId}:`, error);
    return 0;
  }

  if (Array.isArray(data) && data[0]?.total_xp != null) {
    return Number(data[0].total_xp);
  }

  return 0;
}

/**
 * Get user's existing bets for a question/epoch
 */
export async function getUserBets(
  userId: string,
  questionId: number,
  epochId: string
): Promise<{ answer_bit: number; xp_amount: number }[]> {
  const { data, error } = await supabase
    .from("user_bets")
    .select("answer_bit, xp_amount")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .eq("epoch_id", epochId);

  if (error) {
    console.error(`Error fetching bets for user ${userId}:`, error);
    return [];
  }

  return (data || []) as { answer_bit: number; xp_amount: number }[];
}

/**
 * Check if user has already answered a question/epoch
 */
export async function hasUserAnswered(
  nullifier: string,
  questionId: number,
  epochId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("response_commitments")
    .select("id")
    .eq("nullifier", nullifier)
    .eq("question_id", questionId)
    .eq("epoch_id", epochId)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    // PGRST116 is "not found" which is fine
    console.error("Error checking if user answered:", error);
  }

  return !!data;
}

/**
 * Generate a dummy nullifier (random hex string)
 * For test users, we don't need cryptographically secure values
 */
export function generateDummyNullifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a dummy commitment (random hex string)
 */
export function generateDummyCommitment(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a dummy encrypted answer (base64 string)
 */
export function generateDummyEncryptedAnswer(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64");
}

/**
 * Generate a unique nullifier for a user/question/epoch combination
 * Uses a deterministic approach based on user ID, question ID, and epoch ID
 */
export function generateUniqueNullifier(
  userId: string,
  questionId: number,
  epochId: string
): string {
  // Create a deterministic but unique nullifier for this combination
  const input = `${userId}_${questionId}_${epochId}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // Use a simple hash-like approach (not cryptographically secure, but sufficient for test data)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) & 0xffffffff;
  }

  // Convert to hex and pad to 64 chars (32 bytes)
  const hashStr = Math.abs(hash).toString(16).padStart(8, "0");
  return hashStr.repeat(8).substring(0, 64);
}

/**
 * Randomly select a subset of users
 */
export function selectRandomUsers<T>(users: T[], percentage: number): T[] {
  if (percentage <= 0 || users.length === 0) {
    return [];
  }

  const count = Math.max(1, Math.floor(users.length * percentage));
  const shuffled = [...users].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generate random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
