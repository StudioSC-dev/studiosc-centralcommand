/**
 * Google Maps links for an event location.
 *
 * Two URLs, deliberately independent:
 *
 * - `mapLinkUrl` uses the documented `maps.google.com/?api=1` scheme, needs no
 *   key and no CSP allowance, and is therefore always safe to emit.
 * - `mapEmbedUrl` is the Maps Embed API — free and unmetered, but it needs a
 *   key and a `frame-src` entry in apps/web/public/_headers.
 *
 * Both are built here rather than in the browser so the key stays out of the
 * frontend bundle, and so the decision about what counts as a *place* is made
 * once, server-side.
 */

const EMBED_ENDPOINT = "https://www.google.com/maps/embed/v1/place";
const LINK_ENDPOINT = "https://www.google.com/maps/search/";

/**
 * Is this location string something a map can plausibly show?
 *
 * The calendar `location` field is free text and people put anything in it. The
 * two cases worth rejecting are the ones that would render a confidently wrong
 * map:
 *
 * - **A URL.** Conference links land here constantly ("https://zoom.us/j/…"),
 *   and Google would happily geocode the string into somewhere in California.
 * - **Nothing.** Empty or whitespace.
 *
 * Room names ("Room 4B") are deliberately *not* rejected. They cannot be told
 * apart from real venues by any rule that does not also throw out legitimate
 * short place names, and the failure is visible and harmless — a map of
 * somewhere unhelpful, next to a link the user can ignore. Guessing more
 * aggressively would hide real locations, which is the worse error.
 */
export function isMappable(location: string | null | undefined): location is string {
  if (!location) return false;
  const trimmed = location.trim();
  if (!trimmed) return false;
  return !/^(https?:\/\/|www\.)/i.test(trimmed);
}

export interface MapUrls {
  mapLinkUrl?: string;
  mapEmbedUrl?: string;
}

/**
 * Build the map URLs for a location. Returns an empty object for anything
 * unmappable, and omits `mapEmbedUrl` when no key is configured — so a missing
 * secret degrades to a plain link rather than breaking the dialog.
 */
export function buildMapUrls(location: string | null | undefined, apiKey?: string): MapUrls {
  if (!isMappable(location)) return {};

  const query = location.trim();

  const link = new URL(LINK_ENDPOINT);
  link.searchParams.set("api", "1");
  link.searchParams.set("query", query);

  const urls: MapUrls = { mapLinkUrl: link.toString() };

  if (apiKey) {
    const embed = new URL(EMBED_ENDPOINT);
    embed.searchParams.set("key", apiKey);
    embed.searchParams.set("q", query);
    urls.mapEmbedUrl = embed.toString();
  }

  return urls;
}
