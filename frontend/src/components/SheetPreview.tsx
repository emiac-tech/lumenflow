import { withBase } from "@/utils/basePath";
import React from "react";

export interface SheetPreviewProps {
  studioName: string;
  logoUrl?: string;
  accent: string;
  compact?: boolean;
  projectName?: string;
  location?: string;
  revision?: string;
  reference?: string;
  product?: string;
  cct?: string;
  unitPower?: string;
  quantity?: string;
}

/** Small, illustrative version of the specification sheet — mirrors RISE OS. */
export default function SheetPreview(p: SheetPreviewProps) {
  const rows: [string, string][] = [
    ["Reference", p.reference || "L01"],
    ["Product", p.product || "Sample luminaire"],
    ["CCT", p.cct || "Selected in the project"],
    ["Unit power", p.unitPower || "—"],
    ["Quantity", p.quantity || "—"],
  ];
  return (
    <div className={`rise-sheet ${p.compact ? "compact" : ""}`} style={{ borderTopColor: p.accent }}>
      {p.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="rise-sheet-logo" src={withBase(p.logoUrl)} alt="Studio logo" />
      ) : (
        <div className="rise-sheet-brand">{p.studioName || "Your studio"}</div>
      )}
      <div className="rise-sheet-title">Luminaire specification sheet</div>
      <h3>{p.projectName || "Your next project"}</h3>
      <p className="rise-sheet-meta">
        {p.location || "Project location"} · Revision {p.revision || "A"}
      </p>
      {rows.map(([k, v]) => (
        <div className="rise-sheet-row" key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
      <p className="rise-sheet-caption">Illustrative preview · not for issue</p>
    </div>
  );
}
