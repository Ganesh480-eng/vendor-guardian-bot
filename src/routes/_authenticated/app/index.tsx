import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  component: AppHome,
});

function AppHome() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="rounded-full bg-primary/10 p-4 text-primary">
        <ShieldCheck className="h-10 w-10" />
      </div>
      <h1 className="mt-6 font-display text-3xl">Vendor Risk Assessment Agent</h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        Enter a vendor name in the sidebar. The agent checks SOC 2, GDPR, breach history, privacy
        posture, and produces a risk score with an ArmorIQ-gated approval decision.
      </p>
      <div className="mt-8 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
        {["SOC 2", "GDPR / DPA", "Breach History", "Privacy Policy", "Subprocessors", "ISO 27001"].map((c) => (
          <div key={c} className="rounded-md border border-border/60 px-3 py-2 font-mono">{c}</div>
        ))}
      </div>
    </div>
  );
}
