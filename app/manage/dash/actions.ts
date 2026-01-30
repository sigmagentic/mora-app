"use server";

import { headers } from "next/headers";

export type DashDataResult = {
  data_sections: Record<string, unknown[]>;
} | { error: string };

export type ResetResult = { success: true; resetCount: number } | { error: string };

export type AddNewResult =
  | { success: true; questionId: number; answerCount: number }
  | { error: string };

export type CommitmentsByEpochResult =
  | { commitments: Record<string, unknown>[]; count: number }
  | { error: string };

export type ConfirmAggregateResult = { success: true } | { error: string };

export type GenerateInviteCodesResult =
  | { success: true; count: number; codes: string[] }
  | { error: string };

async function getBaseUrl(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function refreshDashSections(
  sections?: string
): Promise<DashDataResult> {
  const apiKey = process.env.MANAGE_API_KEY;
  if (!apiKey) {
    return { error: "MANAGE_API_KEY is not configured" };
  }

  const base = await getBaseUrl();
  const url = sections
    ? `${base}/api/private-data-game/manage/dash-data?sections=${encodeURIComponent(sections)}`
    : `${base}/api/private-data-game/manage/dash-data`;

  try {
    const res = await fetch(url, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (body.error as string) || res.statusText };
    }
    return { data_sections: body.data_sections ?? {} };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch" };
  }
}

export async function resetQuestionGameMeta(): Promise<ResetResult> {
  const apiKey = process.env.MANAGE_API_KEY;
  if (!apiKey) {
    return { error: "MANAGE_API_KEY is not configured" };
  }

  const base = await getBaseUrl();
  const url = `${base}/api/private-data-game/manage/reset-all-question-game-meta`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (body.error as string) || res.statusText };
    }
    return {
      success: true,
      resetCount: (body.resetCount as number) ?? 0,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch" };
  }
}

export async function addNewQuestionAnswerSet(
  bodyJson: string
): Promise<AddNewResult> {
  const apiKey = process.env.MANAGE_API_KEY;
  if (!apiKey) {
    return { error: "MANAGE_API_KEY is not configured" };
  }

  const base = await getBaseUrl();
  const url = `${base}/api/private-data-game/manage/add-new-question-answer-set`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: bodyJson,
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (body.error as string) || res.statusText };
    }
    return {
      success: true,
      questionId: body.questionId as number,
      answerCount: body.answerCount as number,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch" };
  }
}

export async function confirmAggregate(
  epochId: string
): Promise<ConfirmAggregateResult> {
  const apiKey = process.env.MANAGE_API_KEY;
  if (!apiKey) {
    return { error: "MANAGE_API_KEY is not configured" };
  }

  const base = await getBaseUrl();
  const url = `${base}/api/private-data-game/manage/aggregate-commitments`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ epoch_id: epochId }),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (body.error as string) || res.statusText };
    }
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch" };
  }
}

export async function generateInviteCodes(): Promise<GenerateInviteCodesResult> {
  const apiKey = process.env.MANAGE_API_KEY;
  if (!apiKey) {
    return { error: "MANAGE_API_KEY is not configured" };
  }

  const base = await getBaseUrl();
  const url = `${base}/api/private-data-game/manage/generate-invite-codes`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (body.error as string) || res.statusText };
    }
    return {
      success: true,
      count: (body.count as number) ?? 0,
      codes: (body.codes as string[]) ?? [],
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to generate" };
  }
}

export async function getCommitmentsByEpoch(
  epochId: string
): Promise<CommitmentsByEpochResult> {
  const apiKey = process.env.MANAGE_API_KEY;
  if (!apiKey) {
    return { error: "MANAGE_API_KEY is not configured" };
  }

  const base = await getBaseUrl();
  const url = `${base}/api/private-data-game/manage/commitments-by-epoch?epoch_id=${encodeURIComponent(epochId)}`;

  try {
    const res = await fetch(url, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (body.error as string) || res.statusText };
    }
    return {
      commitments: (body.commitments as Record<string, unknown>[]) ?? [],
      count: (body.count as number) ?? 0,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch" };
  }
}
