import { useEffect, useRef, useState } from 'react';

// 現在地表示（GPS）。現場モードで通信なしに動く（端末GPS）。

export interface GeoState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation(watch = true): GeoState {
  const [state, setState] = useState<GeoState>({
    lat: null,
    lng: null,
    accuracy: null,
    error: null,
    loading: true,
  });
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, error: 'この端末は位置情報に対応していません', loading: false }));
      return;
    }

    const onSuccess = (pos: GeolocationPosition) => {
      setState({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        error: null,
        loading: false,
      });
    };
    const onError = (err: GeolocationPositionError) => {
      setState((s) => ({ ...s, error: err.message, loading: false }));
    };
    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    };

    if (watch) {
      watchId.current = navigator.geolocation.watchPosition(onSuccess, onError, options);
    } else {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
    }

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [watch]);

  return state;
}
