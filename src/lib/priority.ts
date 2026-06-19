import type { Flags } from '../db/types';

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
