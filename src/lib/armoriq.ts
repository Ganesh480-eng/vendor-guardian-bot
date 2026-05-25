// ArmorIQ — Policy-as-Code Governance Layer
// Sits between AI risk analysis and final vendor decisions.
// Each policy is independently evaluated, logged, and contributes to the gate decision.

import type { VendorEvaluation } from "./vendor-schema";

export type PolicySeverity = "info" | "warning" | "critical";

export interface ArmorIQPolicy {
  id: string;
  name: string;
  category: "compliance" | "security" | "privacy" | "operational";
  severity: PolicySeverity;
  description: string;
  rationale: string;
}

export interface PolicyEvaluation {
  policy_id: string;
  policy_name: string;
  severity: PolicySeverity;
  status: "pass" | "fail" | "warn" | "not_applicable";
  reason: string;
  remediation?: string;
}

export type GateDecision = "auto_approve" | "manual_review" | "blocked";

export interface ArmorIQReport {
  decision: GateDecision;
  evaluations: PolicyEvaluation[];
  summary: string;
  policies_evaluated: number;
  policies_passed: number;
  policies_failed: number;
}

// ─── Policy Catalog ─────────────────────────────────────────────────────────
export const ARMORIQ_POLICIES: ArmorIQPolicy[] = [
  {
    id: "SOC2-001",
    name: "SOC 2 Type II Attestation Required",
    category: "compliance",
    severity: "critical",
    description: "Vendor must hold an active SOC 2 Type II report.",
    rationale: "Industry baseline for SaaS handling customer data.",
  },
  {
    id: "BREACH-001",
    name: "No Material Breach in Last 24 Months",
    category: "security",
    severity: "critical",
    description: "Vendor must not have a disclosed material data breach in the last 24 months.",
    rationale: "Recent breaches indicate active control gaps.",
  },
  {
    id: "GDPR-001",
    name: "GDPR / Data Processing Agreement Available",
    category: "privacy",
    severity: "critical",
    description: "A signable DPA must be available for any vendor processing personal data.",
    rationale: "Required under GDPR Art. 28 for data processors.",
  },
  {
    id: "ISO-001",
    name: "ISO 27001 or Equivalent Encouraged",
    category: "compliance",
    severity: "warning",
    description: "ISO 27001 certification preferred for vendors in regulated industries.",
    rationale: "Demonstrates a mature ISMS program.",
  },
  {
    id: "RISK-001",
    name: "Risk Score Within Tolerance",
    category: "operational",
    severity: "warning",
    description: "Aggregate risk score must be below the org tolerance threshold (50).",
    rationale: "Quantitative gate aggregating all AI-discovered factors.",
  },
  {
    id: "SUBPROC-001",
    name: "Subprocessor Disclosure",
    category: "privacy",
    severity: "info",
    description: "Vendor should publish a current subprocessor list.",
    rationale: "Required for downstream GDPR compliance.",
  },
];

export const ARMORIQ_RISK_THRESHOLD = 50;

// ─── Helpers ────────────────────────────────────────────────────────────────
function findCheck(ev: VendorEvaluation, keywords: string[]) {
  const lc = (s: string) => s.toLowerCase();
  return ev.checks.find((c) => keywords.some((k) => lc(c.name).includes(lc(k))));
}

function statusFromCheck(
  c: { status: string; detail: string } | undefined,
  expectedPass: "pass" | "any",
): { status: PolicyEvaluation["status"]; reason: string } {
  if (!c) return { status: "warn", reason: "No evidence found in AI analysis." };
  if (c.status === "pass") return { status: "pass", reason: c.detail };
  if (c.status === "fail") return { status: "fail", reason: c.detail };
  if (c.status === "warn")
    return { status: expectedPass === "pass" ? "fail" : "warn", reason: c.detail };
  return { status: "warn", reason: c.detail || "Unknown status." };
}

// ─── Engine ─────────────────────────────────────────────────────────────────
export function evaluateArmorIQ(
  ev: VendorEvaluation,
  enabledPolicyIds?: string[],
): ArmorIQReport {
  const active = ARMORIQ_POLICIES.filter(
    (p) => !enabledPolicyIds || enabledPolicyIds.includes(p.id),
  );

  const evaluations: PolicyEvaluation[] = active.map((policy) => {
    switch (policy.id) {
      case "SOC2-001": {
        const c = findCheck(ev, ["SOC 2", "SOC2"]);
        const r = statusFromCheck(c, "pass");
        return {
          policy_id: policy.id,
          policy_name: policy.name,
          severity: policy.severity,
          status: r.status,
          reason: r.reason,
          remediation:
            r.status !== "pass" ? "Request current SOC 2 Type II report from vendor." : undefined,
        };
      }
      case "BREACH-001": {
        const c = findCheck(ev, ["breach", "incident"]);
        // For breach history, "pass" means no breach
        let status: PolicyEvaluation["status"] = "pass";
        let reason = c?.detail ?? "No recent breach evidence found.";
        if (c?.status === "fail") {
          status = "fail";
        } else if (c?.status === "warn" || c?.status === "unknown") {
          status = "warn";
        }
        return {
          policy_id: policy.id,
          policy_name: policy.name,
          severity: policy.severity,
          status,
          reason,
          remediation:
            status === "fail"
              ? "Request post-incident review and remediation evidence."
              : status === "warn"
                ? "Verify breach history via NIST NVD and vendor trust center."
                : undefined,
        };
      }
      case "GDPR-001": {
        const c = findCheck(ev, ["GDPR", "DPA", "Data Processing"]);
        const r = statusFromCheck(c, "pass");
        return {
          policy_id: policy.id,
          policy_name: policy.name,
          severity: policy.severity,
          status: r.status,
          reason: r.reason,
          remediation: r.status !== "pass" ? "Obtain signed DPA before contract execution." : undefined,
        };
      }
      case "ISO-001": {
        const c = findCheck(ev, ["ISO 27001", "ISO27001", "ISO"]);
        const r = statusFromCheck(c, "any");
        return {
          policy_id: policy.id,
          policy_name: policy.name,
          severity: policy.severity,
          status: r.status === "fail" ? "warn" : r.status,
          reason: r.reason,
          remediation: r.status !== "pass" ? "Recommended but not blocking." : undefined,
        };
      }
      case "RISK-001": {
        const pass = ev.score < ARMORIQ_RISK_THRESHOLD;
        return {
          policy_id: policy.id,
          policy_name: policy.name,
          severity: policy.severity,
          status: pass ? "pass" : "fail",
          reason: pass
            ? `Score ${ev.score} below tolerance ${ARMORIQ_RISK_THRESHOLD}.`
            : `Score ${ev.score} exceeds tolerance ${ARMORIQ_RISK_THRESHOLD}.`,
          remediation: pass ? undefined : "Escalate to security manager for review.",
        };
      }
      case "SUBPROC-001": {
        const c = findCheck(ev, ["subprocessor", "sub-processor"]);
        const r = statusFromCheck(c, "any");
        return {
          policy_id: policy.id,
          policy_name: policy.name,
          severity: policy.severity,
          status: r.status === "fail" ? "warn" : r.status,
          reason: r.reason,
          remediation:
            r.status !== "pass" ? "Request subprocessor list and update tracker." : undefined,
        };
      }
      default:
        return {
          policy_id: policy.id,
          policy_name: policy.name,
          severity: policy.severity,
          status: "not_applicable",
          reason: "No evaluator registered.",
        };
    }
  });

  // Decision logic
  const criticalFail = evaluations.some(
    (e) => e.severity === "critical" && e.status === "fail",
  );
  const anyFail = evaluations.some((e) => e.status === "fail");
  const anyWarn = evaluations.some((e) => e.status === "warn");

  const decision: GateDecision = criticalFail
    ? "blocked"
    : anyFail || anyWarn
      ? "manual_review"
      : "auto_approve";

  const passed = evaluations.filter((e) => e.status === "pass").length;
  const failed = evaluations.filter((e) => e.status === "fail").length;

  const summary =
    decision === "blocked"
      ? `BLOCKED — ${failed} critical policy violation(s).`
      : decision === "manual_review"
        ? `MANUAL REVIEW — ${failed} failure(s), ${evaluations.length - passed - failed} warning(s).`
        : `AUTO-APPROVED — all ${passed} policies passed.`;

  return {
    decision,
    evaluations,
    summary,
    policies_evaluated: evaluations.length,
    policies_passed: passed,
    policies_failed: failed,
  };
}
