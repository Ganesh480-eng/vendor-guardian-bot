import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateObject } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import { VendorEvaluationSchema } from "./vendor-schema";

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .select("id, title, vendor_name, approval_status, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: thread, error } = await context.supabase
      .from("threads")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: messages, error: mErr } = await context.supabase
      .from("messages")
      .select("*")
      .eq("thread_id", data.id)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);
    const { data: audit } = await context.supabase
      .from("audit_logs")
      .select("*")
      .eq("thread_id", data.id)
      .order("created_at", { ascending: true });
    return { thread, messages: messages ?? [], audit: audit ?? [] };
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ vendor_name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: thread, error } = await supabase
      .from("threads")
      .insert({
        user_id: userId,
        vendor_name: data.vendor_name,
        title: data.vendor_name,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("messages").insert({
      thread_id: thread.id,
      user_id: userId,
      role: "user",
      parts: { text: `Evaluate vendor risk for: ${data.vendor_name}` },
    });

    await supabase.from("audit_logs").insert({
      user_id: userId,
      thread_id: thread.id,
      action: "thread.created",
      details: { vendor_name: data.vendor_name },
    });

    return thread;
  });

export const evaluateVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ thread_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: thread, error } = await supabase
      .from("threads")
      .select("*")
      .eq("id", data.thread_id)
      .single();
    if (error || !thread) throw new Error("Thread not found");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");

    const { object } = await generateObject({
      model,
      schema: VendorEvaluationSchema,
      system:
        "You are a vendor risk assessment analyst. Evaluate the SaaS vendor for security, privacy, and compliance posture. Always return at least 5 concrete checks: SOC 2, ISO 27001, GDPR/DPA, Breach history, Privacy policy freshness, Subprocessor disclosure. Be concise and decisive. If unknown, mark status as 'unknown' and explain why.",
      prompt: `Vendor: ${thread.vendor_name}\n\nProduce a risk evaluation. Score 0=safest, 100=most risky. risk_level: low (<33), medium (<66), high (>=66).`,
    });

    await supabase.from("messages").insert({
      thread_id: thread.id,
      user_id: userId,
      role: "assistant",
      parts: { evaluation: object },
    });

    await supabase
      .from("threads")
      .update({
        current_evaluation: object,
        approval_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread.id);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      thread_id: thread.id,
      action: "vendor.evaluated",
      details: {
        risk_level: object.risk_level,
        score: object.score,
        checks: object.checks.length,
      },
    });

    return object;
  });

export const setApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        thread_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("threads")
      .update({ approval_status: data.decision, updated_at: new Date().toISOString() })
      .eq("id", data.thread_id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      thread_id: data.thread_id,
      action: `armoriq.${data.decision}`,
      details: { note: data.note ?? null, policy_gate: "ArmorIQ (mock)" },
    });

    return { ok: true };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("messages").delete().eq("thread_id", data.id);
    await supabase.from("audit_logs").delete().eq("thread_id", data.id);
    const { error } = await supabase.from("threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
