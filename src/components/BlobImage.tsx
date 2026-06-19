import { useEffect, useState } from 'react';

// IndexedDB の Blob を object URL にして表示し、アンマウント時に解放する。
export function BlobImage({ blob, alt }: { blob: Blob; alt?: string }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  return <img src={url} alt={alt ?? ''} />;
}
