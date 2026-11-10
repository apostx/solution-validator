// Checks the built package the way a consumer sees it: through the package name and its
// `exports` map. Run `npm run build` first.

import { existsSync, readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const rootExport = packageJson.exports["."];
const failures = [];

for (const condition of ["types", "default"]) {
  const target = rootExport[condition];
  if (!existsSync(new URL(`../${target}`, import.meta.url))) {
    failures.push(`exports["."].${condition} points to a missing file: ${target}`);
  }
}

const library = await import(packageJson.name);
if (library.VERSION !== packageJson.version) {
  failures.push(
    `VERSION is ${JSON.stringify(library.VERSION)}, package.json says ${packageJson.version}`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`check-package: ${failure}`);
  }
  process.exit(1);
}

console.log(`check-package: ${packageJson.name}@${packageJson.version} is importable`);
