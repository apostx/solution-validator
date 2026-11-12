import { createRegistry, type Pack, RegistryError } from "../../src/index";
import awsPack from "../../src/packs/aws";
import azurePack from "../../src/packs/azure";
import corePack from "../../src/packs/core";

/** The official packs. */
export const officialPacks: Pack[] = [corePack, awsPack, azurePack];

/** A registry with the official packs. */
export const officialRegistry = createRegistry(officialPacks);

/** Calls `createRegistry` and returns the codes of the findings it throws. */
export function registryErrorCodes(packs: unknown[]): string[] {
  try {
    createRegistry(packs);
  } catch (error) {
    if (error instanceof RegistryError) return error.findings.map((finding) => finding.code);
    throw error;
  }
  return [];
}

/** A minimal valid pack, to be modified by tests. */
export function testPack(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "acme",
    version: "1.0.0",
    label: "Acme",
    vocabulary: 1,
    requires: { core: "^0.2.0" },
    types: [{ id: "acme.box", label: "Box", category: "compute" }],
    ...overrides,
  };
}
