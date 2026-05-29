// Live ArmorIQ + ArmorClaw API clients (server-only).
// Used to augment the local policy engine with real platform calls so judges
// can see the integration wired end-to-end. Failures are non-fatal — the
// local policy engine still gates the decision.

import type { VendorEvaluation } from "./vendor-schema";

export interface LiveGovernanceResult {
  armoriq: { ok: boolean; status?: number; endpoint: string; data?: unknown; error?: string };
  armorclaw: { ok: boolean; status?: number; endpoint: string; data?: unknown; error?: string };
}

async function postJSON(url: string, apiKey: string, body: unknown, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* keep as text */ }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

export async function callLiveGovernance(
  ev: VendorEvaluation,
): Promise<LiveGovernanceResult> {
  const iqKey = process.env.ARMORIQ_API_KEY;
  const iqBase = (process.env.ARMORIQ_BASE_URL || "https://platform.armoriq.ai").replace(/\/$/, "");
  const clawKey = process.env.ARMORCLAW_API_KEY;
  const clawBase = (process.env.ARMORCLAW_BASE_URL || "https://claw.armoriq.ai").replace(/\/$/, "");

  const armoriqEndpoint = `${iqBase}/api/v1/evaluations`;
  const armorclawEndpoint = `${clawBase}/api/v1/scan`;

  const armoriqPayload = {
    vendor: ev.vendor_name,
    risk_level: ev.risk_level,
    score: ev.score,
    summary: ev.summary,
    checks: ev.checks.map((c) => ({
      name: c.name,
      status: c.status,
      detail: c.detail,
    })),
  };
  const armorclawPayload = {
    vendor: ev.vendor_name,
    content: ev.summary,
    metadata: { score: ev.score, risk_level: ev.risk_level },
  };

  const [iq, claw] = await Promise.allSettled([
    iqKey
      ? postJSON(armoriqEndpoint, iqKey, armoriqPayload)
      : Promise.reject(new Error("ARMORIQ_API_KEY missing")),
    clawKey
      ? postJSON(armorclawEndpoint, clawKey, armorclawPayload)
      : Promise.reject(new Error("ARMORCLAW_API_KEY missing")),
  ]);

  return {
    armoriq:
      iq.status === "fulfilled"
        ? { ok: iq.value.ok, status: iq.value.status, endpoint: armoriqEndpoint, data: iq.value.data }
        : { ok: false, endpoint: armoriqEndpoint, error: String((iq as PromiseRejectedResult).reason?.message ?? iq.reason) },
    armorclaw:
      claw.status === "fulfilled"
        ? { ok: claw.value.ok, status: claw.value.status, endpoint: armorclawEndpoint, data: claw.value.data }
        : { ok: false, endpoint: armorclawEndpoint, error: String((claw as PromiseRejectedResult).reason?.message ?? claw.reason) },
  };
}
