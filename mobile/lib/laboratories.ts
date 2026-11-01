import { medicalRequest } from "@/lib/medical-api";

export type Laboratory = {
  name: string;
  address: string;
  distanceKm: number | null;
  placeId: string;
  /** Null when the backend had neither a Maps link nor coordinates to build one. */
  mapsUrl: string | null;
};

/** One entry of `laboratories` in the backend's `/laboratories/nearby` reply. */
type LaboratoryDto = {
  name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  google_maps_url?: string | null;
};

type NearbyLaboratoriesResponse = {
  count: number;
  laboratories: LaboratoryDto[];
};

type Coords = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points, in kilometres. */
export function distanceKm(from: Coords, to: Coords): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function toLaboratory(dto: LaboratoryDto, origin: Coords): Laboratory {
  const hasCoords = typeof dto.latitude === "number" && typeof dto.longitude === "number";
  const name = dto.name || "Medical Laboratory";
  const address = dto.address || "";

  return {
    name,
    address,
    distanceKm: hasCoords
      ? distanceKm(origin, { lat: dto.latitude as number, lng: dto.longitude as number })
      : null,
    // Google's id when there is one; otherwise something stable enough to key a list on.
    placeId: dto.place_id || `${name}|${address}`,
    mapsUrl:
      dto.google_maps_url ||
      (hasCoords
        ? `https://www.google.com/maps/search/?api=1&query=${dto.latitude},${dto.longitude}`
        : null),
  };
}

/**
 * Medical laboratories around `location`, nearest first.
 *
 * The backend returns them in Google's relevance order and without a
 * distance, and a text search only biases toward the area rather than
 * restricting to it — so the distance is worked out here and the list is
 * sorted by it. Labs with no coordinates have no distance and go last.
 */
export async function findNearbyLaboratories(
  location: Coords,
  { radiusKm = 10, limit = 20, signal }: { radiusKm?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<Laboratory[]> {
  const query = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lng),
    radius_km: String(radiusKm),
    limit: String(limit),
  });

  const response = await medicalRequest<NearbyLaboratoriesResponse>(
    `/api/v1/medical/laboratories/nearby?${query.toString()}`,
    undefined,
    { method: "GET", signal },
  );

  return (response.laboratories ?? [])
    .map((dto) => toLaboratory(dto, location))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}
