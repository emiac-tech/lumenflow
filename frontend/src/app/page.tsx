"use client";

import { withBase } from "@/utils/basePath";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/components/AuthContext";
import { useBrand } from "@/components/BrandContext";
import { useProjects } from "@/components/ProjectContext";
import { apiFetch } from "@/utils/api";
import ProjectCard from "@/components/ProjectCard";
import { StudioDefaults, TEMPLATE_LABEL, fetchStudio } from "@/utils/brand";

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { companyName } = useBrand();
  const { projects, activeProjectId, setActiveProjectId, isLoading } = useProjects();
  const [documentCount, setDocumentCount] = useState<number | null>(null);

  const [studio, setStudio] = useState<StudioDefaults | null>(null);
  useEffect(() => {
    fetchStudio().then(setStudio).catch(() => setStudio(null));
  }, []);
  const studioName =
    (studio?.studioName || "").trim() || (user?.studioName || "").trim() || (companyName || "").trim() || "Your studio";

  useEffect(() => {
    let cancelled = false;
    if (!projects.length) {
      setDocumentCount(0);
      return;
    }
    // Newer backends return documentCount with each project (one query).
    if (projects.every((p) => typeof p.documentCount === "number")) {
      setDocumentCount(projects.reduce((sum, p) => sum + (p.documentCount ?? 0), 0));
      return;
    }
    Promise.all(
      projects.slice(0, 40).map((p) =>
        apiFetch(`/api/exports?project_id=${p.id}`)
          .then((r) => (r.ok ? r.json() : { items: [] }))
          .then((d) => (Array.isArray(d?.items) ? d.items.length : 0))
          .catch(() => 0),
      ),
    ).then((counts) => {
      if (!cancelled) setDocumentCount(counts.reduce((a, b) => a + b, 0));
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const openProject = (id: number) => {
    setActiveProjectId(id);
    router.push("/schedule");
  };

  const recent = [...projects].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 3);

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <section className="rise-page-head">
          <div>
            <p className="rise-eyebrow">Home / Your studio</p>
            <h1>Admin less. Design more.</h1>
            <p className="rise-lead">Your projects, your studio standards, one place to begin.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => router.push("/projects/new")}>
            + Create a project
          </button>
        </section>

        <section className="rise-card rise-studio">
          <div className="rise-studio-mark" aria-hidden>
            {studio?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={withBase(studio.logoUrl)} alt="" />
            ) : (
              studioName.charAt(0).toUpperCase()
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="rise-panel-label" style={{ marginBottom: 6 }}>Your studio</span>
            <h2>{studioName}</h2>
            <p>{studio?.saved ? "Studio identity and template saved." : "Add your logo and template when you’re ready."}</p>
          </div>
          <Link href="/setup" className="rise-link">
            {studio?.saved ? "Edit studio setup →" : "Set up your studio →"}
          </Link>
        </section>

        <section className={`rise-stats ${user?.role === "admin" ? "three" : ""}`} aria-label="Workspace summary">
          <div>
            <span>Projects</span>
            <strong>{isLoading ? "–" : projects.length}</strong>
          </div>
          <div>
            <span>Documents</span>
            <strong>{documentCount ?? "–"}</strong>
          </div>
          <div>
            <span>Default template</span>
            <strong>{TEMPLATE_LABEL[studio?.template || "standard"]}</strong>
          </div>
          {user?.role !== "admin" && (
            <div>
              <span>Extraction credits</span>
              <strong>{user?.tokens ?? 0}</strong>
            </div>
          )}
        </section>

        <section>
          <div className="rise-section-head">
            <h2>Your projects</h2>
            <Link href="/projects" className="rise-link">View all projects →</Link>
          </div>
          {isLoading ? (
            <p className="muted">Loading projects…</p>
          ) : recent.length === 0 ? (
            <div className="rise-empty">
              <span style={{ fontSize: 26, color: "var(--rise-red)" }}>+</span>
              <h3>Your next project starts here.</h3>
              <p>Give it a name. Your studio defaults will come with it.</p>
              <button type="button" className="primary-button" onClick={() => router.push("/projects/new")}>
                Create your first project →
              </button>
            </div>
          ) : (
            <div className="rise-project-grid">
              {recent.map((p) => (
                <ProjectCard key={p.id} project={p} active={p.id === activeProjectId} onOpen={() => openProject(p.id)} />
              ))}
            </div>
          )}
        </section>
      </main>

    </div>
  );
}
