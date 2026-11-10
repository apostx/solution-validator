/**
 * Compares strings by UTF-16 code units. Unlike `localeCompare`, the order is the same in
 * every runtime and locale, which keeps output ordering deterministic.
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Returns a sorted copy of the strings, without duplicates. */
export function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareStrings);
}
