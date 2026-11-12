import pack from "../../packs/aws.json" with { type: "json" };
import type { Pack } from "../core/pack-schema";

/** The `aws` pack: serverless, web tiers and VPC networking. */
const awsPack = pack as unknown as Pack;
export default awsPack;
