import type { ComponentType, Registry } from "solution-validator";

export const DRAG_FORMAT = "application/x-solution-validator-type";

interface PaletteProps {
  registry: Registry;
  onAdd(type: string): void;
}

/** Component types grouped by category, generated from the loaded packs. */
export function Palette({ registry, onAdd }: PaletteProps) {
  const groups = registry.categories
    .map((category) => ({
      category,
      types: registry.types.filter((type) => type.category === category.id),
    }))
    .filter((group) => group.types.length > 0);

  return (
    <nav className="palette" aria-label="Component types">
      <h2>Components</h2>
      <p className="hint">Drag onto the canvas, or click to add.</p>
      {groups.map(({ category, types }) => (
        <section key={category.id}>
          <h3>{category.label}</h3>
          <ul>
            {types.map((type) => (
              <PaletteItem key={type.id} type={type} onAdd={onAdd} />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function PaletteItem({ type, onAdd }: { type: ComponentType; onAdd(type: string): void }) {
  return (
    <li>
      <button
        type="button"
        draggable
        title={type.description ?? type.label}
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_FORMAT, type.id);
          event.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => onAdd(type.id)}
      >
        <span className="palette-label">{type.label}</span>
        <span className="palette-id">{type.id}</span>
      </button>
    </li>
  );
}
