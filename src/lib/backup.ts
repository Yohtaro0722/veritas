import { db } from '../db/db';

// バックアップ/エクスポート（§3.1, §6）。手動かつローカルファイルのみ。
// 写真Blobは base64 にして1ファイルにまとめる。

interface Backup {
  version: 1;
  exportedAt: number;
  buildings: unknown[];
  tenants: unknown[];
  activities: unknown[];
  contracts: unknown[];
  signboardPhotos: { id?: number; buildingId: number; caption?: string; createdAt: number; dataUrl: string }[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function exportBackup(): Promise<Blob> {
  const [buildings, tenants, activities, contracts, photos] = await Promise.all([
    db.buildings.toArray(),
    db.tenants.toArray(),
    db.activities.toArray(),
    db.contracts.toArray(),
    db.signboardPhotos.toArray(),
  ]);

  const signboardPhotos = await Promise.all(
    photos.map(async (p) => ({
      id: p.id,
      buildingId: p.buildingId,
      caption: p.caption,
      createdAt: p.createdAt,
      dataUrl: await blobToDataUrl(p.blob),
    })),
  );

  const payload: Backup = {
    version: 1,
    exportedAt: Date.now(),
    buildings,
    tenants,
    activities,
    contracts,
    signboardPhotos,
  };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export function downloadBackup(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `veritas-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** バックアップから復元（既存データは全消去して置換） */
export async function importBackup(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text) as Backup;
  if (data.version !== 1) throw new Error('未対応のバックアップ形式です');

  await db.transaction(
    'rw',
    db.buildings,
    db.tenants,
    db.activities,
    db.contracts,
    db.signboardPhotos,
    async () => {
      await Promise.all([
        db.buildings.clear(),
        db.tenants.clear(),
        db.activities.clear(),
        db.contracts.clear(),
        db.signboardPhotos.clear(),
      ]);
      await db.buildings.bulkAdd(data.buildings as never[]);
      await db.tenants.bulkAdd(data.tenants as never[]);
      await db.activities.bulkAdd(data.activities as never[]);
      await db.contracts.bulkAdd(data.contracts as never[]);
      const photos = await Promise.all(
        data.signboardPhotos.map(async (p) => ({
          id: p.id,
          buildingId: p.buildingId,
          caption: p.caption,
          createdAt: p.createdAt,
          blob: await dataUrlToBlob(p.dataUrl),
        })),
      );
      await db.signboardPhotos.bulkAdd(photos as never[]);
    },
  );
}
