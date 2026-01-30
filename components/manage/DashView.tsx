"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type {
  DashDataResult,
  ResetResult,
  AddNewResult,
  CommitmentsByEpochResult,
  ConfirmAggregateResult,
  GenerateInviteCodesResult,
} from "@/app/manage/dash/actions";
import { Textarea } from "@/components/ui/textarea";

const MAX_CELL_LENGTH = 40;

const DISPLAY_SECTIONS = [
  "questions_repo",
  "response_commitments",
  "users",
  "question_aggregates",
  "invite_codes",
] as const;

function truncate(val: unknown): string {
  if (val == null) return "—";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") {
    if (val.length <= MAX_CELL_LENGTH) return val;
    return val.slice(0, MAX_CELL_LENGTH) + "…";
  }
  if (Array.isArray(val)) return `[${val.length}]`;
  if (typeof val === "object") return "{…}";
  return String(val).slice(0, MAX_CELL_LENGTH) + "…";
}

function formatRecord(record: Record<string, unknown>): string {
  return JSON.stringify(record, null, 2);
}

type DashViewProps = {
  initialDataSections: Record<string, unknown[]>;
  onRefreshSection: (sections?: string) => Promise<DashDataResult>;
  onResetQuestionGameMeta: () => Promise<ResetResult>;
  onAddNewQuestionAnswerSet: (bodyJson: string) => Promise<AddNewResult>;
  onGetCommitmentsByEpoch: (
    epochId: string
  ) => Promise<CommitmentsByEpochResult>;
  onConfirmAggregate: (epochId: string) => Promise<ConfirmAggregateResult>;
  onGenerateInviteCodes: () => Promise<GenerateInviteCodesResult>;
};

const ADD_NEW_SAMPLE = `{
  "title": "The Accidental Samaritan",
  "img": "https://example.com/image.jpg",
  "text": "Your question text here...",
  "answers": [
    { "text": "First answer" },
    { "text": "Second answer" }
  ]
}`;

export function DashView({
  initialDataSections,
  onRefreshSection,
  onResetQuestionGameMeta,
  onAddNewQuestionAnswerSet,
  onGetCommitmentsByEpoch,
  onConfirmAggregate,
  onGenerateInviteCodes,
}: DashViewProps) {
  const [dataSections, setDataSections] =
    useState<Record<string, unknown[]>>(initialDataSections);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [aggregateConfirming, setAggregateConfirming] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<{
    section: string;
    record: Record<string, unknown>;
  } | null>(null);
  const [addNewOpen, setAddNewOpen] = useState(false);
  const [addNewJson, setAddNewJson] = useState(ADD_NEW_SAMPLE);
  const [aggregateOpen, setAggregateOpen] = useState(false);
  const [aggregateEpochId, setAggregateEpochId] = useState<string | null>(null);
  const [aggregateData, setAggregateData] = useState<
    | {
        commitments: Record<string, unknown>[];
        count: number;
      }
    | { error: string }
    | null
  >(null);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [generateCodesInProgress, setGenerateCodesInProgress] = useState(false);

  const handleGenerateInviteCodes = useCallback(async () => {
    setGenerateCodesInProgress(true);
    try {
      const result = await onGenerateInviteCodes();
      if ("error" in result) {
        showError(result.error);
        return;
      }
      const refreshResult = await onRefreshSection("invite_codes");
      if ("error" in refreshResult) {
        showError(refreshResult.error);
        return;
      }
      setDataSections((prev) => ({ ...prev, ...refreshResult.data_sections }));
    } finally {
      setGenerateCodesInProgress(false);
    }
  }, [onGenerateInviteCodes, onRefreshSection]);

  useEffect(() => {
    if (!aggregateOpen || !aggregateEpochId) return;
    setAggregateLoading(true);
    setAggregateData(null);
    onGetCommitmentsByEpoch(aggregateEpochId).then((result) => {
      setAggregateData(result);
      setAggregateLoading(false);
    });
  }, [aggregateOpen, aggregateEpochId, onGetCommitmentsByEpoch]);

  const showError = useCallback((message: string) => {
    alert(`Error: ${message}\n\nCheck the logs.`);
  }, []);

  const handleRefresh = useCallback(
    async (sectionKey: string) => {
      setActionInProgress(true);
      try {
        const result = await onRefreshSection(sectionKey);
        if ("error" in result) {
          console.error("Refresh failed:", result.error);
          showError(result.error);
          return;
        }
        setDataSections((prev) => ({ ...prev, ...result.data_sections }));
      } finally {
        setActionInProgress(false);
      }
    },
    [onRefreshSection, showError]
  );

  const handleReset = useCallback(async () => {
    setActionInProgress(true);
    try {
      const result = await onResetQuestionGameMeta();
      if ("error" in result) {
        console.error("Reset failed:", result.error);
        showError(result.error);
        return;
      }
      const refreshResult = await onRefreshSection("questions_repo");
      if ("error" in refreshResult) {
        showError(refreshResult.error);
        return;
      }
      setDataSections((prev) => ({ ...prev, ...refreshResult.data_sections }));
    } finally {
      setActionInProgress(false);
    }
  }, [onResetQuestionGameMeta, onRefreshSection, showError]);

  const handleAddNewSubmit = useCallback(async () => {
    setActionInProgress(true);
    try {
      const result = await onAddNewQuestionAnswerSet(addNewJson);
      if ("error" in result) {
        console.error("Add new failed:", result.error);
        showError(result.error);
        return;
      }
      setAddNewOpen(false);
      const refreshResult = await onRefreshSection("questions_repo");
      if ("error" in refreshResult) {
        showError(refreshResult.error);
        return;
      }
      setDataSections((prev) => ({ ...prev, ...refreshResult.data_sections }));
    } finally {
      setActionInProgress(false);
    }
  }, [onAddNewQuestionAnswerSet, addNewJson, onRefreshSection, showError]);

  const handleConfirmAggregate = useCallback(async () => {
    if (!aggregateEpochId) return;
    setAggregateConfirming(true);
    try {
      const result = await onConfirmAggregate(aggregateEpochId);
      if ("error" in result) {
        console.error("Confirm aggregate failed:", result.error);
        showError(result.error);
        return;
      }
      setAggregateOpen(false);
      setAggregateEpochId(null);
      setAggregateData(null);
      const refreshResult = await onRefreshSection("questions_repo");
      if ("error" in refreshResult) {
        showError(refreshResult.error);
        return;
      }
      setDataSections((prev) => ({ ...prev, ...refreshResult.data_sections }));
    } finally {
      setAggregateConfirming(false);
    }
  }, [aggregateEpochId, onConfirmAggregate, onRefreshSection, showError]);

  const questionAnswers = dataSections.question_answers ?? [];

  return (
    <div className="space-y-8">
      {DISPLAY_SECTIONS.map((sectionKey) => {
        const rows = dataSections[sectionKey];
        if (!Array.isArray(rows) || rows.length === 0) {
          return (
            <section key={sectionKey}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-medium capitalize">
                  {sectionKey.replace(/_/g, " ")}
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRefresh(sectionKey)}
                  disabled={actionInProgress}
                >
                  Refresh
                </Button>
                {sectionKey === "questions_repo" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReset()}
                      disabled={actionInProgress}
                    >
                      Reset Everything
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddNewOpen(true)}
                      disabled={actionInProgress}
                    >
                      Add New
                    </Button>
                  </>
                )}
                {sectionKey === "invite_codes" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenerateInviteCodes()}
                    disabled={actionInProgress || generateCodesInProgress}
                  >
                    {generateCodesInProgress ? "Generating…" : "Generate 25"}
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground">No rows</p>
            </section>
          );
        }

        const first = rows[0] as Record<string, unknown>;
        const columns = Object.keys(first);
        const displayColumns =
          sectionKey === "questions_repo"
            ? ([...columns, "Actions"] as const)
            : columns;

        return (
          <section key={sectionKey}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium capitalize">
                {sectionKey.replace(/_/g, " ")} ({rows.length})
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRefresh(sectionKey)}
                disabled={actionInProgress}
              >
                Refresh
              </Button>
              {sectionKey === "questions_repo" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReset()}
                    disabled={actionInProgress}
                  >
                    Reset Everything
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAddNewOpen(true)}
                    disabled={actionInProgress}
                  >
                    Add New
                  </Button>
                </>
              )}
              {sectionKey === "invite_codes" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGenerateInviteCodes()}
                  disabled={actionInProgress || generateCodesInProgress}
                >
                  {generateCodesInProgress ? "Generating…" : "Generate 25"}
                </Button>
              )}
            </div>
            <div className="h-[280px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {displayColumns.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => {
                    const record = row as Record<string, unknown>;
                    const isAggregating =
                      sectionKey === "questions_repo" &&
                      record.game_status === "AGGREGATING";
                    return (
                      <TableRow
                        key={idx}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedRecord({ section: sectionKey, record })
                        }
                      >
                        {columns.map((col) => (
                          <TableCell
                            key={col}
                            className="max-w-[200px] truncate"
                            title={String(record[col] ?? "—")}
                          >
                            {truncate(record[col])}
                          </TableCell>
                        ))}
                        {sectionKey === "questions_repo" && (
                          <TableCell
                            className="whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isAggregating ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAggregateEpochId(
                                    String(record.epoch_id ?? "")
                                  );
                                  setAggregateOpen(true);
                                }}
                                disabled={actionInProgress}
                              >
                                Aggregate
                              </Button>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}

      <Dialog
        open={!!selectedRecord}
        onOpenChange={(open) => !open && setSelectedRecord(null)}
      >
        <DialogContent className="max-w-2xl flex flex-col [&>button]:shrink-0">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {selectedRecord
                ? `${selectedRecord.section.replace(/_/g, " ")} — full record`
                : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedRecord ? (
            <div className="max-h-[min(60vh,500px)] overflow-y-auto overscroll-contain rounded border p-4">
              <pre className="text-xs whitespace-pre-wrap break-all">
                {formatRecord(selectedRecord.record)}
              </pre>
              {selectedRecord.section === "questions_repo" &&
                "id" in selectedRecord.record && (
                  <>
                    <p className="mt-4 text-sm font-medium text-muted-foreground">
                      question_answers (question_id ={" "}
                      {String(selectedRecord.record.id)})
                    </p>
                    <pre className="mt-1 text-xs whitespace-pre-wrap break-all">
                      {JSON.stringify(
                        questionAnswers.filter(
                          (a) =>
                            (a as { question_id: number }).question_id ===
                            selectedRecord.record.id
                        ),
                        null,
                        2
                      )}
                    </pre>
                  </>
                )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={addNewOpen} onOpenChange={setAddNewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add new question and answers</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Paste JSON with title, img (optional), text, and answers (array of{" "}
            {"{ text }"}).
          </p>
          <Textarea
            className="min-h-[200px] font-mono text-xs"
            value={addNewJson}
            onChange={(e) => setAddNewJson(e.target.value)}
            placeholder={ADD_NEW_SAMPLE}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setAddNewOpen(false)}
              disabled={actionInProgress}
            >
              Cancel
            </Button>
            <Button onClick={handleAddNewSubmit} disabled={actionInProgress}>
              {actionInProgress ? "…" : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={aggregateOpen}
        onOpenChange={(open) => {
          if (!open && !aggregateConfirming) {
            setAggregateOpen(false);
            setAggregateEpochId(null);
            setAggregateData(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Aggregate</DialogTitle>
          </DialogHeader>
          {aggregateEpochId && (
            <p className="text-sm text-muted-foreground">
              epoch_id: <span className="font-mono">{aggregateEpochId}</span>
            </p>
          )}
          {aggregateLoading && (
            <div className="flex items-center gap-2 py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">Loading matching commitments…</span>
            </div>
          )}
          {!aggregateLoading && aggregateData && (
            <>
              {"error" in aggregateData ? (
                <p className="text-destructive">{aggregateData.error}</p>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    Matching commitments:{" "}
                    <span className="font-mono">{aggregateData.count}</span>
                  </p>
                  {aggregateData.commitments.length === 0 ? (
                    <p className="text-muted-foreground text-sm py-2">
                      No matching rows.
                    </p>
                  ) : (
                    <div className="h-[240px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(
                              aggregateData.commitments[0] as Record<
                                string,
                                unknown
                              >
                            ).map((col) => (
                              <TableHead
                                key={col}
                                className="whitespace-nowrap"
                              >
                                {col}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {aggregateData.commitments.map((row, idx) => {
                            const rec = row as Record<string, unknown>;
                            return (
                              <TableRow key={idx}>
                                {Object.keys(rec).map((col) => (
                                  <TableCell
                                    key={col}
                                    className="max-w-[180px] truncate text-xs"
                                    title={String(rec[col] ?? "—")}
                                  >
                                    {truncate(rec[col])}
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {aggregateConfirming && (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Aggregating…
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                if (!aggregateConfirming) {
                  setAggregateOpen(false);
                  setAggregateEpochId(null);
                  setAggregateData(null);
                }
              }}
              disabled={aggregateConfirming}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAggregate}
              disabled={aggregateConfirming}
            >
              {aggregateConfirming ? "…" : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
