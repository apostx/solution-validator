import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type AssumptionPolicy,
  type AvailabilityReport,
  analyze,
  checkRequirements,
  parseSolution,
  parseTask,
} from "../src/index";
import { officialPacks, officialRegistry, registryErrorCodes, testPack } from "./helpers/registry";

function fixture(name: string) {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/solutions/${name}.json`, import.meta.url), "utf8"),
  );
}

function run(solution: unknown, assumptions: AssumptionPolicy = "strict") {
  const parsed = parseSolution(solution, officialRegistry);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
  return { model: parsed.model, result: analyze(parsed.model, { assumptions }) };
}

function intent(solution: unknown, id: string) {
  const { result } = run(solution);
  const access = result.analyses.find((report) => report.id === "access");
  if (access?.id !== "access") throw new Error("missing report");
  const verdict = access.intents.find((candidate) => candidate.intent === id);
  return {
    verdict: verdict?.verdict,
    codes: verdict?.checks.flatMap((check) => check.evidence.map((evidence) => evidence.code)),
  };
}

function availability(solution: unknown, assumptions: AssumptionPolicy = "strict") {
  const { result } = run(solution, assumptions);
  const report = result.analyses.find((r) => r.id === "availability") as AvailabilityReport;
  return Object.fromEntries(report.components.map((fact) => [fact.component, fact]));
}

function component(solution: { components: { id: string }[] }, id: string) {
  const found = solution.components.find((candidate) => candidate.id === id);
  if (!found) throw new Error(id);
  return found as { id: string; properties: Record<string, unknown> };
}

describe("cross-provider tasks", () => {
  it("checks one provider-neutral task against AWS and Azure solutions", () => {
    const task = parseTask(
      {
        schemaVersion: 1,
        id: "orders",
        packs: ["core"],
        provided: [{ id: "users", type: "core.internet", locked: true }],
        requirements: [
          {
            id: "write",
            type: "reachable",
            from: { id: "users" },
            to: { category: "data-store" },
            action: "write",
          },
          {
            id: "private-data",
            type: "not-reachable",
            from: { id: "users" },
            to: { category: "data-store" },
          },
          { id: "compute", type: "uses", select: { category: "compute" } },
          { id: "entry", type: "uses", select: { category: "edge" } },
        ],
      },
      officialRegistry,
    );
    if (!task.ok) throw new Error(JSON.stringify(task.findings));
    for (const name of ["valid-serverless-orders", "valid-azure-serverless"]) {
      const { model, result } = run(fixture(name));
      const requirements = checkRequirements(model, result, task.task);
      expect([name, requirements.verdict]).toEqual([name, "pass"]);
    }
  });
});

describe("azure networking", () => {
  it("gives a subnet outbound access through its NAT gateway, without a route", () => {
    const solution = fixture("valid-azure-network");
    expect(intent(solution, "web-orders")).toMatchObject({ verdict: "pass" });
    expect(intent(solution, "web-orders").codes).toContain("NAT_ROUTE");
    solution.components = solution.components.filter((c: { id: string }) => c.id !== "nat");
    expect(intent(solution, "web-orders").codes).toContain("NO_PUBLIC_ADDRESS");
    expect(intent(solution, "web-orders").verdict).toBe("fail");
  });

  it("lets components with a public IP address reach the internet directly", () => {
    const solution = fixture("valid-azure-network");
    component(solution, "batch").properties.endpoint = "public";
    expect(intent(solution, "batch-orders")).toMatchObject({ verdict: "pass" });
    expect(intent(solution, "batch-orders").codes).toContain("DIRECT_INTERNET");
  });

  it("applies the base rules of network security groups after their own rules", () => {
    const solution = fixture("valid-azure-network");
    expect(intent(solution, "jump-web").codes).toContain("FILTER_DENIES");
    component(solution, "web-nsg").properties.rules = [];
    expect(intent(solution, "jump-web")).toMatchObject({ verdict: "pass" });
    expect(intent(solution, "jump-web").codes).toContain("FILTER_BASE_ALLOWS");
    component(solution, "ops-nsg").properties.rules = [];
    expect(intent(solution, "users-jump")).toMatchObject({ verdict: "fail" });
    expect(intent(solution, "users-jump").codes).toContain("FILTER_DEFAULT_DENIES");
  });

  it("rejects base rules whose peer is not a keyword or an address range", () => {
    const filter = (peer: string) =>
      testPack({
        vocabulary: 5,
        types: [
          {
            id: "acme.firewall",
            label: "Firewall",
            category: "network",
            traits: {
              "traffic-filter": {
                stateful: true,
                attachTo: ["zone"],
                baseRules: [{ direction: "inbound", peer }],
              },
            },
          },
        ],
      });
    expect(registryErrorCodes([...officialPacks, filter("acme.box")])).toEqual([
      "PACK_REFERENCE_UNKNOWN",
    ]);
    expect(registryErrorCodes([...officialPacks, filter("network")])).toEqual([]);
    expect(registryErrorCodes([...officialPacks, filter("10.0.0.0/8")])).toEqual([]);
  });
});

describe("azure availability", () => {
  it("reads failure domains from components", () => {
    const facts = availability(fixture("valid-azure-network"));
    expect(facts.web).toMatchObject({ availability: "redundant", domains: ["1", "2", "3"] });
    expect(facts.jump).toMatchObject({ availability: "single", domains: ["1"] });
    expect(facts.batch?.availability).toBe("single");
    expect(facts.batch?.evidence.map((e) => e.code)).toContain("NO_FAILURE_DOMAIN");
  });

  it("is undecidable when a component's zones are unset under strict", () => {
    const solution = fixture("valid-azure-network");
    delete component(solution, "web").properties.zones;
    expect(availability(solution).web?.availability).toBe("undecidable");
    expect(availability(solution, "pack-defaults").web?.availability).toBe("single");
  });

  it("follows zone redundancy settings of managed services", () => {
    const facts = availability(fixture("valid-azure-serverless"));
    expect(facts["orders-db"]?.availability).toBe("managed");
    expect(facts.uploads?.availability).toBe("single");
    expect(facts.uploads?.evidence.map((e) => e.code)).toContain("NOT_MANAGED");
    expect(facts["public-fn"]?.availability).toBe("undecidable");
  });
});
