interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
}

const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?$/;

function parseVersion(text: string): ParsedVersion | undefined {
  const match = VERSION.exec(text);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? "",
  };
}

function compare(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === b.prerelease) return 0;
  // A pre-release sorts before its release.
  if (a.prerelease === "") return 1;
  if (b.prerelease === "") return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

/**
 * Checks a version against a range: an exact version (`0.1.0`) or a caret range (`^0.1.0`).
 * Caret ranges follow npm: `^1.2.3` allows `1.x.y`, `^0.2.3` allows `0.2.y`, and `^0.0.3`
 * allows only `0.0.3`, each at or above the base version.
 */
export function satisfies(version: string, range: string): boolean {
  const caret = range.startsWith("^");
  const actual = parseVersion(version);
  const base = parseVersion(caret ? range.slice(1) : range);
  if (!actual || !base) return false;
  if (!caret) return compare(actual, base) === 0;
  if (compare(actual, base) < 0) return false;
  if (base.major > 0) return actual.major === base.major;
  if (base.minor > 0) return actual.major === 0 && actual.minor === base.minor;
  return actual.major === 0 && actual.minor === 0 && actual.patch === base.patch;
}
