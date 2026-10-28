"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import SheetPreview from "@/components/SheetPreview";
import { useProjects } from "@/components/ProjectContext";
import {
  BrandTemplate,
  ProjectBrand,
  StudioDefaults,
  checkLogoFile,
  fetchProjectBrand,
  fetchStudio,
  saveProjectBrand,
  uploadProjectLogo,
} from "@/utils/brand";

export default function ProjectSettingsPage() {
  const { projects, activeProjectId, refreshProjects } = useProjects();
  const project = projects.find((p) => p.id === activeProjectId);
  const [brand, setBrand] = useState<ProjectBrand | null>(null);
  const [studio, setStudio] = useState<StudioDefaults | null>(null);
  const [draft, setDraft] = useState<ProjectBrand | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [useStudioLogo, setUseStudioLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!activeProjectId) return;
    setBrand(null);
    setDraft(null);
    fetchProjectBrand(activeProjectId)
      .then((b) => {
        setBrand(b);
        setDraft(b);
      })
      .catch((err) => {
        setIsError(true);
        setMsg(err.message);
      });
    fetchStudio().then(setStudio).catch(() => setStudio(null));
  }, [activeProjectId]);

  // Older projects have no studio name yet: suggest the user's studio name (saved only on Save).
  useEffect(() => {
    if (studio?.studioName && draft && !draft.studioName) {
      setDraft((d) => (d && !d.studioName ? { ...d, studioName: studio.studioName } : d));
    }
  }, [studio, draft]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview("");
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const set = <K extends keyof ProjectBrand>(key: K, value: ProjectBrand[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const applyStudioDefaults = () => {
    if (!studio || !draft) return;
    setDraft({ ...draft, studioName: studio.studioName || draft.studioName, accent: studio.accent, template: studio.template });
    if (studio.logoUrl) {
      setLogoFile(null);
      setUseStudioLogo(true);
    }
    setIsError(false);
    setMsg("Studio defaults applied to the preview. Save to update this project.");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !activeProjectId) return;
    if (!draft.name.trim() || !draft.studioName.trim()) {
      setIsError(true);
      setMsg("Enter the project and studio names.");
      return;
    }
    setSaving(true);
    setIsError(false);
    try {
      if (logoFile) await uploadProjectLogo(activeProjectId, logoFile);
      const saved = await saveProjectBrand(activeProjectId, {
        name: draft.name.trim(),
        location: draft.location,
        revision: draft.revision,
        issueDate: draft.issueDate,
        studioName: draft.studioName.trim(),
        accent: draft.accent,
        template: draft.template,
        useStudioLogo: useStudioLogo && !logoFile,
      });
      setBrand(saved);
      setDraft(saved);
      setLogoFile(null);
      setUseStudioLogo(false);
      setMsg("Project settings saved. Studio defaults and earlier documents are unchanged.");
      refreshProjects();
    } catch (err) {
      setIsError(true);
      setMsg(err instanceof Error ? err.message : "Could not save project settings.");
    } finally {
      setSaving(false);
    }
  };

  const previewLogo = logoPreview || (useStudioLogo ? studio?.logoUrl : brand?.logoUrl) || "";

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <div className="rise-crumbs">
          <Link href="/projects">Projects</Link>
          <span>/</span>
          <Link href="/schedule">{project?.name || "Project"}</Link>
          <span>/</span>
          <span>Settings</span>
        </div>
        <section className="rise-page-head">
          <div>
            <p className="rise-eyebrow">Luminaire schedule / Project settings</p>
            <h1>{project?.name || "Project settings"}</h1>
            {brand && (
              <div className="rise-project-scope">
                <span>Revision {brand.revision || "A"}</span>
                <span>{brand.location || "Location not set"}</span>
                <span>{brand.studioName || "Studio not set"}</span>
              </div>
            )}
          </div>
          <Link href="/schedule" className="rise-btn-outline">← Back to schedule</Link>
        </section>

        {!activeProjectId ? (
          <div className="rise-empty"><h3>Select a project first.</h3><Link href="/projects" className="rise-link">Open projects →</Link></div>
        ) : !draft ? (
          <p className="muted">{msg || "Loading project settings…"}</p>
        ) : (
          <>
            <div className="rise-note">
              <b>Project-only settings for {brand?.name}.</b> These changes do not alter studio defaults or previous document snapshots.
            </div>
            <div className="rise-pane">
              <form className="rise-card rise-form" onSubmit={save}>
                <label className="field">
                  <span>Project name</span>
                  <input required maxLength={100} value={draft.name} onChange={(e) => set("name", e.target.value)} />
                </label>
                <label className="field">
                  <span>Location</span>
                  <input maxLength={100} placeholder="City, country" value={draft.location} onChange={(e) => set("location", e.target.value)} />
                </label>
                <div className="rise-formrow">
                  <label className="field">
                    <span>Revision</span>
                    <input maxLength={20} value={draft.revision} onChange={(e) => set("revision", e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Issue date</span>
                    <input type="date" value={draft.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
                  </label>
                </div>
                <label className="field">
                  <span>Studio name for this project&apos;s documents</span>
                  <input required maxLength={100} value={draft.studioName} onChange={(e) => set("studioName", e.target.value)} />
                </label>
                <div className="field">
                  <span>
                    Project logo override <span className="rise-fine">PNG / JPEG · max 2 MB</span>
                  </span>
                  <div className="rise-logo-row">
                    {previewLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewLogo} alt="Project logo" />
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      aria-label="Project logo override"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        const problem = checkLogoFile(file);
                        if (problem) {
                          setIsError(true);
                          setMsg(problem);
                          e.target.value = "";
                          return;
                        }
                        setUseStudioLogo(false);
                        setLogoFile(file || null);
                      }}
                    />
                  </div>
                </div>
                <div className="rise-formrow">
                  <label className="field">
                    <span>Accent</span>
                    <input type="color" value={draft.accent} onChange={(e) => set("accent", e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Template</span>
                    <select value={draft.template} onChange={(e) => set("template", e.target.value as BrandTemplate)}>
                      <option value="standard">RISE Standard</option>
                      <option value="compact">Compact</option>
                    </select>
                  </label>
                </div>
                <div className="rise-save-row">
                  <button type="submit" className="primary-button" disabled={saving}>
                    {saving ? "Saving…" : "Save project settings"}
                  </button>
                  <button type="button" className="ghost-button" onClick={applyStudioDefaults} disabled={!studio}>
                    Apply current studio defaults
                  </button>
                </div>
                {msg && <span className={`rise-save-msg ${isError ? "error" : ""}`} role="status">{msg}</span>}
                <p className="rise-fine" style={{ fontSize: 13 }}>
                  Changing the template points this project&apos;s luminaires to the new sheet layout. Documents you already generated are kept as they were.
                </p>
              </form>
              <aside>
                <span className="rise-panel-label">Project preview</span>
                <SheetPreview
                  studioName={draft.studioName}
                  logoUrl={previewLogo}
                  accent={draft.accent}
                  compact={draft.template === "compact"}
                  projectName={draft.name}
                  location={draft.location}
                  revision={draft.revision}
                />
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
