import Type from "typebox";
import { ElementId, Meta, RoleName } from "../core/ids";

const closed = { additionalProperties: false } as const;
const Reference = Type.String({ minLength: 1 });

/** The task format version this library reads. */
export const TASK_SCHEMA_VERSION = 1;

/**
 * Selects components of a solution. Every given field must match. A task may select by `id`
 * only components it provides itself, because the solver chooses all other ids.
 */
export const Selector = Type.Object(
  {
    id: Type.Optional(ElementId),
    type: Type.Optional(Reference),
    category: Type.Optional(Reference),
    trait: Type.Optional(Reference),
    /** A role the task declares; matches the components the solver tagged with it. */
    role: Type.Optional(RoleName),
  },
  closed,
);
export type Selector = Type.Static<typeof Selector>;

/** A component the task gives to every solution, such as the users on the internet. */
export const ProvidedComponent = Type.Object(
  {
    id: ElementId,
    type: Reference,
    label: Type.Optional(Type.String()),
    properties: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    /** The solver should not change or remove it. Consumers enforce this. */
    locked: Type.Optional(Type.Boolean()),
    meta: Type.Optional(Meta),
  },
  closed,
);
export type ProvidedComponent = Type.Static<typeof ProvidedComponent>;

const requirementBase = {
  id: ElementId,
  description: Type.Optional(Type.String()),
  meta: Type.Optional(Meta),
};
const Port = Type.Union([Reference, Type.Integer({ minimum: 1, maximum: 65535 })]);

/** At least one matching target can be reached from a matching source through `pass` intents. */
export const ReachableRequirement = Type.Object(
  {
    ...requirementBase,
    type: Type.Literal("reachable"),
    from: Selector,
    to: Selector,
    /** The action of the last intent in the chain. */
    action: Type.Optional(Reference),
    /** The port of the last intent in the chain. */
    port: Type.Optional(Port),
  },
  closed,
);
export type ReachableRequirement = Type.Static<typeof ReachableRequirement>;

/** No matching target is directly accessible from a matching source, with or without intents. */
export const NotReachableRequirement = Type.Object(
  {
    ...requirementBase,
    type: Type.Literal("not-reachable"),
    from: Selector,
    to: Selector,
    /** Only this action. Omitted: any action the target controls access for. */
    action: Type.Optional(Reference),
  },
  closed,
);
export type NotReachableRequirement = Type.Static<typeof NotReachableRequirement>;

/** The solution contains at least `min` matching components. */
export const UsesRequirement = Type.Object(
  {
    ...requirementBase,
    type: Type.Literal("uses"),
    select: Selector,
    /** Default: 1. */
    min: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  closed,
);
export type UsesRequirement = Type.Static<typeof UsesRequirement>;

/**
 * Every matching component survives the loss of one failure domain: the provider manages it, or
 * it runs in two or more failure domains. Needs the availability analysis.
 */
export const RedundantRequirement = Type.Object(
  {
    ...requirementBase,
    type: Type.Literal("redundant"),
    select: Selector,
  },
  closed,
);
export type RedundantRequirement = Type.Static<typeof RedundantRequirement>;

export const Requirement = Type.Union([
  ReachableRequirement,
  NotReachableRequirement,
  UsesRequirement,
  RedundantRequirement,
]);
export type Requirement = Type.Static<typeof Requirement>;

/** A role a task asks the solver to assign, so that requirements can select the component. */
export const RoleDefinition = Type.Object(
  {
    id: RoleName,
    label: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
  },
  closed,
);
export type RoleDefinition = Type.Static<typeof RoleDefinition>;

/** A task: the packs, the components every solution gets, and the requirements. */
export const Task = Type.Object(
  {
    $schema: Type.Optional(Type.String()),
    schemaVersion: Type.Literal(TASK_SCHEMA_VERSION),
    id: ElementId,
    title: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    packs: Type.Array(Type.String({ minLength: 1 })),
    provided: Type.Optional(Type.Array(ProvidedComponent)),
    /** Roles the solver assigns to components with `roles`; selectors can name them. */
    roles: Type.Optional(Type.Array(RoleDefinition)),
    requirements: Type.Array(Requirement),
    meta: Type.Optional(Meta),
  },
  { ...closed, title: "SolutionValidator task" },
);
export type Task = Type.Static<typeof Task>;
