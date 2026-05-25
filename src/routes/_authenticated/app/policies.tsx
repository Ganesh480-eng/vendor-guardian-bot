import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listArmorIQPolicies } from "@/lib/threads.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Lock, ShieldCheck, ShieldAlert, Info, BookOpen } from "lucide-react";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/_authenticated/app/policies")({
  component: PoliciesPage,
});

const sevMeta = {
  critical: {
    color: "text-[color:var(--risk-high)]",
    bg: "bg-[color:var(--risk-high)]/10",
    border: "border-[color:var(--risk-high)]/40",
    Icon: ShieldAlert,
  },
  warning: {
    color: "text-[color:var(--risk-medium)]",
    bg: "bg-[color:var(--risk-medium)]/10",
    border: "border-[color:var(--risk-medium)]/40",
    Icon: ShieldAlert,
  },
  info: {
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    Icon: Info,
  },
} as const;

function PoliciesPage() {
  const fetchPolicies = useServerFn(listArmorIQPolicies);
  const { data: policies = [] } = useQuery({
    queryKey: ["armoriq-policies"],
    queryFn: () => fetchPolicies(),
  });

  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const stored = localStorage.getItem("armoriq.enabled");
    if (stored) setEnabled(JSON.parse(stored));
  }, []);
  useEffect(() => {
    localStorage.setItem("armoriq.enabled", JSON.stringify(enabled));
  }, [enabled]);

  const isOn = (id: string) => enabled[id] !== false;

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="mb-8 flex items-start gap-4">
          <div className="rounded-lg bg-primary/15 p-3 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-3xl tracking-tight">ArmorIQ Policy Engine</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Policy-as-code governance layer. Every AI vendor evaluation is gated by these
              policies before reaching the audit trail. Critical violations auto-block; warnings
              require manual review.
            </p>
          </div>
          <Link to="/app" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Active policies
            </div>
            <div className="mt-1 font-display text-2xl">
              {policies.filter((p) => isOn(p.id)).length}
              <span className="text-sm text-muted-foreground">/{policies.length}</span>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Critical gates
            </div>
            <div className="mt-1 font-display text-2xl text-[color:var(--risk-high)]">
              {policies.filter((p) => p.severity === "critical").length}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Decision modes
            </div>
            <div className="mt-1 flex gap-1.5 text-[10px]">
              <Badge variant="outline">auto_approve</Badge>
              <Badge variant="outline">manual_review</Badge>
              <Badge variant="outline">blocked</Badge>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          {policies.map((p) => {
            const m = sevMeta[p.severity];
            return (
              <Card key={p.id} className={`overflow-hidden border ${m.border}`}>
                <div className="flex items-start gap-4 p-4">
                  <div className={`rounded-md ${m.bg} p-2`}>
                    <m.Icon className={`h-4 w-4 ${m.color}`} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {p.id}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase ${m.color} ${m.border}`}
                      >
                        {p.severity}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {p.category}
                      </Badge>
                    </div>
                    <h3 className="font-display text-sm">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                    <div className="mt-2 flex items-start gap-1.5 rounded border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                      <BookOpen className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        <span className="font-medium text-foreground">Rationale:</span>{" "}
                        {p.rationale}
                      </span>
                    </div>
                  </div>
                  <Switch
                    checked={isOn(p.id)}
                    onCheckedChange={(v) => setEnabled((s) => ({ ...s, [p.id]: v }))}
                  />
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="mt-6 border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
            <div className="text-xs">
              <div className="font-display uppercase tracking-wider text-primary">
                How ArmorIQ decides
              </div>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>
                  • <span className="text-foreground">BLOCKED</span> — any critical-severity
                  policy fails
                </li>
                <li>
                  • <span className="text-foreground">MANUAL REVIEW</span> — any non-critical
                  failure or warning
                </li>
                <li>
                  • <span className="text-foreground">AUTO APPROVE</span> — all active policies
                  pass
                </li>
              </ul>
              <p className="mt-3 text-muted-foreground">
                Every policy evaluation is written to the audit log as a separate{" "}
                <code className="rounded bg-muted px-1 font-mono">armoriq.policy.*</code> event,
                providing complete traceability for compliance reviews.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </ScrollArea>
  );
}
