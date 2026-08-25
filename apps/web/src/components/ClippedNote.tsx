/**
 * Footer for a clamped list: says how many rows did not fit.
 *
 * Always rendered, even at zero, and always the same height. If it appeared
 * only when something was clipped it would take space away from the list at the
 * exact moment the list was already full, which can clip one more row, which
 * keeps it rendered — and in the other direction can oscillate: hiding the note
 * frees the space that lets the last row fit, which hides the note again.
 * Reserving the space unconditionally makes the available height constant, so
 * the measurement has a fixed point.
 */
export function ClippedNote({
  count,
  noun,
  /**
   * Plural form, when appending `s` is wrong. It was right for every noun this
   * started with — event, task, insight — and wrong for the first one added
   * afterwards, which rendered "+4 more matchs" on the League card.
   */
  plural,
}: {
  count: number;
  noun: string;
  plural?: string;
}) {
  return (
    <p className="list-clipped-note" aria-live="polite">
      {count > 0 ? `+${count} more ${count === 1 ? noun : (plural ?? `${noun}s`)}` : ""}
    </p>
  );
}
