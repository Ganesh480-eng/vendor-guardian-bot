import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "VendorGuard — AI Vendor Risk Assessment" },
      { name: "description", content: "Automatically evaluate SaaS vendors for SOC 2, GDPR, breach history and privacy risk in 30 seconds." },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/15 p-1.5 text-primary"><ShieldCheck className="h-5 w-5" /></div>
          <span className="font-display tracking-tight">VendorGuard</span>
        </div>
        <Link to="/login"><Button variant="outline" size="sm">Sign in</Button></Link>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
          <Sparkles className="h-3 w-3" /> Powered by AI · Gated by ArmorIQ
        </div>
        <h1 className="font-display text-5xl tracking-tight md:text-6xl">
          Vendor risk reviews,<br />
          <span className="text-primary">in 30 seconds.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Stop spending two weeks chasing SOC 2 reports, DPAs, and breach history. Drop in a vendor
          name — the agent investigates, scores risk, and logs every step for compliance.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/login">
            <Button size="lg">Start evaluating</Button>
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { Icon: Sparkles, t: "Autonomous research", d: "SOC 2, ISO, GDPR, DPA, breach history, privacy posture — checked in parallel." },
            { Icon: ShieldCheck, t: "Decisive risk score", d: "Low / Medium / High with reasoning, not vibes. Color-coded findings." },
            { Icon: Lock, t: "ArmorIQ policy gate", d: "Every evaluation audited. Approvals require human sign-off before vendor is greenlit." },
          ].map((f) => (
            <div key={f.t} className="rounded-lg border border-border/60 bg-card/40 p-5 text-left">
              <f.Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-display text-base">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
