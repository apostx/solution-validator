import type { PropertySchema } from "solution-validator";

type Schema = PropertySchema | NonNullable<Extract<PropertySchema, { type: "array" }>["items"]>;
type JsonObject = Record<string, unknown>;

interface FieldProps {
  schema: Schema;
  value: unknown;
  /** `undefined` removes the value. */
  onChange(value: unknown): void;
  /** Component ids, for component references. */
  componentIds: readonly string[];
  /** Whether "not set" is offered. */
  optional: boolean;
  label?: string | undefined;
}

const NOT_SET = "";

/** An editor generated from a property schema. "Not set" stays distinct from any value. */
export function PropertyField({
  schema,
  value,
  onChange,
  componentIds,
  optional,
  label,
}: FieldProps) {
  switch (schema.type) {
    case "string":
      return <StringField {...{ schema, value, onChange, componentIds, optional, label }} />;
    case "number":
    case "integer":
      return (
        <input
          type="number"
          aria-label={label}
          step={schema.type === "integer" ? 1 : "any"}
          value={typeof value === "number" ? value : ""}
          placeholder={placeholder(schema)}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : Number(event.target.value))
          }
        />
      );
    case "boolean":
      return (
        <select
          aria-label={label}
          value={typeof value === "boolean" ? String(value) : NOT_SET}
          onChange={(event) =>
            onChange(event.target.value === NOT_SET ? undefined : event.target.value === "true")
          }
        >
          {optional && <option value={NOT_SET}>{notSetLabel(schema)}</option>}
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    case "array":
      return <ArrayField {...{ schema, value, onChange, componentIds, optional }} />;
    case "object":
      return <ObjectField {...{ schema, value, onChange, componentIds }} />;
  }
}

function StringField({
  schema,
  value,
  onChange,
  componentIds,
  optional,
  label,
}: FieldProps & { schema: Extract<Schema, { type: "string" }> }) {
  const current = typeof value === "string" ? value : NOT_SET;
  const choices = schema.enum ?? (schema["x-component-ref"] ? [...componentIds] : undefined);
  if (choices) {
    const options =
      current !== NOT_SET && !choices.includes(current) ? [...choices, current] : choices;
    return (
      <select
        aria-label={label}
        value={current}
        onChange={(event) =>
          onChange(event.target.value === NOT_SET ? undefined : event.target.value)
        }
      >
        <option value={NOT_SET} disabled={!optional}>
          {optional ? notSetLabel(schema) : "Choose…"}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      aria-label={label}
      value={current}
      placeholder={placeholder(schema)}
      onChange={(event) =>
        onChange(optional && event.target.value === "" ? undefined : event.target.value)
      }
    />
  );
}

function ArrayField({
  schema,
  value,
  onChange,
  componentIds,
  optional,
}: FieldProps & { schema: Extract<Schema, { type: "array" }> }) {
  if (!Array.isArray(value)) {
    return (
      <div className="array-field">
        <span className="not-set">{notSetLabel(schema)}</span>
        <button type="button" onClick={() => onChange([])}>
          Set
        </button>
      </div>
    );
  }
  const items = schema.items;
  const replace = (index: number, item: unknown) =>
    onChange(value.map((current, i) => (i === index ? item : current)));
  return (
    <div className="array-field">
      {value.length === 0 && <span className="not-set">Empty list</span>}
      <ol>
        {value.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: list items have no identity of their own
          <li key={index}>
            {items.type === "object" ? (
              <ObjectField
                schema={items}
                value={item}
                onChange={(next) => replace(index, next ?? {})}
                componentIds={componentIds}
              />
            ) : (
              <PropertyField
                schema={items}
                value={item}
                optional={false}
                onChange={(next) => replace(index, next ?? "")}
                componentIds={componentIds}
              />
            )}
            <button
              type="button"
              className="remove"
              aria-label="Remove item"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <div className="array-actions">
        <button type="button" onClick={() => onChange([...value, emptyItem(items)])}>
          Add
        </button>
        {optional && (
          <button type="button" onClick={() => onChange(undefined)}>
            Unset
          </button>
        )}
      </div>
    </div>
  );
}

function ObjectField({
  schema,
  value,
  onChange,
  componentIds,
}: Omit<FieldProps, "optional"> & { schema: Extract<Schema, { type: "object" }> }) {
  const object: JsonObject = isObject(value) ? value : {};
  const required = new Set(schema.required ?? []);
  return (
    <div className="object-field">
      {Object.entries(schema.properties).map(([name, field]) => (
        <div className="field" key={name}>
          <span>
            {field.title ?? name}
            {required.has(name) && <abbr title="required">*</abbr>}
          </span>
          <PropertyField
            schema={field}
            value={object[name]}
            optional
            label={field.title ?? name}
            componentIds={componentIds}
            onChange={(next) => {
              const { [name]: _old, ...rest } = object;
              onChange(next === undefined ? rest : { ...rest, [name]: next });
            }}
          />
        </div>
      ))}
    </div>
  );
}

function emptyItem(schema: Schema): unknown {
  switch (schema.type) {
    case "object":
      return {};
    case "string":
      return schema.enum?.[0] ?? "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function notSetLabel(schema: Schema): string {
  return schema.default === undefined
    ? "Not set"
    : `Not set (default: ${JSON.stringify(schema.default)})`;
}

function placeholder(schema: Schema): string {
  return schema.default === undefined ? "Not set" : `Not set (default: ${String(schema.default)})`;
}
