import { useState, useEffect, useRef } from 'react';

export interface GeolocationData {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  errorCode: number | null;
  loading: boolean;
}

export function useGeolocation(): GeolocationData {
  const [state, setState] = useState<GeolocationData>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    errorCode: null,
    loading: true,
  });

  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setState({
        latitude: null,
        longitude: null,
        accuracy: null,
        error: 'Geolocation is not supported by your browser.',
        errorCode: null,
        loading: false,
      });
      return;
    }

    const successCallback: PositionCallback = (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      setState({
        latitude,
        longitude,
        accuracy,
        error: null,
        errorCode: null,
        loading: false,
      });
    };

    const errorCallback: PositionErrorCallback = (err) => {
      let errorMessage = 'An unknown location error occurred.';
      switch (err.code) {
        case err.PERMISSION_DENIED:
          errorMessage = 'Location permission denied.';
          break;
        case err.POSITION_UNAVAILABLE:
          errorMessage = 'Unable to determine your location.';
          break;
        case err.TIMEOUT:
          errorMessage = 'Location request timed out.';
          break;
      }
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        errorCode: err.code,
        loading: false,
      }));
    };

    // Watch position with high accuracy and 10s maximumAge / timeout
    watchIdRef.current = navigator.geolocation.watchPosition(
      successCallback,
      errorCallback,
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000,
      }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return state;
}
