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

    const system =
      "You are a vendor risk assessment analyst. Evaluate the SaaS vendor for security, privacy, and compliance posture. Return STRICT JSON only matching this TypeScript type:\n" +
      `{
  "vendor_name": string,
  "risk_level": "low" | "medium" | "high",
  "score": number, // 0=safest, 100=most risky
  "summary": string,
  "checks": Array<{ "name": string, "status": "pass"|"warn"|"fail"|"unknown", "detail": string }>, // >=5 items
  "score_breakdown": Array<{ "factor": string, "points": number, "reason": string }>, // >=4 items, EXPLAINABLE AI
  "recommendation": string
}\n` +
      "Checks: SOC 2, ISO 27001, GDPR/DPA, Breach history, Privacy policy freshness, Subprocessor disclosure.\n" +
      "score_breakdown: per-factor +/- point contributions; positive = adds risk, negative = reduces risk; sum approximates the final score (clamped 0-100). Example: {factor:'SOC 2 Type II', points:-20, reason:'Active cert reduces risk'}, {factor:'Public breach 2023', points:+25, reason:'Customer data leak'}.\n" +
      "Do not wrap in markdown.";

    const prompt = `Vendor: ${thread.vendor_name}\n\nReturn the JSON object now. risk_level mapping: low(<33), medium(<66), high(>=66).`;

    let object: import("./vendor-schema").VendorEvaluation;
    try {
      const result = await generateObject({
        model,
        schema: VendorEvaluationSchema,
        
        system,
        prompt,
      });
      object = result.object;
    } catch (e) {
      // Fallback: ask for raw text JSON and parse manually
      const { generateText } = await import("ai");
      const { text } = await generateText({ model, system, prompt });
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Model did not return JSON: " + text.slice(0, 200));
      const parsed = JSON.parse(match[0]);
      if (!parsed.vendor_name) parsed.vendor_name = thread.vendor_name;
      object = VendorEvaluationSchema.parse(parsed);
    }

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

// ArmorIQ policy: vendors with score >= 50 require manager approval
export const ARMORIQ_APPROVAL_THRESHOLD = 50;

export const compareVendors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ vendors: z.array(z.string().min(1).max(120)).min(2).max(4) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");
    const { generateText } = await import("ai");

    const system =
      "You are a vendor risk assessment analyst. Return STRICT JSON only matching this TypeScript type:\n" +
      `{
  "vendor_name": string,
  "risk_level": "low" | "medium" | "high",
  "score": number,
  "summary": string,
  "checks": Array<{ "name": string, "status": "pass"|"warn"|"fail"|"unknown", "detail": string }>,
  "score_breakdown": Array<{ "factor": string, "points": number, "reason": string }>,
  "recommendation": string
}\n` +
      "Checks (>=5 items): SOC 2, ISO 27001, GDPR/DPA, Breach history, Privacy policy freshness, Subprocessor disclosure. Each check MUST be an object with name/status/detail fields (never a plain string). score_breakdown >=4 items with +/- points. No markdown.";

    const evalOne = async (vendor: string) => {
      const prompt = `Vendor: ${vendor}\nReturn the JSON object now. risk_level mapping: low(<33), medium(<66), high(>=66).`;
      try {
        const r = await generateObject({ model, schema: VendorEvaluationSchema, system, prompt });
        return r.object;
      } catch {
        const { text } = await generateText({ model, system, prompt });
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error(`Model did not return JSON for ${vendor}`);
        const parsed = JSON.parse(match[0]);
        if (!parsed.vendor_name) parsed.vendor_name = vendor;
        return VendorEvaluationSchema.parse(parsed);
      }
    };

    const results = await Promise.all(data.vendors.map(evalOne));

    await supabase.from("audit_logs").insert({
      user_id: userId,
      thread_id: null,
      action: "vendors.compared",
      details: { vendors: data.vendors, count: results.length },
    });

    return results;
  });

// SIG Questionnaire auto-responder
const QuestionnaireAnswerSchema = z.object({
  question: z.string(),
  answer: z.enum(["Yes", "No", "Partial", "N/A", "Unknown"]),
  response: z.string().describe("1-3 sentence detailed answer suitable for a SIG questionnaire."),
  evidence: z.string().describe("Source/citation: doc name, URL pattern, or 'Public posture inference'."),
  confidence: z.enum(["high", "medium", "low"]),
});
export type QuestionnaireAnswer = z.infer<typeof QuestionnaireAnswerSchema>;

const QuestionnaireResultSchema = z.object({
  vendor_name: z.string(),
  answers: z.array(QuestionnaireAnswerSchema).min(1),
});

export const answerQuestionnaire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        vendor_name: z.string().min(1).max(120),
        questions: z.array(z.string().min(3).max(500)).min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");
    const { generateText } = await import("ai");

    const system =
      "You are a Security & Compliance analyst pre-filling a SIG (Standardized Information Gathering) questionnaire for a SaaS vendor. " +
      "Use public knowledge (trust center, security pages, SOC2/ISO certifications, GDPR/DPA, breach history, status pages). " +
      "For EACH question, return STRICT JSON matching:\n" +
      `{ "vendor_name": string, "answers": Array<{ "question": string, "answer": "Yes"|"No"|"Partial"|"N/A"|"Unknown", "response": string, "evidence": string, "confidence": "high"|"medium"|"low" }> }\n` +
      "Be conservative: when unsure use 'Unknown' with low confidence. Cite plausible sources (e.g. 'vendor.com/security', 'SOC 2 Type II report (public summary)'). No markdown.";

    const prompt =
      `Vendor: ${data.vendor_name}\n\nQuestions (answer each in order):\n` +
      data.questions.map((q, i) => `${i + 1}. ${q}`).join("\n") +
      `\n\nReturn the JSON object now with answers[] in the SAME ORDER.`;

    let result: z.infer<typeof QuestionnaireResultSchema>;
    try {
      const r = await generateObject({ model, schema: QuestionnaireResultSchema, system, prompt });
      result = r.object;
    } catch {
      const { text } = await generateText({ model, system, prompt });
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Model did not return JSON");
      const parsed = JSON.parse(match[0]);
      if (!parsed.vendor_name) parsed.vendor_name = data.vendor_name;
      result = QuestionnaireResultSchema.parse(parsed);
    }

    await supabase.from("audit_logs").insert({
      user_id: userId,
      thread_id: null,
      action: "questionnaire.generated",
      details: { vendor: data.vendor_name, questions: data.questions.length },
    });

    return result;
  });

