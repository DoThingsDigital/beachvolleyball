// Picco-Bildmarke „Glow" + Wortmarke – reine CSS-Formen laut CI
// (design_handoff_picco_booking/README.md, Sektion Logo).

export function GlowDome({ width = 34 }: { width?: number }) {
  const height = Math.round(width / 2.6);
  return (
    <span
      aria-hidden
      className="inline-flex flex-col items-center"
      style={{ width: width + 6 }}
    >
      <span className="dome-glow block" style={{ width, height }} />
      <span
        className="bg-foreground block rounded-full"
        style={{ width: width + 6, height: 3, marginTop: 2 }}
      />
    </span>
  );
}

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={
        "font-display font-extrabold tracking-tight " +
        (small ? "text-lg" : "text-xl")
      }
    >
      <span className="text-foreground">Picco</span>{" "}
      <span className="text-primary">Winter Beach</span>
    </span>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <GlowDome width={small ? 28 : 34} />
      <Wordmark small={small} />
    </span>
  );
}

/** Footer-Endorsement „by SUMMERDOME" – klein und sekundär. */
export function Endorsement() {
  return (
    <span className="text-stone inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.18em] uppercase">
      by
      <span
        aria-hidden
        className="bg-stone inline-block"
        style={{
          width: 16,
          height: 6,
          borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
        }}
      />
      Summerdome
    </span>
  );
}
