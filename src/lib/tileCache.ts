import type { BBox, OverpassBuilding } from './overpass';
import { fetchBuildings } from './overpass';
import { upsertBuildingByOsm } from '../db/db';
import { TILE_SOURCES, tileUrl, type TileLayerId } from './tiles';

// エリア事前ダウンロード（§5.5）。準備モードで矩形範囲の
// 地図タイル＋建物ポリゴンを取得し、オフラインでも地図・タップが効く状態を作る。
// タイルは fetch することで Workbox の runtimeCaching(gsi-tiles) に乗る。
// 航空写真・淡色地図の両方を取得し、現場での表示切替がオフラインでも効くようにする。

const DOWNLOAD_LAYERS: TileLayerId[] = ['photo', 'pale'];

// 緯度経度 → タイル座標
function lng2tile(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}
function lat2tile(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z),
  );
}

export interface TileRange {
  z: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function tileRangesForBBox(bbox: BBox, zooms: number[]): TileRange[] {
  return zooms.map((z) => ({
    z,
    xMin: lng2tile(bbox.west, z),
    xMax: lng2tile(bbox.east, z),
    yMin: lat2tile(bbox.north, z),
    yMax: lat2tile(bbox.south, z),
  }));
}

export function countTiles(ranges: TileRange[]): number {
  return ranges.reduce(
    (sum, r) => sum + (r.xMax - r.xMin + 1) * (r.yMax - r.yMin + 1),
    0,
  );
}

export interface DownloadProgress {
  tilesDone: number;
  tilesTotal: number;
  buildingsSaved: number;
  phase: 'tiles' | 'buildings' | 'done';
}

export interface DownloadOptions {
  zooms?: number[];
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  concurrency?: number;
}

/** 矩形エリアのタイルと建物をダウンロードしてキャッシュ／保存する */
export async function downloadArea(
  bbox: BBox,
  opts: DownloadOptions = {},
): Promise<{ tilesDone: number; buildingsSaved: number }> {
  const zooms = opts.zooms ?? [15, 16, 17, 18];
  const concurrency = opts.concurrency ?? 6;
  const ranges = tileRangesForBBox(bbox, zooms);
  // 航空写真・淡色地図の2レイヤー分を取得するので合計枚数も掛ける。
  const total = countTiles(ranges) * DOWNLOAD_LAYERS.length;

  // --- タイル ---
  const urls: string[] = [];
  for (const layerId of DOWNLOAD_LAYERS) {
    const src = TILE_SOURCES[layerId];
    for (const r of ranges) {
      for (let x = r.xMin; x <= r.xMax; x++) {
        for (let y = r.yMin; y <= r.yMax; y++) {
          urls.push(tileUrl(src, r.z, x, y));
        }
      }
    }
  }

  let tilesDone = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const url = urls[cursor++];
      try {
        // fetch するだけで SW のキャッシュに乗る
        await fetch(url, { mode: 'cors', signal: opts.signal });
      } catch {
        // 個々のタイル失敗は無視して継続
      }
      tilesDone++;
      opts.onProgress?.({
        tilesDone,
        tilesTotal: total,
        buildingsSaved: 0,
        phase: 'tiles',
      });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  // --- 建物ポリゴン ---
  opts.onProgress?.({
    tilesDone,
    tilesTotal: total,
    buildingsSaved: 0,
    phase: 'buildings',
  });
  let buildingsSaved = 0;
  try {
    const buildings: OverpassBuilding[] = await fetchBuildings(bbox, opts.signal);
    for (const b of buildings) {
      await upsertBuildingByOsm({
        name: b.name ?? '（名称未取得のビル）',
        lat: b.lat,
        lng: b.lng,
        polygon: b.polygon,
        osmId: b.osmId,
      });
      buildingsSaved++;
      opts.onProgress?.({
        tilesDone,
        tilesTotal: total,
        buildingsSaved,
        phase: 'buildings',
      });
    }
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    // 建物取得失敗はタイルDLを無駄にしないため握りつぶし、件数0で返す
  }

  opts.onProgress?.({
    tilesDone,
    tilesTotal: total,
    buildingsSaved,
    phase: 'done',
  });
  return { tilesDone, buildingsSaved };
}
