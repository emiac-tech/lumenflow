"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { useBrand } from "@/components/BrandContext";

interface SettingItem {
  key: string;
  label: string;
  value: string;
  status: string;
  updatedAt: string;
}

import Sidebar from "@/components/Sidebar";
import { useProjects } from "@/components/ProjectContext";
import { apiFetch } from "@/utils/api";

export default function SettingsPage() {
  const { companyName, setCompanyName } = useBrand();
  const { activeProjectId } = useProjects();
  const [items, setItems] = useState<SettingItem[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [companyNameInput, setCompanyNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [locationCountry, setLocationCountry] = useState("");
  const [revision, setRevision] = useState("A (Current)");
  const [issueDate, setIssueDate] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const fetchSettings = async () => {
    if (activeProjectId === null) return;
    try {
      const res = await apiFetch(`/api/settings?project_id=${activeProjectId}`);
      const data = await res.json();
      setItems(data.items || []);
      if (data.companyName) setCompanyNameInput(data.companyName);
      const specRes = await apiFetch(`/api/projects/${activeProjectId}/specification-settings`);
      if (specRes.ok) {
        const spec = await specRes.json();
        setLogoUrl(spec.logoUrl || "");
        setLocationCountry(spec.locationCountry || "");
        setRevision(spec.revision || "A (Current)");
        setIssueDate(spec.issueDate || "");
      }
    } catch (err) {
      console.error("Failed to fetch settings", err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [activeProjectId]);

  // Sync input when context loads
  useEffect(() => {
    if (companyName && !companyNameInput) setCompanyNameInput(companyName);
  }, [companyName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeProjectId === null) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const body: Record<string, string> = { project_id: activeProjectId.toString() };
      if (apiKey.trim()) body.openaiApiKey = apiKey.trim();
      if (companyNameInput.trim()) body.companyName = companyNameInput.trim();

      const res = await apiFetch(`/api/settings?project_id=${activeProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const specRes = await apiFetch(`/api/projects/${activeProjectId}/specification-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationCountry, revision, issueDate }),
      });
      if (res.ok && specRes.ok) {
        if (companyNameInput.trim()) setCompanyName(companyNameInput.trim());
        setApiKey("");
        fetchSettings();
        setSaveMsg("Settings saved successfully!");
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        const error = !specRes.ok ? await specRes.json().catch(() => ({})) : {};
        setSaveMsg(error.detail || "Failed to save settings");
      }
    } catch (err) {
      console.error(err);
      setSaveMsg("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (activeProjectId === null || !event.target.files?.length) return;
    const form = new FormData();
    form.append("file", event.target.files[0]);
    setUploadingLogo(true);
    setSaveMsg("");
    try {
      const res = await apiFetch(`/api/projects/${activeProjectId}/specification-logo`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Logo upload failed");
      setLogoUrl(data.logoUrl || "");
      setSaveMsg("Project logo updated.");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (error) {
      setSaveMsg(error instanceof Error ? error.message : "Logo upload failed");
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  };

  return (
    <div className="shell">
      <Sidebar />

      {/* ── Main ── */}
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Setup / Studio configuration</p>
            <h1>Configuration</h1>
          </div>
        </header>

        <form onSubmit={handleSave}>
          {/* Company Branding */}
          <section className="status-bar" style={{ display: "block", marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Company Branding</h2>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div className="field" style={{ flex: 1 }}>
                <span>Company / Brand Name</span>
                <input
                  type="text"
                  placeholder="e.g. LumenFlow"
                  value={companyNameInput}
                  onChange={(e) => setCompanyNameInput(e.target.value)}
                />
                <small>Shown in the sidebar across all pages of the application.</small>
              </div>
            </div>
          </section>

          <section className="status-bar" style={{ display: "block", marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, marginBottom: 4 }}>Specification Sheet Defaults</h2>
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              These values and the logo are applied dynamically to this project&apos;s default PDF template.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "180px minmax(180px, 1fr) minmax(160px, 0.7fr) minmax(160px, 0.7fr)", gap: 16, alignItems: "end" }}>
              <div className="field">
                <span>Project Logo</span>
                <div style={{ height: 86, border: "1px solid var(--line)", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: 8, marginBottom: 8 }}>
                  {logoUrl ? <img src={logoUrl} alt="Project logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <small>No logo configured</small>}
                </div>
                <label className="ghost-button" style={{ cursor: "pointer", textAlign: "center" }}>
                  {uploadingLogo ? "Uploading..." : "Upload Logo"}
                  <input type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={uploadingLogo} onChange={handleLogoUpload} />
                </label>
              </div>
              <div className="field">
                <span>Location / Country</span>
                <input value={locationCountry} onChange={(e) => setLocationCountry(e.target.value)} placeholder="e.g. London, United Kingdom" />
              </div>
              <div className="field">
                <span>Revision</span>
                <input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="A (Current)" />
              </div>
              <div className="field">
                <span>Issue Date</span>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
            </div>
          </section>

          {/* API Keys */}
          <section className="status-bar" style={{ display: "block", marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>API Keys</h2>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div className="field" style={{ flex: 1 }}>
                <span>OpenAI API Key</span>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <small>Used for automatic data extraction from PDF documents.</small>
              </div>
            </div>
          </section>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
            {saveMsg && (
              <span style={{
                fontSize: 13,
                color: saveMsg.includes("Failed") ? "var(--danger)" : "var(--accent)",
                fontWeight: 600,
              }}>
                {saveMsg}
              </span>
            )}
          </div>
        </form>

        <div className="table-card" style={{ marginTop: 28 }}>
          <table>
            <thead>
              <tr>
                <th><div className="th-content">Setting Name</div></th>
                <th><div className="th-content">Current Value</div></th>
                <th><div className="th-content">Status</div></th>
                <th><div className="th-content">Last Updated</div></th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((item) => (
                  <tr key={item.key} className="table-row">
                    <td style={{ padding: 12 }}>{item.label}</td>
                    <td style={{ padding: 12 }}>{item.value}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{
                        padding: "4px 8px", borderRadius: 4, fontSize: 12,
                        background: item.status === "Active" ? "var(--success)" : "var(--danger)",
                        color: "white",
                      }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: 12 }}>
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="empty-state">No settings found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
