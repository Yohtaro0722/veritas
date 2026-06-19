// データモデル（§4）。Phase 2 の SFDC 連携を見据え、オブジェクト構造は
// Salesforce のレコード単位に分解しやすい形で持つ（Building / Tenant /
// Activity / Contract を独立テーブルにし、法人番号を突合キーにできる）。

/** 派遣利用有無のみ「不明」を持つ（唯一の探索対象） */
export type HakenUsage = 'yes' | 'no' | 'unknown';
/** 自社・自分の事実は二択で確定する */
export type YesNo = 'yes' | 'no';

/** 4フラグ（企業ごと・本アプリの心臓部 §4.1） */
export interface Flags {
  /** 派遣利用有無：有 / 無 / 不明（唯一の探索対象） */
  hakenUsage: HakenUsage;
  /** 過去受注有無：有 / 無（自社記録で確定） */
  pastOrder: YesNo;
  /** 基本契約有無：有 / 無（自社側で確定） */
  basicContract: YesNo;
  /** 担当接触有無：有 / 無（自分が動いたか・確定） */
  contacted: YesNo;
}

export const DEFAULT_FLAGS: Flags = {
  hakenUsage: 'unknown',
  pastOrder: 'no',
  basicContract: 'no',
  contacted: 'no',
};

/** 建物（主キー） */
export interface Building {
  id?: number;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  /** OSM建物形状（任意）。[lat, lng][] のリング */
  polygon?: [number, number][];
  /** OSM の element id（重複登録防止用・任意） */
  osmId?: string;
  createdAt: number;
  updatedAt: number;
}

/** 案内板写真（ローカル参照・第三者送信なし） */
export interface SignboardPhoto {
  id?: number;
  buildingId: number;
  /** 画像本体は Blob で IndexedDB に保持 */
  blob: Blob;
  caption?: string;
  createdAt: number;
}

/** 入居企業（テナント） */
export interface Tenant {
  id?: number;
  buildingId: number;
  /** 社名（手入力） */
  name: string;
  /** 階数 */
  floor?: string;
  /** 法人番号（APIで補完／SFDC連携キー） */
  corporateNumber?: string;
  /** 法人番号APIで補完した正式名称 */
  formalName?: string;
  flags: Flags;
  createdAt: number;
  updatedAt: number;
}

export type ActivityType = '訪問' | '架電' | '商談' | 'その他';

/** 活動履歴 */
export interface Activity {
  id?: number;
  tenantId: number;
  /** ISO日付（YYYY-MM-DD） */
  date: string;
  type: ActivityType;
  note?: string;
  createdAt: number;
}

/** 受注情報 */
export interface Order {
  /** 受注名・内容 */
  title: string;
  /** 受注日（任意・ISO） */
  date?: string;
  note?: string;
}

/** 契約状況（テナント1対1） */
export interface Contract {
  id?: number;
  tenantId: number;
  hasBasicContract: boolean;
  orders: Order[];
  note?: string;
  updatedAt: number;
}
