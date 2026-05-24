import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { answerQuestionnaire, type QuestionnaireAnswer } from "@/lib/threads.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileQuestion, Download, Upload, Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/questionnaire")({
  component: QuestionnairePage,
});

const SAMPLE = `Do you have a SOC 2 Type II report available?
Is data encrypted at rest using AES-256 or stronger?
Is data encrypted in transit using TLS 1.2+?
Do you have a documented incident response plan?
Have you experienced any security breaches in the last 24 months?
Is multi-factor authentication enforced for all employees?
Do you conduct annual penetration tests by a third party?
Is there a documented Data Processing Agreement (DPA) available?
Do you maintain a public list of subprocessors?
What is your data retention and deletion policy?`;

const confColor = {
  high: "bg-[color:var(--risk-low)]/15 text-[color:var(--risk-low)] border-[color:var(--risk-low)]/40",
  medium: "bg-[color:var(--risk-medium)]/15 text-[color:var(--risk-medium)] border-[color:var(--risk-medium)]/40",
  low: "bg-[color:var(--risk-high)]/15 text-[color:var(--risk-high)] border-[color:var(--risk-high)]/40",
} as const;

const ansColor: Record<string, string> = {
  Yes: "text-[color:var(--risk-low)]",
  No: "text-[color:var(--risk-high)]",
  Partial: "text-[color:var(--risk-medium)]",
  "N/A": "text-muted-foreground",
  Unknown: "text-muted-foreground",
};

function QuestionnairePage() {
  const run = useServerFn(answerQuestionnaire);
  const [vendor, setVendor] = useState("");
  const [raw, setRaw] = useState(SAMPLE);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ vendor_name: string; answers: QuestionnaireAnswer[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const parseQuestions = (s: string) =>
    s
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(\d+[\.\)]|[-*])\s*/, "").trim())
      .filter((l) => l.length >= 3)
      .slice(0, 120);

  const onFile = async (f: File | null) => {
    if (!f) return;
    const text = await f.text();
    setRaw(text);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const questions = parseQuestions(raw);
    if (!vendor.trim() || questions.length === 0) {
      setErr("Provide a vendor name and at least one question.");
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      const r = await run({ data: { vendor_name: vendor.trim(), questions } });
      setResults(r);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to generate responses.");
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!results) return;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ["#", "Question", "Answer", "Response", "Evidence", "Confidence"].join(","),
      ...results.answers.map((a, i) =>
        [i + 1, a.question, a.answer, a.response, a.evidence, a.confidence].map((x) => esc(String(x))).join(","),
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${results.vendor_name.replace(/\s+/g, "_")}_SIG_responses.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const count = parseQuestions(raw).length;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <FileQuestion className="h-3.5 w-3.5" /> SIG Auto-Responder
            </div>
            <h1 className="font-display text-3xl tracking-tight">Security Questionnaire</h1>
            <p className="text-sm text-muted-foreground">
              Upload a SIG / CAIQ / custom questionnaire. AI pre-fills answers from the vendor's public posture.
            </p>
          </div>
        </header>

        <Card className="p-5 space-y-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Vendor</label>
                <Input
                  placeholder="e.g. Notion, Slack, Datadog"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm hover:bg-accent">
                  <Upload className="h-4 w-4" /> Upload .txt / .csv
                  <input
                    type="file"
                    accept=".txt,.csv,text/plain,text/csv"
                    className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Questions (one per line, up to 120)
                </label>
                <span className="text-xs text-muted-foreground">{count} parsed</span>
              </div>
              <Textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </div>

            {err && <p className="text-sm text-[color:var(--risk-high)]">{err}</p>}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={loading || !vendor.trim() || count === 0}>
                {loading ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Generating {count} answers…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1 h-4 w-4" /> Auto-fill responses
                  </>
                )}
              </Button>
              {results && (
                <Button type="button" variant="outline" onClick={downloadCsv}>
                  <Download className="mr-1 h-4 w-4" /> Export CSV
                </Button>
              )}
            </div>
          </form>
        </Card>

        {results && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="font-display text-lg">{results.vendor_name}</h2>
                <p className="text-xs text-muted-foreground">{results.answers.length} responses generated</p>
              </div>
              <Badge variant="outline" className="text-xs">
                Review before submitting
              </Badge>
            </div>
            <ol className="divide-y">
              {results.answers.map((a, i) => (
                <li key={i} className="space-y-2 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-xs font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-medium">{a.question}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-semibold ${ansColor[a.answer] ?? ""}`}>{a.answer}</span>
                        <Badge variant="outline" className={`text-[10px] ${confColor[a.confidence]}`}>
                          {a.confidence} confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{a.response}</p>
                      <p className="text-xs text-muted-foreground/80">
                        <span className="uppercase tracking-wider">Evidence:</span> {a.evidence}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </div>
  );
}
