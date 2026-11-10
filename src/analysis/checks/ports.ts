import type { SolutionModel } from "../../core/model";

/** A port id matches an intent's port by id, or by port number and protocol. */
export function samePort(model: SolutionModel, portId: string, port: string | number): boolean {
  const defined = model.registry.getPort(portId);
  if (typeof port === "number") return defined?.port === port;
  if (portId === port) return true;
  const other = model.registry.getPort(port);
  return (
    defined !== undefined &&
    other !== undefined &&
    defined.port === other.port &&
    defined.protocol === other.protocol
  );
}
