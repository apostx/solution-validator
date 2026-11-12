import { describe, expect, it } from "vitest";
import {
  type AccessReport,
  type AssumptionPolicy,
  analyze,
  type Component,
  createRegistry,
  type Intent,
  parseSolution,
} from "../src/index";
import { officialPacks, officialRegistry, testPack } from "./helpers/registry";

function accessReport(
  components: Component[],
  intents: Intent[],
  assumptions: AssumptionPolicy = "strict",
  registry = officialRegistry,
  packs = ["core", "aws"],
): AccessReport {
  const parsed = parseSolution({ schemaVersion: 1, packs, components, intents }, registry);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
  const result = analyze(parsed.model, { assumptions });
  const model = result.analyses.find((r) => r.id === "model-validity");
  if (model?.id === "model-validity" && !model.valid) {
    throw new Error(JSON.stringify(model.findings));
  }
  const report = result.analyses.find((r) => r.id === "access");
  if (report?.id !== "access") throw new Error("missing report");
  return report;
}

function connectivity(report: AccessReport, intent = "x") {
  const check = report.intents
    .find((candidate) => candidate.intent === intent)
    ?.checks.find((candidate) => candidate.check === "connectivity");
  return {
    verdict: check?.verdict,
    codes: check?.evidence.map((evidence) => evidence.code) ?? [],
  };
}

/** A VPC with one subnet routed to an internet gateway, and a table outside. */
function vpc(extra: Component[] = [], subnetRoute = "igw"): Component[] {
  return [
    { id: "users", type: "core.internet" },
    { id: "vpc", type: "aws.vpc" },
    { id: "public", type: "aws.subnet", placement: ["vpc"] },
    { id: "private", type: "aws.subnet", placement: ["vpc"] },
    { id: "igw", type: "aws.internet-gateway", properties: { attachedTo: ["vpc"] } },
    { id: "nat", type: "aws.nat-gateway", placement: ["public"] },
    {
      id: "public-rt",
      type: "aws.route-table",
      properties: {
        routes: [{ destination: "internet", gateway: "igw" }],
        associations: ["public"],
      },
    },
    {
      id: "private-rt",
      type: "aws.route-table",
      properties: {
        routes: [{ destination: "internet", gateway: subnetRoute }],
        associations: ["private"],
      },
    },
    { id: "table", type: "aws.dynamodb" },
    ...extra,
  ];
}

const web = (placement: string, extra: Record<string, unknown> = {}): Component => ({
  id: "web",
  type: "aws.autoscaling-group",
  placement: [placement],
  properties: {
    endpoint: "public",
    permissions: [{ resource: "table", access: "read" }],
    ...extra,
  },
});
const sg = (rules: unknown[], attachedTo = ["web"]): Component => ({
  id: "sg",
  type: "aws.security-group",
  properties: { rules, attachedTo },
});
const allowAll = [
  { direction: "inbound", peer: "any" },
  { direction: "outbound", peer: "any" },
];

describe("network connectivity", () => {
  it("does not let traffic in through an outbound-only gateway", () => {
    const report = accessReport(vpc([web("private"), sg(allowAll)], "nat"), [
      { id: "x", from: "users", to: "web", port: "https" },
    ]);
    expect(connectivity(report)).toMatchObject({ verdict: "fail" });
    expect(connectivity(report).codes).toContain("GATEWAY_OUTBOUND_ONLY");
  });

  it("lets traffic out through a NAT gateway in a public subnet", () => {
    const report = accessReport(vpc([web("private"), sg(allowAll)], "nat"), [
      { id: "x", from: "web", to: "table", action: "read" },
    ]);
    expect(connectivity(report).verdict).toBe("pass");
    expect(connectivity(report).codes).toContain("NAT_ROUTE");
  });

  it("rejects a route to a gateway of another network", () => {
    const components = vpc([web("public"), sg(allowAll)]).map((component) =>
      component.id === "igw" ? { ...component, properties: { attachedTo: ["other"] } } : component,
    );
    components.push({ id: "other", type: "aws.vpc" });
    const report = accessReport(components, [
      { id: "x", from: "web", to: "table", action: "read" },
    ]);
    expect(connectivity(report).codes).toContain("GATEWAY_NOT_ATTACHED");
  });

  it("uses the route table associated with the VPC for subnets without their own", () => {
    const components = vpc([web("private"), sg(allowAll)])
      .map((component) =>
        component.id === "public-rt"
          ? {
              ...component,
              properties: {
                routes: [{ destination: "internet", gateway: "igw" }],
                associations: ["vpc"],
              },
            }
          : component,
      )
      .filter((component) => component.id !== "private-rt");
    const report = accessReport(components, [
      { id: "x", from: "web", to: "table", action: "read" },
    ]);
    expect(connectivity(report).verdict).toBe("pass");
  });

  it("checks stateless filters in order, including the return traffic", () => {
    const acl = (rules: unknown[]): Component => ({
      id: "acl",
      type: "aws.network-acl",
      properties: { rules, subnets: ["public"] },
    });
    const intents = [{ id: "x", from: "web", to: "table", action: "read", port: "https" }];
    const outboundOnly = accessReport(
      vpc([
        web("public"),
        sg(allowAll),
        acl([{ direction: "outbound", peer: "any", ports: ["https"] }]),
      ]),
      intents,
    );
    expect(connectivity(outboundOnly).verdict).toBe("fail");
    expect(connectivity(outboundOnly).codes).toContain("STATELESS_RETURN");

    const both = accessReport(
      vpc([
        web("public"),
        sg(allowAll),
        acl([
          { direction: "outbound", peer: "any", ports: ["https"] },
          { direction: "inbound", peer: "any" },
        ]),
      ]),
      intents,
    );
    expect(connectivity(both).verdict).toBe("pass");

    const denied = accessReport(
      vpc([
        web("public"),
        sg(allowAll),
        acl([
          { direction: "outbound", peer: "internet", effect: "deny" },
          { direction: "outbound", peer: "any" },
          { direction: "inbound", peer: "any" },
        ]),
      ]),
      intents,
    );
    expect(connectivity(denied).codes).toContain("FILTER_DENIES");
  });

  it("is undecidable when a filter limits ports and the port is unknown", () => {
    const report = accessReport(
      vpc([
        web("public"),
        {
          id: "app",
          type: "aws.autoscaling-group",
          placement: ["public"],
          properties: { endpoint: "private" },
        },
        sg([{ direction: "inbound", peer: "any", ports: ["https"] }], ["app"]),
      ]),
      [{ id: "x", from: "web", to: "app", action: "invoke" }],
    );
    expect(connectivity(report).verdict).toBe("undecidable");
    expect(report.findings.map((finding) => finding.code)).toContain("ACCESS_PORT_UNKNOWN");
  });

  it("applies security group defaults only under pack-defaults", () => {
    const components = vpc([
      web("public"),
      { id: "sg", type: "aws.security-group", properties: { attachedTo: ["web"] } },
    ]);
    const intents = [{ id: "x", from: "web", to: "table", action: "read" }];
    expect(connectivity(accessReport(components, intents, "strict")).verdict).toBe("undecidable");
    expect(connectivity(accessReport(components, intents, "pack-defaults")).verdict).toBe("pass");
  });

  it("requires every member of a group to pass", () => {
    const registry = createRegistry([
      ...officialPacks,
      testPack({
        requires: { aws: "^0.6.0" },
        vocabulary: 2,
        types: [
          {
            id: "acme.pool",
            label: "Pool",
            category: "compute",
            traits: {
              group: { members: { property: "members" } },
              endpoint: { visibility: "public" },
            },
            accepts: [{ actions: ["invoke"] }],
            properties: {
              members: { type: "array", items: { type: "string", "x-component-ref": true } },
            },
          },
        ],
      }),
    ]);
    const components: Component[] = [
      ...vpc([web("public"), { ...web("private"), id: "web-2" }, sg(allowAll, ["web", "web-2"])]),
      { id: "pool", type: "acme.pool", properties: { members: ["web", "web-2"] } },
    ];
    const report = accessReport(
      components,
      [{ id: "x", from: "users", to: "pool", action: "invoke" }],
      "strict",
      registry,
      ["acme"],
    );
    // Both members sit in subnets routed to the internet gateway.
    expect(connectivity(report).verdict).toBe("pass");
    // One member in a subnet without routes makes the whole group fail.
    const isolated = accessReport(
      components
        .map((component) =>
          component.id === "web-2" ? { ...component, placement: ["isolated"] } : component,
        )
        .concat([{ id: "isolated", type: "aws.subnet", placement: ["vpc"] }]),
      [{ id: "x", from: "users", to: "pool", action: "invoke" }],
      "strict",
      registry,
      ["acme"],
    );
    expect(connectivity(isolated).verdict).toBe("fail");
  });

  it("reports exposure per open port inside a network", () => {
    const report = accessReport(
      vpc([web("public"), sg([{ direction: "inbound", peer: "internet", ports: ["https"] }])]),
      [],
    );
    expect(report.exposure.find((fact) => fact.component === "web")).toMatchObject({
      exposure: "exposed",
      ports: ["https"],
    });
  });
});
