import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  updateTenant,
  deleteTenant,
  addActivity,
  deleteActivity,
  upsertContract,
} from '../db/db';
import type { ActivityType, Flags, Order } from '../db/types';
import { FlagEditor } from '../components/FlagEditor';
import { classifyPriority } from '../lib/priority';
import { isHoujinApiAvailable, searchByName, type CorporateCandidate } from '../lib/houjin';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const ACTIVITY_TYPES: ActivityType[] = ['訪問', '架電', '商談', 'その他'];
const today = () => new Date().toISOString().slice(0, 10);

export default function TenantDetailPage() {
  const { id } = useParams();
  const tenantId = Number(id);
  const navigate = useNavigate();
  const online = useOnlineStatus();

  const tenant = useLiveQuery(() => db.tenants.get(tenantId), [tenantId]);
  const activities = useLiveQuery(
    () => db.activities.where('tenantId').equals(tenantId).reverse().sortBy('date'),
    [tenantId],
    [],
  );
  const contract = useLiveQuery(
    () => db.contracts.where('tenantId').equals(tenantId).first(),
    [tenantId],
  );

  // 活動ログ入力
  const [actDate, setActDate] = useState(today());
  const [actType, setActType] = useState<ActivityType>('訪問');
  const [actNote, setActNote] = useState('');

  // 法人番号補完
  const [candidates, setCandidates] = useState<CorporateCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // 受注入力
  const [orderTitle, setOrderTitle] = useState('');

  if (tenant === undefined) {
    return <div className="page"><div className="empty">読み込み中…</div></div>;
  }
  if (tenant === null) {
    return (
      <div className="page">
        <div className="empty">テナントが見つかりません。</div>
        <button onClick={() => navigate('/')}>地図へ戻る</button>
      </div>
    );
  }

  const priority = classifyPriority(tenant.flags);

  const onFlagsChange = async (next: Flags) => {
    await updateTenant(tenantId, { flags: next });
    // 基本契約フラグと契約レコードを同期
    await upsertContract(tenantId, { hasBasicContract: next.basicContract === 'yes' });
  };

  const onAddActivity = async () => {
    await addActivity({ tenantId, date: actDate, type: actType, note: actNote.trim() || undefined });
    setActNote('');
    // 活動を記録したら「担当接触有無=有」に自動更新（自分が動いた事実）
    if (tenant.flags.contacted !== 'yes') {
      await onFlagsChange({ ...tenant.flags, contacted: 'yes' });
    }
  };

  const onSearchHoujin = async () => {
    setSearchErr(null);
    setSearching(true);
    try {
      const res = await searchByName(tenant.name);
      setCandidates(res.slice(0, 10));
      if (res.length === 0) setSearchErr('候補が見つかりませんでした。');
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : '検索に失敗しました');
    } finally {
      setSearching(false);
    }
  };

  const pickCandidate = async (c: CorporateCandidate) => {
    await updateTenant(tenantId, {
      corporateNumber: c.corporateNumber,
      formalName: c.name,
    });
    setCandidates(null);
  };

  const addOrder = async () => {
    if (!orderTitle.trim()) return;
    const next: Order[] = [...(contract?.orders ?? []), { title: orderTitle.trim(), date: today() }];
    await upsertContract(tenantId, { orders: next });
    setOrderTitle('');
    // 受注を入れたら過去受注=有に同期
    if (tenant.flags.pastOrder !== 'yes') {
      await onFlagsChange({ ...tenant.flags, pastOrder: 'yes' });
    }
  };

  const removeOrder = async (idx: number) => {
    const next = (contract?.orders ?? []).filter((_, i) => i !== idx);
    await upsertContract(tenantId, { orders: next });
  };

  const onDelete = async () => {
    if (!window.confirm('このテナントと履歴・契約を削除します。よろしいですか？')) return;
    await deleteTenant(tenantId);
    navigate(-1);
  };

  return (
    <div className="page">
      <div className="topbar">
        <button className="back ghost" onClick={() => navigate(-1)}>← 戻る</button>
        <div className="title">{tenant.name}</div>
      </div>

      {/* 優先度 */}
      <div className="card" style={{ borderColor: priority.color }}>
        <span className="badge" style={{ background: priority.color }}>{priority.label}</span>
        <div className="muted" style={{ marginTop: 8 }}>{priority.strategy}</div>
      </div>

      <div className="card">
        <div className="muted">階数: {tenant.floor || '未登録'}</div>
        <div className="muted">
          法人番号: {tenant.corporateNumber || '未補完'}
          {tenant.formalName && ` / ${tenant.formalName}`}
        </div>
        {online && (
          <button
            className="ghost"
            style={{ marginTop: 10 }}
            disabled={searching || !isHoujinApiAvailable()}
            onClick={onSearchHoujin}
          >
            {isHoujinApiAvailable()
              ? searching
                ? '検索中…'
                : '法人番号APIで正式名称を補完（準備モード）'
              : '法人番号API未設定（VITE_HOUJIN_APP_ID）'}
          </button>
        )}
        {searchErr && <div className="muted" style={{ color: '#fca5a5' }}>{searchErr}</div>}
        {candidates && (
          <div className="stack" style={{ marginTop: 10 }}>
            {candidates.map((c) => (
              <button key={c.corporateNumber} className="ghost" onClick={() => pickCandidate(c)}>
                {c.name}（{c.corporateNumber}）{c.address ? ` / ${c.address}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      <h2>4フラグ</h2>
      <div className="card">
        <FlagEditor flags={tenant.flags} onChange={onFlagsChange} />
      </div>

      <h2>契約状況</h2>
      <div className="card stack">
        <div className="flag-line">
          <span className="k">基本契約</span>
          <span>{contract?.hasBasicContract ? '有' : '無'}</span>
        </div>
        <div>
          <label>受注情報</label>
          {(contract?.orders ?? []).length === 0 ? (
            <div className="muted">受注なし</div>
          ) : (
            (contract?.orders ?? []).map((o, i) => (
              <div className="flag-line" key={i}>
                <span>{o.title}{o.date ? `（${o.date}）` : ''}</span>
                <button className="ghost" style={{ minHeight: 32, padding: '4px 10px' }} onClick={() => removeOrder(i)}>削除</button>
              </div>
            ))
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <input
              placeholder="受注内容を追加"
              value={orderTitle}
              onChange={(e) => setOrderTitle(e.target.value)}
            />
            <button className="primary" style={{ flex: 'none' }} onClick={addOrder}>追加</button>
          </div>
        </div>
        <div>
          <label>契約メモ</label>
          <textarea
            defaultValue={contract?.note ?? ''}
            onBlur={(e) => upsertContract(tenantId, { note: e.target.value })}
          />
        </div>
      </div>

      <h2>活動履歴</h2>
      <div className="card stack">
        <div className="row">
          <div>
            <label>日付</label>
            <input type="date" value={actDate} onChange={(e) => setActDate(e.target.value)} />
          </div>
          <div>
            <label>種別</label>
            <select value={actType} onChange={(e) => setActType(e.target.value as ActivityType)}>
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label>メモ</label>
          <textarea value={actNote} onChange={(e) => setActNote(e.target.value)} placeholder="どんな反応だったか等" />
        </div>
        <button className="primary" onClick={onAddActivity}>活動を記録（接触=有に更新）</button>
      </div>

      <div style={{ marginTop: 4 }}>
        {activities.length === 0 ? (
          <div className="empty">活動履歴はまだありません。</div>
        ) : (
          activities.map((a) => (
            <div className="card" key={a.id}>
              <div className="flag-line">
                <strong>{a.type}</strong>
                <span className="muted">{a.date}</span>
              </div>
              {a.note && <div>{a.note}</div>}
              <button
                className="ghost"
                style={{ minHeight: 32, padding: '4px 10px', marginTop: 6 }}
                onClick={() => deleteActivity(a.id!)}
              >
                削除
              </button>
            </div>
          ))
        )}
      </div>

      <h2>危険操作</h2>
      <button className="danger" style={{ width: '100%' }} onClick={onDelete}>
        このテナントを削除
      </button>
    </div>
  );
}
