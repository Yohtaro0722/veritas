// Overpass API（OSM建物データ）取得。建物形状をタップ対象にする（§5.1）。
// 通信が必要 → 準備モード専用。現場（オフライン）では呼ばない。

export interface OverpassBuilding {
  osmId: string;
  name?: string;
  /** 代表点（重心の簡易計算） */
  lat: number;
  lng: number;
  /** [lat, lng][] のリング */
  polygon: [number, number][];
}

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** 矩形範囲内の建物（way の building=*）を取得 */
export async function fetchBuildings(bbox: BBox, signal?: AbortSignal): Promise<OverpassBuilding[]> {
  const { south, west, north, east } = bbox;
  const query = `
    [out:json][timeout:60];
    (
      way["building"](${south},${west},${north},${east});
    );
    out body geom;
  `;

  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      return parseElements(json.elements ?? []);
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) throw e;
    }
  }
  throw lastErr ?? new Error('Overpass 取得に失敗しました');
}

interface OverpassElement {
  type: string;
  id: number;
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

function parseElements(elements: OverpassElement[]): OverpassBuilding[] {
  const out: OverpassBuilding[] = [];
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 3) continue;
    const polygon = el.geometry.map((g) => [g.lat, g.lon] as [number, number]);
    const [lat, lng] = centroid(polygon);
    out.push({
      osmId: `way/${el.id}`,
      name: el.tags?.name,
      lat,
      lng,
      polygon,
    });
  }
  return out;
}

function centroid(ring: [number, number][]): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const [la, ln] of ring) {
    sx += la;
    sy += ln;
  }
  return [sx / ring.length, sy / ring.length];
}
