import { describe, it, expect } from 'vitest';
import { classifyPriority, isTodayTarget } from './priority';
import type { Flags } from '../db/types';

const f = (p: Partial<Flags>): Flags => ({
  hakenUsage: 'unknown',
  pastOrder: 'no',
  basicContract: 'no',
  contacted: 'no',
  ...p,
});

describe('classifyPriority (§5.4 の表)', () => {
  it('有/無/無/無 → 最優先・新規開拓', () => {
    const r = classifyPriority(
      f({ hakenUsage: 'yes', pastOrder: 'no', basicContract: 'no', contacted: 'no' }),
    );
    expect(r.tone).toBe('top');
    expect(r.rank).toBe(1);
  });

  it('有/無/無/有 → 育成中', () => {
    const r = classifyPriority(
      f({ hakenUsage: 'yes', pastOrder: 'no', basicContract: 'no', contacted: 'yes' }),
    );
    expect(r.tone).toBe('nurture');
  });

  it('有/有/有/有 → 既存・深耕', () => {
    const r = classifyPriority(
      f({ hakenUsage: 'yes', pastOrder: 'yes', basicContract: 'yes', contacted: 'yes' }),
    );
    expect(r.tone).toBe('deepen');
  });

  it('有/有/無/有 → 正常フロー（警告色なし）', () => {
    const r = classifyPriority(
      f({ hakenUsage: 'yes', pastOrder: 'yes', basicContract: 'no', contacted: 'yes' }),
    );
    expect(r.tone).toBe('normal');
    // 異常ではない＝赤系の警告色ではないこと
    expect(r.color).toBe('#22c55e');
  });

  it('不明/-/-/無 → 未開拓', () => {
    const r = classifyPriority(f({ hakenUsage: 'unknown', contacted: 'no' }));
    expect(r.tone).toBe('frontier');
  });

  it('無/-/-/- → 低優先', () => {
    const r = classifyPriority(f({ hakenUsage: 'no' }));
    expect(r.tone).toBe('low');
  });
});

describe('isTodayTarget', () => {
  it('最優先・未開拓・育成中・正常フローは対象', () => {
    expect(isTodayTarget(f({ hakenUsage: 'yes', pastOrder: 'no', contacted: 'no' }))).toBe(true);
    expect(isTodayTarget(f({ hakenUsage: 'unknown' }))).toBe(true);
    expect(
      isTodayTarget(f({ hakenUsage: 'yes', pastOrder: 'no', contacted: 'yes' })),
    ).toBe(true);
  });

  it('低優先・既存深耕は対象外', () => {
    expect(isTodayTarget(f({ hakenUsage: 'no' }))).toBe(false);
    expect(
      isTodayTarget(f({ hakenUsage: 'yes', pastOrder: 'yes', basicContract: 'yes', contacted: 'yes' })),
    ).toBe(false);
  });
});
