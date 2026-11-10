import pack from "../../packs/core.json" with { type: "json" };
import type { Pack } from "../core/pack-schema";

/** The `core` pack: provider-neutral categories, actions, ports and `core.internet`. */
const corePack = pack as unknown as Pack;
export default corePack;
