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
  const [deleteRowId, setDeleteRowId] = useState<number | null>(null);
  const [deleteColumnId, setDeleteColumnId] = useState<number | null>(null);

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

  function handleDeleteColumn(id: number) {
    setDeleteColumnId(id);
  }

  async function executeDeleteColumn() {
    if (deleteColumnId === null) return;
    await fetch(`/api/columns/${deleteColumnId}`, { method: "DELETE" });
    loadColumns();
    setDeleteColumnId(null);
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

  function handleDeleteRow(id: number) {
    setDeleteRowId(id);
  }

  async function executeDeleteRow() {
    if (deleteRowId === null) return;
    const res = await fetch(`/api/luminaires/${deleteRowId}`, { method: "DELETE" });
    if (res.ok) {
      loadRows();
      setDeleteRowId(null);
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

      {/* ── Row Delete Confirmation Modal ── */}
      {deleteRowId !== null && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteRowId(null); }}>
          <div className="modal" style={{ maxWidth: '400px', height: 'auto', paddingBottom: '32px' }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setDeleteRowId(null)}>✕</button>
            <div className="modal-header">
              <p className="eyebrow" style={{ color: 'var(--danger)' }}>Warning</p>
              <h2>Delete Row</h2>
              <p>Are you sure you want to delete this record? This action cannot be undone.</p>
            </div>
            <div className="actions" style={{ marginTop: '24px' }}>
              <button className="ghost-button" onClick={() => setDeleteRowId(null)}>Cancel</button>
              <button className="primary-button" style={{ background: 'var(--danger)' }} onClick={executeDeleteRow}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Column Delete Confirmation Modal ── */}
      {deleteColumnId !== null && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteColumnId(null); }}>
          <div className="modal" style={{ maxWidth: '400px', height: 'auto', paddingBottom: '32px' }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setDeleteColumnId(null)}>✕</button>
            <div className="modal-header">
              <p className="eyebrow" style={{ color: 'var(--danger)' }}>Warning</p>
              <h2>Delete Column</h2>
              <p>Are you sure you want to delete this custom column? The column and its data will be removed from all records.</p>
            </div>
            <div className="actions" style={{ marginTop: '24px' }}>
              <button className="ghost-button" onClick={() => setDeleteColumnId(null)}>Cancel</button>
              <button className="primary-button" style={{ background: 'var(--danger)' }} onClick={executeDeleteColumn}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
