import { describe, expect, it } from "vitest";
import {
  type AccessReport,
  type AddressPlanReport,
  analyze,
  type Component,
  type Intent,
  parseSolution,
} from "../src/index";
import {
  cidrContains,
  cidrOverlaps,
  containsPublic,
  parseCidr,
  parsePortRange,
} from "../src/util/ip";
import { officialRegistry } from "./helpers/registry";

describe("IPv4 ranges", () => {
  it("parses CIDR notation", () => {
    expect(parseCidr("10.0.1.0/24")).toMatchObject({ prefix: 24, network: true });
    expect(parseCidr("10.0.1.5/24")).toMatchObject({ network: false });
    for (const text of ["10.0.0.0/33", "256.0.0.0/8", "10.0.0/24", "010.0.0.0/8", "internet"]) {
      expect(parseCidr(text)).toBeUndefined();
    }
  });

  it("compares ranges", () => {
    const vpc = parseCidr("10.0.0.0/16");
    const subnet = parseCidr("10.0.1.0/24");
    const other = parseCidr("10.1.0.0/16");
    if (!vpc || !subnet || !other) throw new Error("parse");
    expect(cidrContains(vpc, subnet)).toBe(true);
    expect(cidrContains(subnet, vpc)).toBe(false);
    expect(cidrOverlaps(vpc, other)).toBe(false);
  });

  it("tells public from private ranges", () => {
    const check = (text: string) => containsPublic(parseCidr(text) as never);
    expect(check("10.0.0.0/8")).toBe(false);
    expect(check("192.168.1.0/24")).toBe(false);
    expect(check("0.0.0.0/0")).toBe(true);
    expect(check("8.8.8.0/24")).toBe(true);
    expect(check("172.0.0.0/8")).toBe(true);
  });

  it("parses port ranges", () => {
    expect(parsePortRange("443")).toEqual({ from: 443, to: 443 });
    expect(parsePortRange("1024-65535")).toEqual({ from: 1024, to: 65535 });
    expect(parsePortRange("90-80")).toBeUndefined();
    expect(parsePortRange("https")).toBeUndefined();
  });
});

function reports(components: Component[], intents: Intent[] = []) {
  const parsed = parseSolution(
    { schemaVersion: 1, packs: ["core", "aws"], components, intents },
    officialRegistry,
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
  const result = analyze(parsed.model, { level: "detailed" });
  const access = result.analyses.find((r) => r.id === "access") as AccessReport;
  const plan = result.analyses.find((r) => r.id === "address-plan") as AddressPlanReport;
  return { access, plan };
}

const network = (extra: Component[]): Component[] => [
  { id: "users", type: "core.internet" },
  { id: "vpc", type: "aws.vpc", properties: { cidrBlock: "10.0.0.0/16" } },
  { id: "a", type: "aws.subnet", placement: ["vpc"], properties: { cidrBlock: "10.0.1.0/24" } },
  { id: "igw", type: "aws.internet-gateway", properties: { attachedTo: ["vpc"] } },
  { id: "table", type: "aws.dynamodb" },
  {
    id: "web",
    type: "aws.autoscaling-group",
    placement: ["a"],
    properties: { endpoint: "public", permissions: [{ resource: "table", access: "read" }] },
  },
  ...extra,
];
const routes = (entries: { destination: string; gateway: string }[]): Component => ({
  id: "rt",
  type: "aws.route-table",
  properties: { routes: entries, associations: ["a"] },
});
const sg = (rules: unknown[]): Component => ({
  id: "sg",
  type: "aws.security-group",
  properties: { rules, attachedTo: ["web"] },
});
const verdict = (report: AccessReport, check = "connectivity") =>
  report.intents[0]?.checks.find((candidate) => candidate.check === check)?.verdict;

describe("detailed access", () => {
  it("matches outside parties only by ranges that decide for unknown public addresses", () => {
    const intents = [{ id: "x", from: "users", to: "web", port: "https" }];
    const route = routes([{ destination: "0.0.0.0/0", gateway: "igw" }]);
    const privateOnly = reports(
      network([route, sg([{ direction: "inbound", peer: "10.0.0.0/8" }])]),
      intents,
    );
    expect(verdict(privateOnly.access)).toBe("fail");
    const publicRange = reports(
      network([route, sg([{ direction: "inbound", peer: "8.8.8.0/24" }])]),
      intents,
    );
    expect(verdict(publicRange.access)).toBe("undecidable");
    expect(publicRange.access.findings.map((f) => f.code)).toContain("ACCESS_ADDRESS_UNDECIDABLE");
  });

  it("is undecidable when a range covers only part of a zone", () => {
    const report = reports(
      network([
        routes([{ destination: "0.0.0.0/0", gateway: "igw" }]),
        sg([{ direction: "outbound", peer: "any" }]),
        {
          id: "app",
          type: "aws.autoscaling-group",
          placement: ["a"],
          properties: { endpoint: "private" },
        },
        {
          id: "app-sg",
          type: "aws.security-group",
          properties: {
            rules: [{ direction: "inbound", peer: "10.0.1.0/25" }],
            attachedTo: ["app"],
          },
        },
      ]),
      [{ id: "x", from: "web", to: "app", action: "invoke", port: "https" }],
    );
    expect(verdict(report.access)).toBe("undecidable");
  });

  it("finds the internet route by prefix and flags ambiguous ones", () => {
    const intents = [{ id: "x", from: "web", to: "table", action: "read" }];
    const allow = sg([{ direction: "outbound", peer: "any" }]);
    expect(
      verdict(
        reports(network([routes([{ destination: "0.0.0.0/0", gateway: "igw" }]), allow]), intents)
          .access,
      ),
    ).toBe("pass");
    const ambiguous = reports(
      network([
        routes([
          { destination: "0.0.0.0/0", gateway: "igw" },
          { destination: "52.0.0.0/8", gateway: "nat" },
        ]),
        { id: "nat", type: "aws.nat-gateway", placement: ["a"] },
        allow,
      ]),
      intents,
    );
    expect(verdict(ambiguous.access)).toBe("undecidable");
    const privateOnly = reports(
      network([
        routes([
          { destination: "0.0.0.0/0", gateway: "igw" },
          { destination: "192.168.0.0/16", gateway: "nat" },
        ]),
        { id: "nat", type: "aws.nat-gateway", placement: ["a"] },
        allow,
      ]),
      intents,
    );
    expect(verdict(privateOnly.access)).toBe("pass");
  });

  it("requires stateless filters to allow replies on the ephemeral ports", () => {
    const acl = (ports: string[]): Component => ({
      id: "acl",
      type: "aws.network-acl",
      properties: {
        rules: [
          { direction: "outbound", peer: "any", ports: ["https"] },
          { direction: "inbound", peer: "any", ports },
        ],
        subnets: ["a"],
      },
    });
    const parts = (ports: string[]) =>
      network([
        routes([{ destination: "0.0.0.0/0", gateway: "igw" }]),
        sg([{ direction: "outbound", peer: "any" }]),
        acl(ports),
      ]);
    const intents = [{ id: "x", from: "web", to: "table", action: "read", port: "https" }];
    expect(verdict(reports(parts(["1024-65535"]), intents).access)).toBe("pass");
    expect(verdict(reports(parts(["https"]), intents).access)).toBe("fail");
  });
});

describe("address-plan", () => {
  it("lists every zone with its address space", () => {
    const { plan } = reports(network([]));
    expect(plan.zones).toEqual([
      { zone: "a", parent: "vpc", space: "10.0.1.0/24", size: 256 },
      { zone: "vpc", space: "10.0.0.0/16", size: 65536 },
    ]);
    expect(plan.findings).toEqual([]);
  });

  it("reports missing, invalid and host-bit address spaces", () => {
    const { plan } = reports([
      { id: "v1", type: "aws.vpc" },
      { id: "v2", type: "aws.vpc", properties: { cidrBlock: "10.0.0.0/40" } },
      { id: "v3", type: "aws.vpc", properties: { cidrBlock: "10.0.0.1/16" } },
    ]);
    expect(plan.findings.map((finding) => finding.code)).toEqual([
      "ADDRESS_SPACE_MISSING",
      "ADDRESS_SPACE_INVALID",
      "ADDRESS_SPACE_HOST_BITS",
    ]);
  });
});
