import { useRef, useState } from 'react';
import { geocode, type GeocodeResult } from '../lib/gsi';
import { downloadArea, type DownloadProgress } from '../lib/tileCache';
import type { BBox } from '../lib/overpass';
import { exportBackup, downloadBackup, importBackup } from '../lib/backup';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

// 準備モード（机・オンライン）。エリア事前DL、ジオコーディング、バックアップ（§3.1）。

// 緯度経度＋半径(m)から矩形bboxを作る（簡易・緯度1度≒111km換算）
function bboxFromCenter(lat: number, lng: number, radiusM: number): BBox {
  const dLat = radiusM / 111000;
  const dLng = radiusM / (111000 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
}

export default function PrepPage() {
  const online = useOnlineStatus();
  const importRef = useRef<HTMLInputElement>(null);

  // ジオコーディング
  const [address, setAddress] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [center, setCenter] = useState<GeocodeResult | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  // エリアDL
  const [radius, setRadius] = useState(400);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [dlMsg, setDlMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onGeocode = async () => {
    setGeoErr(null);
    try {
      const res = await geocode(address);
      setResults(res.slice(0, 8));
      if (res.length === 0) setGeoErr('該当する住所が見つかりませんでした。');
    } catch (e) {
      setGeoErr(e instanceof Error ? e.message : 'ジオコーディングに失敗しました');
    }
  };

  const onDownload = async () => {
    if (!center) return;
    setDlMsg(null);
    const bbox = bboxFromCenter(center.lat, center.lng, radius);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const result = await downloadArea(bbox, {
        signal: ac.signal,
        onProgress: setProgress,
      });
      setDlMsg(`完了: タイル${result.tilesDone}枚 / 建物${result.buildingsSaved}件をキャッシュしました。`);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setDlMsg('ダウンロードを中止しました。');
      } else {
        setDlMsg(e instanceof Error ? `失敗: ${e.message}` : 'ダウンロードに失敗しました');
      }
    } finally {
      abortRef.current = null;
    }
  };

  const onExport = async () => {
    const blob = await exportBackup();
    downloadBackup(blob);
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('現在のデータを全て置き換えます。よろしいですか？')) return;
    try {
      await importBackup(file);
      window.alert('復元しました。');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '復元に失敗しました');
    }
    if (importRef.current) importRef.current.value = '';
  };

  return (
    <div className="page">
      <h1>準備モード</h1>
      <div className="muted" style={{ marginBottom: 12 }}>
        オンラインで机上作業。エリアの地図・建物を事前DLし、現場（オフライン）で通信ゼロにします。
        {online ? (
          <span className="online-pill">オンライン</span>
        ) : (
          <span className="offline-pill">オフライン（DL不可）</span>
        )}
      </div>

      <h2>1. エリアを探す（ジオコーディング）</h2>
      <div className="card stack">
        <div className="row">
          <input
            placeholder="例: 東京都千代田区丸の内"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <button className="primary" style={{ flex: 'none' }} disabled={!online} onClick={onGeocode}>
            検索
          </button>
        </div>
        {geoErr && <div className="muted" style={{ color: '#fca5a5' }}>{geoErr}</div>}
        {results.map((r, i) => (
          <button
            key={i}
            className={center === r ? 'primary' : 'ghost'}
            onClick={() => setCenter(r)}
          >
            {r.address}（{r.lat.toFixed(4)}, {r.lng.toFixed(4)}）
          </button>
        ))}
      </div>

      <h2>2. エリアを事前ダウンロード</h2>
      <div className="card stack">
        <div className="muted">
          中心: {center ? center.address : '未選択（上で選んでください）'}
        </div>
        <div>
          <label>半径: {radius}m（タイル＋建物を取得）</label>
          <input
            type="range"
            min={200}
            max={1000}
            step={100}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            style={{ minHeight: 32 }}
          />
        </div>
        {progress && (
          <div>
            <div className="muted">
              {progress.phase === 'tiles' && `タイル取得中 ${progress.tilesDone}/${progress.tilesTotal}`}
              {progress.phase === 'buildings' && `建物取得中 ${progress.buildingsSaved}件`}
              {progress.phase === 'done' && '完了'}
            </div>
            <div className="progress">
              <div
                style={{
                  width: `${
                    progress.tilesTotal
                      ? Math.round((progress.tilesDone / progress.tilesTotal) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}
        {dlMsg && <div className="muted">{dlMsg}</div>}
        <div className="row">
          <button className="primary" disabled={!online || !center} onClick={onDownload}>
            このエリアをDL
          </button>
          <button className="ghost" onClick={() => abortRef.current?.abort()}>中止</button>
        </div>
      </div>

      <h2>3. バックアップ / 復元（ローカルファイル）</h2>
      <div className="card stack">
        <div className="muted">
          全データ・写真を1ファイルに書き出します。第三者へ送信されません（§6）。
        </div>
        <button className="primary" onClick={onExport}>エクスポート（書き出し）</button>
        <input
          ref={importRef}
          className="hidden-file"
          type="file"
          accept="application/json"
          onChange={onImport}
        />
        <button className="ghost danger" onClick={() => importRef.current?.click()}>
          インポート（復元・全置換）
        </button>
      </div>
    </div>
  );
}
