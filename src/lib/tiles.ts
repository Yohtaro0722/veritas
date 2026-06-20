// 地図タイルの定義を1か所に集約。地図表示（MapView）と事前DL（tileCache）で共用する。
// すべて地理院タイル（無料・APIキー不要）。航空写真をデフォルトにする。

export type TileLayerId = 'photo' | 'pale';

export interface TileSource {
  id: TileLayerId;
  label: string;
  base: string;
  ext: 'jpg' | 'png';
  maxZoom: number;
  attribution: string;
}

const GSI = 'https://cyberjapandata.gsi.go.jp/xyz';

export const TILE_SOURCES: Record<TileLayerId, TileSource> = {
  // 航空写真（全国最新写真・シームレス）。Googleマップの衛星に近い見た目。
  photo: {
    id: 'photo',
    label: '航空写真',
    base: `${GSI}/seamlessphoto`,
    ext: 'jpg',
    maxZoom: 18,
    attribution:
      '出典: <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院（全国最新写真）</a>',
  },
  // 淡色地図（落ち着いたベース・道路や名称が読める）。
  pale: {
    id: 'pale',
    label: '淡色地図',
    base: `${GSI}/pale`,
    ext: 'png',
    maxZoom: 18,
    attribution: '出典: <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
  },
};

export const DEFAULT_LAYER: TileLayerId = 'photo';

/** react-leaflet の TileLayer 用 URL テンプレート */
export function tileUrlTemplate(s: TileSource): string {
  return `${s.base}/{z}/{x}/{y}.${s.ext}`;
}

/** 事前DL用の実 URL */
export function tileUrl(s: TileSource, z: number, x: number, y: number): string {
  return `${s.base}/${z}/${x}/${y}.${s.ext}`;
}
