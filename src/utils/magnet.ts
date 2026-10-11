const MAGNET_SCHEME = /^magnet:\?/i;
const BTIH_HEX = /^[0-9a-f]{40}$/i;
const BTIH_BASE32 = /^[a-z2-7]{32}$/i;
const BTMH = /^[0-9a-f]{64}$/i;

export interface ParsedMagnet {
  infoHash: string;
  displayName: string | null;
  trackers: string[];
  webSeeds: string[];
  exactLength: number | null;
}

function parseQuery(query: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const pair of query.split('&')) {
    if (!pair) {
      continue;
    }
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    const value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    const existing = map.get(key);
    if (existing) {
      existing.push(value);
    } else {
      map.set(key, [value]);
    }
  }
  return map;
}

export function isValidInfoHash(value: string): boolean {
  return BTIH_HEX.test(value) || BTIH_BASE32.test(value) || BTMH.test(value);
}

export function isValidMagnet(uri: string): boolean {
  if (typeof uri !== 'string') {
    return false;
  }
  const trimmed = uri.trim();
  if (!MAGNET_SCHEME.test(trimmed)) {
    return false;
  }
  const qIndex = trimmed.indexOf('?');
  if (qIndex === -1) {
    return false;
  }
  const params = parseQuery(trimmed.slice(qIndex + 1));
  const xtValues = params.get('xt');
  if (!xtValues) {
    return false;
  }
  return xtValues.some(xt => {
    const match = /^urn:btih:(.+)$/i.exec(xt);
    if (match) {
      return isValidInfoHash(match[1]);
    }
    const matchV2 = /^urn:btmh:(.+)$/i.exec(xt);
    if (matchV2) {
      return BTMH.test(matchV2[1]);
    }
    return false;
  });
}

export function parseMagnet(uri: string): ParsedMagnet | null {
  if (!isValidMagnet(uri)) {
    return null;
  }
  const trimmed = uri.trim();
  const qIndex = trimmed.indexOf('?');
  const params = parseQuery(trimmed.slice(qIndex + 1));

  let infoHash = '';
  for (const xt of params.get('xt') ?? []) {
    const m = /^urn:btih:(.+)$/i.exec(xt);
    if (m) {
      infoHash = m[1].toLowerCase();
      break;
    }
  }

  const dn = params.get('dn')?.[0] ?? null;
  const trackers = (params.get('tr') ?? []).filter(t => /^https?:\/\//i.test(t) || /^udp:\/\//i.test(t));
  const webSeeds = (params.get('ws') ?? []).filter(w => /^https?:\/\//i.test(w));
  const xlRaw = params.get('xl')?.[0];
  const exactLength = xlRaw && /^\d+$/.test(xlRaw) ? Number(xlRaw) : null;

  if (!infoHash) {
    return null;
  }

  return { infoHash, displayName: dn, trackers, webSeeds, exactLength };
}

export function looksLikeMagnetCandidate(input: string): boolean {
  return /^magnet:/i.test(input.trim());
}
