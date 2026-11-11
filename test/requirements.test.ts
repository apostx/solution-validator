import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type AssumptionPolicy,
  analyze,
  checkRequirements,
  collect,
  parseSolution,
  parseTask,
  type RequirementsResult,
  type Task,
} from "../src/index";
import { toGolden } from "./helpers/golden";
import { officialRegistry } from "./helpers/registry";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const ordersSolution = JSON.parse(read("./fixtures/solutions/valid-serverless-orders.json"));
const ordersTask = parseTask(read("./fixtures/tasks/orders-api.json"), officialRegistry);
if (!ordersTask.ok) throw new Error(JSON.stringify(ordersTask.findings));

function check(
  solution: unknown,
  task: Task = ordersTask.ok ? ordersTask.task : (undefined as never),
  assumptions: AssumptionPolicy = "strict",
): RequirementsResult {
  const parsed = parseSolution(solution, officialRegistry);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
  return checkRequirements(parsed.model, analyze(parsed.model, { assumptions }), task);
}

function verdicts(result: RequirementsResult): Record<string, string> {
  return Object.fromEntries(result.requirements.map((r) => [r.requirement, r.verdict]));
}

describe("requirements on the orders task", () => {
  it("matches the golden result", async () => {
    await expect(toGolden(check(ordersSolution))).toMatchFileSnapshot(
      "./fixtures/expected/requirements-orders-api.json",
    );
  });

  it("passes for the design example", () => {
    const result = check(ordersSolution);
    expect(verdicts(result)).toEqual({ r1: "pass", r2: "pass", r3: "pass" });
    expect(result.verdict).toBe("pass");
    expect(result.requirements[0]?.evidence[0]?.message).toBe(
      "Reachable: users → api (i1) → orders-fn (i2) → orders-table (i3).",
    );
    expect(result.requirements[0]?.meta).toEqual({ points: 3 });
    expect(result.meta).toEqual({ difficulty: "easy" });
  });

  it("fails r2 when the bucket allows public access", () => {
    const solution = structuredClone(ordersSolution);
    solution.components[4].properties.publicAccess = true;
    const result = check(solution);
    expect(verdicts(result).r2).toBe("fail");
    expect(result.requirements[1]?.evidence.map((e) => e.message)).toEqual([
      "uploads is directly accessible from users (read).",
    ]);
    expect(result.verdict).toBe("fail");
  });

  it("is undecidable when a needed setting is unset under strict", () => {
    const solution = structuredClone(ordersSolution);
    delete solution.components[4].properties;
    expect(verdicts(check(solution, undefined, "strict")).r2).toBe("undecidable");
    expect(verdicts(check(solution, undefined, "pack-defaults")).r2).toBe("pass");
  });

  it("fails r1 without a chain to a data store, and is undecidable with an undecidable hop", () => {
    const broken = structuredClone(ordersSolution);
    broken.components[2].properties.permissions = [];
    expect(verdicts(check(broken)).r1).toBe("fail");

    const unknown = structuredClone(ordersSolution);
    delete unknown.components[2].properties;
    const result = check(unknown);
    expect(verdicts(result).r1).toBe("undecidable");
    expect(result.requirements[0]?.evidence[0]?.code).toBe("PATH_UNDECIDABLE");
  });

  it("fails r3 without a Lambda function and reports a missing provided component", () => {
    const solution = structuredClone(ordersSolution);
    solution.components = solution.components.filter(
      (component: { id: string }) => component.id !== "orders-fn" && component.id !== "users",
    );
    solution.intents = [];
    const result = check(solution);
    expect(verdicts(result)).toEqual({ r1: "fail", r2: "undecidable", r3: "fail" });
    expect(result.findings.map((finding) => finding.code)).toContain("TASK_PROVIDED_MISSING");
  });

  it("is undecidable for reachability without an access analysis", () => {
    const parsed = parseSolution(ordersSolution, officialRegistry);
    if (!parsed.ok || !ordersTask.ok) throw new Error("fixture");
    const analysis = analyze(parsed.model, { analyses: ["model-validity"] });
    const result = checkRequirements(parsed.model, analysis, ordersTask.task);
    expect(result.requirements[0]?.evidence[0]?.code).toBe("ANALYSIS_MISSING");
  });
});

describe("parseTask", () => {
  it("rejects selectors by id that the task does not provide", () => {
    const result = parseTask(
      {
        schemaVersion: 1,
        id: "t",
        packs: ["core", "aws"],
        requirements: [{ id: "r", type: "uses", select: { id: "orders-fn" } }],
      },
      officialRegistry,
    );
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(["TASK_SELECTOR_NOT_PROVIDED"]);
  });

  it("rejects unknown packs, types, categories, traits, actions and duplicates", () => {
    const result = parseTask(
      {
        schemaVersion: 1,
        id: "t",
        packs: ["core", "gcp"],
        provided: [{ id: "users", type: "aws.lambda" }],
        requirements: [
          {
            id: "users",
            type: "reachable",
            from: { category: "nope" },
            to: { trait: "magic" },
            action: "fly",
          },
        ],
      },
      officialRegistry,
    );
    expect(result.findings.map((finding) => finding.code).sort()).toEqual([
      "TASK_ID_DUPLICATE",
      "TASK_PACK_UNKNOWN",
      "TASK_REFERENCE_UNKNOWN",
      "TASK_REFERENCE_UNKNOWN",
      "TASK_REFERENCE_UNKNOWN",
      "TASK_REFERENCE_UNKNOWN",
    ]);
  });

  it("reports schema problems without throwing", () => {
    const result = parseTask(
      { schemaVersion: 1, id: "t", packs: [], requirements: [{ id: "r", type: "maybe" }] },
      officialRegistry,
    );
    expect(result.ok).toBe(false);
    expect(parseTask("{", officialRegistry).findings[0]?.code).toBe("JSON_INVALID");
  });
});

describe("collect", () => {
  it("matches the golden facts", async () => {
    const parsed = parseSolution(ordersSolution, officialRegistry);
    if (!parsed.ok) throw new Error("fixture");
    await expect(toGolden(collect(parsed.model, analyze(parsed.model)))).toMatchFileSnapshot(
      "./fixtures/expected/collect-serverless-orders.json",
    );
  });

  it("merges type and instance meta and counts without an analysis", () => {
    const parsed = parseSolution(ordersSolution, officialRegistry);
    if (!parsed.ok) throw new Error("fixture");
    const facts = collect(parsed.model);
    const fn = facts.components.find((component) => component.id === "orders-fn");
    expect(fn).toMatchObject({
      category: "compute",
      meta: { points: 2 },
      incoming: 1,
      outgoing: 2,
    });
    expect(fn?.exposure).toBeUndefined();
    expect(facts.totals).toEqual({
      components: 5,
      intents: 4,
      byType: {
        "aws.api-gateway": 1,
        "aws.dynamodb": 1,
        "aws.lambda": 1,
        "aws.s3": 1,
        "core.internet": 1,
      },
      byCategory: { compute: 1, "data-store": 2, edge: 1, external: 1 },
    });
  });
});
