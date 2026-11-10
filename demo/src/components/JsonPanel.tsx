import { type ChangeEvent, useEffect, useRef, useState } from "react";

interface JsonPanelProps {
  document: unknown;
  /** Replaces the whole document. */
  onApply(document: unknown): void;
  fileName: string;
}

function format(document: unknown): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** Shows the model as JSON; edits, imports and exports it. */
export function JsonPanel({ document, onApply, fileName }: JsonPanelProps) {
  const [text, setText] = useState(() => format(document));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dirty) setText(format(document));
  }, [document, dirty]);

  function apply(source: string) {
    try {
      onApply(JSON.parse(source));
      setDirty(false);
      setError(null);
    } catch {
      setError("This is not valid JSON.");
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const source = await file.text();
    setText(source);
    apply(source);
  }

  function exportFile() {
    const blob = new Blob([format(document)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="json-panel">
      <div className="toolbar">
        <button type="button" onClick={() => apply(text)} disabled={!dirty}>
          Apply
        </button>
        <button
          type="button"
          onClick={() => {
            setText(format(document));
            setDirty(false);
            setError(null);
          }}
          disabled={!dirty}
        >
          Revert
        </button>
        <span className="spacer" />
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import…
        </button>
        <button type="button" onClick={exportFile}>
          Export
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={importFile}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <textarea
        spellCheck={false}
        aria-label="Solution JSON"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setDirty(true);
        }}
      />
    </div>
  );
}
