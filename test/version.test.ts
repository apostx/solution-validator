import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { VERSION } from "../src/index";

describe("VERSION", () => {
  it("matches the version in package.json", () => {
    expect(VERSION).toBe(packageJson.version);
  });

  it("is a semantic version", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });
});
