"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Luminaire, CustomColumn } from "@/types/luminaire";
import LuminaireTable from "@/components/LuminaireTable";
import AddLuminaireModal from "@/components/AddLuminaireModal";
import EditLuminaireModal from "@/components/EditLuminaireModal";
import ThemeToggle from "@/components/ThemeToggle";

import Link from "next/link";

export default function HomePage() {
  const [items, setItems] = useState<Luminaire[]>([]);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Luminaire | null>(null);

  const loadColumns = useCallback(async () => {
    const res = await fetch("/api/columns");
    if (res.ok) setCustomColumns(await res.json());
  }, []);

  const loadRows = useCallback(async () => {
    const res = await fetch("/api/luminaires");
    const data = await res.json();
    setItems(data.items || []);
  }, []);

  useEffect(() => {
    loadColumns();
    loadRows();
  }, [loadColumns, loadRows]);

  async function handleAddColumn(name: string) {
    await fetch("/api/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    loadColumns();
  }

  async function handleDeleteColumn(id: number) {
    if (!confirm("Delete this custom column?")) return;
    await fetch(`/api/columns/${id}`, { method: "DELETE" });
    loadColumns();
  }

  async function handleEditColumn(id: number, newName: string) {
    await fetch(`/api/columns/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    loadColumns();
  }

  async function handleAddRow() {
    const res = await fetch("/api/luminaires", { method: "POST" });
    if (res.ok) {
      loadRows();
    }
  }

  async function handleDeleteRow(id: number) {
    if (!confirm("Are you sure you want to delete this row?")) return;
    const res = await fetch(`/api/luminaires/${id}`, { method: "DELETE" });
    if (res.ok) {
      loadRows();
    }
  }

  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="brand">LumenFlow</div>
        <nav className="nav">
          <Link href="/" className="nav-item active">Database</Link>
          <Link href="/templates" className="nav-item">Template Builder</Link>
          <Link href="/settings" className="nav-item">Configuration</Link>
        </nav>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>
          <ThemeToggle />
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Luminaire Schedule</p>
            <h1>Lighting Project Intake</h1>
          </div>
          <button
            id="open-modal"
            className="primary-button"
            onClick={() => setAddOpen(true)}
          >
            + Add Luminaire
          </button>
        </header>

        <section className="status-bar">
          <div>
            <span className="status-label">Batch upload</span>
            <p>
              Upload PDFs or paste document URLs, then extract product and
              diagram images automatically.
            </p>
          </div>
          <div className="summary-pill">
            {items.length} record{items.length === 1 ? "" : "s"}
          </div>
        </section>

        <LuminaireTable 
          items={items} 
          customColumns={customColumns}
          onAddColumn={handleAddColumn}
          onDeleteColumn={handleDeleteColumn}
          onEditColumn={handleEditColumn}
          onAddRow={handleAddRow}
          onDeleteRow={handleDeleteRow}
          onEdit={(item) => setEditItem(item)} 
        />
      </main>

      {/* ── Modals ── */}
      <AddLuminaireModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onComplete={loadRows}
      />
      <EditLuminaireModal
        item={editItem}
        onClose={() => setEditItem(null)}
        onSaved={loadRows}
      />
    </div>
  );
}
