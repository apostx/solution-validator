import { EVIDENCE_CODES, type EvidenceCode } from "../messages/codes";
import { type FindingParams, renderMessage } from "../messages/finding";

/**
 * - `pass`: proven from the given data.
 * - `fail`: disproven from the given data.
 * - `undecidable`: the data, the packs or the supported analyses are not enough.
 */
export type Verdict = "pass" | "fail" | "undecidable";

/** Why a check reached its verdict. */
export interface Evidence {
  code: EvidenceCode;
  params: FindingParams;
  /** Default English text, rendered from the code's template and the parameters. */
  message: string;
}

/** One of the checks that verify an intent. */
export type CheckId = "compatibility";

export interface CheckResult {
  check: CheckId;
  verdict: Verdict;
  evidence: Evidence[];
}

/** The verdict on one intent, with the checks that were made. */
export interface IntentVerdict {
  intent: string;
  verdict: Verdict;
  checks: CheckResult[];
}

export function createEvidence(code: EvidenceCode, params: FindingParams = {}): Evidence {
  return {
    code,
    params: { ...params },
    message: renderMessage(EVIDENCE_CODES[code].template, params),
  };
}

/** `fail` if any verdict fails; otherwise `undecidable` if any is; otherwise `pass`. */
export function combineVerdicts(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.includes("fail")) return "fail";
  if (verdicts.includes("undecidable")) return "undecidable";
  return "pass";
}
