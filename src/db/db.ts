import Dexie, { type Table } from 'dexie';
import type {
  Building,
  SignboardPhoto,
  Tenant,
  Activity,
  Contract,
} from './types';
import { DEFAULT_FLAGS } from './types';

// 端末内完結の IndexedDB（Dexie）。写真も含め第三者送信なし（§6）。
export class VeritasDB extends Dexie {
  buildings!: Table<Building, number>;
  signboardPhotos!: Table<SignboardPhoto, number>;
  tenants!: Table<Tenant, number>;
  activities!: Table<Activity, number>;
  contracts!: Table<Contract, number>;

  constructor() {
    super('veritas');
    this.version(1).stores({
      // & は一意。複合検索用のインデックスのみ列挙。
      buildings: '++id, name, osmId, updatedAt',
      signboardPhotos: '++id, buildingId, createdAt',
      tenants: '++id, buildingId, corporateNumber, name, updatedAt',
      activities: '++id, tenantId, date, createdAt',
      contracts: '++id, &tenantId, updatedAt',
    });
  }
}

export const db = new VeritasDB();

const now = () => Date.now();

// --- Building ------------------------------------------------------------
export async function addBuilding(
  data: Omit<Building, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<number> {
  const t = now();
  return db.buildings.add({ ...data, createdAt: t, updatedAt: t });
}

export async function upsertBuildingByOsm(
  data: Omit<Building, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<number> {
  if (data.osmId) {
    const existing = await db.buildings.where('osmId').equals(data.osmId).first();
    if (existing?.id) {
      await db.buildings.update(existing.id, { ...data, updatedAt: now() });
      return existing.id;
    }
  }
  return addBuilding(data);
}

export async function updateBuilding(
  id: number,
  patch: Partial<Building>,
): Promise<void> {
  await db.buildings.update(id, { ...patch, updatedAt: now() });
}

export async function deleteBuilding(id: number): Promise<void> {
  await db.transaction(
    'rw',
    db.buildings,
    db.signboardPhotos,
    db.tenants,
    db.activities,
    db.contracts,
    async () => {
      const tenants = await db.tenants.where('buildingId').equals(id).toArray();
      const tenantIds = tenants.map((t) => t.id!).filter(Boolean);
      await db.activities.where('tenantId').anyOf(tenantIds).delete();
      await db.contracts.where('tenantId').anyOf(tenantIds).delete();
      await db.tenants.where('buildingId').equals(id).delete();
      await db.signboardPhotos.where('buildingId').equals(id).delete();
      await db.buildings.delete(id);
    },
  );
}

// --- Tenant --------------------------------------------------------------
export async function addTenant(
  data: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt' | 'flags'> &
    Partial<Pick<Tenant, 'flags'>>,
): Promise<number> {
  const t = now();
  const id = await db.tenants.add({
    ...data,
    flags: data.flags ?? { ...DEFAULT_FLAGS },
    createdAt: t,
    updatedAt: t,
  });
  // 契約レコードを1対1で初期化
  await db.contracts.add({
    tenantId: id,
    hasBasicContract: false,
    orders: [],
    updatedAt: t,
  });
  return id;
}

export async function updateTenant(
  id: number,
  patch: Partial<Tenant>,
): Promise<void> {
  await db.tenants.update(id, { ...patch, updatedAt: now() });
}

export async function deleteTenant(id: number): Promise<void> {
  await db.transaction('rw', db.tenants, db.activities, db.contracts, async () => {
    await db.activities.where('tenantId').equals(id).delete();
    await db.contracts.where('tenantId').equals(id).delete();
    await db.tenants.delete(id);
  });
}

// --- Activity ------------------------------------------------------------
export async function addActivity(
  data: Omit<Activity, 'id' | 'createdAt'>,
): Promise<number> {
  return db.activities.add({ ...data, createdAt: now() });
}

export async function deleteActivity(id: number): Promise<void> {
  await db.activities.delete(id);
}

// --- Contract ------------------------------------------------------------
export async function getContract(tenantId: number): Promise<Contract | undefined> {
  return db.contracts.where('tenantId').equals(tenantId).first();
}

export async function upsertContract(
  tenantId: number,
  patch: Partial<Omit<Contract, 'id' | 'tenantId'>>,
): Promise<void> {
  const existing = await getContract(tenantId);
  if (existing?.id) {
    await db.contracts.update(existing.id, { ...patch, updatedAt: now() });
  } else {
    await db.contracts.add({
      tenantId,
      hasBasicContract: false,
      orders: [],
      ...patch,
      updatedAt: now(),
    });
  }
}

// --- SignboardPhoto ------------------------------------------------------
export async function addSignboardPhoto(
  buildingId: number,
  blob: Blob,
  caption?: string,
): Promise<number> {
  return db.signboardPhotos.add({
    buildingId,
    blob,
    caption,
    createdAt: now(),
  });
}

export async function deleteSignboardPhoto(id: number): Promise<void> {
  await db.signboardPhotos.delete(id);
}
