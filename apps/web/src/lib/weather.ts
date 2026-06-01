import { useQuery } from "@tanstack/react-query";
import type { WeatherResponse } from "@central-command/types";
import { apiGet } from "./api";

/** Fetch the authenticated user's weather (current + forecast). */
export function useWeather() {
  return useQuery({
    queryKey: ["weather"],
    queryFn: () => apiGet<WeatherResponse>("/api/weather"),
  });
}
