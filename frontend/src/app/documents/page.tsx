"use client";

import { withBase } from "@/utils/basePath";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { useProjects } from "@/components/ProjectContext";
import { apiFetch } from "@/utils/api";
import { parseServerDate } from "@/utils/brand";

type Doc = {
  id: number | string;
  type: "spec" | "schedule";
  title: string;
  fileUrl: string;
  createdAt: string;
  revision?: string;
  projectId: number;
  projectName: string;
  projectRevision?: string;
};

export default function DocumentsPage() {
  const { projects, setActiveProjectId, isLoading } = useProjects();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [projectFilter, setProjectFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    Promise.all(
      projects.slice(0, 60).map((p) =>
        apiFetch(`/api/exports?project_id=${p.id}`)
          .then((r) => (r.ok ? r.json() : { items: [] }))
          .then((d) =>
            (Array.isArray(d?.items) ? d.items : []).map((it: Omit<Doc, "projectId" | "projectName" | "type"> & { type?: string }) => ({
              ...it,
              type: it.type === "schedule" ? "schedule" : "spec",
              projectId: p.id,
              projectName: p.name,
              projectRevision: p.revision,
            })),
          )
          .catch(() => []),
      ),
    ).then((lists) => {
      if (cancelled) return;
      const all = lists.flat() as Doc[];
      all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setDocs(all);
    });
    return () => {
      cancelled = true;
    };
  }, [projects, isLoading]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs || []).filter(
      (d) =>
        (projectFilter === "all" || String(d.projectId) === projectFilter) &&
        (typeFilter === "all" || d.type === typeFilter) &&
        (!q || d.title.toLowerCase().includes(q) || d.projectName.toLowerCase().includes(q)),
    );
  }, [docs, projectFilter, typeFilter, query]);

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <section className="rise-page-head">
          <div>
            <p className="rise-eyebrow">Documentation / Project deliverables</p>
            <h1>Every deliverable. Easy to find.</h1>
            <p className="rise-lead">
              One view of the documents created in your projects. Filter by project and document type; open the project
              for its sources and review decisions.
            </p>
          </div>
          <Link href="/projects" className="rise-btn-outline">Go to projects →</Link>
        </section>

        <div className="rise-note">Browse your project deliverables by project and document type. Each document links back to its project.</div>
        <div className="rise-filters">
          <label>
            Project
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            Document type
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All document types</option>
              <option value="schedule">Schedules</option>
              <option value="spec">Specification sheets</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Search
            <input placeholder="Search project or document" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: "100%" }} />
          </label>
        </div>

        {docs === null ? (
          <p className="muted">Loading documents…</p>
        ) : visible.length === 0 ? (
          <div className="rise-empty">
            <h3>{docs.length === 0 ? "No documents yet." : "Nothing matches these filters."}</h3>
            <p>
              {docs.length === 0
                ? "Specification sheets you download from a project schedule will be listed here."
                : "Try another project or search term."}
            </p>
          </div>
        ) : (
          <table className="rise-doc-table rise-doc-table-responsive">
            <thead>
              <tr>
                <th>Document</th>
                <th>Project</th>
                <th>Type</th>
                <th>Revision</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={`${d.projectId}-${d.id}`}>
                  <td data-label="Document"><span style={{ fontWeight: 600 }}>{d.title}</span></td>
                  <td data-label="Project">
                    <Link href="/schedule" className="rise-link" style={{ fontWeight: 500 }} onClick={() => setActiveProjectId(d.projectId)}>
                      {d.projectName}
                    </Link>
                  </td>
                  <td data-label="Type">{d.type === "schedule" ? "Schedule" : "Specification sheet"}</td>
                  <td data-label="Revision">{d.revision || d.projectRevision || "—"}</td>
                  <td data-label="Created">{parseServerDate(d.createdAt) ? parseServerDate(d.createdAt)!.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td data-label="Action" className="rise-doc-action" style={{ textAlign: "right" }}>
                    <a className="rise-link" href={withBase(d.fileUrl)} target="_blank" rel="noopener noreferrer">
                      {d.type === "schedule" ? (d.fileUrl.endsWith(".xlsx") ? "Download Excel ↓" : "Download PDF ↓") : "Preview sheet ↗"}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {docs !== null && <p className="rise-fine">{visible.length} document{visible.length === 1 ? "" : "s"} shown</p>}
      </main>
    </div>
  );
}
