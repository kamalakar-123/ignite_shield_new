import axios from 'axios';

export interface LiveWeatherData {
  temperature: number;
  humidity: number;
  soilMoisture: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  timestamp: string;
  latitude: number;
  longitude: number;
}

export interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  current: {
    time: string;
    interval?: number;
    temperature_2m: number;
    relative_humidity_2m: number;
    soil_moisture_0_to_1cm: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    precipitation: number;
  };
}

export const weatherService = {
  getDefaultCoordinates: (): { latitude: number; longitude: number } => {
    const latStr = import.meta.env.VITE_WEATHER_LATITUDE;
    const lonStr = import.meta.env.VITE_WEATHER_LONGITUDE;
    const latitude = latStr && !isNaN(Number(latStr)) ? Number(latStr) : 20.5937;
    const longitude = lonStr && !isNaN(Number(lonStr)) ? Number(lonStr) : 78.9629;
    return { latitude, longitude };
  },

  fetchLiveWeather: async (
    customLat?: number,
    customLon?: number
  ): Promise<LiveWeatherData> => {
    const defaults = weatherService.getDefaultCoordinates();
    const latitude = customLat ?? defaults.latitude;
    const longitude = customLon ?? defaults.longitude;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,soil_moisture_0_to_1cm,wind_speed_10m,wind_direction_10m,precipitation&wind_speed_unit=ms`;

    const res = await axios.get<OpenMeteoResponse>(url, { timeout: 10000 });
    const current = res.data?.current;

    if (!current) {
      throw new Error('Invalid response structure received from Open-Meteo API');
    }

    const rawTemp = current.temperature_2m;
    const rawHum = current.relative_humidity_2m;
    const rawSoil = current.soil_moisture_0_to_1cm;
    const rawWindSpeed = current.wind_speed_10m;
    const rawWindDir = current.wind_direction_10m;
    const rawPrecip = current.precipitation;

    if (
      rawTemp == null || isNaN(rawTemp) ||
      rawHum == null || isNaN(rawHum) ||
      rawSoil == null || isNaN(rawSoil) ||
      rawWindSpeed == null || isNaN(rawWindSpeed)
    ) {
      throw new Error('Incomplete weather variables received from Open-Meteo API');
    }

    // Convert soil moisture from m³/m³ to percentage (e.g. 0.391 -> 39.1%)
    const soilMoisturePercent = rawSoil * 100;

    return {
      temperature: Math.round(rawTemp * 10) / 10,
      humidity: Math.round(rawHum * 10) / 10,
      soilMoisture: Math.round(soilMoisturePercent * 10) / 10,
      windSpeed: Math.round(rawWindSpeed * 10) / 10,
      windDirection: rawWindDir != null && !isNaN(rawWindDir) ? Math.round(rawWindDir) : 0,
      precipitation: rawPrecip != null && !isNaN(rawPrecip) ? Math.round(rawPrecip * 10) / 10 : 0.0,
      timestamp: current.time || new Date().toISOString(),
      latitude: res.data.latitude ?? latitude,
      longitude: res.data.longitude ?? longitude,
    };
  },
};
