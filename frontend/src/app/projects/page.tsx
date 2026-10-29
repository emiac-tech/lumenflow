"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Search } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ProjectCard from "@/components/ProjectCard";
import { useProjects } from "@/components/ProjectContext";

export default function ProjectsPage() {
  const router = useRouter();
  const { projects, activeProjectId, setActiveProjectId, renameProject, deleteProject, isLoading } = useProjects();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  const openProject = (id: number) => {
    setActiveProjectId(id);
    router.push("/schedule");
  };

  const saveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editName.trim()) return;
    setBusy(true);
    await renameProject(editing.id, editName.trim());
    setBusy(false);
    setEditing(null);
  };

  const runDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    const ok = await deleteProject(confirmDelete.id);
    setBusy(false);
    if (ok) setConfirmDelete(null);
  };

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <section className="rise-m-head rise-mobile-block">
          <h1>Projects</h1>
          <p>Your project schedules and documents.</p>
          {!isLoading && projects.length > 0 && (
            <button type="button" className="primary-button" onClick={() => router.push("/projects/new")}>
              + New project
            </button>
          )}
        </section>

        <section className="rise-page-head rise-desktop-only">
          <div>
            <p className="rise-eyebrow">Your workspace / Projects</p>
            <h1>A home for every project.</h1>
            <p className="rise-lead">Keep each project’s sources, review decisions, schedule and documents together.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => router.push("/projects/new")}>
            + Create a project
          </button>
        </section>

        {projects.length > 6 && (
          <label className="rise-search" style={{ maxWidth: 420 }}>
            <Search size={15} />
            <input placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        )}

        {isLoading ? (
          <p className="muted">Loading projects…</p>
        ) : projects.length === 0 ? (
          <>
            <div className="rise-m-empty rise-mobile-block">
              <strong>No projects yet.</strong>
              <span>Create your first project to add products and prepare documents.</span>
              <button type="button" className="primary-button" onClick={() => router.push("/projects/new")}>+ New project</button>
            </div>
            <div className="rise-empty rise-desktop-only">
              <h3>Ready for your first project?</h3>
              <p>Create a project to begin.</p>
              <button type="button" className="primary-button" onClick={() => router.push("/projects/new")}>Create a project →</button>
            </div>
          </>
        ) : filtered.length === 0 ? (
          <div className="rise-empty"><p>No projects match “{query}”.</p></div>
        ) : (
          <div className="rise-project-grid">
            {filtered.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                active={p.id === activeProjectId}
                onOpen={() => openProject(p.id)}
                actions={
                  <span className="rise-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="rise-icon-btn"
                      title="Rename project"
                      aria-label={`Rename ${p.name}`}
                      onClick={() => {
                        setEditing({ id: p.id, name: p.name });
                        setEditName(p.name);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="rise-icon-btn danger"
                      title="Delete project"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => setConfirmDelete({ id: p.id, name: p.name })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                }
              />
            ))}
          </div>
        )}
        <p className={`rise-fine ${projects.length === 0 ? "rise-desktop-only" : ""}`}>Open a project to continue in its luminaire schedule.</p>
      </main>


      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
          <div className="modal" style={{ maxWidth: 440, height: "auto" }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setEditing(null)} aria-label="Close">✕</button>
            <div className="modal-header">
              <h2>Rename project</h2>
              <p>The new name shows in the schedule, documents and project list.</p>
            </div>
            <form onSubmit={saveRename} className="modal-form">
              <label className="field">
                <span>Project name</span>
                <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              <div className="actions">
                <button type="button" className="ghost-button" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={busy}>Save project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onMouseDown={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 440, height: "auto" }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setConfirmDelete(null)} aria-label="Close">✕</button>
            <div className="modal-header">
              <h2>Delete project</h2>
              <p>
                Delete <strong>{confirmDelete.name}</strong>? This removes its luminaires, templates, settings and other
                project data.
              </p>
            </div>
            <div className="actions">
              <button type="button" className="ghost-button" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" className="ghost-button danger-button" onClick={runDelete} disabled={busy}>
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
