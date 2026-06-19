import { classifyPriority } from '../lib/priority';
import type { Flags } from '../db/types';

export function PriorityBadge({ flags }: { flags: Flags }) {
  const p = classifyPriority(flags);
  return (
    <span className="badge" style={{ background: p.color }} title={p.strategy}>
      {p.label}
    </span>
  );
}
