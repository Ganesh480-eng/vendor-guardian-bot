import { z } from "zod";

export const RiskLevel = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const VendorEvaluationSchema = z.object({
  vendor_name: z.string(),
  risk_level: RiskLevel,
  score: z.number().min(0).max(100).describe("0=safest, 100=most risky"),
  summary: z.string().describe("One-sentence headline for the risk decision."),
  checks: z.array(
    z.object({
      name: z.string().describe("e.g. SOC 2, GDPR, DPA, Breach history, Privacy policy freshness"),
      status: z.enum(["pass", "warn", "fail", "unknown"]),
      detail: z.string(),
    }),
  ).min(4),
  score_breakdown: z.array(
    z.object({
      factor: z.string().describe("e.g. SOC 2 certification, Recent breach, GDPR/DPA available"),
      points: z.number().describe("Positive = adds risk, negative = reduces risk. Sum approximates final score."),
      reason: z.string(),
    }),
  ).min(4).describe("Explainable AI: per-factor point contributions that build the final score."),
  recommendation: z.string(),
});

export type VendorEvaluation = z.infer<typeof VendorEvaluationSchema>;
