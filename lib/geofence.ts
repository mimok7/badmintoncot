import { getDistanceInMeters } from '@/lib/geo';

export interface GeofenceStadium {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_meter: number;
}

export type GeofenceStatus = 'inside' | 'outside' | 'low-accuracy' | 'unavailable';

export interface GeofenceResult {
  status: GeofenceStatus;
  stadium: GeofenceStadium | null;
  nearestStadium: GeofenceStadium | null;
  distanceMeters: number | null;
  accuracyMeters: number;
  allowedMeters: number | null;
}

// 정확도가 이 값보다 나쁘면 잘못된 구장 밖 판정을 내리지 않고 다음 GPS 갱신을 기다립니다.
export const MAX_ACCEPTABLE_ACCURACY_METERS = 100;
// DB 반경은 그대로 사용하고 기기 측정 오차는 제한적으로만 보정합니다.
export const MAX_ACCURACY_ALLOWANCE_METERS = 50;

export function isValidStadiumLocation(stadium: GeofenceStadium): boolean {
  return (
    Number.isInteger(stadium.id) &&
    stadium.id > 0 &&
    typeof stadium.name === 'string' &&
    stadium.name.trim().length > 0 &&
    Number.isFinite(stadium.latitude) &&
    stadium.latitude >= -90 &&
    stadium.latitude <= 90 &&
    Number.isFinite(stadium.longitude) &&
    stadium.longitude >= -180 &&
    stadium.longitude <= 180 &&
    Number.isFinite(stadium.radius_meter) &&
    stadium.radius_meter > 0
  );
}

export function evaluateGeofence(
  latitude: number,
  longitude: number,
  accuracy: number,
  stadiums: GeofenceStadium[],
): GeofenceResult {
  const validStadiums = stadiums.filter(isValidStadiumLocation);
  const accuracyMeters = Number.isFinite(accuracy) ? Math.max(accuracy, 0) : Infinity;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || validStadiums.length === 0) {
    return {
      status: 'unavailable',
      stadium: null,
      nearestStadium: null,
      distanceMeters: null,
      accuracyMeters,
      allowedMeters: null,
    };
  }

  let nearestStadium: GeofenceStadium | null = null;
  let nearestDistance = Infinity;

  for (const stadium of validStadiums) {
    const distance = getDistanceInMeters(
      latitude,
      longitude,
      stadium.latitude,
      stadium.longitude,
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestStadium = stadium;
    }
  }

  if (!nearestStadium) {
    return {
      status: 'unavailable',
      stadium: null,
      nearestStadium: null,
      distanceMeters: null,
      accuracyMeters,
      allowedMeters: null,
    };
  }

  const accuracyAllowance = Math.min(accuracyMeters, MAX_ACCURACY_ALLOWANCE_METERS);
  const allowedMeters = nearestStadium.radius_meter + accuracyAllowance;

  if (accuracyMeters >= MAX_ACCEPTABLE_ACCURACY_METERS) {
    return {
      status: 'low-accuracy',
      stadium: null,
      nearestStadium,
      distanceMeters: nearestDistance,
      accuracyMeters,
      allowedMeters,
    };
  }

  const isInside = nearestDistance <= allowedMeters;
  return {
    status: isInside ? 'inside' : 'outside',
    stadium: isInside ? nearestStadium : null,
    nearestStadium,
    distanceMeters: nearestDistance,
    accuracyMeters,
    allowedMeters,
  };
}
