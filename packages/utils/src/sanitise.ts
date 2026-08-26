/**
 * Text arriving from outside the app, made safe to store and render.
 *
 * **Lab strings are untrusted data, never instructions** (homelab-telemetry risk
 * 5). Monitor labels, container names and especially ntfy event bodies are all
 * user-controlled: they are typed by whoever configured the service, and the
 * event relay makes that sharper than the snapshot alone did. They are rendered
 * as text, never interpolated anywhere executable, excluded from the Insights
 * card, and — if a Workers AI narrative ever consumes them — must be fenced and
 * labelled, the same rule Trailhead applies to ticket text.
 *
 * This function is the storage half of that: strip the characters that break a
 * log line or a card row, and cap the length so one event cannot dominate either.
 */

/** C0 controls and DEL. */
const C0_END = 0x1f;
const DEL = 0x7f;
/** C1 controls — the range above DEL, which some terminals also act on. */
const C1_END = 0x9f;

/**
 * Filtered by code point rather than a regex.
 *
 * A character class of control characters is written with escapes that survive
 * exactly as long as nothing reformats the file, and the failure is invisible:
 * the regex still compiles, it just stops matching. Comparing numbers cannot
 * silently degrade that way.
 */
function isControl(code: number): boolean {
  return code <= C0_END || (code >= DEL && code <= C1_END);
}

export function sanitiseText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";

  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    // Controls become a space rather than vanishing, so two words either side of
    // a stripped newline do not fuse into one. Newlines and tabs are included on
    // purpose: every consumer here is a single-line card row or a log line, and a
    // smuggled newline is how one log entry becomes two forged ones.
    out += isControl(code) ? " " : char;
  }

  const cleaned = out.replace(/\s+/g, " ").trim();

  // Truncated, not rejected. An over-long title is a service with a chatty
  // config, not an attack, and dropping the whole event would lose the alert.
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

/** Sanitise a tag list: capped in both count and per-tag length, empties dropped. */
export function sanitiseTags(value: unknown, maxTags: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxTags)
    .map((tag) => sanitiseText(tag, maxLength))
    .filter((tag) => tag.length > 0);
}
