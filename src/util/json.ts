/** A JSON object with unknown values. */
export type JsonObject = { [key: string]: unknown };

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Escapes one segment of a JSON Pointer (RFC 6901). */
export function pointerSegment(segment: string | number): string {
  return String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Joins segments into a JSON Pointer. */
export function pointer(...segments: (string | number)[]): string {
  return segments.map((segment) => `/${pointerSegment(segment)}`).join("");
}

/** Renders a JSON Pointer for messages: the document root is shown as `/`. */
export function displayPointer(path: string): string {
  return path === "" ? "/" : path;
}

/**
 * Serializes a JSON value with object keys sorted, so that equal values always produce the
 * same text.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isObject(value)) {
    const sorted: JsonObject = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

/** Deep-copies a JSON value. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
