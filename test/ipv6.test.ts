import { describe, expect, it } from "vitest";
import {
  type AccessReport,
  type AddressPlanReport,
  type AnalysisLevel,
  analyze,
  type Component,
  type Intent,
  parseSolution,
} from "../src/index";
import { containsPublic, formatAddress, parseCidr } from "../src/util/ip";
import { officialRegistry } from "./helpers/registry";

describe("IPv6 ranges", () => {
  it("parses CIDR notation", () => {
    expect(parseCidr("2001:db8::/32")).toMatchObject({ family: 6, prefix: 32, network: true });
    expect(parseCidr("::/0")).toMatchObject({ family: 6, prefix: 0 });
    expect(parseCidr("fe80::1/64")).toMatchObject({ network: false });
    expect(parseCidr("1:2:3:4:5:6:7:8/128")).toMatchObject({ prefix: 128 });
    for (const text of [
      "2001:db8:::/32",
      "2001:db8::/129",
      "1:2:3:4:5:6:7:8:9/64",
      "1:2:3:4:5:6:7/64",
      "g::/8",
      "2001:db8::1::/64",
      "2001:db8::/064",
    ]) {
      expect([text, parseCidr(text)]).toEqual([text, undefined]);
    }
  });

  it("formats addresses canonically", () => {
    const format = (text: string) => {
      const cidr = parseCidr(text);
      if (!cidr) throw new Error(text);
      return formatAddress(cidr.family, cidr.start);
    };
    expect(format("2001:0db8:0000:0000:0000:0000:0000:0001/128")).toBe("2001:db8::1");
    expect(format("::/128")).toBe("::");
    expect(format("2001:db8:0:1:0:0:0:1/128")).toBe("2001:db8:0:1::1");
    expect(format("1:0:0:2:0:0:0:3/128")).toBe("1:0:0:2::3");
    expect(format("1:0:2:3:4:5:6:7/128")).toBe("1:0:2:3:4:5:6:7");
    expect(format("10.0.1.0/24")).toBe("10.0.1.0");
  });

  it("tells public from private ranges", () => {
    const check = (text: string) => containsPublic(parseCidr(text) as never);
    expect(check("fd00::/8")).toBe(false);
    expect(check("fe80::/10")).toBe(false);
    expect(check("2600::/16")).toBe(true);
    expect(check("::/0")).toBe(true);
  });
});

const base = (vpc: Record<string, unknown>, extra: Component[]): Component[] => [
  { id: "users", type: "core.internet" },
  { id: "vpc", type: "aws.vpc", properties: { cidrBlock: "10.0.0.0/16", ...vpc } },
  {
    id: "public",
    type: "aws.subnet",
    placement: ["vpc"],
    properties: { cidrBlock: "10.0.1.0/24", ipv6CidrBlock: "2600:1f18:1234:5601::/64" },
  },
  {
    id: "private",
    type: "aws.subnet",
    placement: ["vpc"],
    properties: { cidrBlock: "10.0.2.0/24", ipv6CidrBlock: "2600:1f18:1234:5602::/64" },
  },
  { id: "igw", type: "aws.internet-gateway", properties: { attachedTo: ["vpc"] } },
  { id: "eigw", type: "aws.egress-only-internet-gateway", properties: { attachedTo: ["vpc"] } },
  { id: "nat", type: "aws.nat-gateway", placement: ["public"] },
  {
    id: "public-rt",
    type: "aws.route-table",
    properties: { routes: [{ destination: "internet", gateway: "igw" }], associations: ["public"] },
  },
  { id: "bucket", type: "aws.s3" },
  ...extra,
];
const dualStack = (extra: Component[]) =>
  base({ ipv6CidrBlock: "2600:1f18:1234:5600::/56" }, extra);
const privateRoutes = (routes: { destination: string; gateway: string }[]): Component => ({
  id: "private-rt",
  type: "aws.route-table",
  properties: { routes, associations: ["private"] },
});
const worker: Component = {
  id: "worker",
  type: "aws.ec2",
  placement: ["private"],
  properties: { endpoint: "private", permissions: [{ resource: "bucket", access: "read" }] },
};
const workerSg = (peer: string): Component => ({
  id: "sg",
  type: "aws.security-group",
  properties: { rules: [{ direction: "outbound", peer }], attachedTo: ["worker"] },
});
const toBucket: Intent[] = [{ id: "x", from: "worker", to: "bucket", action: "read" }];

function run(components: Component[], intents: Intent[], level: AnalysisLevel = "detailed") {
  const parsed = parseSolution(
    { schemaVersion: 1, packs: ["core", "aws"], components, intents },
    officialRegistry,
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
  const result = analyze(parsed.model, { level });
  const access = result.analyses.find((r) => r.id === "access") as AccessReport;
  const plan = result.analyses.find((r) => r.id === "address-plan") as AddressPlanReport;
  const check = access.intents[0]?.checks.find((c) => c.check === "connectivity");
  return {
    verdict: check?.verdict,
    codes: check?.evidence.map((e) => e.code) ?? [],
    plan: plan?.findings.map((f) => f.code) ?? [],
    zones: plan?.zones ?? [],
  };
}

describe("IPv6 address plans", () => {
  it("checks IPv6 address spaces like IPv4 ones", () => {
    expect(run(dualStack([]), []).plan).toEqual([]);
    expect(run(dualStack([]), []).zones.find((z) => z.zone === "public")).toMatchObject({
      space: "10.0.1.0/24",
      ipv6Space: "2600:1f18:1234:5601::/64",
    });
    expect(run(base({}, []), []).plan).toEqual([
      "IPV6_SPACE_WITHOUT_PARENT",
      "IPV6_SPACE_WITHOUT_PARENT",
    ]);
    const outside = run(base({ ipv6CidrBlock: "2600:1f18:9999:5600::/56" }, []), []);
    expect(outside.plan).toEqual(["ADDRESS_SPACE_OUTSIDE_PARENT", "ADDRESS_SPACE_OUTSIDE_PARENT"]);
    const invalid = run(base({ ipv6CidrBlock: "10.0.0.0/16" }, []), []);
    expect(invalid.plan).toContain("IPV6_SPACE_INVALID");
    const hostBits = run(base({ ipv6CidrBlock: "2600:1f18:1234:5600::1/56" }, []), []);
    expect(hostBits.plan).toContain("ADDRESS_SPACE_HOST_BITS");
  });
});

describe("IPv6 access", () => {
  it("reaches the internet over IPv6 through an egress-only internet gateway", () => {
    const components = dualStack([
      worker,
      workerSg("any"),
      privateRoutes([{ destination: "::/0", gateway: "eigw" }]),
    ]);
    const detailed = run(components, toBucket);
    expect(detailed.verdict).toBe("pass");
    expect(detailed.codes).toEqual(expect.arrayContaining(["ADDRESS_FAMILY", "NAT_ROUTE"]));
    // The logical level checks IPv4 only, and there is no IPv4 internet route.
    expect(run(components, toBucket, "logical").verdict).toBe("fail");
  });

  it("does not send IPv6 traffic through a NAT gateway", () => {
    const components = dualStack([
      worker,
      workerSg("::/0"),
      privateRoutes([{ destination: "internet", gateway: "nat" }]),
    ]);
    const result = run(components, toBucket);
    expect(result.verdict).toBe("fail");
    expect(result.codes).toContain("GATEWAY_FAMILY_UNSUPPORTED");
  });

  it("matches rule ranges only with traffic of their family", () => {
    const web: Component = {
      id: "web",
      type: "aws.ec2",
      placement: ["public"],
      properties: { endpoint: "public" },
    };
    const sg = (peer: string): Component => ({
      id: "sg",
      type: "aws.security-group",
      properties: {
        rules: [{ direction: "inbound", peer, ports: ["https"] }],
        attachedTo: ["web"],
      },
    });
    const intents: Intent[] = [{ id: "x", from: "users", to: "web", port: "https" }];
    expect(run(dualStack([web, sg("::/0")]), intents).verdict).toBe("pass");
    // Without IPv6 addresses, an IPv6 rule admits nothing.
    const ipv4Only = base({}, [web, sg("::/0")]).map((component) =>
      component.type === "aws.subnet"
        ? { ...component, properties: { cidrBlock: component.properties?.cidrBlock } }
        : component,
    );
    expect(run(ipv4Only, intents).verdict).toBe("fail");
  });

  it("does not let inbound IPv6 traffic through an egress-only internet gateway", () => {
    const app: Component = {
      id: "app",
      type: "aws.ec2",
      placement: ["private"],
      properties: { endpoint: "public" },
    };
    const components = dualStack([
      app,
      {
        id: "sg",
        type: "aws.security-group",
        properties: { rules: [{ direction: "inbound", peer: "any" }], attachedTo: ["app"] },
      },
      privateRoutes([{ destination: "::/0", gateway: "eigw" }]),
    ]);
    const result = run(components, [{ id: "x", from: "users", to: "app", port: "https" }]);
    expect(result.verdict).toBe("fail");
    expect(result.codes).toContain("GATEWAY_OUTBOUND_ONLY");
  });
});
