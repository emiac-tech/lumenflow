"use client";

import React, { useEffect, useState } from "react";

type Cmyk = [number, number, number, number];

const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function normalizeHex(value: string): string | null {
  const match = value.trim().match(HEX_RE);
  if (!match) return null;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex}`;
}

export function hexToCmyk(hex: string): Cmyk {
  const clean = normalizeHex(hex) || "#000000";
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return [c, m, y, k].map((v) => Math.round(v * 100)) as Cmyk;
}

export function cmykToHex([c, m, y, k]: Cmyk): string {
  const clamp = (v: number) => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0)) / 100;
  const [cc, mm, yy, kk] = [clamp(c), clamp(m), clamp(y), clamp(k)];
  const to = (v: number) => Math.round(255 * (1 - v) * (1 - kk)).toString(16).padStart(2, "0");
  return `#${to(cc)}${to(mm)}${to(yy)}`;
}

/** Brand colour picker that also accepts a HEX code or CMYK values. */
export default function BrandColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [hexText, setHexText] = useState(value.replace(/^#/, "").toUpperCase());
  const [cmyk, setCmyk] = useState<Cmyk>(hexToCmyk(value));
  const [hexError, setHexError] = useState(false);

  useEffect(() => {
    setHexText(value.replace(/^#/, "").toUpperCase());
    setCmyk(hexToCmyk(value));
    setHexError(false);
  }, [value]);

  const commitHex = (text: string) => {
    const hex = normalizeHex(text);
    if (!hex) {
      setHexError(true);
      return;
    }
    setHexError(false);
    onChange(hex);
  };

  const setCmykPart = (index: number, raw: string) => {
    const nextCmyk = [...cmyk] as Cmyk;
    nextCmyk[index] = raw === "" ? 0 : Math.min(100, Math.max(0, Number(raw)));
    setCmyk(nextCmyk);
    onChange(cmykToHex(nextCmyk));
  };

  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");

  return (
    <div className="field rise-colorfield">
      <span id={`${id}-label`}>{label}</span>
      <div className="rise-colorfield-row">
        <input type="color" aria-label={`${label} colour picker`} value={normalizeHex(value) || "#0c5871"} onChange={(e) => onChange(e.target.value)} />
        <div className={`rise-colorfield-hexbox ${hexError ? "invalid" : ""}`}>
          <span aria-hidden>#</span>
          <input
            className="rise-colorfield-hex"
            aria-labelledby={`${id}-label`}
            value={hexText.replace(/^#/, "")}
            maxLength={6}
            spellCheck={false}
            autoCapitalize="characters"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9a-f]/gi, "").toUpperCase();
              setHexText(raw);
              if (raw.length === 6) commitHex(raw);
            }}
            onBlur={(e) => commitHex(e.target.value)}
            placeholder="F20707"
          />
        </div>
      </div>
      <span className="rise-colorfield-sub">CMYK</span>
      <div className="rise-colorfield-cmyk" aria-label={`${label} CMYK`}>
        {(["C", "M", "Y", "K"] as const).map((part, index) => (
          <label key={part}>
            {part} %
            <input type="number" min={0} max={100} step={1} value={cmyk[index]} onChange={(e) => setCmykPart(index, e.target.value)} />
          </label>
        ))}
      </div>
      {hexError ? (
        <span className="rise-colorfield-error">Enter a 6-character hex code, for example F20707.</span>
      ) : (
        <span className="rise-colorfield-note">Type the hex code, pick a colour, or enter CMYK. CMYK is converted to the nearest screen colour.</span>
      )}
    </div>
  );
}
