import type { Pack, Solution, Task } from "solution-validator";
import awsPack from "solution-validator/packs/aws";
import azurePack from "solution-validator/packs/azure";
import corePack from "solution-validator/packs/core";
import azureServerless from "./scenarios/azure-serverless.json";
import azureWebTier from "./scenarios/azure-web-tier.json";
import connectionMistakes from "./scenarios/connection-mistakes.json";
import highAvailability from "./scenarios/high-availability.json";
import serverlessOrders from "./scenarios/serverless-orders.json";
import webAndWorkers from "./scenarios/web-and-workers.json";
import webTier from "./scenarios/web-tier.json";

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
  task?: Task;
}

/** The packs the demo can load, by id. */
export const PACKS: Record<string, Pack> = { core: corePack, aws: awsPack, azure: azurePack };

export const SCENARIOS: Scenario[] = [
  serverlessOrders as Scenario,
  connectionMistakes as Scenario,
  webAndWorkers as Scenario,
  webTier as Scenario,
  highAvailability as Scenario,
  azureServerless as Scenario,
  azureWebTier as Scenario,
];
