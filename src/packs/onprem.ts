import pack from "../../packs/onprem.json" with { type: "json" };
import type { Pack } from "../core/pack-schema";

/** The `onprem` pack: networks, VLANs, firewalls, routers, servers and databases on premises. */
const onpremPack = pack as unknown as Pack;
export default onpremPack;
