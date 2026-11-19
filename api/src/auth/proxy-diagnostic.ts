import { Logger } from '@nestjs/common';
import { Request } from 'express';
import { BlockList, isIP } from 'node:net';

// TEMPORARY (D-018 step 1): describes how a login request reached the app, to choose the
// visitor IP source. It never logs an IP address, only what kind of address each one is.
// Removed in D-018 step 2.

/** A documentation address (RFC 5737) sent in forged headers by the test requests. */
const MARKER = '203.0.113.7';

const PRIVATE = new BlockList();
for (const [network, prefix] of [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['100.64.0.0', 10],
  ['169.254.0.0', 16],
] as const) {
  PRIVATE.addSubnet(network, prefix, 'ipv4');
}
PRIVATE.addSubnet('fc00::', 7, 'ipv6');
PRIVATE.addSubnet('fe80::', 10, 'ipv6');
PRIVATE.addAddress('::1', 'ipv6');

function normalise(address: string): string {
  return address.trim().replace(/^::ffff:/, '');
}

function kind(address: string | undefined): string {
  if (address === undefined) return 'absent';
  const value = normalise(address);
  if (value === MARKER) return 'marker';
  const version = isIP(value);
  if (version === 0) return 'invalid';
  return PRIVATE.check(value, version === 4 ? 'ipv4' : 'ipv6') ? 'private' : 'public';
}

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value.join(',') : value;
}

/** Position of the value in the forwarded list, counted from the right (1 = last), or null. */
function positionFromRight(list: string[], value: string | undefined): number | null {
  if (value === undefined) return null;
  const index = list.lastIndexOf(normalise(value));
  return index === -1 ? null : list.length - index;
}

const logger = new Logger('ProxyDiagnostic');

export function logProxyChain(request: Request): void {
  const forwarded = (header(request, 'x-forwarded-for') ?? '')
    .split(',')
    .map(normalise)
    .filter((entry) => entry !== '');
  const cfConnectingIp = header(request, 'cf-connecting-ip');
  const trueClientIp = header(request, 'true-client-ip');

  logger.log(
    JSON.stringify({
      xffKinds: forwarded.map(kind),
      socket: kind(request.socket.remoteAddress),
      requestIp: kind(request.ip),
      requestIpPositionFromRight: positionFromRight(forwarded, request.ip),
      cfConnectingIp: kind(cfConnectingIp),
      cfConnectingIpPositionFromRight: positionFromRight(forwarded, cfConnectingIp),
      trueClientIp: kind(trueClientIp),
      trueClientIpPositionFromRight: positionFromRight(forwarded, trueClientIp),
      cfRay: header(request, 'cf-ray') !== undefined,
    }),
  );
}
