import { Fragment, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Marker,
  Tooltip,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addBuilding } from '../db/db';
import type { Tenant } from '../db/types';
import { useGeolocation } from '../hooks/useGeolocation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { TILE_SOURCES, DEFAULT_LAYER, tileUrlTemplate, type TileLayerId } from '../lib/tiles';
import {
  aggregateBuildingProspects,
  buildingHeatColor,
  type BuildingProspectAgg,
} from '../lib/priority';

// 地理院タイルで地図表示・現在地・建物ポリゴンのタップ（§5.1）。
// 既定は航空写真。建物・現在地は写真上で映える高コントラスト配色。
// v0.2：ビル単位の見込み件数バッジ＆色分け（2周目優先度・§5.5）。
const DEFAULT_CENTER: [number, number] = [35.6841, 139.7528];

// 見込みなしビルの既定色。
const BUILDING_COLOR = '#ffe600';
const BUILDING_POINT_COLOR = '#ff2d55';
const EMPTY_AGG: BuildingProspectAgg = { prospectCount: 0, revisitDueCount: 0 };

// 件数バッジ（数字＋再訪期限の「!」）の DivIcon を作る。
function badgeIcon(agg: BuildingProspectAgg): L.DivIcon {
  const color = buildingHeatColor(agg);
  const due = agg.revisitDueCount > 0;
  const txt = due ? '#ffffff' : '#0f172a';
  const html = `<div style="
      min-width:24px;height:24px;padding:0 5px;border-radius:999px;
      background:${color};color:${txt};border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.5);
      font-size:13px;font-weight:800;line-height:20px;text-align:center;
      ">${agg.prospectCount}${due ? '!' : ''}</div>`;
  return L.divIcon({ html, className: 'bldg-badge', iconSize: [26, 26], iconAnchor: [13, 13] });
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const recenter = () => map.setView([lat, lng], Math.max(map.getZoom(), 18));
  return (
    <button
      className="primary"
      style={{
        position: 'absolute',
        right: 12,
        bottom: 80,
        zIndex: 1000,
        minHeight: 52,
        borderRadius: 999,
        boxShadow: '0 2px 8px rgba(0,0,0,.4)',
      }}
      onClick={recenter}
    >
      現在地
    </button>
  );
}

function AddOnTap({ enabled, onAdd }: { enabled: boolean; onAdd: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (enabled) onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapPage() {
  const navigate = useNavigate();
  const geo = useGeolocation(true);
  const online = useOnlineStatus();
  const [addMode, setAddMode] = useState(false);
  const [layer, setLayer] = useState<TileLayerId>(DEFAULT_LAYER);
  const src = TILE_SOURCES[layer];

  const buildings = useLiveQuery(() => db.buildings.toArray(), [], []);

  // ビルごとの見込み件数・再訪期限到来数を集計（§5.5）。
  const aggByBuilding = useLiveQuery(async () => {
    const tenants = await db.tenants.toArray();
    const grouped = new Map<number, Tenant[]>();
    for (const t of tenants) {
      const arr = grouped.get(t.buildingId) ?? [];
      arr.push(t);
      grouped.set(t.buildingId, arr);
    }
    const map = new Map<number, BuildingProspectAgg>();
    for (const [bid, arr] of grouped) map.set(bid, aggregateBuildingProspects(arr));
    return map;
  }, [], new Map<number, BuildingProspectAgg>());

  const center = useMemo<[number, number]>(
    () => (geo.lat && geo.lng ? [geo.lat, geo.lng] : DEFAULT_CENTER),
    // 初期センターのみ。以後はユーザー操作優先。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleAdd = async (lat: number, lng: number) => {
    const name = window.prompt('ビル名を入力（後から編集可）');
    if (name === null) return;
    const id = await addBuilding({ name: name.trim() || '名称未設定のビル', lat, lng });
    setAddMode(false);
    navigate(`/building/${id}`);
  };

  return (
    <div className="map-wrap">
      <div className="map-banner">
        歩きながらビルをタップ → テナント一覧へ。数字＝見込み件数、赤＋「!」＝再訪期限。
        {online ? (
          <span className="online-pill">オンライン（準備モード可）</span>
        ) : (
          <span className="offline-pill">オフライン（現場モード）</span>
        )}
        {geo.error && <div style={{ color: '#fca5a5' }}>位置情報: {geo.error}</div>}
      </div>

      {/* 航空写真 / 淡色地図 の切替 */}
      <button
        onClick={() => setLayer((l) => (l === 'photo' ? 'pale' : 'photo'))}
        style={{
          position: 'absolute',
          right: 12,
          top: 'calc(64px + var(--safe-top))',
          zIndex: 1000,
          minHeight: 40,
          padding: '8px 12px',
          background: 'rgba(15,23,42,0.9)',
          boxShadow: '0 2px 8px rgba(0,0,0,.4)',
        }}
      >
        {layer === 'photo' ? '🛰 航空写真' : '🗺 淡色地図'}
      </button>

      <button
        className={addMode ? 'primary' : ''}
        style={{
          position: 'absolute',
          left: 12,
          bottom: 80,
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,.4)',
        }}
        onClick={() => setAddMode((v) => !v)}
      >
        {addMode ? 'タップで追加（中止）' : 'ビルを追加'}
      </button>

      <MapContainer center={center} zoom={18} zoomControl={false} attributionControl maxZoom={src.maxZoom}>
        <TileLayer key={layer} url={tileUrlTemplate(src)} attribution={src.attribution} maxZoom={src.maxZoom} />

        {/* 現在地：白フチ＋青で写真上でも視認 */}
        {geo.lat && geo.lng && (
          <CircleMarker
            center={[geo.lat, geo.lng]}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
          />
        )}

        {/* 建物（ポリゴンがあれば形状、なければ点）＋ 件数バッジ */}
        {buildings.map((b) => {
          const agg = aggByBuilding.get(b.id!) ?? EMPTY_AGG;
          const hasProspects = agg.prospectCount > 0;
          const shapeColor = hasProspects ? buildingHeatColor(agg) : BUILDING_COLOR;
          const onClick = () => navigate(`/building/${b.id}`);
          return (
            <Fragment key={b.id}>
              {b.polygon && b.polygon.length >= 3 ? (
                <Polygon
                  positions={b.polygon}
                  pathOptions={{
                    color: shapeColor,
                    weight: 3,
                    fillColor: shapeColor,
                    fillOpacity: hasProspects ? 0.5 : 0.35,
                  }}
                  eventHandlers={{ click: onClick }}
                >
                  <Tooltip className="bldg-tip" direction="top">{b.name}</Tooltip>
                </Polygon>
              ) : (
                <CircleMarker
                  center={[b.lat, b.lng]}
                  radius={11}
                  pathOptions={{
                    color: '#ffffff',
                    weight: 3,
                    fillColor: hasProspects ? buildingHeatColor(agg) : BUILDING_POINT_COLOR,
                    fillOpacity: 0.95,
                  }}
                  eventHandlers={{ click: onClick }}
                >
                  <Tooltip className="bldg-tip" direction="top">{b.name}</Tooltip>
                </CircleMarker>
              )}
              {hasProspects && (
                <Marker
                  position={[b.lat, b.lng]}
                  icon={badgeIcon(agg)}
                  eventHandlers={{ click: onClick }}
                />
              )}
            </Fragment>
          );
        })}

        <AddOnTap enabled={addMode} onAdd={handleAdd} />
        {geo.lat && geo.lng && <Recenter lat={geo.lat} lng={geo.lng} />}
      </MapContainer>
    </div>
  );
}
