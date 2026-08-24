import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CARD_KEYS,
  LAYOUT_PRESETS,
  PRESET_NAME_MAX,
  arrangementOmits,
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
          <span
            className="edit-bar-label preset-label"
            // Gap 14, said out loud. A saved preset stores its roster and
            // nothing backfills it, so a card that ships later is absent from
            // every one of them. That is the right default for an arrangement
            // someone deliberately pared down — but it is a surprise the first
            // time, and until now nothing in the UI admitted it.
            title={`Your own arrangements. A preset keeps the cards it was saved with — a card added to the dashboard later joins “Wall” only.`}
          >
            Saved
          </span>
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
 * One saved preset: apply on the chip, re-capture on the ⤒, rename on the ✎,
 * delete on the ×.
 *
 * **Both write buttons arm before they fire.** Delete always did (7.2): it is
 * fused to a chip whose whole body is a *non*-destructive click, and the two
 * targets are a few pixels apart. Re-capture did not, and gap 16 named it the
 * one unguarded destructive write in the phase — it overwrites the stored
 * arrangement with whatever is on screen, and the previous one is gone with no
 * Undo covering it. It is now the same two-step, sharing one arming slot with
 * delete so reaching for either disarms the other and only one chip can ever be
 * mid-gesture.
 *
 * Rename is the phase's one *added* affordance (gap 15). It was left out of
 * Phase 7 to keep the chip off a third fused button, and that judgement is
 * reversed here: the alternative on offer was delete-then-save, which discards
 * a saved arrangement to change a label, and is exactly the kind of destructive
 * detour the arming above exists to prevent. It needs no arming of its own —
 * renaming loses nothing, and it swaps the chip for a field rather than firing.
 */
type Arm = "delete" | "recapture" | null;

function SavedPresetChip({
  preset,
  active,
  onApply,
}: {
  preset: SavedPreset;
  active: boolean;
  onApply: () => void;
}) {
  const [arm, setArm] = useState<Arm>(null);
  const [renaming, setRenaming] = useState(false);
  const remove = useDeletePreset();
  const update = useUpdatePreset();
  const { current, fits, duplicateOf, presets } = useSavedPresetState();

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

  // Gap 14: how much of the live dashboard this preset does not include. Read
  // against `CARD_KEYS` rather than against anything stored, because what the
  // roster was missing when it was written is not recorded anywhere — and the
  // number only becomes interesting when a card ships that the preset predates.
  const omitted = arrangementOmits(preset);
  const roster = `shows ${preset.visible.length} of ${CARD_KEYS.length} cards`;

  if (renaming) {
    return (
      <span className="preset-saved is-renaming">
        <PresetNameField
          initial={preset.name}
          label={`Rename ${preset.name}`}
          confirmLabel="Rename"
          pending={update.isPending}
          error={update.error?.message ?? null}
          // The server refuses a duplicate name and can say which; this only
          // pre-empts the round trip, and must ignore *this* preset's own name
          // so re-confirming it unchanged is not reported as a clash.
          taken={presets.filter((p) => p.id !== preset.id).map((p) => p.name)}
          onCancel={() => {
            update.reset();
            setRenaming(false);
          }}
          onSubmit={(name) => {
            if (name === preset.name) {
              setRenaming(false);
              return;
            }
            update.mutate({ id: preset.id, name }, { onSuccess: () => setRenaming(false) });
          }}
        />
      </span>
    );
  }

  return (
    <span className={`preset-saved${arm !== null ? " is-arming" : ""}`}>
      <button
        type="button"
        className={`edit-chip preset-chip preset-chip-saved${active ? " is-active" : ""}`}
        aria-pressed={active}
        title={
          active
            ? `${preset.name} — this is what is on screen · ${roster}`
            : `Apply ${preset.name} · ${roster}`
        }
        onClick={() => {
          setArm(null);
          onApply();
        }}
      >
        <PresetGlyph arrangement={preset} />
        {preset.name}
        {/* A count, not a warning icon: the preset is not broken, it simply
            does not include everything. Shown only once there is something to
            report, so a preset holding the whole roster stays a plain chip. */}
        {omitted.length > 0 && (
          <span className="preset-omits" aria-hidden="true">
            {preset.visible.length}/{CARD_KEYS.length}
          </span>
        )}
      </button>

      {canRecapture && (
        <button
          type="button"
          className="preset-recapture"
          title={
            arm === "recapture"
              ? `Replace ${preset.name} with the current arrangement?`
              : `Update ${preset.name} to the current arrangement`
          }
          aria-label={
            arm === "recapture"
              ? `Confirm replacing ${preset.name}`
              : `Update ${preset.name} to the current arrangement`
          }
          disabled={update.isPending}
          onClick={() => {
            if (arm === "recapture") {
              setArm(null);
              if (current) update.mutate({ id: preset.id, ...current });
            } else {
              setArm("recapture");
            }
          }}
          onBlur={() => setArm((a) => (a === "recapture" ? null : a))}
        >
          {arm === "recapture" ? "Replace?" : "⤒"}
        </button>
      )}

      <button
        type="button"
        className="preset-rename"
        title={`Rename ${preset.name}`}
        aria-label={`Rename ${preset.name}`}
        onClick={() => {
          setArm(null);
          setRenaming(true);
        }}
      >
        ✎
      </button>

      <button
        type="button"
        className="preset-delete"
        title={arm === "delete" ? `Delete ${preset.name}?` : `Delete ${preset.name}`}
        aria-label={
          arm === "delete" ? `Confirm deleting ${preset.name}` : `Delete ${preset.name}`
        }
        disabled={remove.isPending}
        onClick={() => {
          if (arm === "delete") remove.mutate(preset.id);
          else setArm("delete");
        }}
        onBlur={() => setArm((a) => (a === "delete" ? null : a))}
      >
        {arm === "delete" ? "Delete?" : "×"}
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
  const save = useSavePreset();
  const { current, blocked, presets } = useSavedPresetState();

  const close = () => {
    setOpen(false);
    save.reset();
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
    <PresetNameField
      initial=""
      label="Preset name"
      confirmLabel="Save"
      pending={save.isPending}
      error={save.error?.message ?? null}
      taken={presets.map((p) => p.name)}
      onCancel={close}
      onSubmit={(name) => {
        if (!current) return;
        save.mutate({ name, ...current }, { onSuccess: close });
      }}
    />
  );
}

/**
 * The inline name field, shared by saving a new preset and renaming one.
 *
 * One component rather than two because the validation has to be identical:
 * both writes go through `normalisePresetName` on the server and both are
 * refused by the same per-user uniqueness rule, so a field that disagreed with
 * the other would let one gesture offer a click the other knows would 409.
 * The only thing that differs between the two is which names count as taken —
 * renaming has to exclude its own — so that is the parameter.
 *
 * `Escape` closes the field and *only* the field: the window-level handler that
 * leaves edit mode would otherwise fire mid-word and discard what was typed.
 */
function PresetNameField({
  initial,
  label,
  confirmLabel,
  pending,
  error,
  taken,
  onSubmit,
  onCancel,
}: {
  initial: string;
  label: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  taken: readonly string[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const clean = normalisePresetName(name);
  const duplicate = clean !== null && taken.includes(clean);

  const submit = () => {
    if (!clean || duplicate) return;
    onSubmit(clean);
  };

  return (
    <span className="preset-save-form">
      <input
        ref={inputRef}
        type="text"
        className="preset-save-input"
        value={name}
        maxLength={PRESET_NAME_MAX}
        placeholder="Name this layout"
        aria-label={label}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <button
        type="button"
        className="edit-chip preset-save-confirm"
        disabled={!clean || duplicate || pending}
        title={duplicate ? "You already have a preset with that name" : confirmLabel}
        onClick={submit}
      >
        {pending ? "Saving…" : confirmLabel}
      </button>
      <button type="button" className="edit-chip preset-save-cancel" onClick={onCancel}>
        Cancel
      </button>
      {(duplicate || error) && (
        <span className="edit-bar-error">{duplicate ? "That name is taken." : error}</span>
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
