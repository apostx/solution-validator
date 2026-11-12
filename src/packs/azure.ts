import pack from "../../packs/azure.json" with { type: "json" };
import type { Pack } from "../core/pack-schema";

/** The `azure` pack: Functions, API Management, Cosmos DB, Blob Storage, VMs and networking. */
const azurePack = pack as unknown as Pack;
export default azurePack;
