import { headers } from "next/headers";
import { DashView } from "@/components/manage/DashView";
import {
  refreshDashSections,
  resetQuestionGameMeta,
  addNewQuestionAnswerSet,
  getCommitmentsByEpoch,
  confirmAggregate,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ManageDashPage() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  const base = `${protocol}://${host}`;
  const apiKey = process.env.MANAGE_API_KEY;

  if (!apiKey) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-xl font-semibold">Manage Dash</h1>
        <p className="mt-2 text-muted-foreground">
          MANAGE_API_KEY is not set. Configure it to load dashboard data.
        </p>
      </div>
    );
  }

  let data: { data_sections?: Record<string, unknown[]> } | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(`${base}/api/private-data-game/manage/dash-data`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      error = (body.error as string) || res.statusText;
    } else {
      data = (await res.json()) as { data_sections: Record<string, unknown[]> };
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch";
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-xl font-semibold">Manage Dash</h1>
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <DashView
          initialDataSections={data?.data_sections ?? {}}
          onRefreshSection={refreshDashSections}
          onResetQuestionGameMeta={resetQuestionGameMeta}
          onAddNewQuestionAnswerSet={addNewQuestionAnswerSet}
          onGetCommitmentsByEpoch={getCommitmentsByEpoch}
          onConfirmAggregate={confirmAggregate}
        />
      )}
    </div>
  );
}
