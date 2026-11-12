import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type AvailabilityReport,
  analyze,
  checkRequirements,
  parseSolution,
  parseTask,
} from "../src/index";
import { officialRegistry } from "./helpers/registry";

function fixture(name: string) {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/solutions/${name}.json`, import.meta.url), "utf8"),
  );
}

function run(solution: unknown) {
  const parsed = parseSolution(solution, officialRegistry);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
  return { model: parsed.model, result: analyze(parsed.model) };
}

function verdict(solution: unknown, id: string) {
  const access = run(solution).result.analyses.find((report) => report.id === "access");
  if (access?.id !== "access") throw new Error("missing report");
  return access.intents.find((candidate) => candidate.intent === id)?.verdict;
}

function findings(solution: unknown) {
  const report = run(solution).result.analyses.find(
    (r) => r.id === "availability",
  ) as AvailabilityReport;
  return report.findings.map((finding) => `${finding.code} ${finding.subjects.join(",")}`);
}

function component(solution: { components: { id: string }[] }, id: string) {
  const found = solution.components.find((candidate) => candidate.id === id);
  if (!found) throw new Error(id);
  return found as { id: string; properties: Record<string, unknown> };
}

describe("cross-provider tasks", () => {
  it("checks one web tier task against AWS, Azure and on-premises solutions", () => {
    const task = parseTask(
      {
        schemaVersion: 1,
        id: "web-tier",
        packs: ["core"],
        provided: [{ id: "users", type: "core.internet", locked: true }],
        requirements: [
          {
            id: "read",
            type: "reachable",
            from: { id: "users" },
            to: { category: "data-store" },
            action: "read",
          },
          {
            id: "private-data",
            type: "not-reachable",
            from: { id: "users" },
            to: { category: "data-store" },
          },
          { id: "entry", type: "redundant", select: { category: "edge" } },
        ],
      },
      officialRegistry,
    );
    if (!task.ok) throw new Error(JSON.stringify(task.findings));
    const verdicts = ["valid-availability", "valid-azure-network", "valid-onprem"].map((name) => {
      const { model, result } = run(fixture(name));
      return [name, checkRequirements(model, result, task.task).verdict];
    });
    expect(verdicts).toEqual([
      ["valid-availability", "pass"],
      ["valid-azure-network", "pass"],
      ["valid-onprem", "pass"],
    ]);
  });
});

describe("on-premises networks", () => {
  it("filters traffic between VLANs with the firewall's rules", () => {
    const solution = fixture("valid-onprem");
    expect(verdict(solution, "ops-db")).toBe("fail");
    component(solution, "fw").properties.rules = [
      ...(component(solution, "fw").properties.rules as unknown[]),
      { direction: "inbound", peer: "office", ports: ["postgresql"] },
    ];
    expect(verdict(solution, "ops-db")).toBe("pass");
  });

  it("publishes only public servers through the firewall", () => {
    const solution = fixture("valid-onprem");
    expect(verdict(solution, "users-lb")).toBe("pass");
    component(solution, "fw").properties.rules = [];
    expect(verdict(solution, "users-lb")).toBe("fail");
  });

  it("removes the single points of failure with a firewall pair and a replica", () => {
    const solution = fixture("valid-onprem");
    expect(findings(solution)).toEqual([
      "AVAILABILITY_SINGLE_POINT db",
      "AVAILABILITY_SINGLE_POINT fw",
    ]);
    component(solution, "fw").properties.locations = ["rack-a", "rack-b"];
    component(solution, "db").properties.locations = ["rack-a", "rack-b"];
    expect(findings(solution)).toEqual([]);
  });
});
