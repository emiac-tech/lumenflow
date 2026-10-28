"use client";

import { withBase } from "@/utils/basePath";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/components/AuthContext";
import { useBrand } from "@/components/BrandContext";
import { useProjects } from "@/components/ProjectContext";
import { useTemplates } from "@/components/TemplateContext";
import SheetPreview from "@/components/SheetPreview";
import {
  BrandTemplate,
  StudioDefaults,
  checkLogoFile,
  fetchStudio,
  saveStudio,
  uploadStudioLogo,
} from "@/utils/brand";

export default function SetupPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { companyName } = useBrand();
  const { projects, activeProjectId, setActiveProjectId } = useProjects();
  const { templates, setSelectedTemplateId, createTemplate, renameTemplate } = useTemplates();
  const isAdmin = user?.role === "admin";
  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Studio identity & default template (RISE OS Setup).
  const [studio, setStudio] = useState<StudioDefaults | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftAccent, setDraftAccent] = useState("#0c5871");
  const [draftTemplate, setDraftTemplate] = useState<BrandTemplate>("standard");
  const [draftLogoFile, setDraftLogoFile] = useState<File | null>(null);
  const [draftLogoPreview, setDraftLogoPreview] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("Applies to new projects only.");
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    fetchStudio()
      .then((data) => {
        setStudio(data);
        setDraftName(data.studioName || companyName?.trim() || "");
        setDraftAccent(data.accent);
        setDraftTemplate(data.template);
      })
      .catch((err) => {
        setSaveError(true);
        setSaveMsg(err.message || "Could not load studio defaults.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftLogoFile) {
      setDraftLogoPreview("");
      return;
    }
    const url = URL.createObjectURL(draftLogoFile);
    setDraftLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draftLogoFile]);

  const previewLogo = draftLogoPreview || (removeLogo ? "" : studio?.logoUrl || "");

  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const problem = checkLogoFile(file);
    if (problem) {
      setSaveError(true);
      setSaveMsg(problem);
      e.target.value = "";
      return;
    }
    setSaveError(false);
    setSaveMsg("Applies to new projects only.");
    setRemoveLogo(false);
    setDraftLogoFile(file || null);
  };

  const saveDefaults = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName.trim()) {
      setSaveError(true);
      setSaveMsg("Enter a studio name.");
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      if (draftLogoFile) await uploadStudioLogo(draftLogoFile);
      const saved = await saveStudio({ studioName: draftName.trim(), accent: draftAccent, template: draftTemplate, removeLogo });
      setStudio(saved);
      setDraftLogoFile(null);
      setRemoveLogo(false);
      setSaveMsg("Saved for new projects. Existing projects unchanged.");
      refreshUser();
    } catch (err) {
      setSaveError(true);
      setSaveMsg(err instanceof Error ? err.message : "Could not save studio defaults.");
    } finally {
      setSaving(false);
    }
  };

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [projectIds, setProjectIds] = useState<number[]>([]);
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [editName, setEditName] = useState("");

  const openTemplate = (id: number) => {
    setSelectedTemplateId(id.toString());
    router.push("/templates");
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !projectIds.length) return;
    const tpl = await createTemplate(newName.trim(), projectIds);
    setShowNew(false);
    if (tpl) openTemplate(tpl.id);
  };

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editName.trim()) return;
    await renameTemplate(editing.id, editName.trim());
    setEditing(null);
  };

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <section className="rise-page-head">
          <div>
            <p className="rise-eyebrow">Setup / Studio framework</p>
            <h1>Set the standard once.</h1>
            <p className="rise-lead">
              Your logo and reusable template defaults carry into new projects. Project-specific details stay with each project.
            </p>
          </div>
          <Link href="/projects" className="rise-btn-outline">Go to projects →</Link>
        </section>

        <div className="rise-note">
          <b>Studio defaults → new projects → document snapshots.</b> Saving defaults does not silently change existing
          projects or previously generated documents.
        </div>

        <div className="rise-pane">
          <form className="rise-card rise-form" onSubmit={saveDefaults}>
            <span className="rise-panel-label" style={{ marginBottom: 0 }}>Studio identity &amp; default template</span>
            <label className="field">
              <span>Studio name</span>
              <input required maxLength={100} value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            </label>
            <div className="field">
              <span>
                Studio logo <span className="rise-fine">Optional · PNG / JPEG · max 2 MB</span>
              </span>
              <div className="rise-logo-row">
                {previewLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={withBase(previewLogo)} alt="Studio logo" />
                )}
                <input type="file" accept="image/png,image/jpeg" onChange={onLogoChange} aria-label="Studio logo" />
                {(studio?.logoUrl || draftLogoFile) && !removeLogo && (
                  <button
                    type="button"
                    className="rise-link"
                    onClick={() => {
                      setDraftLogoFile(null);
                      setRemoveLogo(true);
                    }}
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>
            <div className="rise-formrow">
              <label className="field">
                <span>Document accent</span>
                <input type="color" value={draftAccent} onChange={(e) => setDraftAccent(e.target.value)} />
              </label>
              <label className="field">
                <span>Default template</span>
                <select value={draftTemplate} onChange={(e) => setDraftTemplate(e.target.value as BrandTemplate)}>
                  <option value="standard">RISE Standard</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
            </div>
            <div className="rise-save-row">
              <button type="submit" className="primary-button" disabled={saving || !studio}>
                {saving ? "Saving…" : "Save studio defaults"}
              </button>
              <span className={`rise-save-msg ${saveError ? "error" : ""}`} role="status">{saveMsg}</span>
            </div>
            <p className="rise-fine" style={{ fontSize: 13 }}>
              New projects inherit this studio name, logo, accent and template on their specification sheets.
              {isAdmin && (
                <>
                  {" "}
                  Company branding, API keys and the default project logo are in{" "}
                  <Link href="/settings" className="rise-link" style={{ fontSize: 13 }}>studio configuration →</Link>
                </>
              )}
            </p>
          </form>
          <aside>
            <span className="rise-panel-label">Live default-template preview</span>
            <SheetPreview
              studioName={draftName}
              logoUrl={previewLogo}
              accent={draftAccent}
              compact={draftTemplate === "compact"}
            />
          </aside>
        </div>

          <section className="rise-card">
            <span className="rise-panel-label">Specification templates</span>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>
              {activeProject ? <>Templates for <b style={{ color: "var(--rise-ink)" }}>{activeProject.name}</b>.</> : "Select a project to see its templates."}
            </p>
            {projects.length > 1 && (
              <div className="rise-filters" style={{ marginBottom: 16 }}>
                <label>
                  Project
                  <select
                    value={activeProjectId ?? ""}
                    onChange={(e) => e.target.value && setActiveProjectId(Number(e.target.value))}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="rise-list">
              {templates.length === 0 ? (
                <p className="muted" style={{ padding: "14px 0", fontSize: 13.5 }}>No templates yet.</p>
              ) : (
                templates.map((t) => (
                  <div key={t.id} className="rise-list-row">
                    <span>
                      <button type="button" className="rise-list-name" onClick={() => openTemplate(t.id)}>{t.name}</button>
                      {t.isDefault && <span className="rise-tag">Default</span>}
                    </span>
                    <span className="rise-card-actions">
                      <button
                        type="button"
                        className="rise-icon-btn"
                        title="Rename template"
                        aria-label={`Rename ${t.name}`}
                        onClick={() => {
                          setEditing({ id: t.id, name: t.name });
                          setEditName(t.name);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button type="button" className="rise-link" onClick={() => openTemplate(t.id)} style={{ fontSize: 13 }}>
                        Design →
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              className="ghost-button"
              style={{ marginTop: 18 }}
              disabled={!projects.length}
              onClick={() => {
                setNewName("");
                setProjectIds(activeProjectId ? [activeProjectId] : []);
                setShowNew(true);
              }}
            >
              + New template
            </button>
          </section>
      </main>

      {showNew && (
        <div className="modal-backdrop" onMouseDown={() => setShowNew(false)}>
          <div className="modal" style={{ maxWidth: 460, height: "auto" }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setShowNew(false)} aria-label="Close">✕</button>
            <div className="modal-header">
              <p className="rise-eyebrow" style={{ marginBottom: 10 }}>Template builder</p>
              <h2>New template</h2>
              <p>Create a blank template and assign it to one or more projects.</p>
            </div>
            <form onSubmit={submitNew} className="modal-form">
              <label className="field">
                <span>Template name</span>
                <input autoFocus placeholder="e.g. Spec Sheet" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </label>
              <div className="field">
                <span>Assign to project(s)</span>
                <div className="project-checklist">
                  {projects.map((p) => {
                    const checked = projectIds.includes(p.id);
                    return (
                      <label key={p.id} className={`project-check-item ${checked ? "checked" : ""}`}>
                        <span className="project-check-box">{checked && <Check size={12} strokeWidth={3} />}</span>
                        <input
                          type="checkbox"
                          hidden
                          checked={checked}
                          onChange={() =>
                            setProjectIds((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                          }
                        />
                        {p.name}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="actions">
                <button type="button" className="ghost-button" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={!newName.trim() || projectIds.length === 0}>
                  Create template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
          <div className="modal" style={{ maxWidth: 440, height: "auto" }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setEditing(null)} aria-label="Close">✕</button>
            <div className="modal-header">
              <h2>Rename template</h2>
              <p>Update the name used in the template list and designer.</p>
            </div>
            <form onSubmit={submitRename} className="modal-form">
              <label className="field">
                <span>Template name</span>
                <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              <div className="actions">
                <button type="button" className="ghost-button" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="primary-button">Save template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
