"use client";

import React from "react";
import type { Project } from "./ProjectContext";

export default function ProjectCard({
  project,
  active,
  onOpen,
  actions,
}: {
  project: Project;
  active?: boolean;
  onOpen: () => void;
  actions?: React.ReactNode;
}) {
  const n = project.luminaireCount ?? 0;
  const docs = project.documentCount ?? 0;
  const status = n === 0 ? "Start with sources" : docs > 0 ? "Open schedule" : "Ready to deliver";
  return (
    <div
      role="button"
      tabIndex={0}
      className={`rise-project-card ${active ? "active" : ""}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="rise-scope-pill">Lighting project</span>
      <h3>{project.name}</h3>
      <span className="rise-card-meta">
        {project.location || "Location not set"} · Revision {project.revision || "A"}
      </span>
      <span className="rise-card-foot">
        <span className="rise-card-meta">
          {n} luminaire{n === 1 ? "" : "s"} · {docs} document{docs === 1 ? "" : "s"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {actions}
          <span className="rise-link" style={{ fontSize: 13 }}>{status} →</span>
        </span>
      </span>
    </div>
  );
}
