import { useEffect, useState, type CSSProperties } from "react";
import {
  LAYOUT_PRESETS,
  cardSpan,
  cardSpans,
  gridShape,
  type DashboardLayoutInput,
  type LayoutPreset,
} from "@central-command/types";
import { useApplyPreset } from "../lib/dashboard";

/**
 * The preset row in the edit bar — whole arrangements under one name.
 *
 * Presets are the answer to "this is fiddly to configure" (docs/ui-suite.md
 * Phase 6). Building a 4×3 Focus wall by hand is four hides, three resizes and
 * a drag, each a separate round trip, with the size picker refusing options
 * along the way because the order is not right *yet*. One button is the whole
 * arrangement, applied as a single write.
 *
 * It lives in the edit bar rather than on a card, because unlike the remove
 * badge and the size picker a preset is not about any one card.
 */
export function LayoutPresets() {
  const { active, apply, snapshot, restore } = useApplyPreset();

  // The layout as it was before the last preset was applied. Applying a preset
  // is the only edit-mode gesture that discards an arrangement wholesale, so
  // it is the only one that needs an explicit way back — every other gesture
  // is undone by repeating it.
  const [undo, setUndo] = useState<Required<DashboardLayoutInput> | null>(null);

  // Once the layout has been touched by anything else, the snapshot no longer
  // describes a state the user would recognise as "before" — so it is dropped
  // rather than left as a button that silently reverts unrelated edits too.
  // Keyed on `active` alone on purpose: it flips to null the moment the
  // arrangement stops being the preset that was applied, which is exactly the
  // event that invalidates the snapshot.
  useEffect(() => {
    if (active === null) setUndo(null);
  }, [active]);

  return (
    <>
      <span className="edit-bar-label">Presets</span>
      <ul className="edit-bar-list">
        {LAYOUT_PRESETS.map((preset) => (
          <li key={preset.key}>
            <button
              type="button"
              className={`edit-chip preset-chip${active === preset.key ? " is-active" : ""}`}
              // A radio group would claim these are the only possible states.
              // A hand-arranged dashboard is a legitimate fourth state with no
              // button, so each is a toggle reporting whether it is the one.
              aria-pressed={active === preset.key}
              title={preset.description}
              onClick={() => {
                // Re-applying the preset you are already on changes nothing, so
                // it must not arm an Undo that would then revert to the same
                // state and read as a broken button.
                if (active !== preset.key) setUndo(snapshot());
                apply(preset);
              }}
            >
              <PresetGlyph preset={preset} />
              {preset.label}
            </button>
          </li>
        ))}
      </ul>

      {undo && (
        <button
          type="button"
          className="edit-chip preset-undo"
          title="Put the previous arrangement back"
          onClick={() => {
            restore(undo);
            setUndo(null);
          }}
        >
          Undo
        </button>
      )}
    </>
  );
}

/**
 * A miniature of the arrangement, drawn as the grid it actually produces.
 *
 * The first attempt reused the size picker's 3×2 filled-cell field and could
 * not tell Wall from Minimal — both fill it completely. What distinguishes the
 * presets is not *how much* of the grid is used but **where the card boundaries
 * fall**, so this draws one block per card at the preset's own derived shape.
 *
 * It is a real CSS grid with real spans, and placement is left to the browser's
 * `grid-auto-flow: row`. That is not a shortcut — it is the same non-dense
 * row-packing `gridShape()` simulates (D9), so the glyph is laid out by exactly
 * the mechanism the dashboard is, and cannot drift from it. Change a preset and
 * the picture follows.
 */
function PresetGlyph({ preset }: { preset: LayoutPreset }) {
  const shape = gridShape(cardSpans(preset.visible, preset.sizes));
  return (
    <span
      className="preset-glyph"
      aria-hidden="true"
      style={
        {
          "--preset-cols": shape.cols,
          "--preset-rows": shape.rows,
        } as CSSProperties
      }
    >
      {preset.visible.map((key) => {
        const { w, h } = cardSpan(preset.sizes[key]);
        return (
          <span
            key={key}
            className="preset-glyph-cell"
            style={{ gridColumn: `span ${w}`, gridRow: `span ${h}` } as CSSProperties}
          />
        );
      })}
    </span>
  );
}
