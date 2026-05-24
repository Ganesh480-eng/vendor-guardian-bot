import { createFileRoute, Outlet, redirect, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listThreads, createThread, deleteThread } from "@/lib/threads.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck, Plus, LogOut, Trash2, ShieldAlert, ShieldQuestion, GitCompare } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } as any });
    }
  },
  component: AuthLayout,
});

function statusDot(s: string) {
  if (s === "approved") return "bg-[color:var(--risk-low)]";
  if (s === "rejected") return "bg-[color:var(--risk-high)]";
  if (s === "pending") return "bg-[color:var(--risk-medium)]";
  return "bg-muted-foreground/40";
}

function AuthLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const del = useServerFn(deleteThread);
  const params = useParams({ strict: false }) as { threadId?: string };

  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => list(),
  });

  const [vendor, setVendor] = useState("");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor.trim()) return;
    setCreating(true);
    try {
      const t = await create({ data: { vendor_name: vendor.trim() } });
      setVendor("");
      await qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/app/$threadId", params: { threadId: t.id } });
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this evaluation?")) return;
    await del({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["threads"] });
    if (params.threadId === id) navigate({ to: "/app" });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex h-screen">
      <aside className="flex w-72 flex-col border-r bg-[color:var(--sidebar)] text-[color:var(--sidebar-foreground)]">
        <div className="flex items-center gap-2 border-b border-[color:var(--sidebar-border)] p-4">
          <div className="rounded-md bg-primary/15 p-1.5 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-sm tracking-tight">VendorGuard</div>
            <div className="text-[10px] uppercase text-muted-foreground">Risk Agent</div>
          </div>
        </div>

        <form onSubmit={onCreate} className="space-y-2 border-b border-[color:var(--sidebar-border)] p-3">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">New evaluation</label>
          <Input
            placeholder="Vendor name (e.g. Notion)"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="h-9 bg-background/40"
          />
          <Button type="submit" className="w-full h-9" disabled={creating || !vendor.trim()}>
            <Plus className="h-4 w-4 mr-1" /> {creating ? "Creating…" : "Evaluate"}
          </Button>
        </form>

        <ScrollArea className="flex-1">
          <div className="space-y-0.5 p-2">
            {threads.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">No evaluations yet.</p>
            )}
            {threads.map((t) => {
              const active = params.threadId === t.id;
              return (
                <Link
                  key={t.id}
                  to="/app/$threadId"
                  params={{ threadId: t.id }}
                  className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
                    active ? "bg-primary/15 text-foreground" : "hover:bg-accent/40"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${statusDot(t.approval_status)}`} />
                  <span className="flex-1 truncate">{t.vendor_name ?? t.title}</span>
                  <button
                    onClick={(e) => onDelete(t.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </Link>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-[color:var(--sidebar-border)] p-3 text-xs">
          <div className="flex-1 truncate text-muted-foreground">{email}</div>
          <button onClick={signOut} className="text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export { ShieldAlert, ShieldQuestion };
