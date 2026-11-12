import { ReactFlowProvider } from "@xyflow/react";
import { useMemo, useState } from "react";
import {
  type AnalysisLevel,
  type AssumptionPolicy,
  createRegistry,
  parseTask,
  type Solution,
  VERSION,
} from "solution-validator";
import { Canvas } from "./components/Canvas";
import { FactsPanel } from "./components/FactsPanel";
import { FindingsPanel } from "./components/FindingsPanel";
import { Inspector } from "./components/Inspector";
import { JsonPanel } from "./components/JsonPanel";
import { Palette } from "./components/Palette";
import { TaskPanel } from "./components/TaskPanel";
import { TerraformPanel } from "./components/TerraformPanel";
import { evaluate } from "./evaluation";
import { addComponent, type Selection } from "./model";
import { PACKS, SCENARIOS, type Scenario } from "./scenarios";

const REPOSITORY_URL = "https://github.com/apostx/solution-validator";

type Tab = "properties" | "task" | "facts" | "terraform" | "json";

const TABS: { id: Tab; label: string }[] = [
  { id: "properties", label: "Properties" },
  { id: "task", label: "Task" },
  { id: "facts", label: "Facts" },
  { id: "terraform", label: "Terraform" },
  { id: "json", label: "JSON" },
];

export function App() {
  const [scenario, setScenario] = useState<Scenario>(() => SCENARIOS[0] as Scenario);
  const [document, setDocument] = useState<unknown>(() => scenario.solution);
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>("properties");
  const [policy, setPolicy] = useState<AssumptionPolicy>("strict");
  const [level, setLevel] = useState<AnalysisLevel>("logical");

  const registry = useMemo(
    () => createRegistry(scenario.packs.flatMap((id) => (PACKS[id] ? [PACKS[id]] : []))),
    [scenario],
  );
  const parsedTask = useMemo(
    () => (scenario.task ? parseTask(scenario.task, registry) : undefined),
    [scenario, registry],
  );
  const task = parsedTask?.ok ? parsedTask.task : undefined;
  const evaluation = useMemo(
    () => evaluate(registry, document, policy, task, level),
    [registry, document, policy, task, level],
  );
  const lockedIds = useMemo(
    () => (task?.provided ?? []).filter((c) => c.locked).map((c) => c.id),
    [task],
  );
  const solution = evaluation.model?.solution;

  function change(next: Solution) {
    setDocument(next);
  }

  function selectSubject(id: string) {
    if (!solution) return;
    if (solution.components.some((component) => component.id === id)) {
      setSelection({ kind: "component", id });
    } else if (solution.intents?.some((intent) => intent.id === id)) {
      setSelection({ kind: "intent", id });
    }
    setTab("properties");
  }

  return (
    <div className="app">
      <header>
        <h1>SolutionValidator</h1>
        <label className="scenario-picker">
          <span>Scenario</span>
          <select
            value={scenario.id}
            onChange={(event) => {
              const next = SCENARIOS.find((candidate) => candidate.id === event.target.value);
              if (!next) return;
              setScenario(next);
              setDocument(next.solution);
              setSelection(null);
            }}
          >
            {SCENARIOS.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setDocument(scenario.solution);
            setSelection(null);
          }}
        >
          Reset
        </button>
        <label
          className="scenario-picker"
          title="logical: decided from logical settings. detailed: also checks address spaces, address ranges in rules and routes, and port ranges."
        >
          <span>Level</span>
          <select value={level} onChange={(event) => setLevel(event.target.value as AnalysisLevel)}>
            <option value="logical">logical</option>
            <option value="detailed">detailed (addresses)</option>
          </select>
        </label>
        <label
          className="scenario-picker"
          title="strict: unset properties make verdicts undecidable. pack-defaults: the packs' documented defaults are assumed and listed."
        >
          <span>Unset properties</span>
          <select
            value={policy}
            onChange={(event) => setPolicy(event.target.value as AssumptionPolicy)}
          >
            <option value="strict">strict: undecidable</option>
            <option value="pack-defaults">pack-defaults: assume defaults</option>
          </select>
        </label>
        <span className="spacer" />
        <span className="version">
          library <code>{VERSION}</code> · <a href={REPOSITORY_URL}>GitHub</a>
        </span>
      </header>
      <p className="scenario-description">{scenario.description}</p>
      <main>
        <Palette
          registry={registry}
          onAdd={(type) => {
            if (!solution) return;
            const offset = solution.components.length * 24;
            const next = addComponent(solution, type, { x: 80 + offset, y: 320 + offset });
            change(next);
            const created = next.components.at(-1);
            if (created) setSelection({ kind: "component", id: created.id });
          }}
        />
        <div className="workspace">
          {solution ? (
            <ReactFlowProvider key={scenario.id}>
              <Canvas
                solution={solution}
                registry={registry}
                evaluation={evaluation}
                selection={selection}
                onSelect={setSelection}
                onChange={change}
                lockedIds={lockedIds}
              />
            </ReactFlowProvider>
          ) : (
            <div className="canvas canvas-empty">
              <p>The model cannot be drawn until its schema errors are fixed.</p>
            </div>
          )}
          <FindingsPanel
            assumptions={evaluation.assumptions}
            exposure={[...evaluation.exposure.values()]}
            findings={evaluation.findings}
            parseFailed={!evaluation.model}
            onSelectSubject={selectSubject}
          />
        </div>
        <aside className="side-panel">
          <div className="tabs" role="tablist">
            {TABS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={tab === candidate.id}
                onClick={() => setTab(candidate.id)}
              >
                {candidate.label}
                {candidate.id === "task" && evaluation.requirements && (
                  <span className={`verdict verdict-${evaluation.requirements.verdict}`}> ●</span>
                )}
              </button>
            ))}
          </div>
          {tab === "properties" &&
            (solution ? (
              <Inspector
                solution={solution}
                registry={registry}
                findings={evaluation.findings}
                intentVerdicts={evaluation.intentVerdicts}
                selection={selection}
                roles={scenario.task?.roles ?? []}
                onChange={change}
              />
            ) : (
              <p className="hint">Fix the schema errors in the JSON view first.</p>
            ))}
          {tab === "task" && (
            <TaskPanel
              task={scenario.task}
              taskFindings={parsedTask?.findings ?? []}
              result={evaluation.requirements}
              components={solution?.components ?? []}
            />
          )}
          {tab === "facts" && <FactsPanel facts={evaluation.facts} />}
          {tab === "terraform" && <TerraformPanel model={evaluation.model} />}
          {tab === "json" && (
            <JsonPanel
              document={document}
              fileName={`${scenario.id}.json`}
              onApply={(next) => {
                setDocument(next);
                setSelection(null);
              }}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
