import { db } from '../db/db';
import type { Flags } from '../db/types';
import { classifyProspect, isProspectActive, todayISO } from './priority';

// 1日の見込みリストを Excel(.xlsx) 化し、端末のメール等へワンタップ共有する。
// すべて端末内で生成（オフライン可）。送信は共有シート経由＝外部APIキー不要。

const haken = (v: Flags['hakenUsage']) => (v === 'yes' ? '有' : v === 'no' ? '無' : '不明');
const yn = (v: 'yes' | 'no') => (v === 'yes' ? '有' : '無');

export interface ProspectRow {
  優先度: string;
  タイミング: string;
  攻め筋: string;
  社名: string;
  ビル名: string;
  階: string;
  派遣利用: string;
  過去受注: string;
  基本契約: string;
  担当接触: string;
  最終アプローチ日: string;
  次回アプローチ日: string;
  最終活動日: string;
  受注件数: number;
  法人番号: string;
}

const HEADER: (keyof ProspectRow)[] = [
  '優先度', 'タイミング', '攻め筋', '社名', 'ビル名', '階',
  '派遣利用', '過去受注', '基本契約', '担当接触',
  '最終アプローチ日', '次回アプローチ日', '最終活動日', '受注件数', '法人番号',
];

/** 現時点の見込みリスト（再訪期限→優先度順）を行データにする */
export async function buildProspectRows(): Promise<ProspectRow[]> {
  const [tenants, buildings, activities, contracts] = await Promise.all([
    db.tenants.toArray(),
    db.buildings.toArray(),
    db.activities.toArray(),
    db.contracts.toArray(),
  ]);
  const bById = new Map(buildings.map((b) => [b.id!, b]));
  const lastActByTenant = new Map<number, string>();
  for (const a of activities) {
    const prev = lastActByTenant.get(a.tenantId);
    if (!prev || a.date > prev) lastActByTenant.set(a.tenantId, a.date);
  }
  const contractByTenant = new Map(contracts.map((c) => [c.tenantId, c]));
  const t0 = todayISO();

  return tenants
    .filter((t) => isProspectActive(t.isProspect))
    .map((t) => ({ t, s: classifyProspect(t, t0) }))
    .sort((a, b) => a.s.sortRank - b.s.sortRank || a.t.name.localeCompare(b.t.name))
    .map(({ t, s }) => ({
      優先度: s.base.label,
      タイミング: s.badges.join(' / '),
      攻め筋: s.base.strategy,
      社名: t.formalName || t.name,
      ビル名: bById.get(t.buildingId)?.name ?? '建物不明',
      階: t.floor ?? '',
      派遣利用: haken(t.flags.hakenUsage),
      過去受注: yn(t.flags.pastOrder),
      基本契約: yn(t.flags.basicContract),
      担当接触: yn(t.flags.contacted),
      最終アプローチ日: t.lastApproachDate ?? '',
      次回アプローチ日: t.nextApproachDate ?? '',
      最終活動日: lastActByTenant.get(t.id!) ?? '',
      受注件数: contractByTenant.get(t.id!)?.orders.length ?? 0,
      法人番号: t.corporateNumber ?? '',
    }));
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 見込みリストの .xlsx Blob を生成 */
export async function buildProspectsXlsx(): Promise<{ blob: Blob; rows: number }> {
  // SheetJS は重いので、出力時に動的importして本体バンドルを軽く保つ。
  const XLSX = await import('xlsx');
  const rows = await buildProspectRows();
  const ws = XLSX.utils.json_to_sheet(rows, { header: HEADER as string[] });
  // 列幅を読みやすく
  ws['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 22 }, { wch: 20 }, { wch: 6 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `見込み_${todayStamp()}`);
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return { blob, rows: rows.length };
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Web Share API（ファイル添付）でメール等へ共有。非対応端末では
 * ダウンロード＋（宛先があれば）メール下書きを開くフォールバック。
 */
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  opts: { email?: string; subject?: string; body?: string } = {},
): Promise<ShareResult> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };

  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: opts.subject ?? filename,
        text: opts.body ?? '',
      });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // それ以外はフォールバックへ
    }
  }

  // フォールバック：ファイルをダウンロード
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  // 宛先があればメール下書きを開く（添付は手動で付ける必要あり）
  if (opts.email) {
    const subject = encodeURIComponent(opts.subject ?? filename);
    const body = encodeURIComponent(
      (opts.body ? opts.body + '\n\n' : '') +
        `※ダウンロードした「${filename}」を添付して送信してください。`,
    );
    window.location.href = `mailto:${opts.email}?subject=${subject}&body=${body}`;
  }
  return 'downloaded';
}
