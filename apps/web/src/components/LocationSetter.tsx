import { useEffect, useState } from "react";
import type { GeoCity } from "@central-command/types";
import { useSetLocation } from "../lib/settings";
import { fetchReverseGeocode, useCitySearch } from "../lib/weather";

/** The browser's IANA timezone — the user's own day boundary, used for scoring. */
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || null;

const cityLabel = (c: GeoCity) => [c.name, c.state, c.country].filter(Boolean).join(", ");

/** Debounce a value so we don't fire a geocoding request on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Lets the user set their home location, which unblocks the weather pillar and
 * sets the timezone used for day-scoped scoring. Two paths: a one-tap browser
 * geolocation prompt, or a city search. Used in the weather empty state and
 * behind a "Change" toggle once a location is set.
 */
export function LocationSetter({ onDone }: { onDone?: () => void }) {
  const setLocation = useSetLocation();
  const [term, setTerm] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const debouncedTerm = useDebounced(term, 300);
  const { data: search, isFetching } = useCitySearch(debouncedTerm);
  const results = search?.results ?? [];

  const submit = (input: Parameters<typeof setLocation.mutate>[0]) =>
    setLocation.mutate(input, {
      onSuccess: () => {
        setTerm("");
        onDone?.();
      },
    });

  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Your browser doesn’t support location access.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let label: string | null = null;
        try {
          const { result } = await fetchReverseGeocode(latitude, longitude);
          if (result) label = cityLabel(result);
        } catch {
          // Reverse lookup is best-effort; coordinates alone still work.
        }
        submit({
          timezone: browserTimeZone(),
          homeLat: latitude,
          homeLon: longitude,
          locationLabel: label,
        });
        setLocating(false);
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — search for your city instead."
            : "Couldn’t get your location — search for your city instead.",
        );
        setLocating(false);
      },
      { timeout: 10_000 },
    );
  };

  const pick = (city: GeoCity) =>
    submit({
      timezone: browserTimeZone(),
      homeLat: city.lat,
      homeLon: city.lon,
      locationLabel: cityLabel(city),
    });

  const busy = setLocation.isPending || locating;

  return (
    <div className="location-setter">
      <button type="button" className="connect-link" onClick={useMyLocation} disabled={busy}>
        {locating ? "Getting location…" : "Use my location"}
      </button>

      <div className="city-search">
        <input
          type="text"
          placeholder="Or search for a city…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          disabled={busy}
        />
        {results.length > 0 && (
          <ul className="city-results">
            {results.map((city) => (
              <li key={`${city.lat},${city.lon}`}>
                <button type="button" onClick={() => pick(city)} disabled={busy}>
                  {cityLabel(city)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {debouncedTerm.trim().length >= 2 && !isFetching && results.length === 0 && (
          <p className="city-empty">No cities found.</p>
        )}
      </div>

      {geoError && <p className="log-error">{geoError}</p>}
      {setLocation.isError && (
        <p className="log-error">Couldn’t save location: {setLocation.error.message}</p>
      )}
    </div>
  );
}
