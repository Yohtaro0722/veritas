import { describe, it, expect } from 'vitest';
import {
  classifyPriority,
  isTodayTarget,
  classifyProspect,
  aggregateBuildingProspects,
} from './priority';
import type { Flags, Tenant } from '../db/types';

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

describe('classifyProspect (4フラグ × アプローチ日付・v0.2)', () => {
  const today = '2026-06-22';
  const tenant = (p: Partial<Tenant>): Tenant => ({
    buildingId: 1,
    name: 'X社',
    flags: f({ hakenUsage: 'yes', contacted: 'yes' }),
    createdAt: 0,
    updatedAt: 0,
    ...p,
  });

  it('次回アプローチ日が今日以前なら再訪期限到来で最上位に浮上', () => {
    const s = classifyProspect(tenant({ nextApproachDate: '2026-06-20' }), today);
    expect(s.revisitDue).toBe(true);
    expect(s.overdueDays).toBe(2);
    expect(s.sortRank).toBeLessThan(0);
  });

  it('未来の次回アプローチ日は再訪期限ではない', () => {
    const s = classifyProspect(tenant({ nextApproachDate: '2026-07-01' }), today);
    expect(s.revisitDue).toBe(false);
    expect(s.sortRank).toBeGreaterThan(0);
  });

  it('接触済で最終アプローチから14日以上は放置警告', () => {
    const s = classifyProspect(tenant({ lastApproachDate: '2026-06-01' }), today);
    expect(s.stale).toBe(true);
    expect(s.badges.some((b) => b.includes('放置'))).toBe(true);
  });

  it('超過日数が大きいほど上位（sortRankが小さい）', () => {
    const a = classifyProspect(tenant({ nextApproachDate: '2026-06-10' }), today);
    const b = classifyProspect(tenant({ nextApproachDate: '2026-06-21' }), today);
    expect(a.sortRank).toBeLessThan(b.sortRank);
  });
});

describe('aggregateBuildingProspects (§5.5 ビル単位)', () => {
  const today = '2026-06-22';
  const t = (p: Partial<Tenant>): Tenant => ({
    buildingId: 1, name: 'n', flags: f({ hakenUsage: 'yes' }), createdAt: 0, updatedAt: 0, ...p,
  });

  it('isProspect=false は数えない／再訪期限到来を別途カウント', () => {
    const agg = aggregateBuildingProspects(
      [
        t({}),
        t({ isProspect: false }),
        t({ nextApproachDate: '2026-06-20' }),
      ],
      today,
    );
    expect(agg.prospectCount).toBe(2);
    expect(agg.revisitDueCount).toBe(1);
  });
});
