import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { compareVendors } from "@/lib/threads.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, Sparkles, Plus, X, Check, ShieldQuestion, GitCompare } from "lucide-react";
import type { VendorEvaluation } from "@/lib/vendor-schema";

export const Route = createFileRoute("/_authenticated/app/compare")({
  component: ComparePage,
});

const riskColor = {
  low: "text-[color:var(--risk-low)]",
  medium: "text-[color:var(--risk-medium)]",
  high: "text-[color:var(--risk-high)]",
} as const;
const riskBg = {
  low: "bg-[color:var(--risk-low)]/10 border-[color:var(--risk-low)]/40",
  medium: "bg-[color:var(--risk-medium)]/10 border-[color:var(--risk-medium)]/40",
  high: "bg-[color:var(--risk-high)]/10 border-[color:var(--risk-high)]/40",
} as const;

function statusIcon(s: string) {
  if (s === "pass") return <Check className="h-3.5 w-3.5 text-[color:var(--risk-low)]" />;
  if (s === "fail") return <X className="h-3.5 w-3.5 text-[color:var(--risk-high)]" />;
  if (s === "warn") return <ShieldAlert className="h-3.5 w-3.5 text-[color:var(--risk-medium)]" />;
  return <ShieldQuestion className="h-3.5 w-3.5 text-muted-foreground" />;
}

function ComparePage() {
  const compare = useServerFn(compareVendors);
  const [vendors, setVendors] = useState<string[]>(["", ""]);
  const [results, setResults] = useState<VendorEvaluation[] | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (i: number, v: string) => setVendors((p) => p.map((x, idx) => (idx === i ? v : x)));
  const add = () => vendors.length < 4 && setVendors([...vendors, ""]);
  const remove = (i: number) => vendors.length > 2 && setVendors(vendors.filter((_, idx) => idx !== i));

  const run = async () => {
    const clean = vendors.map((v) => v.trim()).filter(Boolean);
    if (clean.length < 2) return alert("Add at least 2 vendors");
    setLoading(true);
    try {
      const r = await compare({ data: { vendors: clean } });
      setResults(r);
    } catch (e: any) {
      alert(e.message ?? "Comparison failed");
    } finally {
      setLoading(false);
    }
  };

  // Build union of all check names across results for the comparison matrix
  const allCheckNames = results
    ? Array.from(new Set(results.flatMap((r) => r.checks.map((c) => c.name))))
    : [];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center gap-3">
          <GitCompare className="h-6 w-6 text-primary" />
          <h1 className="font-display text-2xl">Side-by-Side Vendor Comparison</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare 2-4 vendors at once. Procurement-ready in 30 seconds.
        </p>

        <Card className="mt-6 p-4">
          <div className="grid gap-2">
            {vendors.map((v, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder={`Vendor ${i + 1} (e.g. ${i === 0 ? "Mixpanel" : i === 1 ? "Amplitude" : "PostHog"})`}
                  value={v}
                  onChange={(e) => update(i, e.target.value)}
                />
                {vendors.length > 2 && (
                  <Button size="icon" variant="ghost" onClick={() => remove(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              {vendors.length < 4 && (
                <Button size="sm" variant="outline" onClick={add}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add vendor
                </Button>
              )}
              <Button size="sm" className="ml-auto" onClick={run} disabled={loading}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {loading ? "Comparing…" : "Compare risk"}
              </Button>
            </div>
          </div>
        </Card>

        {results && (
          <div className="mt-8 space-y-6">
            {/* Header row of cards */}
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${results.length}, minmax(0, 1fr))` }}>
              {results.map((r) => {
                const Icon = r.risk_level === "low" ? ShieldCheck : ShieldAlert;
                return (
                  <Card key={r.vendor_name} className={`p-4 border ${riskBg[r.risk_level]}`}>
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${riskColor[r.risk_level]}`} />
                      <div className="font-display text-lg">{r.vendor_name}</div>
                    </div>
                    <div className={`mt-3 font-display text-4xl ${riskColor[r.risk_level]}`}>{r.score}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.risk_level} risk
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{r.summary}</p>
                  </Card>
                );
              })}
            </div>

            {/* Comparison matrix */}
            <Card className="overflow-hidden">
              <div className="border-b bg-muted/30 px-4 py-2 font-display text-xs uppercase tracking-wider">
                Compliance Matrix
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Control</th>
                      {results.map((r) => (
                        <th key={r.vendor_name} className="px-4 py-2 font-medium">{r.vendor_name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allCheckNames.map((name) => (
                      <tr key={name} className="border-b last:border-0">
                        <td className="px-4 py-2 text-xs font-medium">{name}</td>
                        {results.map((r) => {
                          const c = r.checks.find((x) => x.name === name);
                          return (
                            <td key={r.vendor_name} className="px-4 py-2">
                              {c ? (
                                <div className="flex items-start gap-1.5">
                                  {statusIcon(c.status)}
                                  <span className="text-xs text-muted-foreground line-clamp-2">{c.detail}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Recommendations */}
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${results.length}, minmax(0, 1fr))` }}>
              {results.map((r) => (
                <Card key={r.vendor_name} className="p-3">
                  <Badge variant="outline" className="text-[10px]">Recommendation</Badge>
                  <p className="mt-2 text-xs">{r.recommendation}</p>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
