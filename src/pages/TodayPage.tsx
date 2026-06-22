import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { classifyProspect, isProspectActive, todayISO } from '../lib/priority';
import { buildProspectsXlsx, shareOrDownload, todayStamp } from '../lib/exportProspects';

// 「今日攻めるべき先／再訪すべき先」一覧（§5.4）。
// 4フラグ × アプローチ日付 をルールで仕分け、再訪期限到来を最上位に浮上させる。
// リストは保存データから毎回算出されるため、フラグ・日付を更新すれば常に最新。

const EMAIL_KEY = 'plotto.reportEmail';

export default function TodayPage() {
  const rows = useLiveQuery(async () => {
    const tenants = await db.tenants.toArray();
    const buildings = await db.buildings.toArray();
    const byId = new Map(buildings.map((b) => [b.id!, b]));
    const t0 = todayISO();
    return tenants
      .filter((t) => isProspectActive(t.isProspect))
      .map((t) => ({ tenant: t, status: classifyProspect(t, t0), building: byId.get(t.buildingId) }))
      .sort((a, b) => a.status.sortRank - b.status.sortRank || a.tenant.name.localeCompare(b.tenant.name));
  }, [], []);

  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onSaveEmail = (v: string) => {
    setEmail(v);
    localStorage.setItem(EMAIL_KEY, v.trim());
  };

  const onShare = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const { blob, rows: n } = await buildProspectsXlsx();
      if (n === 0) {
        setMsg('対象が0件です。フラグを入れてから出力してください。');
        return;
      }
      const filename = `plotto-見込みリスト-${todayStamp()}.xlsx`;
      const result = await shareOrDownload(blob, filename, {
        email: email.trim() || undefined,
        subject: `見込みリスト ${todayStamp()}（${n}件）`,
        body: `${todayStamp()} 時点の見込みリスト（${n}件）です。`,
      });
      if (result === 'shared') setMsg(`共有しました（${n}件）。`);
      else if (result === 'downloaded')
        setMsg(`この端末は共有に非対応のため、Excelをダウンロードしました（${n}件）。メールに添付して送信してください。`);
      else setMsg('共有をキャンセルしました。');
    } catch (e) {
      setMsg(e instanceof Error ? `失敗: ${e.message}` : '出力に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>今日攻めるべき先 / 再訪すべき先</h1>
      <div className="muted" style={{ marginBottom: 12 }}>
        4フラグ × アプローチ日付をルールで仕分けた結果です（予測ではありません）。
        再訪期限が来た先が最上位に浮上します。
      </div>

      {/* 1日の締め：Excel化してメール等へワンタップ共有 */}
      <div className="card stack">
        <div>
          <label>送信先メールアドレス（任意・端末内に保存）</label>
          <input
            type="email"
            inputMode="email"
            placeholder="例: report@example.com"
            value={email}
            onChange={(e) => onSaveEmail(e.target.value)}
          />
        </div>
        <button className="primary" disabled={busy} onClick={onShare}>
          {busy ? '作成中…' : `📤 今日の見込みをExcelで共有（${rows.length}件）`}
        </button>
        {msg && <div className="muted">{msg}</div>}
        <div className="muted" style={{ fontSize: 12 }}>
          メールアプリが開いたら宛先を確認して送信してください（端末仕様で宛先が空のことがあります）。
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          対象がありません。<br />
          地図でビルをタップ → テナント登録 → 4フラグ・アプローチ日を入れると、ここに優先順で並びます。
        </div>
      ) : (
        rows.map((r) => (
          <Link className="tenant-item" key={r.tenant.id} to={`/tenant/${r.tenant.id}`}>
            <div style={{ minWidth: 0 }}>
              <div className="name">{r.tenant.name}</div>
              <div className="sub">
                {r.building?.name ?? '建物不明'}
                {r.tenant.floor ? ` ・ ${r.tenant.floor}` : ''}
              </div>
              <div className="sub" style={{ color: r.status.base.color }}>{r.status.base.strategy}</div>
              {r.status.badges.length > 0 && (
                <div className="sub" style={{ color: r.status.revisitDue ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                  {r.status.badges.join(' / ')}
                </div>
              )}
            </div>
            <span className="badge" style={{ background: r.status.base.color }}>{r.status.base.label}</span>
          </Link>
        ))
      )}
    </div>
  );
}
