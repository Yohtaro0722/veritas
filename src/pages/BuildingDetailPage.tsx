import { useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  updateBuilding,
  deleteBuilding,
  addTenant,
  addSignboardPhoto,
  deleteSignboardPhoto,
} from '../db/db';
import { BlobImage } from '../components/BlobImage';
import { PriorityBadge } from '../components/PriorityBadge';

// ビル詳細：案内板写真の撮影・添付＋テナント手動登録（§5.2）。

export default function BuildingDetailPage() {
  const { id } = useParams();
  const buildingId = Number(id);
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const building = useLiveQuery(() => db.buildings.get(buildingId), [buildingId]);
  const photos = useLiveQuery(
    () => db.signboardPhotos.where('buildingId').equals(buildingId).reverse().sortBy('createdAt'),
    [buildingId],
    [],
  );
  const tenants = useLiveQuery(
    () => db.tenants.where('buildingId').equals(buildingId).toArray(),
    [buildingId],
    [],
  );

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  if (building === undefined) {
    return <div className="page"><div className="empty">読み込み中…</div></div>;
  }
  if (building === null) {
    return (
      <div className="page">
        <div className="empty">ビルが見つかりません。</div>
        <button onClick={() => navigate('/')}>地図へ戻る</button>
      </div>
    );
  }

  const startEdit = () => {
    setName(building.name);
    setAddress(building.address ?? '');
    setEditing(true);
  };
  const saveEdit = async () => {
    await updateBuilding(buildingId, { name: name.trim() || building.name, address: address.trim() });
    setEditing(false);
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await addSignboardPhoto(buildingId, file);
    }
    // 同じファイルを連続で選べるよう、操作した input をリセット
    e.target.value = '';
  };

  const onAddTenant = async () => {
    const tName = window.prompt('社名（案内板を見ながら手入力）');
    if (!tName) return;
    const floor = window.prompt('階数（任意。例: 7F）') ?? undefined;
    const tid = await addTenant({ buildingId, name: tName.trim(), floor: floor?.trim() || undefined });
    navigate(`/tenant/${tid}`);
  };

  const onDeleteBuilding = async () => {
    if (!window.confirm('このビルとテナント・履歴・写真をすべて削除します。よろしいですか？')) return;
    await deleteBuilding(buildingId);
    navigate('/');
  };

  return (
    <div className="page">
      <div className="topbar">
        <button className="back ghost" onClick={() => navigate(-1)}>← 戻る</button>
        <div className="title">{building.name}</div>
      </div>

      {editing ? (
        <div className="card stack">
          <div>
            <label>ビル名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label>住所</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="row">
            <button className="primary" onClick={saveEdit}>保存</button>
            <button className="ghost" onClick={() => setEditing(false)}>キャンセル</button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="muted">{building.address || '住所未登録'}</div>
          <div className="muted">
            緯度経度: {building.lat.toFixed(5)}, {building.lng.toFixed(5)}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="ghost" onClick={startEdit}>ビル情報を編集</button>
          </div>
        </div>
      )}

      <h2>建物攻略メモ</h2>
      <div className="card">
        <div className="muted" style={{ marginBottom: 6 }}>
          受付の癖・フロア構成・空く時間帯など、2周目で効くビル固有のノウハウ。
        </div>
        <textarea
          defaultValue={building.buildingMemo ?? ''}
          placeholder="例：受付は2F、午前は不在がち。10Fまで内階段で上がれる 等"
          onBlur={(e) => updateBuilding(buildingId, { buildingMemo: e.target.value })}
        />
      </div>

      <h2>案内板の写真</h2>
      <div className="card">
        {/* 撮影（カメラ起動）と、写真フォルダ/ライブラリから選択 の2系統 */}
        <input
          ref={cameraRef}
          className="hidden-file"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onPickPhoto}
        />
        <input
          ref={libraryRef}
          className="hidden-file"
          type="file"
          accept="image/*"
          multiple
          onChange={onPickPhoto}
        />
        <div className="row">
          <button className="primary" onClick={() => cameraRef.current?.click()}>
            📷 撮影
          </button>
          <button onClick={() => libraryRef.current?.click()}>
            🖼 フォルダから選択
          </button>
        </div>
        {photos.length > 0 ? (
          <div className="photo-grid" style={{ marginTop: 12 }}>
            {photos.map((p) => (
              <div className="thumb" key={p.id}>
                <BlobImage blob={p.blob} alt="案内板" />
                <button className="del" onClick={() => deleteSignboardPhoto(p.id!)}>×</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 12 }}>
            まず案内板を撮ると、見ながらテナントを入力できます。
          </div>
        )}
      </div>

      <h2>テナント（入居企業）</h2>
      <button className="primary" style={{ width: '100%' }} onClick={onAddTenant}>
        ＋ テナントを追加
      </button>
      <div style={{ marginTop: 12 }}>
        {tenants.length === 0 ? (
          <div className="empty">まだテナント未登録です。</div>
        ) : (
          tenants.map((t) => (
            <Link className="tenant-item" key={t.id} to={`/tenant/${t.id}`}>
              <div>
                <div className="name">{t.name}</div>
                <div className="sub">{t.floor || '階数未登録'}</div>
              </div>
              <PriorityBadge flags={t.flags} />
            </Link>
          ))
        )}
      </div>

      <h2>危険操作</h2>
      <button className="danger" style={{ width: '100%' }} onClick={onDeleteBuilding}>
        このビルを削除
      </button>
    </div>
  );
}
