"use client";

import React, { useState, useEffect } from "react";
import { Luminaire, CustomColumn } from "@/types/luminaire";
import Lightbox from "./Lightbox";
import { 
  Maximize2, Hash, Type, Image as ImageIcon, Tag, AlignLeft, Settings, 
  FileText, LayoutTemplate, Palette, Plus, ChevronDown, Edit2, Trash2, 
  Upload, Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, 
  GripVertical, Eye, EyeOff, Columns3, Settings2, ArrowUp, ArrowDown, Pencil 
} from "lucide-react";
import { useAuth } from "./AuthContext";
import { apiFetch } from "@/utils/api";

export interface SortRule {
  key: string;
  direction: "asc" | "desc";
}

export interface FilterCondition {
  id: string;
  key: string;
  operator: "contains" | "not_contains" | "is" | "is_not" | "is_empty" | "is_not_empty" | "gt" | "lt";
  value: string;
}

interface EditableCellProps {
  value: string | null;
  onSave: (val: string) => void;
}

function EditableCell({ value, onSave }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value || "");

  useEffect(() => {
    setVal(value || "");
  }, [value]);

  if (isEditing) {
    return (
      <input
        autoFocus
        className="editable-input"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          setIsEditing(false);
          if (val !== (value || "")) {
            onSave(val);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setVal(value || "");
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div className="editable-text" onClick={() => setIsEditing(true)}>
      {value || <span className="muted">—</span>}
    </div>
  );
}

interface TableColumn {
  key: string;
  label: string;
  icon: any;
  className?: string;
  customColumn?: CustomColumn;
  filterable?: boolean;
  sortable?: boolean;
}

interface CustomColumnDraft {
  name: string;
  aiEnabled: boolean;
  aiDescription: string;
}

const BASE_COLUMNS: TableColumn[] = [
  { key: "type", label: "Type", icon: Type },
  { key: "photo", label: "Photo", icon: ImageIcon, className: "img-col", filterable: false, sortable: false },
  { key: "diagram", label: "Diagram", icon: ImageIcon, className: "img-col", filterable: false, sortable: false },
  { key: "polar", label: "Polar Curve", icon: ImageIcon, className: "img-col", filterable: false, sortable: false },
  { key: "manufacturer", label: "Manufacturer", icon: Tag },
  { key: "product", label: "Product", icon: Tag },
  { key: "specCode", label: "Spec Code", icon: Hash },
  { key: "description", label: "Description", icon: AlignLeft },
  { key: "colour", label: "Colour", icon: Palette },
  { key: "cct", label: "CCT", icon: Settings },
  { key: "cri", label: "CRI", icon: Settings },
  { key: "unitWatts", label: "Unit Watts", icon: Hash },
  { key: "dimming", label: "Dimming", icon: Settings },
  { key: "quantity", label: "Qty", icon: Hash },
  { key: "ipRating", label: "IP Rating", icon: Settings },
  { key: "totalWatts", label: "Total Watts", icon: Hash },
  { key: "document", label: "Document", icon: FileText, filterable: false, sortable: false },
  { key: "templatePdf", label: "Template PDF", icon: LayoutTemplate, filterable: false, sortable: false },
];

function dedupeKeys(keys: string[]) {
  const seen = new Set<string>();
  return keys.filter((key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function moveKey(keys: string[], draggedKey: string, targetKey: string) {
  if (draggedKey === targetKey) return keys;
  const next = [...keys];
  const fromIndex = next.indexOf(draggedKey);
  const toIndex = next.indexOf(targetKey);
  if (fromIndex === -1 || toIndex === -1) return keys;
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function FilterPopover({ 
  conditions, 
  logic, 
  onChange, 
  onLogicChange, 
  columns, 
  onClose 
}: { 
  conditions: FilterCondition[]; 
  logic: "AND" | "OR"; 
  onChange: (c: FilterCondition[]) => void; 
  onLogicChange: (l: "AND" | "OR") => void; 
  columns: TableColumn[]; 
  onClose: () => void; 
}) {
  return (
    <div className="popover filter-popover" onClick={e => e.stopPropagation()}>
      <div className="popover-header">
        <span>Filter</span>
        <div className="logic-toggle">
          <button className={logic === "AND" ? "active" : ""} onClick={() => onLogicChange("AND")}>And</button>
          <button className={logic === "OR" ? "active" : ""} onClick={() => onLogicChange("OR")}>Or</button>
        </div>
      </div>
      <div className="popover-body">
        {conditions.length === 0 ? (
          <p className="empty-msg">No filters applied to this view</p>
        ) : (
          <div className="condition-list">
            {conditions.map((cond, i) => (
              <div key={cond.id} className="condition-row">
                <span className="row-label">{i === 0 ? "Where" : logic.toLowerCase()}</span>
                <select value={cond.key} onChange={e => onChange(conditions.map(c => c.id === cond.id ? { ...c, key: e.target.value } : c))}>
                  {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select value={cond.operator} onChange={e => onChange(conditions.map(c => c.id === cond.id ? { ...c, operator: e.target.value as any } : c))}>
                  <option value="contains">contains</option>
                  <option value="not_contains">does not contain</option>
                  <option value="is">is</option>
                  <option value="is_not">is not</option>
                  <option value="is_empty">is empty</option>
                  <option value="is_not_empty">is not empty</option>
                </select>
                <input 
                  value={cond.value} 
                  onChange={e => onChange(conditions.map(c => c.id === cond.id ? { ...c, value: e.target.value } : c))}
                  placeholder="Value"
                  disabled={cond.operator === "is_empty" || cond.operator === "is_not_empty"}
                />
                <button className="remove-btn" onClick={() => onChange(conditions.filter(c => c.id !== cond.id))}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="popover-footer">
        <button className="add-btn" onClick={() => onChange([...conditions, { id: Math.random().toString(36).substr(2, 9), key: "type", operator: "contains", value: "" }])}>+ Add condition</button>
      </div>
    </div>
  );
}

function SortPopover({ 
  rules, 
  onChange, 
  columns, 
  onClose 
}: { 
  rules: SortRule[]; 
  onChange: (r: SortRule[]) => void; 
  columns: TableColumn[]; 
  onClose: () => void; 
}) {
  return (
    <div className="popover sort-popover" onClick={e => e.stopPropagation()}>
      <div className="popover-header">Sort</div>
      <div className="popover-body">
        {rules.length === 0 ? (
          <p className="empty-msg">No sort rules applied</p>
        ) : (
          <div className="condition-list">
            {rules.map((rule, i) => (
              <div key={i} className="condition-row">
                <span className="row-label">{i === 0 ? "Sort by" : "then by"}</span>
                <select value={rule.key} onChange={e => onChange(rules.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))}>
                  {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select value={rule.direction} onChange={e => onChange(rules.map((r, idx) => idx === i ? { ...r, direction: e.target.value as any } : r))}>
                  <option value="asc">Ascending (A-Z)</option>
                  <option value="desc">Descending (Z-A)</option>
                </select>
                <button className="remove-btn" onClick={() => onChange(rules.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="popover-footer">
        <button className="add-btn" onClick={() => onChange([...rules, { key: "type", direction: "asc" }])}>+ Add sort</button>
      </div>
    </div>
  );
}

function RowHeightPopover({ 
  current, 
  onChange, 
  onClose 
}: { 
  current: "small" | "medium" | "large"; 
  onChange: (h: "small" | "medium" | "large") => void; 
  onClose: () => void; 
}) {
  return (
    <div className="popover row-height-popover" style={{ minWidth: "180px" }} onClick={e => e.stopPropagation()}>
      <div className="popover-header">Row Height</div>
      <div className="column-list">
        {(["small", "medium", "large"] as const).map((h) => (
          <div key={h} className={`column-item ${current === h ? "active" : ""}`} onClick={() => { onChange(h); onClose(); }}>
            <span className="col-label" style={{ textTransform: "capitalize" }}>{h}</span>
            {current === h && <Eye size={14} className="accent" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ThContent({ 
  column, 
  draggedKey, 
  dragOverKey, 
  onDragStart, 
  onDragOver, 
  onDrop, 
  onDragEnd, 
  onHide,
  onSortAsc,
  onSortDesc,
  onDelete,
  onRename,
  onEditCustomColumn,
}: { 
  column: TableColumn; 
  draggedKey: string | null; 
  dragOverKey: string | null; 
  onDragStart: (key: string) => void; 
  onDragOver: (key: string) => void; 
  onDrop: (key: string) => void; 
  onDragEnd: () => void; 
  onHide: (key: string) => void;
  onSortAsc: (key: string) => void;
  onSortDesc: (key: string) => void;
  onDelete: (key: string) => void;
  onRename: (key: string, label: string) => void;
  onEditCustomColumn: (column: CustomColumn) => void;
}) {
  const Icon = column.icon;
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(column.label);
  const ref = React.useRef<HTMLDivElement>(null);

  // Sync editLabel when column.label changes (e.g. after a rename saves)
  useEffect(() => {
    setEditLabel(column.label);
  }, [column.label]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div 
      ref={ref}
      className="th-content" 
      draggable 
      onDragStart={() => onDragStart(column.key)} 
      onDragOver={(e) => { e.preventDefault(); onDragOver(column.key); }} 
      onDrop={() => onDrop(column.key)} 
      onDragEnd={onDragEnd}
      style={{ 
        opacity: draggedKey === column.key ? 0.5 : 1, 
        boxShadow: dragOverKey === column.key ? "inset 0 -2px 0 var(--accent)" : undefined 
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
        <GripVertical size={14} style={{ color: "var(--muted)", flexShrink: 0, cursor: "grab" }} />
        <Icon size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{column.label}</span>
      </div>

      {/* Chevron dropdown trigger */}
      <button
        className="col-menu-btn"
        onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
        title="Column options"
      >
        <ChevronDown size={12} />
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <div className="col-dropdown" onClick={e => e.stopPropagation()}>
          {editing ? (
            <div className="col-dropdown-edit">
              <input
                autoFocus
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    onRename(column.key, editLabel);
                    setEditing(false);
                    setMenuOpen(false);
                  }
                  if (e.key === 'Escape') { setEditing(false); setEditLabel(column.label); }
                }}
                onBlur={() => { onRename(column.key, editLabel); setEditing(false); setMenuOpen(false); }}
              />
            </div>
          ) : (
            <>
              <button className="col-dropdown-item" onClick={() => {
                if (column.customColumn) {
                  onEditCustomColumn(column.customColumn);
                  setMenuOpen(false);
                  return;
                }
                setEditing(true);
              }}>
                <Pencil size={14} /> {column.customColumn ? "Edit column" : "Edit field"}
              </button>
              {column.sortable !== false && (
                <>
                  <button className="col-dropdown-item" onClick={() => { onSortAsc(column.key); setMenuOpen(false); }}>
                    <ArrowUp size={14} /> Sort ascending
                  </button>
                  <button className="col-dropdown-item" onClick={() => { onSortDesc(column.key); setMenuOpen(false); }}>
                    <ArrowDown size={14} /> Sort descending
                  </button>
                </>
              )}
              <button className="col-dropdown-item" onClick={() => { onHide(column.key); setMenuOpen(false); }}>
                <EyeOff size={14} /> Hide field
              </button>
              <div className="col-dropdown-divider" />
              <button className="col-dropdown-item danger" onClick={() => { onDelete(column.key); setMenuOpen(false); }}>
                <Trash2 size={14} /> Delete field
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface TableRowProps {
  item: Luminaire;
  index: number;
  columns: TableColumn[];
  onEdit: (item: Luminaire) => void;
  onDeleteRow: (id: number) => void;
  templates: any[];
  activeProjectId: number | null;
  rowHeight: "small" | "medium" | "large";
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
}

function TableRow({ item, index, columns, onEdit, onDeleteRow, templates, activeProjectId, rowHeight, isSelected, onToggleSelect }: TableRowProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const { refreshUser } = useAuth();
  const [local, setLocal] = useState({ ...item });
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setLocal(item);
  }, [item]);

  async function handleFieldSave(field: keyof Luminaire, value: string) {
    if (local[field] === value) return;
    const updated = { ...local, [field]: value };
    setLocal(updated);
    try {
      const res = await apiFetch(`/api/luminaires/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCustomFieldSave(name: string, value: string) {
    const nextCustom = { ...(local.customData || {}), [name]: value };
    const updated = { ...local, customData: nextCustom };
    setLocal(updated);

    try {
      const res = await apiFetch(`/api/luminaires/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customData: { [name]: value } }),
      });
      if (!res.ok) throw new Error("Failed to save custom field");
    } catch (err) {
      console.error(err);
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: "productImageUrl" | "diagramImageUrl") => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await apiFetch(`/api/luminaires/${item.id}/designer-assets`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        handleFieldSave(field, data.imageUrl);
      }
    } catch (err) { console.error(err); }
    finally { e.target.value = ""; }
  };

  async function handleExport() {
    const tid = local.pdfTemplate;
    if (!tid || tid === "modern" || tid === "compact" || tid === "detailed") {
      alert("Please select a custom template first.");
      return;
    }
    setIsExporting(true);
    try {
      const res = await apiFetch(`/api/luminaires/${item.id}/templates/${tid}/export?project_id=${activeProjectId}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        window.open(data.document.fileUrl, "_blank");
        refreshUser();
      } else {
        alert(data.detail || "Export failed");
      }
    } catch (err) { console.error(err); }
    finally { setIsExporting(false); }
  }

  const renderCell = (column: TableColumn) => {
    if (column.customColumn) {
      return (
        <EditableCell 
          value={local.customData?.[column.customColumn.name] || ""} 
          onSave={(v) => handleCustomFieldSave(column.customColumn!.name, v)} 
        />
      );
    }

    switch (column.key) {
      case "type": return <EditableCell value={local.type} onSave={(v) => handleFieldSave("type", v)} />;
      case "photo":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "54px", paddingLeft: "8px" }}>
            {local.productImageUrl ? (
              <img src={local.productImageUrl} alt="product" className="thumb" onClick={() => setLightboxUrl(local.productImageUrl)} />
            ) : <span className="muted">—</span>}
            <label className="upload-overlay" title="Upload Photo"><Upload size={14} /><input type="file" hidden accept="image/*" onChange={(e) => handleImageUpload(e, "productImageUrl")} /></label>
          </div>
        );
      case "diagram":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "54px", paddingLeft: "8px" }}>
            {local.diagramImageUrl ? (
              <img src={local.diagramImageUrl} alt="diagram" className="thumb" onClick={() => setLightboxUrl(local.diagramImageUrl)} />
            ) : <span className="muted">—</span>}
            <label className="upload-overlay" title="Upload Diagram"><Upload size={14} /><input type="file" hidden accept="image/*" onChange={(e) => handleImageUpload(e, "diagramImageUrl")} /></label>
          </div>
        );
      case "polar":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "54px", paddingLeft: "8px" }}>
            {local.polarImageUrl ? (
              <img src={local.polarImageUrl} alt="polar curve" className="thumb" onClick={() => setLightboxUrl(local.polarImageUrl)} />
            ) : <span className="muted">—</span>}
          </div>
        );
      case "manufacturer": return <EditableCell value={local.manufacturer} onSave={(v) => handleFieldSave("manufacturer", v)} />;
      case "product": return <EditableCell value={local.product} onSave={(v) => handleFieldSave("product", v)} />;
      case "specCode": return <EditableCell value={local.specCode} onSave={(v) => handleFieldSave("specCode", v)} />;
      case "description": return <EditableCell value={local.description} onSave={(v) => handleFieldSave("description", v)} />;
      case "colour": return <EditableCell value={local.colour} onSave={(v) => handleFieldSave("colour", v)} />;
      case "cct": return <EditableCell value={local.cct} onSave={(v) => handleFieldSave("cct", v)} />;
      case "cri": return <EditableCell value={local.cri} onSave={(v) => handleFieldSave("cri", v)} />;
      case "unitWatts": return <EditableCell value={local.unitWatts} onSave={(v) => handleFieldSave("unitWatts", v)} />;
      case "dimming": return <EditableCell value={local.dimming} onSave={(v) => handleFieldSave("dimming", v)} />;
      case "quantity": return <EditableCell value={local.quantity} onSave={(v) => handleFieldSave("quantity", v)} />;
      case "ipRating": return <EditableCell value={local.ipRating} onSave={(v) => handleFieldSave("ipRating", v)} />;
      case "totalWatts": return <EditableCell value={local.totalWatts} onSave={(v) => handleFieldSave("totalWatts", v)} />;
      case "document": return local.sourceUrl ? <a href={local.sourceUrl} target="_blank" rel="noreferrer" className="doc-link">Open PDF</a> : <span className="muted">—</span>;
      case "templatePdf":
        return (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "0 12px" }}>
            <select className="template-select" value={local.pdfTemplate || ""} onChange={(e) => handleFieldSave("pdfTemplate", e.target.value)}>
              <option value="">Select Template</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="print-btn" disabled={isExporting} onClick={handleExport}>{isExporting ? "..." : "Download PDF"}</button>
          </div>
        );
      default: return <span className="muted">—</span>;
    }
  };

  return (
    <>
      <tr className={`table-row group ${rowHeight}${isSelected ? ' row-selected' : ''}`}>
        <td className="select-column-cell" style={{ background: isSelected ? "var(--accent-soft)" : "var(--th-bg)" }}>
          <div className="select-column-cell-inner">
            <input
              type="checkbox"
              className="row-checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(item.id)}
              onClick={e => e.stopPropagation()}
            />
            <span className="row-index" style={{ color: "var(--muted)", fontSize: 12 }}>{index + 1}</span>
            <button className="expand-record-btn" onClick={() => onEdit(local)} title="Expand record"><Maximize2 size={12} /></button>
          </div>
        </td>
        {columns.map((col) => (
          <td key={col.key} className={col.key === "description" ? "desc-cell" : undefined}>
            {renderCell(col)}
          </td>
        ))}
        <td style={{ textAlign: "center", position: "sticky", right: 0, background: "var(--th-bg)", zIndex: 2 }}>
          <button className="delete-row-btn" onClick={() => onDeleteRow(item.id)} title="Delete Row" style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: "6px 10px", borderRadius: "4px" }}>
            <Trash2 size={15} />
          </button>
        </td>
      </tr>
      <Lightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </>
  );
}

export interface SortRule {
  key: string;
  direction: "asc" | "desc";
}

export interface FilterCondition {
  id: string;
  key: string;
  operator: "contains" | "not_contains" | "is" | "is_not" | "is_empty" | "is_not_empty" | "gt" | "lt";
  value: string;
}

interface LuminaireTableProps {
  items: Luminaire[];
  customColumns: CustomColumn[];
  columnOrder: string[];
  hiddenColumns: string[];
  sortRules: SortRule[];
  filterConditions: FilterCondition[];
  filterLogic: "AND" | "OR";
  columnLabels: Record<string, string>;
  rowHeight: "small" | "medium" | "large";
  onRowHeightChange: (h: "small" | "medium" | "large") => void;
  onColumnOrderChange: (order: string[]) => void;
  onHiddenColumnsChange: (hidden: string[]) => void;
  onSortRulesChange: (rules: SortRule[]) => void;
  onFilterConditionsChange: (conds: FilterCondition[]) => void;
  onFilterLogicChange: (logic: "AND" | "OR") => void;
  onColumnLabelsChange: (labels: Record<string, string>) => void;
  onRenameBaseColumn: (key: string, label: string) => void;
  onDeleteBaseColumn: (key: string) => void;
  onAddColumn: (column: CustomColumnDraft) => void;
  onDeleteColumn: (id: number) => void;
  onEditColumn: (id: number, column: CustomColumnDraft) => void;
  onAddRow: () => void;
  onDeleteRow: (id: number) => void;
  onEdit: (item: Luminaire) => void;
  activeProjectId: number | null;
}

export default function LuminaireTable({ 
  items, 
  customColumns, 
  columnOrder,
  hiddenColumns,
  sortRules,
  filterConditions,
  filterLogic,
  columnLabels,
  rowHeight,
  onRowHeightChange,
  onColumnOrderChange,
  onHiddenColumnsChange,
  onSortRulesChange,
  onFilterConditionsChange,
  onFilterLogicChange,
  onColumnLabelsChange,
  onRenameBaseColumn,
  onDeleteBaseColumn,
  onAddColumn, 
  onDeleteColumn, 
  onEditColumn,
  onAddRow,
  onDeleteRow,
  onEdit,
  activeProjectId
}: LuminaireTableProps) {
  const { refreshUser } = useAuth();
  const [isAddColModalOpen, setAddColModalOpen] = useState(false);
  const [newColumnDraft, setNewColumnDraft] = useState<CustomColumnDraft>({
    name: "",
    aiEnabled: true,
    aiDescription: "",
  });
  const [editingCustomColumn, setEditingCustomColumn] = useState<CustomColumn | null>(null);
  const [editingColumnDraft, setEditingColumnDraft] = useState<CustomColumnDraft>({
    name: "",
    aiEnabled: true,
    aiDescription: "",
  });
  const [templates, setTemplates] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // ── Row selection ──
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [activePopover, setActivePopover] = useState<"filter" | "sort" | "columns" | "rowHeight" | null>(null);

  useEffect(() => {
    if (activeProjectId === null) return;
    const fetchTemplates = async () => {
      const res = await apiFetch(`/api/templates?project_id=${activeProjectId}`);
      const data = await res.json();
      setTemplates(data.templates || []);
    };
    fetchTemplates();
  }, [activeProjectId]);

  // Bulk export handler — calls backend to generate a single multi-page PDF
  const handleBulkExport = async () => {
    if (!bulkTemplateId || selectedRowIds.size === 0 || !activeProjectId) return;
    setIsBulkExporting(true);
    try {
      const res = await apiFetch(
        `/api/bulk-export?project_id=${activeProjectId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            luminaire_ids: Array.from(selectedRowIds),
            template_id: parseInt(bulkTemplateId),
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        window.open(data.document.fileUrl, "_blank");
        setSelectedRowIds(new Set());
        setBulkTemplateId("");
        refreshUser();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Bulk export failed.");
      }
    } catch (err) {
      console.error(err);
      alert("Bulk export failed. Check the backend is running.");
    } finally {
      setIsBulkExporting(false);
    }
  };


  const allColumns = React.useMemo<TableColumn[]>(() => {
    const customDefs = customColumns.map((c) => ({ 
      key: `custom:${c.id}`, 
      label: c.name, 
      icon: Tag, 
      customColumn: c,
      filterable: true,
    }));
    // Apply any user-renamed labels to base columns
    const baseCols = BASE_COLUMNS.map(col => 
      columnLabels[col.key] ? { ...col, label: columnLabels[col.key] } : col
    );
    return [...baseCols, ...customDefs];
  }, [customColumns, columnLabels]);

  const orderedAllColumns = React.useMemo(() => {
    const columnMap = new Map(allColumns.map((c) => [c.key, c]));
    const normalizedOrder = dedupeKeys(columnOrder);
    const ordered = normalizedOrder.map((key) => columnMap.get(key)).filter((c): c is TableColumn => Boolean(c));
    const missing = allColumns.filter((c) => !normalizedOrder.includes(c.key));
    return [...ordered, ...missing];
  }, [allColumns, columnOrder]);

  const visibleColumns = React.useMemo(() => 
    orderedAllColumns.filter((c) => !hiddenColumns.includes(c.key)), 
  [orderedAllColumns, hiddenColumns]);

  const filterableColumns = React.useMemo(
    () => orderedAllColumns.filter((c) => c.filterable !== false),
    [orderedAllColumns]
  );

  const sortableColumns = React.useMemo(
    () => orderedAllColumns.filter((c) => c.sortable !== false),
    [orderedAllColumns]
  );

  const activeSortableSortRules = React.useMemo(() => {
    const sortableColumnKeys = new Set(sortableColumns.map((column) => column.key));
    return sortRules.filter((rule) => sortableColumnKeys.has(rule.key));
  }, [sortRules, sortableColumns]);

  const processedItems = React.useMemo(() => {
    let result = [...items];

    // Global Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(item => 
        item.type?.toLowerCase().includes(q) ||
        item.manufacturer?.toLowerCase().includes(q) ||
        item.product?.toLowerCase().includes(q) ||
        item.specCode?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      );
    }

    // Filters
    const filterableColumnKeys = new Set(filterableColumns.map((column) => column.key));
    const activeFilterConditions = filterConditions.filter((cond) => filterableColumnKeys.has(cond.key));

    if (activeFilterConditions.length > 0) {
      result = result.filter(item => {
        const matches = activeFilterConditions.map(cond => {
          let val = "";
          if (cond.key.startsWith("custom:")) {
             const colId = parseInt(cond.key.split(":")[1]);
             const col = customColumns.find(c => c.id === colId);
             val = (col ? item.customData?.[col.name] : "") || "";
          } else {
             val = (item[cond.key as keyof Luminaire] as string) || "";
          }
          val = val.toLowerCase();
          const target = cond.value.toLowerCase();

          switch (cond.operator) {
            case "contains": return val.includes(target);
            case "not_contains": return !val.includes(target);
            case "is": return val === target;
            case "is_not": return val !== target;
            case "is_empty": return !val;
            case "is_not_empty": return !!val;
            default: return true;
          }
        });

        return filterLogic === "OR" ? matches.some(m => m) : matches.every(m => m);
      });
    }

    // Sort
    if (activeSortableSortRules.length > 0) {
      result.sort((a, b) => {
        for (const rule of activeSortableSortRules) {
          let valA = "", valB = "";
          if (rule.key.startsWith("custom:")) {
            const colId = parseInt(rule.key.split(":")[1]);
            const col = customColumns.find(c => c.id === colId);
            valA = (col ? a.customData?.[col.name] : "") || "";
            valB = (col ? b.customData?.[col.name] : "") || "";
          } else {
            valA = (a[rule.key as keyof Luminaire] as string) || "";
            valB = (b[rule.key as keyof Luminaire] as string) || "";
          }
          
          if (valA === valB) continue;
          const factor = rule.direction === "asc" ? 1 : -1;
          return valA > valB ? factor : -factor;
        }
        return 0;
      });
    }

    return result;
  }, [items, searchTerm, filterConditions, filterLogic, customColumns, filterableColumns, activeSortableSortRules]);

  const paginatedItems = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedItems.slice(start, start + itemsPerPage);
  }, [processedItems, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(processedItems.length / itemsPerPage);

  const handleDrop = (targetKey: string) => {
    if (!draggedKey || draggedKey === targetKey) {
      setDraggedKey(null);
      setDragOverKey(null);
      return;
    }
    const keys = orderedAllColumns.map(c => c.key);
    const nextOrder = moveKey(keys, draggedKey, targetKey);
    onColumnOrderChange(nextOrder);
    setDraggedKey(null);
    setDragOverKey(null);
  };

  const handleAddNewColumnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newColumnDraft.name.trim()) {
      onAddColumn({
        name: newColumnDraft.name.trim(),
        aiEnabled: newColumnDraft.aiEnabled,
        aiDescription: newColumnDraft.aiDescription.trim(),
      });
      setNewColumnDraft({
        name: "",
        aiEnabled: true,
        aiDescription: "",
      });
      setAddColModalOpen(false);
    }
  };

  const openEditCustomColumnModal = (column: CustomColumn) => {
    setEditingCustomColumn(column);
    setEditingColumnDraft({
      name: column.name,
      aiEnabled: column.aiEnabled,
      aiDescription: column.aiDescription || "",
    });
  };

  const handleEditCustomColumnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomColumn || !editingColumnDraft.name.trim()) return;
    onEditColumn(editingCustomColumn.id, {
      name: editingColumnDraft.name.trim(),
      aiEnabled: editingColumnDraft.aiEnabled,
      aiDescription: editingColumnDraft.aiDescription.trim(),
    });
    setEditingCustomColumn(null);
  };

  return (
    <section className="table-section">
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={14} className="search-icon" />
            <input 
              placeholder="Search luminaires..." 
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>
        <div className="toolbar-right">
          <div className="toolbar-actions">
            <div className="dropdown-wrapper">
              <button className={`toolbar-btn ${rowHeight !== "medium" ? "active" : ""}`} onClick={() => setActivePopover(activePopover === "rowHeight" ? null : "rowHeight")}>
                <Settings2 size={14} /> Row Height
              </button>
              {activePopover === "rowHeight" && (
                <RowHeightPopover 
                  current={rowHeight} 
                  onChange={onRowHeightChange} 
                  onClose={() => setActivePopover(null)} 
                />
              )}
            </div>

            <div className="dropdown-wrapper">
              <button className={`toolbar-btn ${filterConditions.length > 0 ? "active" : ""}`} onClick={() => setActivePopover(activePopover === "filter" ? null : "filter")}>
                <Filter size={14} /> Filter {filterConditions.length > 0 && <span className="badge">{filterConditions.length}</span>}
              </button>
              {activePopover === "filter" && (
                <FilterPopover 
                  conditions={filterConditions} 
                  logic={filterLogic} 
                  onChange={onFilterConditionsChange} 
                  onLogicChange={onFilterLogicChange}
                  columns={filterableColumns}
                  onClose={() => setActivePopover(null)}
                />
              )}
            </div>

            <div className="dropdown-wrapper">
              <button className={`toolbar-btn ${activeSortableSortRules.length > 0 ? "active" : ""}`} onClick={() => setActivePopover(activePopover === "sort" ? null : "sort")}>
                <ArrowUpDown size={14} /> Sort {activeSortableSortRules.length > 0 && <span className="badge">{activeSortableSortRules.length}</span>}
              </button>
              {activePopover === "sort" && (
                <SortPopover 
                  rules={activeSortableSortRules} 
                  onChange={onSortRulesChange} 
                  columns={sortableColumns}
                  onClose={() => setActivePopover(null)}
                />
              )}
            </div>

            <div className="dropdown-wrapper">
              <button className="toolbar-btn" onClick={() => setActivePopover(activePopover === "columns" ? null : "columns")}>
                <Columns3 size={14} /> Columns
              </button>
              {activePopover === "columns" && (
                <div className="popover columns-popover" onClick={e => e.stopPropagation()}>
                  <div className="popover-header">Customize Columns</div>
                  <div className="popover-body" style={{ paddingTop: 0 }}>
                    <div className="search-box" style={{ width: "100%", margin: "12px 0", background: "var(--surface-low)" }}>
                      <Search size={14} className="search-icon" />
                      <input 
                        placeholder="Search columns..." 
                        onChange={(e) => {
                          const q = e.target.value.toLowerCase();
                          const items = document.querySelectorAll(".column-item");
                          items.forEach((item: any) => {
                            const text = item.innerText.toLowerCase();
                            item.style.display = text.includes(q) ? "flex" : "none";
                          });
                        }} 
                      />
                    </div>
                    <div className="column-list" style={{ padding: 0 }}>
                      {orderedAllColumns.map(col => {
                        const isHidden = hiddenColumns.includes(col.key);
                        return (
                          <div key={col.key} className="column-item" onClick={() => {
                            const next = isHidden ? hiddenColumns.filter(k => k !== col.key) : dedupeKeys([...hiddenColumns, col.key]);
                            onHiddenColumnsChange(next);
                          }}>
                            <span className="col-label">{col.label}</span>
                            {isHidden ? <EyeOff size={14} className="muted" /> : <Eye size={14} className="accent" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="table-card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="select-column-header">
                <div className="select-column-header-inner">
                  <input
                    type="checkbox"
                    className="row-checkbox"
                    title="Select all"
                    checked={paginatedItems.length > 0 && paginatedItems.every(i => selectedRowIds.has(i.id))}
                    ref={el => { if (el) el.indeterminate = paginatedItems.some(i => selectedRowIds.has(i.id)) && !paginatedItems.every(i => selectedRowIds.has(i.id)); }}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRowIds(prev => new Set([...prev, ...paginatedItems.map(i => i.id)]));
                      } else {
                        setSelectedRowIds(prev => { const next = new Set(prev); paginatedItems.forEach(i => next.delete(i.id)); return next; });
                      }
                    }}
                  />
                  <span className="select-column-label">Select all</span>
                </div>
              </th>
              {visibleColumns.map((col) => (
                <th key={col.key} className={col.className}>
                  <ThContent 
                    column={col} 
                    draggedKey={draggedKey} 
                    dragOverKey={dragOverKey}
                    onDragStart={setDraggedKey}
                    onDragOver={setDragOverKey}
                    onDrop={handleDrop}
                    onDragEnd={() => { setDraggedKey(null); setDragOverKey(null); }}
                    onHide={(key) => onHiddenColumnsChange([...hiddenColumns, key])}
                    onSortAsc={(key) => onSortRulesChange([...sortRules.filter(r => r.key !== key), { key, direction: 'asc' }])}
                    onSortDesc={(key) => onSortRulesChange([...sortRules.filter(r => r.key !== key), { key, direction: 'desc' }])}
                    onDelete={(key) => {
                      if (key.startsWith('custom:')) {
                        const colId = parseInt(key.split(':')[1]);
                        onDeleteColumn(colId);
                      } else {
                        onDeleteBaseColumn(key);
                      }
                    }}
                    onRename={(key, label) => {
                      if (key.startsWith('custom:')) {
                        const customColumn = customColumns.find((column) => column.id === parseInt(key.split(':')[1]));
                        if (customColumn) {
                          openEditCustomColumnModal(customColumn);
                        }
                      } else {
                        onRenameBaseColumn(key, label);
                      }
                    }}
                    onEditCustomColumn={openEditCustomColumnModal}
                  />
                </th>
              ))}
              <th style={{ minWidth: 40 }}>
                <button
                  className="add-col-btn"
                  onClick={() => {
                    setNewColumnDraft({
                      name: "",
                      aiEnabled: true,
                      aiDescription: "",
                    });
                    setAddColModalOpen(true);
                  }}
                  title="Add custom column"
                >
                  <Plus size={14} />
                </button>
              </th>
              <th style={{ position: 'sticky', right: 0, background: 'var(--th-bg)', zIndex: 11, width: 44, borderLeft: '1px solid var(--line)' }}></th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr><td colSpan={visibleColumns.length + 3} className="empty-state">No luminaires found.</td></tr>
            ) : (
              paginatedItems.map((item, idx) => (
                <TableRow 
                  key={item.id} 
                  item={item} 
                  index={(currentPage - 1) * itemsPerPage + idx}
                  columns={visibleColumns}
                  templates={templates}
                  onEdit={onEdit} 
                  onDeleteRow={onDeleteRow}
                  activeProjectId={activeProjectId}
                  rowHeight={rowHeight}
                  isSelected={selectedRowIds.has(item.id)}
                  onToggleSelect={(id) => setSelectedRowIds(prev => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  })}
                />
              ))
            )}
            <tr>
              <td style={{ textAlign: 'center', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 2, borderBottom: 'none' }}>
                <button onClick={onAddRow} title="Add empty row" className="add-row-inline"><Plus size={16} /></button>
              </td>
              <td colSpan={visibleColumns.length + 2} style={{ borderBottom: 'none' }}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <footer className="pagination-footer">
        <div className="pagination-info">
          <span className="muted">Rows per page:</span>
          <select value={itemsPerPage} onChange={e => { setItemsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="item-range">
            {processedItems.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}-{Math.min(currentPage * itemsPerPage, processedItems.length)} of {processedItems.length}
          </span>
        </div>
        <div className="pagination-controls">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)}><ChevronLeft size={16} /></button>
          <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(prev => prev + 1)}><ChevronRight size={16} /></button>
        </div>
      </footer>
      </div>

      {isAddColModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setAddColModalOpen(false); }}>
          <div className="modal ai-column-modal" style={{ maxWidth: '560px', paddingBottom: '32px', height: 'auto' }}>
            <button className="close-button" onClick={() => setAddColModalOpen(false)}>✕</button>
            <div className="modal-header">
              <p className="eyebrow">AI Column Setup</p>
              <h2>Add Custom Column</h2>
              <p>Create a custom field and optionally let AI fill it during PDF extraction.</p>
            </div>
            <form className="modal-form" onSubmit={handleAddNewColumnSubmit}>
              <div className="ai-column-panel">
                <label className="field">
                  <span>Column Name</span>
                  <input
                    autoFocus
                    value={newColumnDraft.name}
                    onChange={e => setNewColumnDraft(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Warranty period"
                    required
                  />
                </label>
                <label className="ai-column-toggle">
                  <input
                    type="checkbox"
                    checked={newColumnDraft.aiEnabled}
                    onChange={e => setNewColumnDraft(prev => ({ ...prev, aiEnabled: e.target.checked }))}
                  />
                  <span>AI Enabled</span>
                </label>
                <label className="field">
                  <span>What is this column about?</span>
                  <textarea
                    value={newColumnDraft.aiDescription}
                    onChange={e => setNewColumnDraft(prev => ({ ...prev, aiDescription: e.target.value }))}
                    placeholder="Describe what AI should extract here, for example: warranty period, mounting detail, housing finish, installation note."
                    rows={4}
                  />
                </label>
                <p className="ai-column-note">
                  When AI is enabled, PDF extraction will try to populate this column using your description. If disabled, AI will ignore it.
                </p>
              </div>
              <div className="actions">
                <button type="button" className="ghost-button" onClick={() => setAddColModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button">Add Column</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingCustomColumn && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditingCustomColumn(null); }}>
          <div className="modal ai-column-modal" style={{ maxWidth: '560px', paddingBottom: '32px', height: 'auto' }}>
            <button className="close-button" onClick={() => setEditingCustomColumn(null)}>✕</button>
            <div className="modal-header">
              <p className="eyebrow">AI Column Setup</p>
              <h2>Edit Custom Column</h2>
              <p>Update the field name and control whether AI should map PDF content into it.</p>
            </div>
            <form className="modal-form" onSubmit={handleEditCustomColumnSubmit}>
              <div className="ai-column-panel">
                <label className="field">
                  <span>Column Name</span>
                  <input
                    autoFocus
                    value={editingColumnDraft.name}
                    onChange={e => setEditingColumnDraft(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Warranty period"
                    required
                  />
                </label>
                <label className="ai-column-toggle">
                  <input
                    type="checkbox"
                    checked={editingColumnDraft.aiEnabled}
                    onChange={e => setEditingColumnDraft(prev => ({ ...prev, aiEnabled: e.target.checked }))}
                  />
                  <span>AI Enabled</span>
                </label>
                <label className="field">
                  <span>What is this column about?</span>
                  <textarea
                    value={editingColumnDraft.aiDescription}
                    onChange={e => setEditingColumnDraft(prev => ({ ...prev, aiDescription: e.target.value }))}
                    placeholder="Describe what AI should extract here."
                    rows={4}
                  />
                </label>
                <p className="ai-column-note">
                  Turning this off keeps the column in the table, but AI import will stop filling it from PDFs.
                </p>
              </div>
              <div className="actions">
                <button type="button" className="ghost-button" onClick={() => setEditingCustomColumn(null)}>Cancel</button>
                <button type="submit" className="primary-button">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Bulk Action Bar ── */}
      {selectedRowIds.size > 0 && (
        <div className="bulk-action-bar">
          <span className="bulk-count">
            <strong>{selectedRowIds.size}</strong> row{selectedRowIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="bulk-actions">
            <select
              className="bulk-template-select"
              value={bulkTemplateId}
              onChange={e => setBulkTemplateId(e.target.value)}
            >
              <option value="">Choose template…</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              className="bulk-export-btn"
              disabled={!bulkTemplateId || isBulkExporting}
              onClick={handleBulkExport}
            >
              {isBulkExporting ? (
                <><span className="bulk-spinner" />Generating…</>
              ) : (
                '⚡ Generate PDFs'
              )}
            </button>
            <button
              className="bulk-clear-btn"
              onClick={() => setSelectedRowIds(new Set())}
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
