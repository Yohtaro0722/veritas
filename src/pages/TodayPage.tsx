import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { classifyPriority, isTodayTarget } from '../lib/priority';

// 「今日攻めるべき先」一覧（§5.4）。4フラグの仕分け結果を優先度順に表示。

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

  return (
    <div className="page">
      <h1>今日攻めるべき先</h1>
      <div className="muted" style={{ marginBottom: 12 }}>
        4フラグの事実をルールで仕分けた結果です（予測ではありません）。
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
