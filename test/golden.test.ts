import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze, parseSolution } from "../src/index";
import { toGolden, withoutVersion } from "./helpers/golden";
import { officialRegistry } from "./helpers/registry";

const directory = new URL("./fixtures/solutions/", import.meta.url);
const fixtures = readdirSync(directory)
  .filter((name) => name.endsWith(".json"))
  .sort();

/**
 * Golden files: each solution in `fixtures/solutions` is parsed and analyzed under both
 * assumption policies, and the result is compared with `fixtures/expected`. Update them with `npx vitest run -u` and review the diff.
 */
describe.each(fixtures)("%s", (name) => {
  const text = readFileSync(new URL(name, directory), "utf8");
  const parsed = parseSolution(text, officialRegistry);
  const output = parsed.ok
    ? {
        parse: { ok: true, findings: parsed.findings },
        analysis: {
          strict: withoutVersion(analyze(parsed.model, { assumptions: "strict" })),
          "pack-defaults": withoutVersion(analyze(parsed.model, { assumptions: "pack-defaults" })),
        },
      }
    : { parse: { ok: false, findings: parsed.findings } };

  it("matches its expected result", async () => {
    await expect(toGolden(output)).toMatchFileSnapshot(`./fixtures/expected/${name}`);
  });

  it(name.startsWith("valid-") ? "is a valid model" : "is an invalid model", () => {
    const valid =
      parsed.ok &&
      output.analysis?.strict.analyses.every(
        (report) => report.id !== "model-validity" || report.valid,
      );
    expect(valid).toBe(name.startsWith("valid-"));
  });

  it("gives the same result every time", () => {
    const again = parseSolution(text, officialRegistry);
    expect(again.ok).toBe(parsed.ok);
    if (parsed.ok && again.ok) {
      expect(analyze(again.model)).toEqual(analyze(parsed.model));
    }
  });
});
