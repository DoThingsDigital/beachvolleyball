"use client";

import { useEffect, useRef, useState } from "react";

// Mehrfachauswahl im Select-Look: zu sehen ist nur der Trigger-Button mit
// Zusammenfassung, die Checkboxen klappen als Overlay auf. Die Inputs bleiben
// dauerhaft im DOM (display:none zählt bei FormData mit), damit die Server
// Action per formData.getAll(name) liest. Nach dem React-19-Form-Reset stellt
// der reset-Listener die Ausgangsauswahl wieder her.
export function MultiSelect({
  id,
  name,
  options,
  defaultValue,
  emptyLabel,
}: {
  id: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue: string[];
  emptyLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef(defaultValue);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(defaultValue);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    const form = rootRef.current?.closest("form");
    const onReset = () => {
      setSelected(initialRef.current);
      setOpen(false);
    };
    form?.addEventListener("reset", onReset);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      form?.removeEventListener("reset", onReset);
    };
  }, []);

  const labelByValue = new Map(options.map((o) => [o.value, o.label]));
  const summary =
    selected.length === 0
      ? emptyLabel
      : selected.length <= 2
        ? selected.map((v) => labelByValue.get(v) ?? v).join(", ")
        : `${selected.length} ausgewählt`;

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="border-input bg-background flex h-9 w-40 items-center justify-between gap-2 rounded-md border px-2 text-left text-sm"
      >
        <span className="truncate">{summary}</span>
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          ▾
        </span>
      </button>
      <div
        className={
          open
            ? "bg-background absolute z-30 mt-1 flex min-w-full flex-col gap-0.5 rounded-md border p-2 shadow-md"
            : "hidden"
        }
      >
        {options.map((o) => (
          <label
            key={o.value}
            className="hover:bg-muted flex items-center gap-2 rounded px-1.5 py-1 text-sm whitespace-nowrap"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              checked={selected.includes(o.value)}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked
                    ? [...s, o.value]
                    : s.filter((v) => v !== o.value),
                )
              }
              className="size-4"
            />
            {o.label}
          </label>
        ))}
        <p className="text-muted-foreground border-t px-1.5 pt-1.5 text-xs">
          Keine Auswahl = {emptyLabel}
        </p>
      </div>
    </div>
  );
}
