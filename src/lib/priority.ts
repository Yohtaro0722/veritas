import type { Flags, Tenant } from '../db/types';

// 見込みリストの「自動生成」の正体（§5.4）。
// AIが予測するのではなく、現場で入れた4つの事実フラグをルールで仕分け、
// 優先度を吐く。完全オフラインで決定論的に効く。

export type PriorityTone =
  | 'top' // 最優先・新規開拓
  | 'frontier' // 未開拓（まず案内板を撮る）
  | 'nurture' // 育成中
  | 'normal' // 正常フロー（警告色を出さない）
  | 'deepen' // 既存・深耕／追加提案
  | 'low' // 低優先
  | 'other'; // 上記以外（要確認）

export interface PriorityResult {
  /** 1 が最優先。一覧のソートキー */
  rank: number;
  tone: PriorityTone;
  /** 状態 */
  label: string;
  /** 攻め筋 */
  strategy: string;
  /** 表示色（CSSカラー） */
  color: string;
}

const RESULTS: Record<PriorityTone, Omit<PriorityResult, 'tone'>> = {
  top: {
    rank: 1,
    label: '最優先・新規開拓',
    strategy: 'ニーズ確実・未着手。今日いちばんに攻める。',
    color: '#ef4444',
  },
  frontier: {
    rank: 2,
    label: '未開拓',
    strategy: 'まず案内板を撮ってテナントと派遣利用を埋める対象。',
    color: '#f97316',
  },
  nurture: {
    rank: 3,
    label: '育成中',
    strategy: '接触済・受注前。関係を進めて受注へ。',
    color: '#eab308',
  },
  normal: {
    rank: 4,
    // ※派遣=有 × 受注=有 × 契約=無 は異常ではなく正常フロー。警告色は出さない。
    label: '正常フロー',
    strategy: '開始前までに基本契約を巻く（即日締結可のため警戒不要）。',
    color: '#22c55e',
  },
  deepen: {
    rank: 5,
    label: '既存・深耕／追加提案',
    strategy: '既存。追加提案で深耕する。',
    color: '#3b82f6',
  },
  low: {
    rank: 6,
    label: '低優先',
    strategy: '派遣利用なし。今は優先度低。',
    color: '#94a3b8',
  },
  other: {
    rank: 5,
    label: '要確認',
    strategy: 'フラグの組み合わせを確認。',
    color: '#64748b',
  },
};

function build(tone: PriorityTone): PriorityResult {
  return { tone, ...RESULTS[tone] };
}

/**
 * 4フラグから優先度を決定論的に算出する（§5.4 の表を実装）。
 */
export function classifyPriority(flags: Flags): PriorityResult {
  const { hakenUsage, pastOrder, basicContract, contacted } = flags;

  // 派遣利用=無 → 低優先（受注・契約・接触は不問）
  if (hakenUsage === 'no') {
    return build('low');
  }

  // 派遣利用=不明 → 探索対象。未接触なら「未開拓」。
  if (hakenUsage === 'unknown') {
    // 接触済で派遣利用が不明なままなら、引き続き探索対象として未開拓扱い。
    return build('frontier');
  }

  // ここから派遣利用=有
  if (pastOrder === 'no') {
    if (contacted === 'no') {
      // 有 / 無 / 無 / 無 → 最優先・新規開拓
      return build('top');
    }
    // 有 / 無 / - / 有 → 育成中（接触済・受注前）
    return build('nurture');
  }

  // 派遣=有 かつ 受注=有
  if (basicContract === 'yes') {
    // 有 / 有 / 有 / 有 → 既存・深耕
    return build('deepen');
  }
  // 有 / 有 / 無 / 有 → 正常フロー（警告色なし）
  return build('normal');
}

/** 「今日攻めるべき先」に出すべきか（低優先・既存深耕は除外） */
export function isTodayTarget(flags: Flags): boolean {
  const tone = classifyPriority(flags).tone;
  return tone === 'top' || tone === 'frontier' || tone === 'nurture' || tone === 'normal';
}

// --- v0.2：状態(4フラグ) × タイミング(アプローチ日) の掛け算（§5.4） ----------

/** 最終アプローチからこの日数以上で「放置警告」 */
export const STALE_DAYS = 14;

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO日付(YYYY-MM-DD)同士の経過日数。a→b の日数。 */
export function daysBetweenISO(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00');
  const b = Date.parse(to + 'T00:00:00');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export interface ProspectInput {
  flags: Flags;
  lastApproachDate?: string;
  nextApproachDate?: string;
}

export interface ProspectStatus {
  /** 状態ベースの分類 */
  base: PriorityResult;
  /** 次回アプローチ日 ≦ 今日（再訪期限到来） */
  revisitDue: boolean;
  /** 再訪期限の超過日数（来ていなければ null） */
  overdueDays: number | null;
  /** 最終アプローチからの経過日数（未接触は null） */
  daysSinceLast: number | null;
  /** 放置警告（接触済なのに長期放置） */
  stale: boolean;
  /** 一覧のソートキー（小さいほど上位）。再訪期限到来は最上位に浮上。 */
  sortRank: number;
  /** バッジ表示用ラベル */
  badges: string[];
}

/**
 * 4フラグ × アプローチ日付 を重ねて再訪・放置を炙る（§5.4）。
 * 次回アプローチ日が今日以前なら最上位、放置は警告として付与する。
 */
export function classifyProspect(input: ProspectInput, today = todayISO()): ProspectStatus {
  const base = classifyPriority(input.flags);
  const badges: string[] = [];

  let revisitDue = false;
  let overdueDays: number | null = null;
  if (input.nextApproachDate) {
    const d = daysBetweenISO(input.nextApproachDate, today);
    if (d >= 0) {
      revisitDue = true;
      overdueDays = d;
      badges.push(d === 0 ? '本日再訪' : `再訪期限${d}日超過`);
    }
  }

  let daysSinceLast: number | null = null;
  let stale = false;
  if (input.lastApproachDate) {
    daysSinceLast = daysBetweenISO(input.lastApproachDate, today);
    if (daysSinceLast >= STALE_DAYS && input.flags.contacted === 'yes') {
      stale = true;
      badges.push(`放置${daysSinceLast}日`);
    }
  }

  // 再訪期限到来は base.rank より優先（最上位）。超過日数が大きいほど上。
  // sortRank: revisitDue → 0.xxx（超過大ほど小さく）、それ以外は base.rank。
  let sortRank: number;
  if (revisitDue) {
    sortRank = -1000 - (overdueDays ?? 0); // 超過が大きいほど上位
  } else {
    sortRank = base.rank + (stale ? -0.5 : 0); // 放置はわずかに浮上
  }

  return { base, revisitDue, overdueDays, daysSinceLast, stale, sortRank, badges };
}

/** 見込みリストに出すか（isProspect 既定true ＝ undefinedも対象） */
export function isProspectActive(isProspect: boolean | undefined): boolean {
  return isProspect !== false;
}

// --- v0.2：ビル単位の集計（§5.5 2周目優先度） --------------------------------

export interface BuildingProspectAgg {
  /** 見込みリスト入りの企業数 */
  prospectCount: number;
  /** 再訪期限が今日以前のテナント数 */
  revisitDueCount: number;
}

/** 1棟ぶんのテナントから見込み件数と再訪期限到来数を集計する */
export function aggregateBuildingProspects(
  tenants: Tenant[],
  today = todayISO(),
): BuildingProspectAgg {
  let prospectCount = 0;
  let revisitDueCount = 0;
  for (const t of tenants) {
    if (!isProspectActive(t.isProspect)) continue;
    prospectCount++;
    if (classifyProspect(t, today).revisitDue) revisitDueCount++;
  }
  return { prospectCount, revisitDueCount };
}

/** 件数→色の段階（§5.5：多いほど濃い/目立つ）。再訪期限ありは強調色。 */
export function buildingHeatColor(agg: BuildingProspectAgg): string {
  if (agg.revisitDueCount > 0) return '#ef4444'; // 再訪期限到来=赤で最強調
  if (agg.prospectCount >= 5) return '#f97316';
  if (agg.prospectCount >= 3) return '#f59e0b';
  if (agg.prospectCount >= 1) return '#fde047';
  return '#38bdf8'; // 見込みなし=既定の水色
}
