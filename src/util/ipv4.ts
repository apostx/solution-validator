/**
 * IPv4 address ranges for the detailed analysis level. Pure integer arithmetic: deterministic in
 * every runtime. IPv6 is not supported yet.
 */
export interface Cidr {
  /** The first address of the range, as an unsigned 32-bit integer. */
  start: number;
  /** The last address of the range. */
  end: number;
  prefix: number;
  /** Whether the text named the network address (no host bits set). */
  network: boolean;
  text: string;
}

const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

/** Parses `a.b.c.d/n`. Returns `undefined` for anything else. */
export function parseCidr(text: string): Cidr | undefined {
  const match = CIDR.exec(text);
  if (!match) return undefined;
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((octet) => octet > 255) || prefix > 32) return undefined;
  if (match.slice(1, 5).some((octet) => octet.length > 1 && octet.startsWith("0")))
    return undefined;
  const address = octets.reduce((value, octet) => value * 256 + octet, 0);
  const size = 2 ** (32 - prefix);
  const start = Math.floor(address / size) * size;
  return { start, end: start + size - 1, prefix, network: start === address, text };
}

export function isCidr(text: string): boolean {
  return parseCidr(text) !== undefined;
}

/** Whether `inner` lies entirely within `outer`. */
export function cidrContains(outer: Cidr, inner: Cidr): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

export function cidrOverlaps(a: Cidr, b: Cidr): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** The number of addresses in the range. */
export function cidrSize(cidr: Cidr): number {
  return cidr.end - cidr.start + 1;
}

/**
 * Ranges that are not public internet addresses: private (RFC 1918), shared (RFC 6598),
 * loopback and link-local.
 */
const NON_PUBLIC = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
]
  .map((text) => parseCidr(text))
  .filter((cidr): cidr is Cidr => cidr !== undefined);

/** Whether the range contains any public internet address. */
export function containsPublic(cidr: Cidr): boolean {
  // Walk the range, skipping the non-public blocks it covers; anything left is public.
  let cursor = cidr.start;
  const blocks = NON_PUBLIC.filter((block) => cidrOverlaps(block, cidr)).sort(
    (a, b) => a.start - b.start,
  );
  for (const block of blocks) {
    if (block.start > cursor) return true;
    cursor = Math.max(cursor, block.end + 1);
    if (cursor > cidr.end) return false;
  }
  return cursor <= cidr.end;
}

/** A port range: a single port (`"443"`) or an inclusive range (`"1024-65535"`). */
export interface PortRange {
  from: number;
  to: number;
}

const PORT_RANGE = /^(\d{1,5})(?:-(\d{1,5}))?$/;

export function parsePortRange(text: string): PortRange | undefined {
  const match = PORT_RANGE.exec(text);
  if (!match) return undefined;
  const from = Number(match[1]);
  const to = match[2] === undefined ? from : Number(match[2]);
  if (from < 1 || to > 65535 || from > to) return undefined;
  return { from, to };
}

/** Ports clients use for replies; stateless filters must allow them for return traffic. */
export const EPHEMERAL_PORTS: PortRange = { from: 1024, to: 65535 };
