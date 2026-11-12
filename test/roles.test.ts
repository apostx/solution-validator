import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze, checkRequirements, collect, parseSolution, parseTask } from "../src/index";
import { officialRegistry } from "./helpers/registry";

const solution = JSON.parse(
  readFileSync(
    new URL("./fixtures/solutions/valid-serverless-orders.json", import.meta.url),
    "utf8",
  ),
);

function withRoles(roles: Record<string, string[]>) {
  const copy = structuredClone(solution);
  for (const component of copy.components) {
    if (roles[component.id]) component.roles = roles[component.id];
  }
  return copy;
}

const task = {
  schemaVersion: 1,
  id: "orders",
  packs: ["core"],
  provided: [{ id: "users", type: "core.internet", locked: true }],
  roles: [
    { id: "entry", label: "API entry point" },
    { id: "orders-store", description: "Where orders are kept." },
    { id: "uploads" },
    { id: "audit-log" },
  ],
  requirements: [
    {
      id: "write",
      type: "reachable",
      from: { id: "users" },
      to: { role: "orders-store" },
      action: "write",
    },
    { id: "private", type: "not-reachable", from: { id: "users" }, to: { role: "uploads" } },
    { id: "entry", type: "uses", select: { role: "entry", category: "edge" } },
    { id: "audit", type: "uses", select: { role: "audit-log" } },
  ],
};

describe("role tags", () => {
  it("selects the components the solver tagged", () => {
    const parsedTask = parseTask(task, officialRegistry);
    if (!parsedTask.ok) throw new Error(JSON.stringify(parsedTask.findings));
    const parsed = parseSolution(
      withRoles({ api: ["entry"], "orders-table": ["orders-store"], uploads: ["uploads"] }),
      officialRegistry,
    );
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
    const result = checkRequirements(parsed.model, analyze(parsed.model), parsedTask.task);
    expect(result.requirements.map((r) => [r.requirement, r.verdict])).toEqual([
      ["write", "pass"],
      ["private", "pass"],
      ["entry", "pass"],
      ["audit", "fail"],
    ]);
    expect(result.findings.map((f) => f.code)).toContain("TASK_ROLE_UNASSIGNED");
    // A role nobody carries yet does not make "not reachable" vacuously true.
    const untagged = parseSolution(
      withRoles({ "orders-table": ["orders-store"] }),
      officialRegistry,
    );
    if (!untagged.ok) throw new Error("solution");
    const open = checkRequirements(untagged.model, analyze(untagged.model), parsedTask.task);
    expect(open.requirements.find((r) => r.requirement === "private")?.verdict).toBe("undecidable");
    expect(result.requirements[3]?.evidence.map((e) => e.message)).toEqual([
      "0 component(s) match role audit-log; at least 1 required.",
    ]);
  });

  it("does not match a role on the wrong kind of component", () => {
    const parsedTask = parseTask(task, officialRegistry);
    if (!parsedTask.ok) throw new Error("task");
    const parsed = parseSolution(withRoles({ "orders-fn": ["entry"] }), officialRegistry);
    if (!parsed.ok) throw new Error("solution");
    const result = checkRequirements(parsed.model, analyze(parsed.model), parsedTask.task);
    expect(result.requirements.find((r) => r.requirement === "entry")?.verdict).toBe("fail");
  });

  it("checks role selectors and declarations", () => {
    const undeclared = parseTask(
      {
        ...task,
        roles: [{ id: "entry" }, { id: "entry" }],
        requirements: [{ id: "x", type: "uses", select: { role: "missing" } }],
      },
      officialRegistry,
    );
    expect(undeclared.ok).toBe(false);
    expect(undeclared.findings.map((f) => f.code).sort()).toEqual([
      "TASK_ROLE_DUPLICATE",
      "TASK_ROLE_UNKNOWN",
    ]);
  });

  it("validates role tags on components", () => {
    const invalid = parseSolution(withRoles({ api: ["Entry", "entry"] }), officialRegistry);
    expect(invalid.ok).toBe(false);
    const duplicate = parseSolution(withRoles({ api: ["entry", "entry"] }), officialRegistry);
    expect(duplicate.ok).toBe(false);
  });

  it("returns roles with the collected facts", () => {
    const parsed = parseSolution(withRoles({ api: ["entry"] }), officialRegistry);
    if (!parsed.ok) throw new Error("solution");
    const facts = collect(parsed.model);
    expect(facts.components.find((c) => c.id === "api")?.roles).toEqual(["entry"]);
    expect(facts.components.find((c) => c.id === "uploads")).not.toHaveProperty("roles");
  });
});
