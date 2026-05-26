import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getThread, evaluateVendor, setApproval } from "@/lib/threads.functions";
import type { ArmorIQReport } from "@/lib/armoriq";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Sparkles, Check, X, Clock, FileText, Lock, Ban } from "lucide-react";
import type { VendorEvaluation } from "@/lib/vendor-schema";

export const Route = createFileRoute("/_authenticated/app/$threadId")({
  component: ThreadPage,
});

const riskMeta = {
  low: { color: "text-[color:var(--risk-low)]", bg: "bg-[color:var(--risk-low)]/15", border: "border-[color:var(--risk-low)]/40", Icon: ShieldCheck, label: "LOW RISK" },
  medium: { color: "text-[color:var(--risk-medium)]", bg: "bg-[color:var(--risk-medium)]/15", border: "border-[color:var(--risk-medium)]/40", Icon: ShieldAlert, label: "MEDIUM RISK" },
  high: { color: "text-[color:var(--risk-high)]", bg: "bg-[color:var(--risk-high)]/15", border: "border-[color:var(--risk-high)]/40", Icon: ShieldAlert, label: "HIGH RISK" },
} as const;

function checkIcon(status: string) {
  if (status === "pass") return <Check className="h-3.5 w-3.5 text-[color:var(--risk-low)]" />;
  if (status === "fail") return <X className="h-3.5 w-3.5 text-[color:var(--risk-high)]" />;
  if (status === "warn") return <ShieldAlert className="h-3.5 w-3.5 text-[color:var(--risk-medium)]" />;
  return <ShieldQuestion className="h-3.5 w-3.5 text-muted-foreground" />;
}

function ThreadPage() {
  const { threadId } = Route.useParams();
  const qc = useQueryClient();
  const fetchThread = useServerFn(getThread);
  const evaluate = useServerFn(evaluateVendor);
  const approve = useServerFn(setApproval);

  const { data, isLoading } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => fetchThread({ data: { id: threadId } }),
  });

  const [running, setRunning] = useState(false);
  const messages = data?.messages ?? [];
  const audit = data?.audit ?? [];
  const thread = data?.thread;

  const evaluation: VendorEvaluation | null = useMemo(() => {
    const assistant = [...messages].reverse().find((m) => m.role === "assistant");
    return (assistant?.parts as any)?.evaluation ?? (thread?.current_evaluation as any) ?? null;
  }, [messages, thread]);

  // Auto-run evaluation when thread is fresh (only user message, no assistant)
  useEffect(() => {
    if (!data || running) return;
    const hasAssistant = messages.some((m) => m.role === "assistant");
    if (!hasAssistant) runEval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.thread?.id]);

  const runEval = async () => {
    setRunning(true);
    try {
      await evaluate({ data: { thread_id: threadId } });
      await qc.invalidateQueries({ queryKey: ["thread", threadId] });
      await qc.invalidateQueries({ queryKey: ["threads"] });
    } catch (e: any) {
      alert(e.message ?? "Evaluation failed");
    } finally {
      setRunning(false);
    }
  };

  const decide = async (decision: "approved" | "rejected") => {
    await approve({ data: { thread_id: threadId, decision } });
    await qc.invalidateQueries({ queryKey: ["thread", threadId] });
    await qc.invalidateQueries({ queryKey: ["threads"] });
  };

  if (isLoading || !thread) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="grid h-full grid-cols-[1fr_360px]">
      {/* Chat column */}
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl">{thread.vendor_name}</h1>
            <Badge variant="outline" className="font-mono text-[10px]">{thread.id.slice(0, 8)}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Created {new Date(thread.created_at).toLocaleString()}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
            {messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-lg bg-primary/15 px-4 py-2 text-sm">
                      {(m.parts as any).text}
                    </div>
                  </div>
                );
              }
              const ev = (m.parts as any).evaluation as VendorEvaluation | undefined;
              if (!ev) return null;
              return <EvaluationCard key={m.id} ev={ev} />;
            })}

            {running && (
              <Card className="flex items-center gap-3 p-4">
                <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                <span className="text-sm text-muted-foreground">Running vendor risk evaluation…</span>
              </Card>
            )}
          </div>
        </ScrollArea>

        <div className="border-t px-6 py-3">
          <Button variant="outline" size="sm" onClick={runEval} disabled={running}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Re-run evaluation
          </Button>
        </div>
      </div>

      {/* Right rail: ArmorIQ panel */}
      <aside className="flex h-full flex-col overflow-hidden border-l bg-background/60">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm uppercase tracking-wider">ArmorIQ Gate</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">policy engine</Badge>
          </div>
        </div>

        <ArmorIQPanel
          evaluation={(thread.current_evaluation as any) ?? (evaluation as any)}
          approvalStatus={thread.approval_status}
          onDecide={decide}
        />


        <div className="flex items-center gap-2 border-b px-4 py-3">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm uppercase tracking-wider">Audit Trail</h2>
        </div>
        <ScrollArea className="flex-1">
          <ol className="space-y-3 p-4 text-xs">
            {audit.length === 0 && <p className="text-muted-foreground">No events yet.</p>}
            {audit.map((a) => (
              <li key={a.id} className="border-l-2 border-primary/40 pl-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="mt-0.5 font-mono">{a.action}</div>
                {a.details && (
                  <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 text-[10px] text-muted-foreground">
{JSON.stringify(a.details, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </ScrollArea>
      </aside>
    </div>
  );
}

function EvaluationCard({ ev }: { ev: VendorEvaluation }) {
  const meta = riskMeta[ev.risk_level];
  return (
    <Card className={`overflow-hidden border ${meta.border}`}>
      <div className={`flex items-center gap-3 px-4 py-3 ${meta.bg}`}>
        <meta.Icon className={`h-5 w-5 ${meta.color}`} />
        <div className="flex-1">
          <div className={`font-display text-sm tracking-wider ${meta.color}`}>{meta.label}</div>
          <div className="text-xs text-muted-foreground">{ev.vendor_name}</div>
        </div>
        <div className="text-right">
          <div className={`font-display text-2xl ${meta.color}`}>{ev.score}</div>
          <div className="text-[10px] uppercase text-muted-foreground">risk score</div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <p className="text-sm">{ev.summary}</p>

        <div className="space-y-1.5">
          {ev.checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2 rounded border border-border/40 px-3 py-2">
              <div className="mt-0.5">{checkIcon(c.status)}</div>
              <div className="flex-1">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.detail}</div>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase">{c.status}</Badge>
            </div>
          ))}
        </div>

        {ev.score_breakdown && ev.score_breakdown.length > 0 && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <div className="font-display text-[10px] uppercase tracking-wider text-primary">
                Score Breakdown · Explainable AI
              </div>
            </div>
            <div className="space-y-1">
              {ev.score_breakdown.map((b, i) => {
                const positive = b.points > 0; // positive = adds risk
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span
                      className={`min-w-[3rem] rounded px-1.5 py-0.5 text-center font-mono text-[10px] ${
                        positive
                          ? "bg-[color:var(--risk-high)]/15 text-[color:var(--risk-high)]"
                          : "bg-[color:var(--risk-low)]/15 text-[color:var(--risk-low)]"
                      }`}
                    >
                      {positive ? "+" : ""}
                      {b.points}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium">{b.factor}</div>
                      <div className="text-muted-foreground">{b.reason}</div>
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                <span className="text-muted-foreground">Final risk score</span>
                <span className="font-display text-base">{ev.score}/100</span>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="text-[10px] font-display uppercase tracking-wider text-primary">Recommendation</div>
          <p className="mt-1 text-sm">{ev.recommendation}</p>
        </div>
      </div>
    </Card>
  );
}

// ─── ArmorIQ Panel ─────────────────────────────────────────────────────────
const decisionMeta = {
  auto_approve: {
    label: "AUTO-APPROVED",
    color: "text-[color:var(--risk-low)]",
    bg: "bg-[color:var(--risk-low)]/15",
    border: "border-[color:var(--risk-low)]/40",
    Icon: ShieldCheck,
  },
  manual_review: {
    label: "MANUAL REVIEW",
    color: "text-[color:var(--risk-medium)]",
    bg: "bg-[color:var(--risk-medium)]/15",
    border: "border-[color:var(--risk-medium)]/40",
    Icon: ShieldAlert,
  },
  blocked: {
    label: "BLOCKED",
    color: "text-[color:var(--risk-high)]",
    bg: "bg-[color:var(--risk-high)]/15",
    border: "border-[color:var(--risk-high)]/40",
    Icon: Ban,
  },
} as const;

function policyStatusIcon(s: string) {
  if (s === "pass") return <Check className="h-3 w-3 text-[color:var(--risk-low)]" />;
  if (s === "fail") return <X className="h-3 w-3 text-[color:var(--risk-high)]" />;
  if (s === "warn") return <ShieldAlert className="h-3 w-3 text-[color:var(--risk-medium)]" />;
  return <ShieldQuestion className="h-3 w-3 text-muted-foreground" />;
}

function ArmorIQPanel({
  evaluation,
  approvalStatus,
  onDecide,
}: {
  evaluation: (VendorEvaluation & { armoriq?: ArmorIQReport }) | null;
  approvalStatus: string;
  onDecide: (d: "approved" | "rejected") => void;
}) {
  const report = evaluation?.armoriq;

  if (!evaluation || !report) {
    return (
      <div className="border-b p-4 text-xs text-muted-foreground">
        Awaiting evaluation. ArmorIQ will gate the decision once AI analysis completes.
      </div>
    );
  }

  const meta = decisionMeta[report.decision];

  return (
    <div className="border-b">
      <div className={`px-4 py-3 ${meta.bg} border-b ${meta.border}`}>
        <div className="flex items-center gap-2">
          <meta.Icon className={`h-5 w-5 ${meta.color}`} />
          <div className="flex-1">
            <div className={`font-display text-sm tracking-wider ${meta.color}`}>
              {meta.label}
            </div>
            <div className="text-[10px] uppercase text-muted-foreground">ArmorIQ Gate Decision</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{report.summary}</p>
        <div className="mt-2 flex gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span><span className="text-[color:var(--risk-low)] font-mono">{report.policies_passed}</span> pass</span>
          <span><span className="text-[color:var(--risk-high)] font-mono">{report.policies_failed}</span> fail</span>
          <span><span className="font-mono">{report.policies_evaluated}</span> total</span>
        </div>
      </div>

      <div className="space-y-1.5 p-3">
        {report.evaluations.map((e) => (
          <div
            key={e.policy_id}
            className="rounded border border-border/40 bg-background/40 px-2.5 py-2 text-[11px]"
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5">{policyStatusIcon(e.status)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] text-muted-foreground">{e.policy_id}</span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] uppercase ${
                      e.severity === "critical"
                        ? "text-[color:var(--risk-high)] border-[color:var(--risk-high)]/40"
                        : e.severity === "warning"
                          ? "text-[color:var(--risk-medium)] border-[color:var(--risk-medium)]/40"
                          : "text-primary border-primary/40"
                    }`}
                  >
                    {e.severity}
                  </Badge>
                </div>
                <div className="mt-0.5 font-medium leading-tight">{e.policy_name}</div>
                <div className="mt-0.5 text-muted-foreground">{e.reason}</div>
                {e.remediation && (
                  <div className="mt-1 rounded bg-muted/40 px-1.5 py-1 text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground">Fix:</span> {e.remediation}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t p-4">
        {approvalStatus === "approved" && (
          <div className="rounded-md border border-[color:var(--risk-low)]/40 bg-[color:var(--risk-low)]/15 px-3 py-2 text-sm">
            ✓ Approved by reviewer
          </div>
        )}
        {approvalStatus === "rejected" && (
          <div className="rounded-md border border-[color:var(--risk-high)]/40 bg-[color:var(--risk-high)]/15 px-3 py-2 text-sm">
            ✗ Rejected by reviewer
          </div>
        )}
        {(approvalStatus === "pending" || approvalStatus === "none") && report.decision !== "auto_approve" && (
          <>
            <p className="text-[11px] text-muted-foreground">
              {report.decision === "blocked"
                ? "Critical policy violation. Override requires CISO approval."
                : "Manual review required per ArmorIQ policy."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="default" onClick={() => onDecide("approved")}>
                <Check className="h-3.5 w-3.5 mr-1" /> Override & Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onDecide("rejected")}>
                <X className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
