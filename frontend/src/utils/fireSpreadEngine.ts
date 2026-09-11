// ============================================================
// IGNITE SHIELD — Wind-Based Fire Spread Engine
// ============================================================
//
// RULE-BASED WIND SPREAD SIMULATION
// Visualizes potential fire spread based on wind conditions.
// It is NOT a scientifically validated wildfire prediction model.
//
// Inputs: wind speed, wind direction, sensor/fire origin
// Outputs: spread cone polygon, direction, scaling category
// ============================================================

export interface SpreadPoint {
  lat: number;
  lng: number;
  intensity: number; // 0-1
}

export interface FireSpreadData {
  origin: { lat: number; lng: number };
  spreadPoints: SpreadPoint[];
  spreadPolygon: [number, number][];
  spreadDirection: number; // degrees (0° = N, 90° = E, 180° = S, 270° = W)
  spreadIntensity: string;
  spreadDistanceKm: number;
  affectedAreaSqKm: number;
  scalingCategory: string; // 'Very Short' | 'Moderate' | 'Large' | 'Very Large'
  arrowTip: { lat: number; lng: number };
  note: string;
}

/**
 * Frontend Visualization Scaling Categories:
 * 0–2 m/s  → Very short (approx 0.5 – 1.0 km)
 * 2–5 m/s  → Moderate   (approx 1.0 – 2.0 km)
 * 5–8 m/s  → Large      (approx 2.0 – 3.2 km)
 * >8 m/s   → Very large (approx 3.2 – 5.0 km)
 *
 * These are ONLY visualization scaling categories.
 */
export function getWindSpeedScaling(windSpeed: number): {
  scalingCategory: string;
  spreadDistanceKm: number;
  spreadIntensity: string;
} {
  const speed = Math.max(0, windSpeed);

  if (speed <= 2) {
    return {
      scalingCategory: 'Very Short',
      spreadDistanceKm: Math.round((0.5 + (speed / 2) * 0.5) * 10) / 10,
      spreadIntensity: 'Low',
    };
  }
  if (speed <= 5) {
    return {
      scalingCategory: 'Moderate',
      spreadDistanceKm: Math.round((1.0 + ((speed - 2) / 3) * 1.0) * 10) / 10,
      spreadIntensity: 'Moderate',
    };
  }
  if (speed <= 8) {
    return {
      scalingCategory: 'Large',
      spreadDistanceKm: Math.round((2.0 + ((speed - 5) / 3) * 1.2) * 10) / 10,
      spreadIntensity: 'High',
    };
  }
  return {
    scalingCategory: 'Very Large',
    spreadDistanceKm: Math.min(5.0, Math.round((3.2 + Math.min(speed - 8, 12) * 0.15) * 10) / 10),
    spreadIntensity: 'Extreme',
  };
}

/**
 * Generate a fire-spread cone/sector originating from the sensor.
 * Starts at the sensor coordinates.
 * Points in the wind direction.
 * Increases in length as wind speed increases.
 * Has a width representing uncertainty (±28°).
 */
export function generateSpreadCone(
  lat: number,
  lng: number,
  distanceKm: number,
  bearingDeg: number,
  halfSpreadAngleDeg: number = 28
): [number, number][] {
  const points: [number, number][] = [];

  // 1 degree ≈ 111 km for latitude
  const kmToLat = 1 / 111;
  const kmToLng = 1 / (111 * Math.cos((lat * Math.PI) / 180));

  // 1. Apex starts at the sensor coordinates (fire origin)
  points.push([lat, lng]);

  const numArcSteps = 24;
  const startAngle = bearingDeg - halfSpreadAngleDeg;
  const endAngle = bearingDeg + halfSpreadAngleDeg;

  // 2. Arc representing the spread front
  for (let i = 0; i <= numArcSteps; i++) {
    const fraction = i / numArcSteps;
    const currentAngleDeg = startAngle + fraction * (endAngle - startAngle);
    const rad = (currentAngleDeg * Math.PI) / 180;

    // Center of the cone reaches full distance; flanks taper gracefully
    const angleOffset = Math.abs(currentAngleDeg - bearingDeg) / halfSpreadAngleDeg;
    const taper = 1.0 - 0.22 * (angleOffset * angleOffset);
    const r = distanceKm * taper;

    const pointLat = lat + r * Math.cos(rad) * kmToLat;
    const pointLng = lng + r * Math.sin(rad) * kmToLng;

    points.push([pointLat, pointLng]);
  }

  // 3. Close back to origin
  points.push([lat, lng]);

  return points;
}

/**
 * Calculate potential fire spread based on wind speed and direction.
 * 
 * Geographic convention:
 * 0° / 360° = North
 * 90° = East
 * 180° = South
 * 270° = West
 */
export function calculateFireSpread(
  originLat: number,
  originLng: number,
  windSpeed: number,
  windDirection: number,
  _fireRisk?: string
): FireSpreadData {
  const { scalingCategory, spreadDistanceKm, spreadIntensity } = getWindSpeedScaling(windSpeed);

  // Normalise bearing: 0° = N, 90° = E, 180° = S, 270° = W
  const spreadDirection = ((windDirection % 360) + 360) % 360;

  // Generate the geographic cone/sector polygon
  const spreadPolygon = generateSpreadCone(originLat, originLng, spreadDistanceKm, spreadDirection);

  // Arrow tip at maximum reach along spread direction
  const kmToLat = 1 / 111;
  const kmToLng = 1 / (111 * Math.cos((originLat * Math.PI) / 180));
  const centerRad = (spreadDirection * Math.PI) / 180;
  const arrowTip = {
    lat: originLat + spreadDistanceKm * Math.cos(centerRad) * kmToLat,
    lng: originLng + spreadDistanceKm * Math.sin(centerRad) * kmToLng,
  };

  // Generate intensity points along the spread vector for heat visualization
  const spreadPoints: SpreadPoint[] = [{ lat: originLat, lng: originLng, intensity: 1.0 }];
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const fraction = i / steps;
    const dist = spreadDistanceKm * fraction;
    const intensity = Math.round((1.0 - fraction * 0.7) * 100) / 100;
    spreadPoints.push({
      lat: originLat + dist * Math.cos(centerRad) * kmToLat,
      lng: originLng + dist * Math.sin(centerRad) * kmToLng,
      intensity,
    });
  }

  // Approximate affected area (sector area = π * r² * (2 * halfAngle / 360))
  const halfAngle = 28;
  const affectedAreaSqKm =
    Math.round(
      Math.PI * spreadDistanceKm * spreadDistanceKm * ((halfAngle * 2) / 360) * 100
    ) / 100;

  return {
    origin: { lat: originLat, lng: originLng },
    spreadPoints,
    spreadPolygon,
    spreadDirection,
    spreadIntensity,
    spreadDistanceKm,
    affectedAreaSqKm,
    scalingCategory,
    arrowTip,
    note: 'Potential Fire Spread (Based on wind conditions). Not an exact fire boundary.',
  };
}

/**
 * Human-readable wind direction label (N, NE, E, SE, S, SW, W, NW).
 */
export function getWindDirectionLabel(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}

/**
 * Human-readable spread direction label.
 */
export function getSpreadDirectionLabel(windDirection: number): string {
  return getWindDirectionLabel(windDirection);
}
