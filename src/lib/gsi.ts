// 国土地理院 ジオコーディングAPI（住所→緯度経度）。準備モード専用（§2）。
// 無料・APIキー不要。

export interface GeocodeResult {
  address: string;
  lat: number;
  lng: number;
}

const GSI_GEOCODE = 'https://msearch.gsi.go.jp/address-search/AddressSearch';

/** 住所文字列から候補を取得（地理院ジオコーディング） */
export async function geocode(address: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const url = `${GSI_GEOCODE}?q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`ジオコーディング失敗 ${res.status}`);
  const json = (await res.json()) as {
    geometry: { coordinates: [number, number] };
    properties: { title: string };
  }[];
  return json.map((item) => ({
    address: item.properties.title,
    // GeoJSON は [lng, lat]
    lng: item.geometry.coordinates[0],
    lat: item.geometry.coordinates[1],
  }));
}
