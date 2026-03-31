"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

interface SettingItem {
  key: string;
  label: string;
  value: string;
  status: string;
  updatedAt: string;
}

export default function SettingsPage() {
  const [items, setItems] = useState<SettingItem[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error("Failed to fetch settings", err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiApiKey: apiKey }),
      });
      if (res.ok) {
        setApiKey("");
        fetchSettings();
        alert("Settings saved successfully!");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="brand">LumenFlow</div>
        <nav className="nav">
          <Link href="/" className="nav-item">Database</Link>
          <Link href="/templates" className="nav-item">Template Builder</Link>
          <Link href="/settings" className="nav-item active">Configuration</Link>
        </nav>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>
          <ThemeToggle />
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Application Settings</p>
            <h1>Configuration</h1>
          </div>
        </header>

        <section className="status-bar" style={{ display: 'block' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>API Keys</h2>
          <form onSubmit={handleSave} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}>
              <span>OpenAI API Key</span>
              <input 
                type="password" 
                placeholder="sk-..." 
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <small>Used for automatic data extraction from PDF documents.</small>
            </div>
            <button type="submit" className="primary-button" disabled={saving || !apiKey}>
              {saving ? "Saving..." : "Update Key"}
            </button>
          </form>
        </section>

        <div className="table-card" style={{ marginTop: '20px' }}>
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
                items.map(item => (
                  <tr key={item.key} className="table-row">
                    <td style={{ padding: '12px' }}>{item.label}</td>
                    <td style={{ padding: '12px' }}>{item.value}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ 
                        padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
                        background: item.status === 'Active' ? 'var(--success)' : 'var(--danger)',
                        color: 'white'
                      }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "-"}
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
