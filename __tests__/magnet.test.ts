import {
  isValidInfoHash,
  isValidMagnet,
  looksLikeMagnetCandidate,
  parseMagnet,
} from '../src/utils/magnet';

const V1 = 'c9e15763f722f23e98a29decdfae341b98d53056';
const V2 = 'a'.repeat(64);
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

describe('magnet URI validation', () => {
  it('accepts a well formed v1 magnet', () => {
    expect(isValidMagnet(`magnet:?xt=urn:btih:${V1}&dn=Example`)).toBe(true);
  });

  it('accepts uppercase hex and base32 info-hashes', () => {
    expect(isValidMagnet(`magnet:?xt=urn:btih:${V1.toUpperCase()}`)).toBe(true);
    expect(isValidMagnet(`magnet:?xt=urn:btih:${BASE32}`)).toBe(true);
  });

  it('accepts a v2 (btmh) magnet', () => {
    expect(isValidMagnet(`magnet:?xt=urn:btmh:${V2}`)).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isValidMagnet('')).toBe(false);
    expect(isValidMagnet('   ')).toBe(false);
    expect(isValidMagnet('http://example.com/file.torrent')).toBe(false);
    expect(isValidMagnet('magnet:')).toBe(false);
    expect(isValidMagnet('magnet:?dn=missing-hash')).toBe(false);
    expect(isValidMagnet(`magnet:?xt=urn:btih:${V1.slice(0, 30)}`)).toBe(false);
    expect(isValidMagnet(`magnet:?xt=urn:btih:notahash`)).toBe(false);
    expect(isValidMagnet(null as unknown as string)).toBe(false);
  });

  it('validates bare info-hashes', () => {
    expect(isValidInfoHash(V1)).toBe(true);
    expect(isValidInfoHash(V2)).toBe(true);
    expect(isValidInfoHash('zzz')).toBe(false);
  });

  it('detects magnet-looking candidates without validating them', () => {
    expect(looksLikeMagnetCandidate(' magnet:?xt=...')).toBe(true);
    expect(looksLikeMagnetCandidate('https://example.com')).toBe(false);
  });

  it('parses trackers, display name and exact length', () => {
    const uri =
      `magnet:?xt=urn:btih:${V1}` +
      '&dn=Debian+ISO' +
      '&tr=' + encodeURIComponent('udp://tracker.example.com:80/announce') +
      '&tr=' + encodeURIComponent('https://tracker2.example.com/announce') +
      '&xl=12345';

    const parsed = parseMagnet(uri);
    expect(parsed).not.toBeNull();
    expect(parsed?.infoHash).toBe(V1);
    expect(parsed?.displayName).toBe('Debian ISO');
    expect(parsed?.trackers).toHaveLength(2);
    expect(parsed?.trackers[0]).toBe('udp://tracker.example.com:80/announce');
    expect(parsed?.exactLength).toBe(12345);
  });

  it('ignores unsupported tracker schemes', () => {
    const parsed = parseMagnet(`magnet:?xt=urn:btih:${V1}&tr=${encodeURIComponent('ftp://x/y')}`);
    expect(parsed?.trackers).toEqual([]);
  });

  it('returns null for invalid magnets', () => {
    expect(parseMagnet('magnet:?dn=nope')).toBeNull();
  });
});
