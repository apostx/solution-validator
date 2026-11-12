import Type from "typebox";

const LOCAL = "[a-z][a-z0-9]*(?:-[a-z0-9]+)*";

/** Pack ids: lowercase kebab case, for example `aws` or `on-prem`. */
export const PACK_ID_PATTERN = `^${LOCAL}$`;

/** Type ids: the pack id, a dot and a kebab-case name, for example `aws.api-gateway`. */
export const TYPE_ID_PATTERN = `^${LOCAL}\\.${LOCAL}$`;

/**
 * Category, action and port ids. The `core` pack defines unprefixed ids such as `invoke`; every
 * other pack prefixes its own with the pack id, for example `aws.publish`.
 */
export const NAME_PATTERN = `^(?:${LOCAL}\\.)?${LOCAL}$`;

/** Component and intent ids in a solution. */
export const ELEMENT_ID_PATTERN = "^[A-Za-z0-9_][A-Za-z0-9_.-]*$";

/** Property and field names in type definitions: camel case. */
export const PROPERTY_NAME_PATTERN = "^[a-z][A-Za-z0-9]*$";

/** A semantic version: `major.minor.patch`, optionally with a pre-release suffix. */
export const VERSION_PATTERN =
  "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$";

/** A version range: an exact version, or a caret range such as `^0.1.0`. */
export const VERSION_RANGE_PATTERN =
  "^\\^?(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$";

/** The pack that owns unprefixed category, action and port ids. */
export const SHARED_NAMESPACE_PACK = "core";

export const PackId = Type.String({ pattern: PACK_ID_PATTERN });
/** Access level names, for example `read-write`: lowercase kebab case. */
export const LevelName = Type.String({ pattern: PACK_ID_PATTERN });
export const TypeId = Type.String({ pattern: TYPE_ID_PATTERN });
export const Name = Type.String({ pattern: NAME_PATTERN });
export const PropertyName = Type.String({ pattern: PROPERTY_NAME_PATTERN });
export const ElementId = Type.String({ pattern: ELEMENT_ID_PATTERN, maxLength: 128 });
/** Role tags that solvers put on components and tasks select, for example `orders-store`. */
export const RoleName = Type.String({ pattern: PACK_ID_PATTERN });

/** Free-form consumer data. The library never interprets it. */
export const Meta = Type.Record(Type.String(), Type.Unknown());
export type Meta = Type.Static<typeof Meta>;

/** The pack that owns an id: the part before the first dot, or `core` when there is none. */
export function namespaceOf(id: string): string {
  const dot = id.indexOf(".");
  return dot === -1 ? SHARED_NAMESPACE_PACK : id.slice(0, dot);
}
