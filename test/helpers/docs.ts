import { FINDING_CODES, type FindingSource } from "../../src/index";

const SECTIONS: { source: FindingSource; title: string; intro: string }[] = [
  {
    source: "schema",
    title: "Schema validation",
    intro:
      "Reported by `parseSolution` for the solution document, by `createRegistry` for packs, and by the `model-validity` analysis for component properties. `path` is a JSON Pointer.",
  },
  {
    source: "registry",
    title: "Registry",
    intro: "Thrown by `createRegistry` in a `RegistryError` when packs are invalid.",
  },
  {
    source: "model-validity",
    title: "Analysis: model-validity",
    intro: "Semantic checks of a parsed solution.",
  },
];

function cell(text: string): string {
  return text.replaceAll("|", "\\|");
}

/** Renders `docs/finding-codes.md` from the finding code catalog. */
export function renderFindingCodes(): string {
  const lines = [
    "# Finding codes",
    "",
    "> Generated from `src/messages/codes.ts` by `test/docs.test.ts`. Do not edit by hand; run `npx vitest run -u` after changing the catalog.",
    "",
    "Every finding has a stable `code`, a `severity`, the `subjects` it is about (component, intent, pack or type ids), `params`, and a default English `message` rendered from the template below. `{name}` stands for the parameter `name`. Consumers may translate messages from the code and the parameters.",
  ];
  for (const section of SECTIONS) {
    lines.push("", `## ${section.title}`, "", section.intro, "");
    lines.push("| Code | Severity | Message template | Meaning |", "|---|---|---|---|");
    for (const [code, definition] of Object.entries(FINDING_CODES)) {
      if (definition.source !== section.source) continue;
      lines.push(
        `| \`${code}\` | ${definition.severity} | ${cell(definition.template)} | ${cell(definition.description)} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
