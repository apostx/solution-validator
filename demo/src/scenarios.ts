import type { Pack, Solution } from "solution-validator";
import awsPack from "solution-validator/packs/aws";
import corePack from "solution-validator/packs/core";
import connectionMistakes from "./scenarios/connection-mistakes.json";
import serverlessOrders from "./scenarios/serverless-orders.json";

/**
 * A scenario: the packs to load, a starting model and (from Iteration 4) a task. It reuses the
 * library's formats and adds no model of its own.
 */
export interface Scenario {
  id: string;
  title: string;
  description: string;
  packs: string[];
  solution: Solution;
}

/** The packs the demo can load, by id. */
export const PACKS: Record<string, Pack> = { core: corePack, aws: awsPack };

export const SCENARIOS: Scenario[] = [serverlessOrders as Scenario, connectionMistakes as Scenario];
