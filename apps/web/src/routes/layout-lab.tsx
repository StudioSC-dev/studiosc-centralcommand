import { useEffect, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CARD_SIZES,
  LAYOUT_PRESETS,
  cardSpan,
  cardSpans,
  gridShape,
  matchingPresetKey,
  presetLayoutInput,
  type CardSize,
  type LayoutPreset,
} from "@central-command/types";
import { meQueryOptions } from "../lib/auth";
import { CARD_REGISTRY } from "../components/cardRegistry";

/**
 * Layout lab — every card at every size, on one page.
 *
 * **Why this exists.** Nine cards × five sizes is 45 combinations, and every
 * layout change until now was verified against whichever one or two happened to
 * be on screen. Worse, only *one* of the two failure modes is visible to the
 * naked eye: content overflowing looks broken, while content dropped with room
 * left over just looks like a card that has little to say. Both bugs that
 * prompted this page — Weather cropping its day strip, then Weather binning it
 * with 200px to spare — were of that second kind.
 *
 * So each tile reports what a screenshot cannot: whether the body overflows,
 * how many blocks the fit pass dropped, and how much space it left unused.
 *
 * Dev-only. Unlinked from the app and redirected away in production builds.
 */
export const Route = createFileRoute("/layout-lab")({
  beforeLoad: async ({ context }) => {
    if (!import.meta.env.DEV) throw redirect({ to: "/" });
    // Cards read live data, so the lab needs the same session the dashboard has.
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (!me) throw redirect({ to: "/login" });
  },
  component: LayoutLab,
});

/** Chrome the real dashboard subtracts from the viewport before dividing into rows. */
const CHROME_PX = 56 + 28.8 + 8;
const GAP_REM = 0.85;

/** More than this much unused space after a drop is worth flagging. */
const SLACK_PX = 32;

interface TileReport {
  /** Body overflow in px — positive means content is being cropped or scrolled. */
  overflow: number;
  /** Unused space in the body, in px. */
  slack: number;
  /** `[data-drop-order]` blocks the fit pass removed. */
  dropped: number;
  /** List rows `useClampList` hid. */
  clipped: number;
  /** The card opted into scrolling (News, Today) — overflow is expected. */
  scrollable: boolean;
}

/**
 * Watch one rendered card and report how it is coping with its tile.
 *
 * Observes *attribute* changes as well as size, because the interesting events
 * here are `.is-dropped` and `.is-clipped` being toggled by the fit hooks — and
 * those change no box, so a ResizeObserver alone would never see them.
 */
function useTileReport<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [report, setReport] = useState<TileReport | null>(null);
  const last = useRef<string>("");

  useEffect(() => {
    if (!node) return;

    const read = () => {
      const body = node.querySelector<HTMLElement>(".card-body");
      if (!body) return;

      // Count blocks that are *not rendered*, whatever hid them — the fit pass
      // (`.is-dropped`) or a container query. Counting only `.is-dropped` missed
      // Weather swapping its day strip for text on a tile with 50px of width to
      // spare, and scored that tile OK. What matters is that content is gone,
      // not which mechanism removed it.
      //
      // `[data-fallback]` blocks are excluded: they are alternate renderings of
      // another block, so the hidden one is always the half that isn't showing.
      const droppable = Array.from(
        node.querySelectorAll<HTMLElement>("[data-drop-order]:not([data-fallback])"),
      );

      const next: TileReport = {
        overflow: Math.max(0, body.scrollHeight - body.clientHeight),
        slack: Math.max(0, body.clientHeight - body.scrollHeight),
        dropped: droppable.filter((el) => el.getClientRects().length === 0).length,
        clipped: node.querySelectorAll(".is-clipped").length,
        scrollable: body.classList.contains("is-scrollable"),
      };

      // Only re-render on a real change: this observer watches class attributes,
      // and re-rendering on every read would be a loop waiting to happen.
      const key = JSON.stringify(next);
      if (key === last.current) return;
      last.current = key;
      setReport(next);
    };

    read();
    const resize = new ResizeObserver(read);
    resize.observe(node);
    const mutation = new MutationObserver(read);
    mutation.observe(node, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [node]);

  return { ref: setNode, report };
}

function verdict(report: TileReport | null): { label: string; tone: string } {
  if (!report) return { label: "…", tone: "idle" };
  if (report.scrollable) {
    return { label: report.overflow > 1 ? `scrolls · ${report.overflow}px` : "scrolls", tone: "ok" };
  }
  // The card is being cropped — the fit pass ran out of things it was allowed
  // to drop, or nothing was marked droppable in the first place.
  if (report.overflow > 1) return { label: `OVERFLOW ${report.overflow}px`, tone: "bad" };
  // Content was given up while space went unused: the expensive, invisible bug.
  if ((report.dropped > 0 || report.clipped > 0) && report.slack > SLACK_PX) {
    const gave = [
      report.dropped > 0 && `${report.dropped} block${report.dropped === 1 ? "" : "s"}`,
      report.clipped > 0 && `${report.clipped} row${report.clipped === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" + ");
    return { label: `SLACK ${report.slack}px · gave up ${gave}`, tone: "warn" };
  }
  if (report.dropped > 0 || report.clipped > 0) {
    return { label: `fits · dropped ${report.dropped}, clipped ${report.clipped}`, tone: "ok" };
  }
  if (report.slack > SLACK_PX * 4) return { label: `empty ${report.slack}px`, tone: "warn" };
  return { label: "OK", tone: "ok" };
}

/** Tiles are derived from the window, so resizing it has to re-derive them —
 * otherwise the lab reports one viewport's answer while showing another's. */
function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function LayoutLab() {
  // The column count the real grid would derive. 3 and 4 are the two that
  // matter — 4 is what a 12-cell layout produces, and it is where every width
  // failure so far has surfaced.
  const [cols, setCols] = useState(4);
  const viewport = useViewport();

  const gap = GAP_REM * 16;
  const unitW = (Math.min(viewport.w, 1920) - gap * (cols - 1)) / cols;
  const unitH = (viewport.h - CHROME_PX - gap * 2) / 3;

  return (
    <section className="lab">
      <header className="lab-head">
        <h1>Layout lab</h1>
        <p className="lab-note">
          Every card at every size, in tiles the real grid would produce. <strong>OVERFLOW</strong>{" "}
          means content is cropped; <strong>SLACK</strong> means the card gave content up while
          leaving room unused — the failure a screenshot cannot show.
        </p>
        <div className="lab-controls">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={`seg-btn${cols === n ? " active" : ""}`}
              onClick={() => setCols(n)}
            >
              {n} columns
            </button>
          ))}
          <span className="lab-note">
            unit tile {Math.round(unitW)} × {Math.round(unitH)}px
          </span>
        </div>
      </header>

      <PresetAudit />

      {CARD_REGISTRY.map((card) => (
        <section key={card.key} className="lab-card-group">
          <h2 className="lab-card-name">{card.label}</h2>
          <div className="lab-row">
            {CARD_SIZES.map((size) => (
              <LabTile
                key={size}
                size={size}
                unitW={unitW}
                unitH={unitH}
                gap={gap}
                cols={cols}
                Component={card.component}
              />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function LabTile({
  size,
  unitW,
  unitH,
  gap,
  cols,
  Component,
}: {
  size: CardSize;
  unitW: number;
  unitH: number;
  gap: number;
  cols: number;
  Component: React.ComponentType;
}) {
  const { ref, report } = useTileReport<HTMLDivElement>();
  const { w, h } = cardSpan(size);
  const { label, tone } = verdict(report);

  // A span is n tiles plus the gaps between them — the same arithmetic CSS grid
  // does, so a tile here is the size it would really be.
  const width = unitW * w + gap * (w - 1);
  const height = unitH * h + gap * (h - 1);

  // A size wider than the grid cannot occur on the real dashboard.
  if (w > cols) return null;

  return (
    <div className="lab-tile-wrap">
      <div className="lab-tile-head">
        <span className="lab-size">{`${w} × ${h}`}</span>
        <span className={`lab-verdict lab-${tone}`}>{label}</span>
      </div>
      <div className="lab-tile" ref={ref} style={{ width, height }}>
        <Component />
      </div>
    </div>
  );
}


/**
 * Presets, checked rather than eyeballed.
 *
 * A preset is a promise that one click produces a *good* wall, so a preset that
 * packs raggedly — or worse, overflows into a fourth row — undercuts the only
 * reason to offer one. There is no test runner in this repo (docs/ui-suite.md
 * gap 7), and this page is already the place layout claims get checked, so the
 * assertion lives here where it is seen rather than in a harness that isn't.
 *
 * Four things are asserted per preset, and each has a way of going wrong that
 * is silent otherwise:
 *
 * - **fits** — the server would accept the write at all.
 * - **holes** — packing leaves no dead cells. Position matters (D9), so simply
 *   reordering a preset's roster can introduce a hole without changing a size.
 * - **round-trip** — the layout it produces identifies back as itself, so the
 *   active-state highlight is not quietly always off.
 * - **rows ≤ 3** — it still fits one screen.
 */
function PresetAudit() {
  const rows = LAYOUT_PRESETS.map((preset) => audit(preset));
  const failures = rows.filter((row) => !row.ok).length;

  return (
    <section className="lab-card-group">
      <h2 className="lab-card-name">
        Presets{" "}
        <span className={`lab-verdict lab-${failures === 0 ? "ok" : "bad"}`}>
          {failures === 0 ? "all pass" : `${failures} FAILING`}
        </span>
      </h2>
      <div className="lab-preset-audit">
        {rows.map((row) => (
          <div key={row.key} className="lab-preset-row">
            <span className={`lab-verdict lab-${row.ok ? "ok" : "bad"}`}>
              {row.ok ? "PASS" : "FAIL"}
            </span>
            <strong>{row.label}</strong>
            <span className="lab-note">
              {row.cols} × {row.rows} · {row.cells}/{row.capacity} cells ·{" "}
              {row.holes === 0 ? "no holes" : `${row.holes} HOLE(S)`} ·{" "}
              {row.fits ? "fits" : "DOES NOT FIT"} ·{" "}
              {row.roundTrip ? "round-trips" : "NO ROUND-TRIP"}
            </span>
            <span className="lab-note">{row.visible.join(" · ")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function audit(preset: LayoutPreset) {
  const input = presetLayoutInput(preset);
  const hidden = new Set(input.hidden);
  const visible = input.order.filter((key) => !hidden.has(key));
  const shape = gridShape(cardSpans(visible, input.sizes));
  const holes = shape.capacity - shape.cells;
  const fits = !shape.overflows;
  const roundTrip =
    matchingPresetKey({ hidden: input.hidden, order: input.order, visible, sizes: input.sizes }) ===
    preset.key;

  return {
    key: preset.key,
    label: preset.label,
    visible,
    cols: shape.cols,
    rows: shape.rows,
    cells: shape.cells,
    capacity: shape.capacity,
    holes,
    fits,
    roundTrip,
    ok: fits && holes === 0 && roundTrip && shape.rows <= 3,
  };
}
