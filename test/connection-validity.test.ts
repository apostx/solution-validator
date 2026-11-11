import { describe, expect, it } from "vitest";
import {
  analyze,
  type ConnectionValidityReport,
  createRegistry,
  type Intent,
  parseSolution,
  type Registry,
} from "../src/index";
import { officialPacks, officialRegistry, testPack } from "./helpers/registry";

function connectionReport(
  components: { id: string; type: string }[],
  intents: Intent[],
  registry: Registry = officialRegistry,
  packs: string[] = ["core", "aws"],
): ConnectionValidityReport {
  const parsed = parseSolution({ schemaVersion: 1, packs, components, intents }, registry);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
  const report = analyze(parsed.model).analyses.find((r) => r.id === "connection-validity");
  if (report?.id !== "connection-validity") throw new Error("missing report");
  return report;
}

const serverless = [
  { id: "users", type: "core.internet" },
  { id: "api", type: "aws.api-gateway" },
  { id: "fn", type: "aws.lambda" },
  { id: "table", type: "aws.dynamodb" },
  { id: "bucket", type: "aws.s3" },
];

function verdictOf(intent: Omit<Intent, "id">): string | undefined {
  return connectionReport(serverless, [{ id: "x", ...intent }]).intents[0]?.verdict;
}

describe("connection-validity", () => {
  it("accepts API Gateway invoking Lambda", () => {
    expect(verdictOf({ from: "api", to: "fn", action: "invoke" })).toBe("pass");
  });

  it("rejects S3 writing to DynamoDB", () => {
    const report = connectionReport(serverless, [
      { id: "x", from: "bucket", to: "table", action: "write" },
    ]);
    expect(report.intents[0]?.verdict).toBe("fail");
    expect(report.findings.map((finding) => finding.message)).toEqual([
      "Intent x: aws.dynamodb does not accept write from aws.s3.",
    ]);
  });

  it("matches the action and the port the intent states", () => {
    expect(verdictOf({ from: "users", to: "api", port: "https" })).toBe("pass");
    expect(verdictOf({ from: "users", to: "api", action: "invoke", port: "https" })).toBe("pass");
    expect(verdictOf({ from: "users", to: "api", port: "http" })).toBe("fail");
    expect(verdictOf({ from: "users", to: "api", action: "write" })).toBe("fail");
  });

  it("does not restrict the port when a rule lists none", () => {
    expect(verdictOf({ from: "fn", to: "table", action: "write", port: "https" })).toBe("pass");
    expect(verdictOf({ from: "fn", to: "table", port: 8000 })).toBe("pass");
  });

  it("matches numeric ports by port number", () => {
    expect(verdictOf({ from: "users", to: "api", port: 443 })).toBe("pass");
    expect(verdictOf({ from: "users", to: "api", port: 80 })).toBe("fail");
  });

  it("matches sources by type, category and trait", () => {
    const registry = createRegistry([
      ...officialPacks,
      testPack({
        requires: { aws: "^0.3.0" },
        types: [
          {
            id: "acme.sink",
            label: "Sink",
            category: "data-store",
            accepts: [{ from: { trait: "principal" }, actions: ["write"] }],
          },
        ],
      }),
    ]);
    const report = connectionReport(
      [...serverless, { id: "sink", type: "acme.sink" }],
      [
        { id: "a", from: "fn", to: "sink", action: "write" },
        { id: "b", from: "api", to: "sink", action: "write" },
      ],
      registry,
      ["acme"],
    );
    expect(report.intents.map((intent) => [intent.intent, intent.verdict])).toEqual([
      ["a", "pass"],
      ["b", "fail"],
    ]);
  });

  it("is undecidable when a type does not declare what it accepts", () => {
    const registry = createRegistry([officialPacks[0], testPack()]);
    const report = connectionReport(
      [
        { id: "users", type: "core.internet" },
        { id: "box", type: "acme.box" },
      ],
      [{ id: "x", from: "users", to: "box", action: "connect" }],
      registry,
      ["acme"],
    );
    expect(report.intents[0]?.verdict).toBe("undecidable");
    expect(report.findings.map((finding) => finding.code)).toEqual(["CONNECTION_RULES_MISSING"]);
  });

  it("is undecidable, without a finding, when the model is invalid", () => {
    const report = connectionReport(serverless, [
      { id: "a", from: "users", to: "nowhere", action: "read" },
      { id: "b", from: "users", to: "bucket" },
      { id: "c", from: "users", to: "bucket", action: "fly" },
    ]);
    expect(report.intents.map((intent) => intent.verdict)).toEqual([
      "undecidable",
      "undecidable",
      "undecidable",
    ]);
    expect(report.intents.map((intent) => intent.checks[0]?.evidence[0]?.code)).toEqual([
      "COMPONENT_MISSING",
      "PURPOSE_MISSING",
      "ACTION_UNDEFINED",
    ]);
    expect(report.findings).toEqual([]);
  });

  it("explains a pass with the matching rule", () => {
    const report = connectionReport(serverless, [
      { id: "x", from: "fn", to: "table", action: "write" },
    ]);
    expect(report.intents[0]?.checks).toEqual([
      {
        check: "compatibility",
        verdict: "pass",
        evidence: [
          {
            code: "ACCEPTED",
            params: { fromType: "aws.lambda", toType: "aws.dynamodb", purpose: "write", rule: 0 },
            message: "aws.dynamodb accepts write from aws.lambda (accepts rule 0).",
          },
        ],
      },
    ]);
    expect(report.summary).toEqual({ pass: 1, fail: 0, undecidable: 0 });
  });
});
