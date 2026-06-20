import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { classifyPriority, isTodayTarget } from '../lib/priority';
import { buildProspectsXlsx, shareOrDownload, todayStamp } from '../lib/exportProspects';

// 「今日攻めるべき先」一覧（§5.4）。4フラグの仕分け結果を優先度順に表示。
// リストは保存データから毎回算出されるため、フラグを更新すれば常に最新。

const EMAIL_KEY = 'plotto.reportEmail';

export default function TodayPage() {
  const rows = useLiveQuery(async () => {
    const tenants = await db.tenants.toArray();
    const buildings = await db.buildings.toArray();
    const byId = new Map(buildings.map((b) => [b.id!, b]));
    return tenants
      .map((t) => ({ tenant: t, priority: classifyPriority(t.flags), building: byId.get(t.buildingId) }))
      .filter((r) => isTodayTarget(r.tenant.flags))
      .sort((a, b) => a.priority.rank - b.priority.rank || a.tenant.name.localeCompare(b.tenant.name));
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
      <h1>今日攻めるべき先</h1>
      <div className="muted" style={{ marginBottom: 12 }}>
        4フラグの事実をルールで仕分けた結果です（予測ではありません）。フラグを更新すれば常に最新になります。
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
          地図でビルをタップ → テナント登録 → 4フラグを入れると、ここに優先順で並びます。
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
              <div className="sub" style={{ color: r.priority.color }}>{r.priority.strategy}</div>
            </div>
            <span className="badge" style={{ background: r.priority.color }}>{r.priority.label}</span>
          </Link>
        ))
      )}
    </div>
  );
}
