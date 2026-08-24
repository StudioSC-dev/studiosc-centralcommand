import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  LAYOUT_PRESETS,
  PRESET_NAME_MAX,
  cardSpan,
  cardSpans,
  gridShape,
  normalisePresetName,
  type DashboardLayoutInput,
  type PresetArrangement,
  type SavedPreset,
} from "@central-command/types";
import { useApplyPreset } from "../lib/dashboard";
import {
  useDeletePreset,
  useSavePreset,
  useSavedPresetState,
  useUpdatePreset,
} from "../lib/presets";

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
 *
 * Phase 7 adds the user's own saved arrangements beside the three built-ins.
 * They are a separate group with its own label rather than one merged row,
 * because the two are not the same kind of thing: the built-ins are permanent
 * and identical for everyone, and only the saved ones can be deleted or
 * re-captured. Merging them would put affordances on three chips that cannot
 * have them.
 */
export function LayoutPresets() {
  const { active, apply, snapshot, restore } = useApplyPreset();
  const { presets, matching } = useSavedPresetState();

  // The layout as it was before the last preset was applied, plus which preset
  // that was. Applying a preset is the only edit-mode gesture that discards an
  // arrangement wholesale, so it is the only one that needs an explicit way
  // back — every other gesture is undone by repeating it.
  const [undo, setUndo] = useState<{
    input: Required<DashboardLayoutInput>;
    token: string;
  } | null>(null);

  // Once the layout stops being the preset that was applied, the snapshot no
  // longer describes a state the user would recognise as "before" — so it is
  // dropped rather than left as a button that silently reverts unrelated edits
  // too. Keyed on the *applied* preset rather than on "is any preset active",
  // because with saved presets in the row the user can apply a second one, and
  // an Undo still pointing at the first would revert two steps in one click.
  const matched = active ? [active as string, ...matching] : matching;
  const stale = undo !== null && !matched.includes(undo.token);
  useEffect(() => {
    if (stale) setUndo(null);
  }, [stale]);

  const armUndo = (token: string) => {
    // Re-applying the preset you are already on changes nothing, so it must not
    // arm an Undo that would then revert to the same state and read as a broken
    // button.
    if (matched.includes(token)) return;
    const taken = snapshot();
    if (taken) setUndo({ input: taken, token });
  };

  return (
    <>
      <span className="edit-bar-label preset-label">Presets</span>
      <ul className="edit-bar-list preset-list">
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
                armUndo(preset.key);
                apply(preset);
              }}
            >
              <PresetGlyph arrangement={preset} />
              {preset.label}
            </button>
          </li>
        ))}
      </ul>

      {presets.length > 0 && (
        <>
          <span className="edit-bar-label preset-label">Saved</span>
          <ul className="edit-bar-list preset-list">
            {presets.map((preset) => (
              <li key={preset.id}>
                <SavedPresetChip
                  preset={preset}
                  active={matching.includes(preset.id)}
                  onApply={() => {
                    armUndo(preset.id);
                    apply(preset);
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <SavePresetControl />

      {undo && (
        <button
          type="button"
          className="edit-chip preset-undo"
          title="Put the previous arrangement back"
          onClick={() => {
            restore(undo.input);
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
 * One saved preset: apply on the chip, re-capture on the ⤒, delete on the ×.
 *
 * Delete arms rather than fires. It is the only destructive control in edit
 * mode, it sits inside a chip whose whole body is a *non*-destructive click,
 * and the two targets are a few pixels apart — so a mis-tap that silently
 * discards a saved arrangement is exactly the mistake to design against. The
 * second click confirms; blurring disarms it.
 */
function SavedPresetChip({
  preset,
  active,
  onApply,
}: {
  preset: SavedPreset;
  active: boolean;
  onApply: () => void;
}) {
  const [arming, setArming] = useState(false);
  const remove = useDeletePreset();
  const update = useUpdatePreset();
  const { current, fits, duplicateOf } = useSavedPresetState();

  // Whether this preset already describes what is on screen decides which of
  // the two write actions is meaningful, so it also decides which is offered:
  // re-capturing a preset that already matches would be a no-op button. `fits`
  // is the same gate Save carries — the endpoint refuses an arrangement too
  // tall for one screen, so offering the button would be offering a 400.
  //
  // The duplicate check excludes *this* preset: re-capturing onto something it
  // already describes is a no-op rather than a clash. Matching a different
  // preset is refused, because storing it would leave two chips claiming the
  // same wall — the state this control is supposed to report unambiguously.
  const clash = duplicateOf(preset.id);
  const canRecapture =
    !active && current !== null && current.visible.length > 0 && fits && clash === null;

  return (
    <span className={`preset-saved${arming ? " is-arming" : ""}`}>
      <button
        type="button"
        className={`edit-chip preset-chip preset-chip-saved${active ? " is-active" : ""}`}
        aria-pressed={active}
        title={active ? `${preset.name} — this is what is on screen` : `Apply ${preset.name}`}
        onClick={() => {
          setArming(false);
          onApply();
        }}
      >
        <PresetGlyph arrangement={preset} />
        {preset.name}
      </button>

      {canRecapture && (
        <button
          type="button"
          className="preset-recapture"
          title={`Update ${preset.name} to the current arrangement`}
          aria-label={`Update ${preset.name} to the current arrangement`}
          disabled={update.isPending}
          onClick={() => {
            setArming(false);
            if (current) update.mutate({ id: preset.id, ...current });
          }}
        >
          ⤒
        </button>
      )}

      <button
        type="button"
        className="preset-delete"
        title={arming ? `Delete ${preset.name}?` : `Delete ${preset.name}`}
        aria-label={arming ? `Confirm deleting ${preset.name}` : `Delete ${preset.name}`}
        disabled={remove.isPending}
        onClick={() => {
          if (arming) remove.mutate(preset.id);
          else setArming(true);
        }}
        onBlur={() => setArming(false)}
      >
        {arming ? "Delete?" : "×"}
      </button>
    </span>
  );
}

/**
 * Save the arrangement on screen under a name.
 *
 * A collapsed button that opens an inline field, rather than a field that is
 * always there: the bar is already dense, and saving is the rarest thing done
 * in it — you arrange for a while, then name the result once.
 *
 * The name is validated with the same `normalisePresetName` the server uses, so
 * Save is disabled on exactly the input that would be refused, and the two
 * remaining failures (duplicate name, preset limit) are the ones only the
 * server can settle — they come back as a message rather than being guessed at.
 */
function SavePresetControl() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const save = useSavePreset();
  const { current, blocked, presets } = useSavedPresetState();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const clean = normalisePresetName(name);
  const duplicate = clean !== null && presets.some((p) => p.name === clean);

  const close = () => {
    setOpen(false);
    setName("");
    save.reset();
  };

  const submit = () => {
    if (!clean || duplicate || !current) return;
    save.mutate({ name: clean, ...current }, { onSuccess: close });
  };

  if (!open) {
    return (
      <button
        type="button"
        className="edit-chip preset-save-open"
        // Disabled with the reason in the tooltip rather than hidden: a control
        // that vanishes at the eight-preset limit reads as a bug, where one that
        // says why reads as a rule.
        disabled={blocked !== null}
        title={blocked ?? "Save this arrangement as a preset"}
        onClick={() => setOpen(true)}
      >
        + Save
      </button>
    );
  }

  return (
    <span className="preset-save-form">
      <input
        ref={inputRef}
        type="text"
        className="preset-save-input"
        value={name}
        maxLength={PRESET_NAME_MAX}
        placeholder="Name this layout"
        aria-label="Preset name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          // Escape closes the field, not edit mode — the window-level Escape
          // handler would otherwise drop the user out of the mode they are
          // mid-gesture in, discarding the name they were typing.
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
      />
      <button
        type="button"
        className="edit-chip preset-save-confirm"
        disabled={!clean || duplicate || save.isPending}
        title={duplicate ? "You already have a preset with that name" : "Save"}
        onClick={submit}
      >
        {save.isPending ? "Saving…" : "Save"}
      </button>
      <button type="button" className="edit-chip preset-save-cancel" onClick={close}>
        Cancel
      </button>
      {(duplicate || save.error) && (
        <span className="edit-bar-error">
          {duplicate ? "That name is taken." : save.error?.message}
        </span>
      )}
    </span>
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
 * the picture follows — and a *saved* preset gets the same picture from the
 * same code, because it is the same `PresetArrangement`.
 */
function PresetGlyph({ arrangement }: { arrangement: PresetArrangement }) {
  const shape = gridShape(cardSpans(arrangement.visible, arrangement.sizes));
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
      {arrangement.visible.map((key) => {
        const { w, h } = cardSpan(arrangement.sizes[key]);
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
