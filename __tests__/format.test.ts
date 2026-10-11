import {
  clamp,
  formatBytes,
  formatCount,
  formatDuration,
  formatEta,
  formatPercent,
  formatSpeed,
} from '../src/utils/format';

describe('byte and speed formatting', () => {
  it('formats byte counts with sensible precision', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-10)).toBe('0 B');
    expect(formatBytes(null)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 1024 * 3.5)).toBe('3.50 MB');
    expect(formatBytes(1024 * 1024 * 120)).toBe('120 MB');
    expect(formatBytes(1024 ** 4 * 2)).toBe('2.00 TB');
  });

  it('formats rates', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
    expect(formatSpeed(undefined)).toBe('0 B/s');
    expect(formatSpeed(2048)).toBe('2.00 KB/s');
  });

  it('formats ETA only when it is meaningful', () => {
    expect(formatEta(null)).toBe('—');
    expect(formatEta(Number.NaN)).toBe('—');
    expect(formatEta(-5)).toBe('—');
    expect(formatEta(0)).toBe('0s');
    expect(formatEta(45)).toBe('45s');
    expect(formatEta(125)).toBe('2m 5s');
    expect(formatEta(3 * 3600 + 20 * 60)).toBe('3h 20m');
    expect(formatEta(50 * 3600)).toBe('2d 2h');
  });

  it('formats percentages without exceeding bounds', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.004)).toBe('0.4%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(1.5)).toBe('100%');
    expect(formatPercent(-1)).toBe('0%');
  });

  it('formats durations and counts', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(90)).toBe('1m');
    expect(formatDuration(3700)).toBe('1h 1m');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(null)).toBe('0');
    expect(formatCount(7)).toBe('7');
  });

  it('clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});
