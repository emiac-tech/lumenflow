"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Luminaire, CustomColumn } from "@/types/luminaire";
import LuminaireTable, { FilterCondition, SortRule } from "@/components/LuminaireTable";
import AddLuminaireModal from "@/components/AddLuminaireModal";
import EditLuminaireModal from "@/components/EditLuminaireModal";
import ThemeToggle from "@/components/ThemeToggle";
import { useBrand } from "@/components/BrandContext";
import Link from "next/link";
import { useProjects } from "@/components/ProjectContext";

import Sidebar from "@/components/Sidebar";
import { apiFetch } from "@/utils/api";

interface CustomColumnInput {
  name: string;
  aiEnabled: boolean;
  aiDescription: string;
}

export default function HomePage() {
  const { companyName } = useBrand();
  const { activeProjectId, isLoading: projectsLoading, projects } = useProjects();
  
  const [items, setItems] = useState<Luminaire[]>([]);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [filterLogic, setFilterLogic] = useState<"AND" | "OR">("AND");
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const [rowHeight, setRowHeight] = useState<"small" | "medium" | "large">("medium");
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isProjectRefreshing, setIsProjectRefreshing] = useState(false);
  
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Luminaire | null>(null);
  const [deleteRowId, setDeleteRowId] = useState<number | null>(null);
  const [deleteColumnId, setDeleteColumnId] = useState<number | null>(null);

  const activeProject = projects.find(p => p.id === activeProjectId);

  const readJsonSafely = useCallback(async (res: Response) => {
    const text = await res.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error("Failed to parse API response as JSON", {
        url: res.url,
        status: res.status,
        body: text.slice(0, 200),
        error,
      });
      throw new Error(text.slice(0, 200) || `Request failed with status ${res.status}`);
    }
  }, []);

  const loadColumns = useCallback(async () => {
    if (activeProjectId === null) return;
    try {
      const res = await apiFetch(`/api/columns?project_id=${activeProjectId}`);
      if (!res.ok) {
        console.error("Failed to load columns", res.status, res.statusText);
        setCustomColumns([]);
        return;
      }

      const data = await readJsonSafely(res);
      setCustomColumns(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load columns", error);
      setCustomColumns([]);
      setLoadError("Some project data could not be loaded.");
    }
  }, [activeProjectId, readJsonSafely]);

  const loadColumnPreferences = useCallback(async (showLoading = true) => {
    if (activeProjectId === null) return;
    if (showLoading) setPrefsLoaded(false);
    try {
      const res = await apiFetch(`/api/columns/order?project_id=${activeProjectId}`);
      if (!res.ok) {
        console.error("Failed to load column preferences", res.status, res.statusText);
        return;
      }

      const data = await readJsonSafely(res);
      setColumnOrder(Array.isArray(data?.order) ? data.order : []);
      setHiddenColumns(Array.isArray(data?.hidden) ? data.hidden : []);
      setSortRules(Array.isArray(data?.sort) ? data.sort : []);
      setFilterConditions(Array.isArray(data?.filter) ? data.filter : []);
      setFilterLogic(data?.filterLogic === "OR" ? "OR" : "AND");
      setColumnLabels(data?.labels && typeof data.labels === "object" ? data.labels : {});
      if (data?.rowHeight) setRowHeight(data.rowHeight);
    } catch (error) {
      console.error("Failed to load column preferences", error);
      setLoadError("Project view settings failed to load.");
    } finally {
      if (showLoading) setPrefsLoaded(true);
    }
  }, [activeProjectId, readJsonSafely]);

  const loadRows = useCallback(async () => {
    if (activeProjectId === null) return;
    try {
      const res = await apiFetch(`/api/luminaires?project_id=${activeProjectId}`);
      if (!res.ok) {
        console.error("Failed to load luminaires", res.status, res.statusText);
        setItems([]);
        return;
      }

      const data = await readJsonSafely(res);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      console.error("Failed to load luminaires", error);
      setItems([]);
      setLoadError("Project luminaires failed to load.");
    }
  }, [activeProjectId, readJsonSafely]);

  useEffect(() => {
    if (activeProjectId !== null) {
      setLoadError(null);
      setIsProjectRefreshing(true);
      void Promise.allSettled([
        loadColumns(),
        loadColumnPreferences(),
        loadRows(),
      ]).finally(() => {
        setIsProjectRefreshing(false);
      });
    } else {
      setPrefsLoaded(true);
      setItems([]);
      setCustomColumns([]);
      setColumnOrder([]);
      setHiddenColumns([]);
      setSortRules([]);
      setFilterConditions([]);
      setColumnLabels({});
      setFilterLogic("AND");
      setRowHeight("medium");
      setLoadError(null);
    }
  }, [activeProjectId, loadColumns, loadColumnPreferences, loadRows]);

  async function handleAddColumn(input: CustomColumnInput) {
    if (activeProjectId === null) return;
    await apiFetch(`/api/columns?project_id=${activeProjectId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await Promise.all([loadColumns(), loadColumnPreferences()]);
  }

  function handleDeleteColumn(id: number) {
    setDeleteColumnId(id);
  }

  async function executeDeleteColumn() {
    if (deleteColumnId === null || activeProjectId === null) return;
    await apiFetch(`/api/columns/${deleteColumnId}?project_id=${activeProjectId}`, { method: "DELETE" });
    await Promise.all([loadColumns(), loadColumnPreferences()]);
    setDeleteColumnId(null);
  }

  async function handleEditColumn(id: number, input: CustomColumnInput) {
    if (activeProjectId === null) return;
    await apiFetch(`/api/columns/${id}?project_id=${activeProjectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    loadColumns();
  }

  const saveViewPreferences = useCallback(async (
    nextOrder: string[],
    nextHidden: string[],
    nextSort: SortRule[],
    nextFilter: FilterCondition[],
    nextLabels: Record<string, string>,
    nextFilterLogic: "AND" | "OR",
    nextRowHeight: "small" | "medium" | "large"
  ) => {
    if (activeProjectId === null) return;
    
    // Apply state updates
    setColumnOrder(nextOrder);
    setHiddenColumns(nextHidden);
    setSortRules(nextSort);
    setFilterConditions(nextFilter);
    setColumnLabels(nextLabels);
    setFilterLogic(nextFilterLogic);
    setRowHeight(nextRowHeight);

    const res = await apiFetch(`/api/columns/order?project_id=${activeProjectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order: nextOrder,
        hidden: nextHidden,
        sort: nextSort,
        filter: nextFilter,
        labels: nextLabels,
        filterLogic: nextFilterLogic,
        rowHeight: nextRowHeight,
      }),
    });

    if (!res.ok) {
      // Revert on error
      await loadColumnPreferences();
    }
  }, [activeProjectId, loadColumnPreferences]);

  const handleColumnOrderChange = useCallback(async (order: string[]) => {
    await saveViewPreferences(order, hiddenColumns, sortRules, filterConditions, columnLabels, filterLogic, rowHeight);
  }, [columnLabels, filterConditions, hiddenColumns, saveViewPreferences, sortRules, filterLogic, rowHeight]);

  const handleHiddenColumnsChange = useCallback(async (hidden: string[]) => {
    await saveViewPreferences(columnOrder, hidden, sortRules, filterConditions, columnLabels, filterLogic, rowHeight);
  }, [columnLabels, columnOrder, filterConditions, saveViewPreferences, sortRules, filterLogic, rowHeight]);

  const handleSortRulesChange = useCallback(async (nextSortRules: SortRule[]) => {
    await saveViewPreferences(columnOrder, hiddenColumns, nextSortRules, filterConditions, columnLabels, filterLogic, rowHeight);
  }, [columnLabels, columnOrder, filterConditions, hiddenColumns, saveViewPreferences, filterLogic, rowHeight]);

  const handleFilterConditionsChange = useCallback(async (nextFilterConditions: FilterCondition[]) => {
    await saveViewPreferences(columnOrder, hiddenColumns, sortRules, nextFilterConditions, columnLabels, filterLogic, rowHeight);
  }, [columnLabels, columnOrder, hiddenColumns, saveViewPreferences, sortRules, filterLogic, rowHeight]);

  const handleFilterLogicChange = useCallback(async (nextLogic: "AND" | "OR") => {
    await saveViewPreferences(columnOrder, hiddenColumns, sortRules, filterConditions, columnLabels, nextLogic, rowHeight);
  }, [columnLabels, columnOrder, filterConditions, hiddenColumns, saveViewPreferences, sortRules, rowHeight]);

  const handleRowHeightChange = useCallback(async (nextRowHeight: "small" | "medium" | "large") => {
    await saveViewPreferences(columnOrder, hiddenColumns, sortRules, filterConditions, columnLabels, filterLogic, nextRowHeight);
  }, [columnLabels, columnOrder, filterConditions, hiddenColumns, saveViewPreferences, sortRules, filterLogic]);


  const handleColumnLabelsChange = useCallback(async (nextLabels: Record<string, string>) => {
    await saveViewPreferences(columnOrder, hiddenColumns, sortRules, filterConditions, nextLabels, filterLogic, rowHeight);
  }, [columnOrder, filterConditions, hiddenColumns, saveViewPreferences, sortRules, filterLogic, rowHeight]);

  const handleRenameBaseColumn = useCallback(async (key: string, label: string) => {
    const trimmed = label.trim();
    const nextLabels = { ...columnLabels };
    if (trimmed) nextLabels[key] = trimmed;
    else delete nextLabels[key];
    await handleColumnLabelsChange(nextLabels);
  }, [columnLabels, handleColumnLabelsChange]);

  const handleDeleteBaseColumn = useCallback(async (key: string) => {
    const nextHidden = hiddenColumns.includes(key) ? hiddenColumns : [...hiddenColumns, key];
    const nextLabels = { ...columnLabels };
    delete nextLabels[key];
    await saveViewPreferences(columnOrder, nextHidden, sortRules, filterConditions, nextLabels, filterLogic, rowHeight);
  }, [columnLabels, columnOrder, filterConditions, hiddenColumns, saveViewPreferences, sortRules, filterLogic, rowHeight]);

  async function handleAddRow() {
    if (activeProjectId === null) return;
    const res = await apiFetch(`/api/luminaires?project_id=${activeProjectId}`, { method: "POST" });
    if (res.ok) {
      loadRows();
    }
  }

  function handleDeleteRow(id: number) {
    setDeleteRowId(id);
  }

  async function executeDeleteRow() {
    if (deleteRowId === null) return;
    const res = await apiFetch(`/api/luminaires/${deleteRowId}`, { method: "DELETE" });
    if (res.ok) {
      loadRows();
      setDeleteRowId(null);
    }
  }

  return (
    <div className="shell">
      <Sidebar />

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Luminaire Schedule</p>
            <h1>
              {activeProject?.name ||
                (projectsLoading
                  ? "Loading Project..."
                  : projects.length > 0
                    ? "Select a Project"
                    : "No Projects Yet")}
            </h1>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            {isProjectRefreshing && activeProjectId !== null && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "var(--muted)",
                  fontSize: 13,
                }}
              >
                Updating…
              </div>
            )}
            <button id="open-modal" className="primary-button" onClick={() => setAddOpen(true)} disabled={!activeProjectId}>
              + Add Luminaire
            </button>
          </div>
        </header>

        {projectsLoading || (activeProjectId !== null && !prefsLoaded && items.length === 0 && customColumns.length === 0) ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--muted)", fontSize: 14 }}>
            Loading…
          </div>
        ) : !activeProjectId ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--muted)", fontSize: 14 }}>
            {projects.length > 0 ? "Select a project from the sidebar." : "Create a project to get started."}
          </div>
        ) : (
          <>
            {loadError && (
              <div
                style={{
                  marginBottom: "16px",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  background: "rgba(239, 68, 68, 0.08)",
                  color: "#b91c1c",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  fontSize: 14,
                }}
              >
                {loadError}
              </div>
            )}
            <LuminaireTable
              items={items}
              customColumns={customColumns}
              columnOrder={columnOrder}
              hiddenColumns={hiddenColumns}
              sortRules={sortRules}
              filterConditions={filterConditions}
              filterLogic={filterLogic}
              columnLabels={columnLabels}
              rowHeight={rowHeight}
              onRowHeightChange={handleRowHeightChange}
              onColumnOrderChange={handleColumnOrderChange}
              onHiddenColumnsChange={handleHiddenColumnsChange}
              onSortRulesChange={handleSortRulesChange}
              onFilterConditionsChange={handleFilterConditionsChange}
              onFilterLogicChange={handleFilterLogicChange}
              onColumnLabelsChange={handleColumnLabelsChange}
              onRenameBaseColumn={handleRenameBaseColumn}
              onDeleteBaseColumn={handleDeleteBaseColumn}
              onAddColumn={handleAddColumn}
              onDeleteColumn={handleDeleteColumn}
              onEditColumn={handleEditColumn}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
              onEdit={(item) => setEditItem(item)}
              activeProjectId={activeProjectId}
            />
          </>
        )}
      </main>

      <AddLuminaireModal isOpen={addOpen} onClose={() => setAddOpen(false)} onComplete={loadRows} project_id={activeProjectId} />
      <EditLuminaireModal item={editItem} onClose={() => setEditItem(null)} onSaved={loadRows} />


      {/* Delete Confirmation Modals */}
      {deleteRowId !== null && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteRowId(null); }}>
          <div className="modal" style={{ maxWidth: "400px", height: "auto", paddingBottom: "32px" }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setDeleteRowId(null)}>✕</button>
            <div className="modal-header">
              <p className="eyebrow" style={{ color: "var(--danger)" }}>Warning</p>
              <h2>Delete Row</h2>
              <p>Are you sure you want to delete this record? This action cannot be undone.</p>
            </div>
            <div className="actions" style={{ marginTop: "24px" }}>
              <button className="ghost-button" onClick={() => setDeleteRowId(null)}>Cancel</button>
              <button className="primary-button" style={{ background: "var(--danger)" }} onClick={executeDeleteRow}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {deleteColumnId !== null && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteColumnId(null); }}>
          <div className="modal" style={{ maxWidth: "400px", height: "auto", paddingBottom: "32px" }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setDeleteColumnId(null)}>✕</button>
            <div className="modal-header">
              <p className="eyebrow" style={{ color: "var(--danger)" }}>Warning</p>
              <h2>Delete Column</h2>
              <p>Are you sure you want to delete this custom column? The column and its data will be removed from all records.</p>
            </div>
            <div className="actions" style={{ marginTop: "24px" }}>
              <button className="ghost-button" onClick={() => setDeleteColumnId(null)}>Cancel</button>
              <button className="primary-button" style={{ background: "var(--danger)" }} onClick={executeDeleteColumn}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
