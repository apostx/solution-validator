/**
 * IPv4 and IPv6 address ranges for the detailed analysis level. Addresses are `bigint`s, so the
 * arithmetic is exact and deterministic in every runtime.
 */
export type AddressFamily = 4 | 6;

export interface Cidr {
  family: AddressFamily;
  /** The first address of the range. */
  start: bigint;
  /** The last address of the range. */
  end: bigint;
  prefix: number;
  /** Whether the text named the network address (no host bits set). */
  network: boolean;
  text: string;
}

const BITS: Record<AddressFamily, number> = { 4: 32, 6: 128 };
const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const GROUP = /^[0-9a-fA-F]{1,4}$/;
const PREFIX = /^(0|[1-9]\d{0,2})$/;

function parseV4(text: string): bigint | undefined {
  const match = V4.exec(text);
  if (!match) return undefined;
  const octets = match.slice(1, 5);
  if (octets.some((octet) => Number(octet) > 255 || (octet.length > 1 && octet.startsWith("0")))) {
    return undefined;
  }
  return octets.reduce((value, octet) => value * 256n + BigInt(Number(octet)), 0n);
}

function parseV6(text: string): bigint | undefined {
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const split = (part: string | undefined) => (part ? part.split(":") : []);
  const head = split(halves[0]);
  const tail = split(halves[1]);
  if (![...head, ...tail].every((group) => GROUP.test(group))) return undefined;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;
  const groups = [...head, ...Array<string>(halves.length === 1 ? 0 : missing).fill("0"), ...tail];
  return groups.reduce((value, group) => value * 65536n + BigInt(Number.parseInt(group, 16)), 0n);
}

/** Parses `a.b.c.d/n` or an IPv6 range such as `2001:db8::/32`. Anything else: `undefined`. */
export function parseCidr(text: string): Cidr | undefined {
  const slash = text.indexOf("/");
  if (slash < 0 || !PREFIX.test(text.slice(slash + 1))) return undefined;
  const addressText = text.slice(0, slash);
  const family: AddressFamily = addressText.includes(":") ? 6 : 4;
  const address = family === 4 ? parseV4(addressText) : parseV6(addressText);
  const prefix = Number(text.slice(slash + 1));
  if (address === undefined || prefix > BITS[family]) return undefined;
  const size = 1n << BigInt(BITS[family] - prefix);
  const start = (address / size) * size;
  return { family, start, end: start + size - 1n, prefix, network: start === address, text };
}

export function isCidr(text: string): boolean {
  return parseCidr(text) !== undefined;
}

/** Whether `inner` lies entirely within `outer`. Ranges of different families never do. */
export function cidrContains(outer: Cidr, inner: Cidr): boolean {
  return outer.family === inner.family && outer.start <= inner.start && inner.end <= outer.end;
}

export function cidrOverlaps(a: Cidr, b: Cidr): boolean {
  return a.family === b.family && a.start <= b.end && b.start <= a.end;
}

/** The number of addresses in the range. */
export function cidrSize(cidr: Cidr): bigint {
  return cidr.end - cidr.start + 1n;
}

/** Formats an address: dotted IPv4, or IPv6 in its canonical compressed form (RFC 5952). */
export function formatAddress(family: AddressFamily, address: bigint): string {
  if (family === 4) {
    return [24n, 16n, 8n, 0n].map((shift) => String((address >> shift) & 255n)).join(".");
  }
  const groups: number[] = [];
  for (let shift = 112n; shift >= 0n; shift -= 16n) {
    groups.push(Number((address >> shift) & 65535n));
  }
  let best = { start: -1, length: 0 };
  let run = { start: -1, length: 0 };
  groups.forEach((group, index) => {
    if (group !== 0) {
      run = { start: -1, length: 0 };
      return;
    }
    run = run.start < 0 ? { start: index, length: 1 } : { ...run, length: run.length + 1 };
    if (run.length > best.length) best = run;
  });
  const hex = (list: number[]) => list.map((group) => group.toString(16)).join(":");
  if (best.length < 2) return hex(groups);
  return `${hex(groups.slice(0, best.start))}::${hex(groups.slice(best.start + best.length))}`;
}

/**
 * Ranges that are not public internet addresses. IPv4: private (RFC 1918), shared (RFC 6598),
 * loopback and link-local. IPv6: unspecified, loopback, unique local, link-local and multicast.
 */
const NON_PUBLIC = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "::/128",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
]
  .map((text) => parseCidr(text))
  .filter((cidr): cidr is Cidr => cidr !== undefined);

/** Whether the range contains any public internet address. */
export function containsPublic(cidr: Cidr): boolean {
  // Walk the range, skipping the non-public blocks it covers; anything left is public.
  let cursor = cidr.start;
  const blocks = NON_PUBLIC.filter((block) => cidrOverlaps(block, cidr)).sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
  );
  for (const block of blocks) {
    if (block.start > cursor) return true;
    if (block.end + 1n > cursor) cursor = block.end + 1n;
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
