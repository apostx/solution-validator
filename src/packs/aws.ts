import pack from "../../packs/aws.json" with { type: "json" };
import type { Pack } from "../core/pack-schema";

/** The `aws` pack: a minimal serverless subset (API Gateway, Lambda, DynamoDB and S3). */
const awsPack = pack as unknown as Pack;
export default awsPack;
