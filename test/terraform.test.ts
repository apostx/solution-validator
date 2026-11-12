import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRegistry, exportTerraform, parseSolution, type Registry } from "../src/index";
import { officialPacks, officialRegistry, registryErrorCodes, testPack } from "./helpers/registry";

function model(name: string, registry: Registry = officialRegistry) {
  const parsed = parseSolution(
    readFileSync(new URL(`./fixtures/solutions/${name}.json`, import.meta.url), "utf8"),
    registry,
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
  return parsed.model;
}

function codes(findings: readonly { code: string }[]) {
  return [...new Set(findings.map((finding) => finding.code))].sort();
}

describe("exportTerraform", () => {
  it.each([
    ["valid-web-tier", "terraform-web-tier.tf"],
    ["valid-azure-network", "terraform-azure-network.tf"],
    ["valid-dual-stack", "terraform-dual-stack.tf"],
  ])("exports %s", async (name, file) => {
    const result = exportTerraform(model(name));
    await expect(result.hcl).toMatchFileSnapshot(`./fixtures/expected/${file}`);
    expect(exportTerraform(model(name))).toEqual(result);
  });

  it("writes Terraform JSON with references as interpolations", () => {
    const { json } = exportTerraform(model("valid-web-tier"));
    const resources = json.resource as Record<string, Record<string, Record<string, unknown>>>;
    expect(resources.aws_subnet?.public).toEqual({
      vpc_id: "${aws_vpc.vpc.id}",
      cidr_block: "10.0.1.0/24",
    });
    expect(resources.aws_route_table?.["public-rt"]?.route).toEqual([
      { cidr_block: "0.0.0.0/0", gateway_id: "${aws_internet_gateway.igw.id}" },
    ]);
    expect(json.terraform).toEqual({ required_providers: { aws: { source: "hashicorp/aws" } } });
  });

  it("reports what it cannot export", () => {
    const result = exportTerraform(model("valid-web-tier"));
    expect(codes(result.findings)).toEqual([
      "TERRAFORM_ITEM_SKIPPED",
      "TERRAFORM_NOTE",
      "TERRAFORM_NOT_MAPPED",
    ]);
    expect(result.findings.find((f) => f.code === "TERRAFORM_NOT_MAPPED")?.subjects).toEqual([
      "cdn",
    ]);
  });

  it("exports nothing for packs without mappings", () => {
    const result = exportTerraform(model("valid-onprem"));
    expect(result.hcl).toBe("");
    expect(result.resources).toEqual([]);
    expect(codes(result.findings)).toEqual(["TERRAFORM_NOT_MAPPED"]);
  });

  it("supports the mapping language", () => {
    const pack = testPack({
      vocabulary: 6,
      terraform: {
        providers: { acme: { source: "acme/acme", blocks: ["features"] } },
        variables: { region: { description: "The region.", type: "string" } },
      },
      types: [
        { id: "acme.box", label: "Box", category: "compute" },
        {
          id: "acme.wall",
          label: "Wall",
          category: "network",
          properties: {
            title: { type: "string" },
            on: { type: "boolean" },
            sizes: { type: "array", items: { type: "string" } },
            boxes: { type: "array", items: { type: "string", "x-component-ref": true } },
            rules: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  peer: { type: "string" },
                  ports: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
          terraform: {
            resource: "acme_wall",
            attributes: {
              name: { id: true },
              title: { property: "title" },
              enabled: { property: "on", map: { true: "yes", false: "no" }, default: false },
              size: { property: "sizes", first: true },
              region: { variable: "region" },
              boxes: { reference: "boxes", attribute: "id", list: true },
            },
            blocks: [
              {
                name: "rule",
                each: "rules",
                expand: "ports",
                attributes: {
                  priority: { index: { start: 100, step: 10 } },
                  name: { index: { start: 100, step: 10 }, prefix: "r" },
                  from: { port: "from", property: "ports" },
                  range: { port: "range", property: "ports" },
                  cidr: { property: "peer", map: { anywhere: "0.0.0.0/0" }, ranges: true },
                },
                requireAny: ["cidr"],
              },
            ],
            notes: ["Set the colour."],
          },
        },
      ],
    });
    const registry = createRegistry([...officialPacks, pack]);
    const parsed = parseSolution(
      {
        schemaVersion: 1,
        packs: ["acme"],
        components: [
          { id: "box", type: "acme.box" },
          {
            id: "1wall.main",
            type: "acme.wall",
            properties: {
              title: "Costs ${money}",
              sizes: ["s", "m"],
              boxes: ["box"],
              rules: [
                { peer: "anywhere", ports: ["https", "8080-8090"] },
                { peer: "box" },
                { peer: "10.0.0.0/8" },
              ],
            },
          },
        ],
      },
      registry,
    );
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.findings));
    const result = exportTerraform(parsed.model);
    expect(result.resources).toEqual([
      {
        type: "acme_wall",
        name: "_1wall_main",
        component: "1wall.main",
        arguments: {
          name: "1wall.main",
          title: "Costs ${money}",
          enabled: "no",
          size: "s",
          region: { ref: "var.region" },
        },
        blocks: [
          {
            name: "rule",
            arguments: { priority: 100, name: "r100", from: 443, range: "443", cidr: "0.0.0.0/0" },
          },
          {
            name: "rule",
            arguments: {
              priority: 110,
              name: "r110",
              from: 8080,
              range: "8080-8090",
              cidr: "0.0.0.0/0",
            },
          },
          {
            name: "rule",
            arguments: { priority: 120, name: "r120", from: 0, range: "*", cidr: "10.0.0.0/8" },
          },
        ],
      },
    ]);
    expect(codes(result.findings)).toEqual([
      "TERRAFORM_ITEM_SKIPPED",
      "TERRAFORM_NOTE",
      "TERRAFORM_NOT_MAPPED",
      "TERRAFORM_REFERENCE_UNMAPPED",
    ]);
    // HCL escapes template sequences in strings.
    expect(result.hcl).toContain('title   = "Costs $${money}"');
    expect(result.hcl).toContain('provider "acme" {\n  features {}\n}');
    expect(result.hcl).toContain('variable "region" {');
  });

  it("checks mappings when packs load", () => {
    const pack = (terraform: unknown) =>
      testPack({
        vocabulary: 6,
        types: [{ id: "acme.box", label: "Box", category: "compute", terraform }],
      });
    expect(
      registryErrorCodes([
        ...officialPacks,
        pack({ resource: "acme_box", attributes: { name: { property: "missing" } } }),
      ]),
    ).toEqual(["PACK_REFERENCE_UNKNOWN"]);
    expect(
      registryErrorCodes([
        ...officialPacks,
        pack({ resource: "acme_box", attributes: { region: { variable: "region" } } }),
      ]),
    ).toEqual(["PACK_REFERENCE_UNKNOWN"]);
    expect(
      registryErrorCodes([
        ...officialPacks,
        pack({ resource: "acme_box", attributes: { name: { id: true } } }),
      ]),
    ).toEqual([]);
  });
});
