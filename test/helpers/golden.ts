import type { AnalysisResult } from "../../src/index";

/** Serializes a value the way golden files store it. */
export function toGolden(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Replaces the library version, so golden files survive releases. */
export function withoutVersion(result: AnalysisResult): AnalysisResult {
  return { ...result, library: { ...result.library, version: "<version>" } };
}
