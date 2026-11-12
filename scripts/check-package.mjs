// Checks the built package the way a consumer sees it: through the package name and its
// `exports` map. Run `npm run build` first.

import { existsSync, readdirSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const failures = [];

for (const [subpath, target] of Object.entries(packageJson.exports)) {
  const targets = typeof target === "string" ? [target] : Object.values(target);
  for (const file of targets) {
    if (file.includes("*")) {
      const [directory, suffix] = file.slice(2).split("*");
      const matches = readdirSync(new URL(directory, root)).filter((name) => name.endsWith(suffix));
      if (matches.length === 0) failures.push(`exports["${subpath}"] matches no files: ${file}`);
    } else if (!existsSync(new URL(file, root))) {
      failures.push(`exports["${subpath}"] points to a missing file: ${file}`);
    }
  }
}

const library = await import(packageJson.name);
if (library.VERSION !== packageJson.version) {
  failures.push(
    `VERSION is ${JSON.stringify(library.VERSION)}, package.json says ${packageJson.version}`,
  );
}

const { default: corePack } = await import(`${packageJson.name}/packs/core`);
const { default: awsPack } = await import(`${packageJson.name}/packs/aws`);
const { default: azurePack } = await import(`${packageJson.name}/packs/azure`);
const { default: onpremPack } = await import(`${packageJson.name}/packs/onprem`);
try {
  const registry = library.createRegistry([corePack, awsPack, azurePack, onpremPack]);
  const parsed = library.parseSolution(
    { schemaVersion: 1, packs: ["aws"], components: [{ id: "fn", type: "aws.lambda" }] },
    registry,
  );
  if (!parsed.ok) failures.push("a minimal solution does not parse");
} catch (error) {
  failures.push(`the official packs do not load: ${error}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`check-package: ${failure}`);
  }
  process.exit(1);
}

console.log(`check-package: ${packageJson.name}@${packageJson.version} is importable`);
