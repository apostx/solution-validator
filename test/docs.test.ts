import { describe, expect, it } from "vitest";
import { FINDING_CODES, Pack, Solution } from "../src/index";
import { renderFindingCodes } from "./helpers/docs";

const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

function schemaFile(schema: object): string {
  return `${JSON.stringify({ $schema: JSON_SCHEMA_DIALECT, ...schema }, null, 2)}\n`;
}

describe("generated files", () => {
  it("docs/finding-codes.md lists every finding code", async () => {
    await expect(renderFindingCodes()).toMatchFileSnapshot("../docs/finding-codes.md");
  });

  it("schemas/solution.schema.json matches the solution schema", async () => {
    await expect(schemaFile(Solution)).toMatchFileSnapshot("../schemas/solution.schema.json");
  });

  it("schemas/pack.schema.json matches the pack schema", async () => {
    await expect(schemaFile(Pack)).toMatchFileSnapshot("../schemas/pack.schema.json");
  });
});

describe("finding codes", () => {
  it.each(Object.entries(FINDING_CODES))(
    "%s has a template and description",
    (code, definition) => {
      expect(code).toMatch(/^[A-Z][A-Z_]*$/);
      expect(definition.template.length).toBeGreaterThan(0);
      expect(definition.description).toMatch(/\.$/);
    },
  );
});
