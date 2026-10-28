"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import SheetPreview from "@/components/SheetPreview";
import { useProjects } from "@/components/ProjectContext";
import { StudioDefaults, TEMPLATE_LABEL, fetchStudio, todayIso } from "@/utils/brand";

export default function NewProjectPage() {
  const router = useRouter();
  const { addProject, setActiveProjectId } = useProjects();
  const [studio, setStudio] = useState<StudioDefaults | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [revision, setRevision] = useState("A");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStudio().then(setStudio).catch(() => setStudio(null));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a project name.");
      return;
    }
    setSaving(true);
    setError("");
    const created = await addProject(name.trim(), location.trim(), { revision: revision.trim() || "A", issueDate });
    setSaving(false);
    if (!created) {
      setError("The project could not be created. Please try again.");
      return;
    }
    setActiveProjectId(created.id);
    router.push("/schedule");
  };

  const studioName = studio?.studioName || "Your studio";
  const templateLabel = TEMPLATE_LABEL[studio?.template || "standard"];

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <section className="rise-page-head">
          <div>
            <p className="rise-eyebrow">Setup / New project</p>
            <h1>Give the work a home.</h1>
            <p className="rise-lead">Create a project with your studio defaults. Then extract, review and deliver inside that project.</p>
          </div>
        </section>
        <div className="rise-pane">
          <form className="rise-card rise-form" onSubmit={submit}>
            <label className="field">
              <span>Project name</span>
              <input autoFocus required maxLength={100} placeholder="e.g. Nocturne Hotel — Phase 2" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Location</span>
              <input maxLength={100} placeholder="City, country" value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <div className="rise-formrow">
              <label className="field">
                <span>Revision</span>
                <input maxLength={20} value={revision} onChange={(e) => setRevision(e.target.value)} />
              </label>
              <label className="field">
                <span>Issue date</span>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </label>
            </div>
            <div className="rise-note">
              Inheriting: <b>{studioName}</b> · {templateLabel} template. You can adjust the project branding later.
            </div>
            {error && <div className="rise-auth-msg error">{error}</div>}
            <div className="rise-save-row">
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Creating…" : "Create project →"}
              </button>
              <Link href="/projects" className="rise-link">Cancel</Link>
            </div>
          </form>
          <aside>
            <span className="rise-panel-label">Inherited document identity</span>
            <SheetPreview
              studioName={studioName}
              logoUrl={studio?.logoUrl}
              accent={studio?.accent || "#0c5871"}
              compact={studio?.template === "compact"}
              projectName={name || "Your new project"}
              location={location}
              revision={revision}
            />
            <p className="rise-fine" style={{ marginTop: 12 }}>No need to repeat studio setup for every project.</p>
          </aside>
        </div>
      </main>
    </div>
  );
}
