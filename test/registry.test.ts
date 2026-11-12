import { describe, expect, it } from "vitest";
import { satisfies } from "../src/core/semver";
import { createRegistry, RegistryError } from "../src/index";
import { officialPacks, officialRegistry, registryErrorCodes, testPack } from "./helpers/registry";

describe("createRegistry", () => {
  it("loads the official packs", () => {
    expect(officialRegistry.packs.map((pack) => `${pack.id}@${pack.version}`)).toEqual([
      "aws@0.5.0",
      "azure@0.1.0",
      "core@0.2.0",
      "onprem@0.1.0",
    ]);
    expect(officialRegistry.types.map((type) => type.id)).toEqual([
      "core.internet",
      "aws.api-gateway",
      "aws.lambda",
      "aws.dynamodb",
      "aws.s3",
      "aws.vpc",
      "aws.subnet",
      "aws.internet-gateway",
      "aws.nat-gateway",
      "aws.route-table",
      "aws.security-group",
      "aws.network-acl",
      "aws.autoscaling-group",
      "aws.cloudfront",
      "aws.alb",
      "aws.ec2",
      "aws.rds",
      "aws.gateway-endpoint",
      "azure.function-app",
      "azure.api-management",
      "azure.cosmos-db",
      "azure.blob-storage",
      "azure.vnet",
      "azure.subnet",
      "azure.nsg",
      "azure.nat-gateway",
      "azure.vm",
      "azure.vm-scale-set",
      "azure.application-gateway",
      "onprem.network",
      "onprem.vlan",
      "onprem.firewall",
      "onprem.router",
      "onprem.server",
      "onprem.server-cluster",
      "onprem.load-balancer",
      "onprem.database",
    ]);
    expect(officialRegistry.getType("aws.lambda")?.category).toBe("compute");
    expect(officialRegistry.getAction("invoke")?.pack).toBe("core");
    expect(officialRegistry.getPort("https")?.port).toBe(443);
  });

  it("does not depend on the order of the packs", () => {
    const reversed = createRegistry([...officialPacks].reverse());
    expect(reversed.packs).toEqual(officialRegistry.packs);
    expect(reversed.getType("aws.s3")).toEqual(officialRegistry.getType("aws.s3"));
  });

  it("does not keep references to the input", () => {
    const pack = testPack();
    const registry = createRegistry([officialPacks[0], pack]);
    const [type] = pack.types as { label: string }[];
    if (type) type.label = "Changed";
    expect(registry.getType("acme.box")?.label).toBe("Box");
  });

  it("resolves required packs transitively", () => {
    const registry = createRegistry([...officialPacks, testPack({ requires: { aws: "^0.5.0" } })]);
    expect(registry.resolvePacks(["acme"])).toEqual(["acme", "aws", "core"]);
    expect(registry.resolvePacks(["unknown"])).toEqual([]);
  });

  it("throws a RegistryError with findings", () => {
    expect(() => createRegistry([{ id: "broken" }])).toThrow(RegistryError);
    expect(registryErrorCodes([{ id: "broken" }])).toContain("SCHEMA_REQUIRED");
  });

  it.each([
    ["a pack loaded twice", [officialPacks[0], officialPacks[0]], "PACK_DUPLICATE"],
    [
      "a newer vocabulary",
      [officialPacks[0], testPack({ vocabulary: 99 })],
      "PACK_VOCABULARY_UNSUPPORTED",
    ],
    ["a missing required pack", [testPack()], "PACK_REQUIREMENT_MISSING"],
    [
      "an incompatible required pack",
      [officialPacks[0], testPack({ requires: { core: "^1.0.0" } })],
      "PACK_REQUIREMENT_VERSION",
    ],
    [
      "a type outside the namespace",
      [
        officialPacks[0],
        testPack({ types: [{ id: "other.box", label: "Box", category: "compute" }] }),
      ],
      "PACK_NAMESPACE",
    ],
    [
      "an unprefixed action outside core",
      [officialPacks[0], testPack({ actions: [{ id: "launch", label: "Launch" }] })],
      "PACK_NAMESPACE",
    ],
    [
      "a duplicate definition",
      [
        officialPacks[0],
        testPack({
          actions: [
            { id: "acme.x", label: "X" },
            { id: "acme.x", label: "X" },
          ],
        }),
      ],
      "PACK_DEFINITION_DUPLICATE",
    ],
    [
      "an unknown category",
      [officialPacks[0], testPack({ types: [{ id: "acme.box", label: "Box", category: "nope" }] })],
      "PACK_REFERENCE_UNKNOWN",
    ],
    [
      "a category of a pack that is not required",
      [
        ...officialPacks,
        testPack({ requires: {}, types: [{ id: "acme.box", label: "Box", category: "compute" }] }),
      ],
      "PACK_REFERENCE_UNKNOWN",
    ],
    [
      "an unknown action in accepts",
      [
        officialPacks[0],
        testPack({
          types: [
            { id: "acme.box", label: "Box", category: "compute", accepts: [{ actions: ["fly"] }] },
          ],
        }),
      ],
      "PACK_REFERENCE_UNKNOWN",
    ],
    [
      "an unknown trait in a selector",
      [
        officialPacks[0],
        testPack({
          types: [
            {
              id: "acme.box",
              label: "Box",
              category: "compute",
              accepts: [{ from: { trait: "magic" } }],
            },
          ],
        }),
      ],
      "PACK_REFERENCE_UNKNOWN",
    ],
    [
      "a binding to an undeclared property",
      [
        officialPacks[0],
        testPack({
          types: [
            {
              id: "acme.box",
              label: "Box",
              category: "compute",
              traits: { endpoint: { visibility: { property: "exposure" } } },
            },
          ],
        }),
      ],
      "PACK_REFERENCE_UNKNOWN",
    ],
    [
      "a binding to an unsuitable property",
      [
        officialPacks[0],
        testPack({
          types: [
            {
              id: "acme.box",
              label: "Box",
              category: "compute",
              traits: { principal: { grants: { property: "grants" } } },
              properties: { grants: { type: "array", items: { type: "string" } } },
            },
          ],
        }),
      ],
      "PACK_BINDING_MISMATCH",
    ],
    [
      "an enum binding with an unknown value",
      [
        officialPacks[0],
        testPack({
          types: [
            {
              id: "acme.box",
              label: "Box",
              category: "compute",
              traits: { endpoint: { visibility: { property: "exposure" } } },
              properties: { exposure: { type: "string", enum: ["public", "everywhere"] } },
            },
          ],
        }),
      ],
      "PACK_BINDING_MISMATCH",
    ],
    [
      "an invalid default",
      [
        officialPacks[0],
        testPack({
          types: [
            {
              id: "acme.box",
              label: "Box",
              category: "compute",
              properties: { size: { type: "integer", minimum: 1, default: 0 } },
            },
          ],
        }),
      ],
      "PACK_PROPERTY_DEFAULT_INVALID",
    ],
    [
      "an undeclared required property",
      [
        officialPacks[0],
        testPack({
          types: [{ id: "acme.box", label: "Box", category: "compute", required: ["size"] }],
        }),
      ],
      "PACK_REFERENCE_UNKNOWN",
    ],
  ])("rejects %s", (_name, packs, code) => {
    expect(registryErrorCodes(packs)).toContain(code);
  });

  it("reports pack schema violations with paths", () => {
    try {
      createRegistry([
        officialPacks[0],
        testPack({
          types: [
            {
              id: "acme.box",
              label: "Box",
              category: "compute",
              properties: { size: { type: "string", default: 5 } },
            },
          ],
        }),
      ]);
      expect.unreachable();
    } catch (error) {
      expect((error as RegistryError).findings.map((finding) => finding.message)).toEqual([
        "/types/0/properties/size/default must be of type string.",
      ]);
    }
  });
});

describe("satisfies", () => {
  it.each([
    ["0.1.0", "0.1.0", true],
    ["0.1.1", "0.1.0", false],
    ["0.1.5", "^0.1.0", true],
    ["0.2.0", "^0.1.0", false],
    ["0.0.9", "^0.1.0", false],
    ["1.4.0", "^1.2.0", true],
    ["2.0.0", "^1.2.0", false],
    ["0.0.3", "^0.0.3", true],
    ["0.0.4", "^0.0.3", false],
    ["1.0.0-beta", "^1.0.0", false],
    ["1.0.0", "^1.0.0-beta", true],
  ])("%s satisfies %s: %s", (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });
});
