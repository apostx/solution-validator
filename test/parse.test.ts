import { describe, expect, it } from "vitest";
import { analyze, parseSolution } from "../src/index";
import { officialRegistry } from "./helpers/registry";

const minimal = { schemaVersion: 1, packs: ["core"], components: [] };

describe("parseSolution", () => {
  it("accepts an object or JSON text", () => {
    expect(parseSolution(minimal, officialRegistry).ok).toBe(true);
    expect(parseSolution(JSON.stringify(minimal), officialRegistry).ok).toBe(true);
  });

  it("reports text that is not JSON without throwing", () => {
    const result = parseSolution("{ nope", officialRegistry);
    expect(result).toEqual({
      ok: false,
      findings: [
        {
          code: "JSON_INVALID",
          severity: "error",
          subjects: [],
          params: {},
          message: "The input is not valid JSON.",
        },
      ],
    });
  });

  it.each([null, 42, "[]", []])("reports a non-object input (%j)", (input) => {
    const result = parseSolution(input, officialRegistry);
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.code).toBe("SCHEMA_TYPE");
  });

  it("copies the input", () => {
    const input = structuredClone({
      ...minimal,
      components: [{ id: "users", type: "core.internet" }],
    });
    const result = parseSolution(input, officialRegistry);
    const [first] = input.components;
    if (first) first.id = "changed";
    expect(result.ok && result.model.getComponent("users")).toBeTruthy();
  });

  it("indexes components and intents by their first occurrence", () => {
    const result = parseSolution(
      {
        ...minimal,
        components: [
          { id: "a", type: "core.internet", label: "first" },
          { id: "a", type: "core.internet", label: "second" },
        ],
        intents: [{ id: "i", from: "a", to: "a", action: "connect" }],
      },
      officialRegistry,
    );
    if (!result.ok) throw new Error("expected a model");
    expect(result.model.getComponent("a")?.label).toBe("first");
    expect(result.model.getIntent("i")?.action).toBe("connect");
    expect(result.model.packs).toEqual(["core"]);
  });

  it("resolves only types from the packs the solution uses", () => {
    const result = parseSolution(
      { ...minimal, components: [{ id: "fn", type: "aws.lambda" }] },
      officialRegistry,
    );
    if (!result.ok) throw new Error("expected a model");
    const [component] = result.model.components;
    expect(component && result.model.getType(component)).toBeUndefined();
    const findings = analyze(result.model).analyses[0]?.findings ?? [];
    expect(findings.map((finding) => finding.code)).toEqual(["TYPE_PACK_NOT_LISTED"]);
  });
});

describe("analyze", () => {
  const parsed = parseSolution(minimal, officialRegistry);
  if (!parsed.ok) throw new Error("expected a model");

  it("records the library, packs and options", () => {
    const result = analyze(parsed.model);
    expect(result.library.name).toBe("solution-validator");
    expect(result.packs).toEqual([{ id: "core", version: "0.2.0" }]);
    expect(result.options).toEqual({
      level: "logical",
      analyses: ["model-validity", "connection-validity", "access"],
      assumptions: "strict",
    });
  });

  it("rejects unknown analyses and unsupported levels", () => {
    expect(() => analyze(parsed.model, { analyses: ["nope" as "model-validity"] })).toThrow(
      TypeError,
    );
    expect(() => analyze(parsed.model, { level: "exact" as "logical" })).toThrow(TypeError);
    expect(() => analyze(parsed.model, { level: "logical", analyses: ["address-plan"] })).toThrow(
      TypeError,
    );
    expect(() => analyze(parsed.model, { assumptions: "lenient" as "strict" })).toThrow(TypeError);
  });

  it("adds the analyses a requested analysis needs", () => {
    expect(analyze(parsed.model, { analyses: ["access"] }).options.analyses).toEqual([
      "connection-validity",
      "access",
    ]);
    expect(analyze(parsed.model, { level: "detailed" }).options.analyses).toEqual([
      "model-validity",
      "connection-validity",
      "access",
      "address-plan",
    ]);
  });
});
