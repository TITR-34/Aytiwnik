import { describe, it, expect } from 'vitest';
import { shuffle, shuffleOptions, clampPoints, joinCode } from './util';

describe('util', () => {
  it('shuffle keeps all items without duplicates', () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    const s = shuffle(a);
    expect([...s].sort((x, y) => x - y)).toEqual(a);
  });
  it('two shuffles are (almost surely) different', () => {
    const a = Array.from({ length: 30 }, (_, i) => i);
    expect(shuffle(a)).not.toEqual(shuffle(a));
  });
  it('shuffled options keep id->text mapping', () => {
    const opts = [
      { id: 'a', text: 'A1' }, { id: 'b', text: 'B1' }, { id: 'c', text: 'C1' }, { id: 'd', text: 'D1' },
    ];
    const s = shuffleOptions(opts);
    for (const o of s) expect(opts.find((x) => x.id === o.id)!.text).toBe(o.text);
  });
  it('clampPoints never exceeds max or goes negative', () => {
    expect(clampPoints(12, 10)).toBe(10);
    expect(clampPoints(-3, 10)).toBe(0);
    expect(clampPoints('abc', 10)).toBe(0);
    expect(clampPoints(7.3, 10)).toBe(7.5);
  });
  it('joinCode has right length and charset', () => {
    expect(joinCode()).toMatch(/^[A-Z2-9]{8}$/);
  });
});
