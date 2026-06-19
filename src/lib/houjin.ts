// 国税庁 法人番号システム Web-API（Ver4）。準備モード専用（§2）。
// 手入力した社名を正式名称・法人番号で補完し、将来の SFDC 連携キーにする。
//
// 注意: 本APIは無料だが「アプリケーションID」の事前発行が必要。
// .env に VITE_HOUJIN_APP_ID を設定すると有効化される。未設定なら UI 側で
// 補完機能を無効表示する。

const APP_ID = import.meta.env.VITE_HOUJIN_APP_ID as string | undefined;
const BASE = 'https://api.houjin-bangou.nta.go.jp/4';

export function isHoujinApiAvailable(): boolean {
  return Boolean(APP_ID);
}

export interface CorporateCandidate {
  corporateNumber: string;
  name: string;
  address?: string;
}

/** 社名で検索し、正式名称・法人番号の候補を返す */
export async function searchByName(
  name: string,
  signal?: AbortSignal,
): Promise<CorporateCandidate[]> {
  if (!APP_ID) {
    throw new Error('法人番号APIのアプリケーションID(VITE_HOUJIN_APP_ID)が未設定です');
  }
  const params = new URLSearchParams({
    id: APP_ID,
    name,
    type: '02', // Unicode CSV
    mode: '2', // 部分一致
  });
  const res = await fetch(`${BASE}/name?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`法人番号API ${res.status}`);
  const text = await res.text();
  return parseNameCsv(text);
}

// 1行目はヘッダ(件数等)。2行目以降がデータ。
// 列: 0=一連番号 1=法人番号 ... 6=法人名 ... 9=都道府県 10=市区町村 11=丁目番地
function parseNameCsv(text: string): CorporateCandidate[] {
  const rows = text.split(/\r?\n/).filter((l) => l.length > 0);
  const out: CorporateCandidate[] = [];
  // 先頭行は集計行（データ件数）なのでスキップ
  for (let i = 1; i < rows.length; i++) {
    const cols = parseCsvLine(rows[i]);
    if (cols.length < 7) continue;
    const corporateNumber = cols[1];
    const name = cols[6];
    if (!corporateNumber || !name) continue;
    const address = [cols[9], cols[10], cols[11]].filter(Boolean).join('');
    out.push({ corporateNumber, name, address: address || undefined });
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
