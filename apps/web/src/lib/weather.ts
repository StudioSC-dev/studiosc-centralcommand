import { useQuery } from "@tanstack/react-query";
import type {
  CitySearchResponse,
  ReverseGeocodeResponse,
  WeatherResponse,
} from "@central-command/types";
import { apiGet } from "./api";

/** Fetch the authenticated user's weather (current + forecast). */
export function useWeather() {
  return useQuery({
    queryKey: ["weather"],
    queryFn: () => apiGet<WeatherResponse>("/api/weather"),
  });
}

/** City search for the location picker. Disabled until the query is meaningful. */
export function useCitySearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["weather", "search", q],
    queryFn: () => apiGet<CitySearchResponse>(`/api/weather/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    staleTime: 24 * 60 * 60 * 1000, // place data is stable; mirror the server cache
  });
}

/** Resolve browser coordinates to a place (for the "Use my location" flow). */
export function fetchReverseGeocode(lat: number, lon: number) {
  return apiGet<ReverseGeocodeResponse>(`/api/weather/reverse?lat=${lat}&lon=${lon}`);
}
