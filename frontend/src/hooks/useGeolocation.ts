import { useState, useEffect, useRef, useCallback } from 'react';

export interface GeolocationData {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  errorCode: number | null;
  loading: boolean;
  retry: () => void;
  setManualLocation: (lat: number, lon: number) => void;
}

export function useGeolocation(): GeolocationData {
  const watchIdRef = useRef<number | null>(null);

  const [state, setState] = useState<{
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    error: string | null;
    errorCode: number | null;
    loading: boolean;
  }>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    errorCode: null,
    loading: true,
  });

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState((prev) => ({
        ...prev,
        error: 'Geolocation is not supported by your browser.',
        errorCode: null,
        loading: false,
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const successCallback: PositionCallback = (position) => {
      setState({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        error: null,
        errorCode: null,
        loading: false,
      });
    };

    const errorCallback: PositionErrorCallback = (err) => {
      let errorMessage = 'An unknown location error occurred.';
      switch (err.code) {
        case err.PERMISSION_DENIED:
          errorMessage = 'Location permission required for live weather data.';
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

    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000,
    });

    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      successCallback,
      errorCallback,
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000,
      }
    );
  }, []);

  const setManualLocation = useCallback((lat: number, lon: number) => {
    setState({
      latitude: lat,
      longitude: lon,
      accuracy: 10,
      error: null,
      errorCode: null,
      loading: false,
    });
  }, []);

  useEffect(() => {
    requestLocation();
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [requestLocation]);

  return {
    ...state,
    retry: requestLocation,
    setManualLocation,
  };
}
