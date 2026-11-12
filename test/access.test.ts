import { describe, expect, it } from "vitest";
import {
  type AccessReport,
  type AssumptionPolicy,
  analyze,
  type Component,
  createRegistry,
  type Intent,
  parseSolution,
  type Registry,
} from "../src/index";
import { officialPacks, officialRegistry, testPack } from "./helpers/registry";

function accessReport(
  components: Component[],
  intents: Intent[],
  assumptions: AssumptionPolicy = "strict",
  registry: Registry = officialRegistry,
  packs: string[] = ["core", "aws"],
): AccessReport {
  const parsed = parseSolution({ schemaVersion: 1, packs, components, intents }, registry);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
  const report = analyze(parsed.model, { assumptions }).analyses.find((r) => r.id === "access");
  if (report?.id !== "access") throw new Error("missing report");
  return report;
}

function checks(report: AccessReport, intent = "x"): Record<string, string> {
  const verdict = report.intents.find((candidate) => candidate.intent === intent);
  return Object.fromEntries(verdict?.checks.map((check) => [check.check, check.verdict]) ?? []);
}

const users = { id: "users", type: "core.internet" };
const table = { id: "table", type: "aws.dynamodb" };

describe("access", () => {
  it("allows a function with a grant and denies one without", () => {
    const report = accessReport(
      [
        {
          id: "fn",
          type: "aws.lambda",
          properties: { permissions: [{ resource: "table", access: "read" }] },
        },
        table,
      ],
      [
        { id: "read", from: "fn", to: "table", action: "read" },
        { id: "write", from: "fn", to: "table", action: "write" },
      ],
    );
    expect(report.intents.map((intent) => intent.verdict)).toEqual(["pass", "fail"]);
    expect(report.findings.map((finding) => finding.message)).toEqual([
      "Intent write: fn has no permission to write table.",
    ]);
  });

  it("requires a forwarder's route to its target", () => {
    const report = accessReport(
      [
        { id: "api", type: "aws.api-gateway", properties: { endpoint: "public", routes: [] } },
        { id: "fn", type: "aws.lambda" },
      ],
      [{ id: "x", from: "api", to: "fn", action: "invoke" }],
    );
    expect(checks(report)).toEqual({
      compatibility: "pass",
      forwarding: "fail",
      connectivity: "pass",
      authorization: "fail",
    });
    expect(
      report.findings.map((finding) => finding.code).filter((code) => code.startsWith("ACCESS_")),
    ).toEqual(["ACCESS_PERMISSION_MISSING", "ACCESS_ROUTE_MISSING"]);
  });

  it("does not reach a private endpoint from outside a private network", () => {
    const report = accessReport(
      [users, { id: "api", type: "aws.api-gateway", properties: { endpoint: "private" } }],
      [{ id: "x", from: "users", to: "api", port: "https" }],
    );
    expect(checks(report).connectivity).toBe("fail");
    expect(report.findings.map((finding) => finding.code)).toEqual(["ACCESS_NOT_REACHABLE"]);
  });

  it("checks the port against the endpoint's ports", () => {
    const fn = {
      id: "fn",
      type: "aws.lambda",
      properties: { permissions: [{ resource: "table", access: "read" }] },
    };
    const report = accessReport(
      [fn, table],
      [
        { id: "x", from: "fn", to: "table", action: "read", port: 8000 },
        { id: "y", from: "fn", to: "table", action: "read", port: "https" },
      ],
    );
    expect(checks(report, "x").connectivity).toBe("fail");
    expect(checks(report, "y").connectivity).toBe("pass");
  });

  it("allows public reads of a public bucket, but not writes", () => {
    const report = accessReport(
      [users, { id: "bucket", type: "aws.s3", properties: { publicAccess: true } }],
      [
        { id: "read", from: "users", to: "bucket", action: "read", port: "https" },
        { id: "write", from: "users", to: "bucket", action: "write" },
      ],
    );
    expect(checks(report, "read").authorization).toBe("pass");
    expect(checks(report, "write").authorization).toBe("fail");
    expect(report.exposure).toEqual([
      expect.objectContaining({ component: "bucket", exposure: "exposed", actions: ["read"] }),
    ]);
  });

  it("is undecidable when an intent to an access-controlled target states no action", () => {
    const report = accessReport(
      [{ id: "fn", type: "aws.lambda", properties: { permissions: [] } }, table],
      [{ id: "x", from: "fn", to: "table", port: "https" }],
    );
    expect(report.intents[0]?.verdict).toBe("undecidable");
    expect(report.findings.map((finding) => finding.code)).toEqual(["ACCESS_ACTION_MISSING"]);
  });

  describe("assumption policies", () => {
    const components = [
      users,
      { id: "api", type: "aws.api-gateway" },
      { id: "bucket", type: "aws.s3" },
    ];
    const intents = [
      { id: "x", from: "users", to: "api", port: "https" },
      { id: "y", from: "users", to: "bucket", action: "read" },
    ];

    it("strict: unset properties make verdicts undecidable", () => {
      const report = accessReport(components, intents, "strict");
      expect(report.intents.map((intent) => intent.verdict)).toEqual([
        "undecidable",
        "undecidable",
      ]);
      expect(report.assumptions).toEqual([]);
      expect(report.exposure.map((fact) => fact.exposure)).toEqual(["undecidable", "undecidable"]);
      expect(report.findings.map((finding) => finding.message)).toEqual([
        "Intent x cannot be decided: api does not set endpoint.",
        "Intent y cannot be decided: bucket does not set publicAccess.",
      ]);
    });

    it("pack-defaults: documented defaults are applied and listed", () => {
      const report = accessReport(components, intents, "pack-defaults");
      expect(report.intents.map((intent) => intent.verdict)).toEqual(["pass", "fail"]);
      expect(report.assumptions).toEqual([
        { component: "api", property: "endpoint", value: "public" },
        { component: "bucket", property: "publicAccess", value: false },
      ]);
      expect(report.exposure.map((fact) => [fact.component, fact.exposure])).toEqual([
        ["api", "exposed"],
        ["bucket", "not-exposed"],
      ]);
      const evidence = report.intents[0]?.checks.flatMap((check) => check.evidence) ?? [];
      expect(evidence.map((item) => item.message)).toContain(
        'api does not set endpoint; the pack default "public" is assumed.',
      );
    });
  });

  it("does not reach the internet from a zone without routes", () => {
    const registry = createRegistry([
      ...officialPacks,
      testPack({
        requires: { aws: "^0.4.0" },
        vocabulary: 2,
        types: [{ id: "acme.net", label: "Net", category: "network", traits: { zone: {} } }],
      }),
    ]);
    const report = accessReport(
      [
        { id: "net", type: "acme.net" },
        {
          id: "fn",
          type: "aws.lambda",
          placement: ["net"],
          properties: { permissions: [{ resource: "table", access: "read" }] },
        },
        table,
      ],
      [{ id: "x", from: "fn", to: "table", action: "read" }],
      "strict",
      registry,
      ["acme"],
    );
    expect(checks(report).connectivity).toBe("fail");
    const evidence = report.intents[0]?.checks.flatMap((check) => check.evidence) ?? [];
    expect(evidence.map((item) => item.code)).toContain("LOCAL_ROUTES_ONLY");
  });

  it("reaches a component without an endpoint only through a forwarder's route", () => {
    const registry = createRegistry([
      ...officialPacks,
      testPack({
        requires: { aws: "^0.4.0" },
        types: [
          {
            id: "acme.worker",
            label: "Worker",
            category: "compute",
            traits: { endpoint: { visibility: "none" } },
            accepts: [{ actions: ["invoke"] }],
          },
        ],
      }),
    ]);
    const report = accessReport(
      [
        {
          id: "api",
          type: "aws.api-gateway",
          properties: { endpoint: "public", routes: [{ path: "/", target: "w" }] },
        },
        { id: "fn", type: "aws.lambda", properties: { permissions: [] } },
        { id: "w", type: "acme.worker" },
      ],
      [
        { id: "x", from: "api", to: "w", action: "invoke" },
        { id: "y", from: "fn", to: "w", action: "invoke" },
      ],
      "strict",
      registry,
      ["acme"],
    );
    expect(checks(report, "x").connectivity).toBe("pass");
    expect(checks(report, "y").connectivity).toBe("fail");
  });
});
