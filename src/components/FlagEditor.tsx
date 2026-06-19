import type { Flags, HakenUsage, YesNo } from '../db/types';

// 4フラグ入力UI（§5.3）。大きめのセグメントトグルで片手操作。

interface SegProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; text: string }[];
  onChange: (v: T) => void;
}

function Seg<T extends string>({ label, value, options, onChange }: SegProps<T>) {
  return (
    <div>
      <label>{label}</label>
      <div className="seg">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={value === o.value ? 'on' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

const HAKEN_OPTS: { value: HakenUsage; text: string }[] = [
  { value: 'yes', text: '有' },
  { value: 'no', text: '無' },
  { value: 'unknown', text: '不明' },
];
const YESNO_OPTS: { value: YesNo; text: string }[] = [
  { value: 'yes', text: '有' },
  { value: 'no', text: '無' },
];

export function FlagEditor({
  flags,
  onChange,
}: {
  flags: Flags;
  onChange: (next: Flags) => void;
}) {
  const set = (patch: Partial<Flags>) => onChange({ ...flags, ...patch });
  return (
    <div className="stack">
      <Seg
        label="派遣利用有無（唯一の探索対象）"
        value={flags.hakenUsage}
        options={HAKEN_OPTS}
        onChange={(v) => set({ hakenUsage: v })}
      />
      <Seg
        label="過去受注有無"
        value={flags.pastOrder}
        options={YESNO_OPTS}
        onChange={(v) => set({ pastOrder: v })}
      />
      <Seg
        label="基本契約有無"
        value={flags.basicContract}
        options={YESNO_OPTS}
        onChange={(v) => set({ basicContract: v })}
      />
      <Seg
        label="担当接触有無"
        value={flags.contacted}
        options={YESNO_OPTS}
        onChange={(v) => set({ contacted: v })}
      />
    </div>
  );
}
