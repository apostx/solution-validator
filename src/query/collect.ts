import type { AnalysisResult } from "../analysis/analyze";
import type { ExposureFact } from "../analysis/checks/access-checks";
import type { Verdict } from "../analysis/verdict";
import type { Meta } from "../core/ids";
import type { SolutionModel } from "../core/model";
import type { TraitId } from "../core/traits";
import { compareStrings } from "../util/compare";

export interface CollectedComponent {
  id: string;
  type: string;
  /** Unset when the type is unknown. */
  category?: string;
  traits: TraitId[];
  /** The type's `meta` merged with the component's `meta`; the component wins. */
  meta: Meta;
  /** Intents that end at the component. */
  incoming: number;
  /** Intents that start at the component. */
  outgoing: number;
  /** Whether it is directly accessible from the internet, when an access analysis is given. */
  exposure?: ExposureFact["exposure"];
}

export interface CollectedIntent {
  id: string;
  from: string;
  to: string;
  action?: string;
  port?: string | number;
  meta: Meta;
  /** The verdict of the most complete intent analysis in the given result. */
  verdict?: Verdict;
}

export interface Facts {
  /** Every component, sorted by id. */
  components: CollectedComponent[];
  /** Every intent, sorted by id. */
  intents: CollectedIntent[];
  totals: {
    components: number;
    intents: number;
    /** Component counts by type id, keys sorted. */
    byType: Record<string, number>;
    /** Component counts by category, keys sorted; unknown types are not counted. */
    byCategory: Record<string, number>;
    /** Intent counts by verdict, when an analysis is given. */
    byVerdict?: Record<Verdict, number>;
  };
}

/**
 * Returns metadata and structural facts for consumers that build their own scoring or metrics.
 * The library never interprets `meta`. The result is deterministic: lists and keys are sorted.
 */
export function collect(model: SolutionModel, analysis?: AnalysisResult): Facts {
  const intentVerdicts = new Map<string, Verdict>();
  const exposure = new Map<string, ExposureFact["exposure"]>();
  for (const report of analysis?.analyses ?? []) {
    if (report.id === "model-validity") continue;
    // Later reports are more complete, so they win.
    const seen = new Set<string>();
    for (const intent of report.intents) {
      if (seen.has(intent.intent)) continue;
      seen.add(intent.intent);
      intentVerdicts.set(intent.intent, intent.verdict);
    }
    if (report.id === "access") {
      for (const fact of report.exposure) exposure.set(fact.component, fact.exposure);
    }
  }

  const components = model.components
    .map((component): CollectedComponent => {
      const type = model.getType(component);
      const fact = exposure.get(component.id);
      return {
        id: component.id,
        type: component.type,
        ...(type ? { category: type.category } : {}),
        traits: type ? (Object.keys(type.traits) as TraitId[]).sort(compareStrings) : [],
        meta: { ...type?.meta, ...component.meta },
        incoming: model.intents.filter((intent) => intent.to === component.id).length,
        outgoing: model.intents.filter((intent) => intent.from === component.id).length,
        ...(fact ? { exposure: fact } : {}),
      };
    })
    .sort((a, b) => compareStrings(a.id, b.id));

  const intents = model.intents
    .map((intent): CollectedIntent => {
      const verdict = intentVerdicts.get(intent.id);
      return {
        id: intent.id,
        from: intent.from,
        to: intent.to,
        ...(intent.action === undefined ? {} : { action: intent.action }),
        ...(intent.port === undefined ? {} : { port: intent.port }),
        meta: { ...intent.meta },
        ...(verdict ? { verdict } : {}),
      };
    })
    .sort((a, b) => compareStrings(a.id, b.id));

  const count = (keys: readonly string[]) => {
    const counts: Record<string, number> = {};
    for (const key of [...keys].sort(compareStrings)) counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  };
  const byVerdict = { pass: 0, fail: 0, undecidable: 0 };
  for (const intent of intents) if (intent.verdict) byVerdict[intent.verdict] += 1;

  return {
    components,
    intents,
    totals: {
      components: components.length,
      intents: intents.length,
      byType: count(components.map((component) => component.type)),
      byCategory: count(components.flatMap((component) => component.category ?? [])),
      ...(analysis ? { byVerdict } : {}),
    },
  };
}
