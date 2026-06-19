import { useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Tooltip,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addBuilding } from '../db/db';
import { useGeolocation } from '../hooks/useGeolocation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { GSI_TILE_BASE } from '../lib/tileCache';

// 地理院タイルで地図表示・現在地・建物ポリゴンのタップ（§5.1）。
// 既定の表示位置は皇居周辺（丸の内・千代田区を想定）。
const DEFAULT_CENTER: [number, number] = [35.6841, 139.7528];

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const recenter = () => map.setView([lat, lng], Math.max(map.getZoom(), 17));
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

  const buildings = useLiveQuery(() => db.buildings.toArray(), [], []);

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
        歩きながらビルをタップ → テナント一覧へ。
        {online ? (
          <span className="online-pill">オンライン（準備モード可）</span>
        ) : (
          <span className="offline-pill">オフライン（現場モード）</span>
        )}
        {geo.error && <div style={{ color: '#fca5a5' }}>位置情報: {geo.error}</div>}
      </div>

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

      <MapContainer center={center} zoom={17} zoomControl={false} attributionControl>
        <TileLayer
          url={`${GSI_TILE_BASE}/{z}/{x}/{y}.png`}
          attribution='出典: <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
          maxZoom={18}
        />

        {/* 現在地 */}
        {geo.lat && geo.lng && (
          <CircleMarker
            center={[geo.lat, geo.lng]}
            radius={8}
            pathOptions={{ color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.9 }}
          />
        )}

        {/* 建物（ポリゴンがあれば形状、なければ点） */}
        {buildings.map((b) =>
          b.polygon && b.polygon.length >= 3 ? (
            <Polygon
              key={b.id}
              positions={b.polygon}
              pathOptions={{ color: '#38bdf8', weight: 2, fillOpacity: 0.25 }}
              eventHandlers={{ click: () => navigate(`/building/${b.id}`) }}
            >
              <Tooltip>{b.name}</Tooltip>
            </Polygon>
          ) : (
            <CircleMarker
              key={b.id}
              center={[b.lat, b.lng]}
              radius={10}
              pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.7 }}
              eventHandlers={{ click: () => navigate(`/building/${b.id}`) }}
            >
              <Tooltip>{b.name}</Tooltip>
            </CircleMarker>
          ),
        )}

        <AddOnTap enabled={addMode} onAdd={handleAdd} />
        {geo.lat && geo.lng && <Recenter lat={geo.lat} lng={geo.lng} />}
      </MapContainer>
    </div>
  );
}
