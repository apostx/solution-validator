import type { TSchema } from "typebox";
import { Settings } from "typebox/system";
import { Value } from "typebox/value";
import { createFinding, type Finding } from "../messages/finding";
import { displayPointer } from "../util/json";

/** The maximum number of schema errors collected for one value. */
const MAX_ERRORS = 100;

/** A schema violation, independent of how it is reported. */
export type SchemaIssue =
  | { kind: "required"; path: string; field: string }
  | { kind: "unknown-field"; path: string; field: string }
  | { kind: "type"; path: string; expected: string }
  | { kind: "enum"; path: string; allowed: string }
  | { kind: "form"; path: string }
  | { kind: "constraint"; path: string; constraint: string; limit: string };

interface RawError {
  keyword: string;
  schemaPath: string;
  instancePath: string;
  params: Record<string, unknown>;
}

/** Validates a value against a JSON Schema and returns its issues; none when it is valid. */
export function validateSchema(schema: unknown, value: unknown): SchemaIssue[] {
  const previous = Settings.Get().maxErrors;
  Settings.Set({ maxErrors: MAX_ERRORS });
  try {
    if (Value.Check(schema as TSchema, value)) return [];
    const errors = Value.Errors(schema as TSchema, value) as unknown as RawError[];
    return toIssues(errors);
  } finally {
    Settings.Set({ maxErrors: previous });
  }
}

/** Converts schema issues into findings. `prefix` is the JSON Pointer of the validated value. */
export function issuesToFindings(
  issues: readonly SchemaIssue[],
  subjects: readonly string[],
  prefix = "",
): Finding[] {
  return issues.map((issue) => {
    const path = displayPointer(prefix + issue.path);
    switch (issue.kind) {
      case "required":
        return createFinding("SCHEMA_REQUIRED", subjects, { path, field: issue.field });
      case "unknown-field":
        return createFinding("SCHEMA_UNKNOWN_FIELD", subjects, { path, field: issue.field });
      case "type":
        return createFinding("SCHEMA_TYPE", subjects, { path, expected: issue.expected });
      case "enum":
        return createFinding("SCHEMA_ENUM", subjects, { path, allowed: issue.allowed });
      case "form":
        return createFinding("SCHEMA_FORM", subjects, { path });
      default:
        return createFinding("SCHEMA_CONSTRAINT", subjects, {
          path,
          constraint: issue.constraint,
          limit: issue.limit,
        });
    }
  });
}

function toIssues(errors: readonly RawError[]): SchemaIssue[] {
  const dropped = new Set<RawError>();
  const extra: SchemaIssue[] = [];

  // A failed union reports one error per alternative. Keep the alternatives that matched the
  // value's shape and failed deeper inside it; otherwise summarize the union in one issue.
  const unions = errors
    .filter((error) => error.keyword === "anyOf")
    .sort((a, b) => a.schemaPath.length - b.schemaPath.length);
  for (const union of unions) {
    if (dropped.has(union)) continue;
    dropped.add(union);
    const prefix = `${union.schemaPath}/anyOf/`;
    const alternatives = errors.filter((error) => error.schemaPath.startsWith(prefix));
    const deeper = alternatives.filter(
      (error) =>
        error.keyword !== "boolean" && error.instancePath.startsWith(`${union.instancePath}/`),
    );
    if (deeper.length > 0) {
      // Several alternatives may match the shape; the ones with the fewest errors match best. A
      // mismatched constant, such as a discriminating `type` field, weighs more than others.
      const counts = new Map<string, number>();
      for (const error of alternatives) {
        const index = alternativeIndex(error, prefix);
        const weight = error.keyword === "const" ? 10 : 1;
        counts.set(index, (counts.get(index) ?? 0) + weight);
      }
      const candidates = new Set(deeper.map((error) => alternativeIndex(error, prefix)));
      const fewest = Math.min(...[...candidates].map((index) => counts.get(index) ?? 0));
      const kept = new Set([...candidates].filter((index) => counts.get(index) === fewest));
      for (const error of alternatives) {
        if (!kept.has(alternativeIndex(error, prefix))) dropped.add(error);
      }
      continue;
    }
    for (const error of alternatives) dropped.add(error);
    const sameLevel = alternatives.filter((error) => error.instancePath === union.instancePath);
    const onlyLiterals =
      sameLevel.length > 0 &&
      sameLevel.every((error) => error.keyword === "enum" || error.keyword === "const");
    if (onlyLiterals) {
      const literals = sameLevel.flatMap(allowedValues);
      extra.push({ kind: "enum", path: union.instancePath, allowed: formatValues(literals) });
    } else {
      extra.push({ kind: "form", path: union.instancePath });
    }
  }

  const issues: SchemaIssue[] = [];
  for (const error of errors) {
    if (dropped.has(error) || error.keyword === "boolean") continue;
    issues.push(...errorToIssues(error));
  }
  issues.push(...extra);
  return dedupe(issues);
}

function alternativeIndex(error: RawError, prefix: string): string {
  return error.schemaPath.slice(prefix.length).split("/")[0] ?? "";
}

function allowedValues(error: RawError): unknown[] {
  if (error.keyword === "const") return [error.params.allowedValue];
  if (error.keyword === "enum" && Array.isArray(error.params.allowedValues)) {
    return error.params.allowedValues;
  }
  return [];
}

function formatValues(values: readonly unknown[]): string {
  return [...new Set(values.map(formatValue))].join(", ");
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function errorToIssues(error: RawError): SchemaIssue[] {
  const path = error.instancePath;
  const params = error.params;
  switch (error.keyword) {
    case "required":
      return stringList(params.requiredProperties).map((field) => ({
        kind: "required",
        path,
        field,
      }));
    case "additionalProperties":
      return stringList(params.additionalProperties).map((field) => ({
        kind: "unknown-field",
        path,
        field,
      }));
    case "type": {
      const type = params.type;
      const expected = Array.isArray(type) ? type.join(" or ") : String(type);
      return [{ kind: "type", path, expected }];
    }
    case "enum":
    case "const":
      return [{ kind: "enum", path, allowed: formatValues(allowedValues(error)) }];
    default: {
      const limit = params.limit ?? params.pattern ?? params.format ?? "";
      return [
        {
          kind: "constraint",
          path,
          constraint: error.keyword,
          limit: typeof limit === "string" ? limit : JSON.stringify(limit),
        },
      ];
    }
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function dedupe(issues: readonly SchemaIssue[]): SchemaIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = JSON.stringify(issue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
