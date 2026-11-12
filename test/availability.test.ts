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
import { officialRegistry } from "./helpers/registry";

const base = JSON.parse(
  readFileSync(new URL("./fixtures/solutions/valid-availability.json", import.meta.url), "utf8"),
);

function run(solution: unknown, assumptions: AssumptionPolicy = "strict") {
  const parsed = parseSolution(solution, officialRegistry);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
  const result = analyze(parsed.model, { assumptions });
  const report = result.analyses.find((r) => r.id === "availability") as AvailabilityReport;
  return { parsed, result, report };
}

const fact = (report: AvailabilityReport, id: string) =>
  report.components.find((candidate) => candidate.component === id);

describe("availability", () => {
  it("counts a Multi-AZ database as redundant", () => {
    const solution = structuredClone(base);
    const db = solution.components.find((c: { id: string }) => c.id === "db");
    db.properties.multiAz = true;
    const { report } = run(solution);
    expect(fact(report, "db")).toMatchObject({
      availability: "redundant",
      domains: ["eu-west-1a", "eu-west-1b"],
    });
    expect(report.findings.map((f) => f.subjects[0])).not.toContain("db");
  });

  it("is undecidable when a zone has no failure domain", () => {
    const solution = structuredClone(base);
    const subnet = solution.components.find((c: { id: string }) => c.id === "private-b");
    delete subnet.properties;
    const { report } = run(solution);
    expect(fact(report, "app")?.availability).toBe("undecidable");
  });

  it("does not flag a NAT gateway per availability zone", () => {
    const solution = structuredClone(base);
    solution.components.push({ id: "nat-b", type: "aws.nat-gateway", placement: ["public-b"] });
    const rt = solution.components.find((c: { id: string }) => c.id === "private-rt");
    rt.properties.associations = ["private-a"];
    solution.components.push({
      id: "private-rt-b",
      type: "aws.route-table",
      properties: {
        routes: [{ destination: "internet", gateway: "nat-b" }],
        associations: ["private-b"],
      },
    });
    const { report } = run(solution);
    expect(report.findings.map((f) => f.code)).not.toContain("AVAILABILITY_CROSS_DOMAIN");
  });

  it("checks redundant requirements", () => {
    const task = parseTask(
      {
        schemaVersion: 1,
        id: "ha",
        packs: ["core", "aws"],
        requirements: [
          { id: "compute", type: "redundant", select: { category: "compute" } },
          { id: "data", type: "redundant", select: { type: "aws.dynamodb" } },
          { id: "databases", type: "redundant", select: { type: "aws.rds" } },
        ],
      },
      officialRegistry,
    );
    if (!task.ok) throw new Error(JSON.stringify(task.findings));
    const { parsed, result } = run(base);
    if (!parsed.ok) throw new Error("fixture");
    const requirements = checkRequirements(parsed.model, result, task.task);
    expect(requirements.requirements.map((r) => [r.requirement, r.verdict])).toEqual([
      ["compute", "fail"],
      ["data", "pass"],
      ["databases", "fail"],
    ]);
    expect(requirements.requirements[0]?.evidence.map((e) => e.message)).toContain(
      "bastion runs in a single failure domain.",
    );
  });
});
