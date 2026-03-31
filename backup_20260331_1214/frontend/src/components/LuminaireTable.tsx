"use client";

import React, { useState, useEffect } from "react";
import { Luminaire, CustomColumn } from "@/types/luminaire";
import Lightbox from "./Lightbox";
import { Maximize2, Hash, Type, Image as ImageIcon, Tag, AlignLeft, Settings, FileText, LayoutTemplate, Palette, Plus, ChevronDown, Edit2, Trash2 } from "lucide-react";

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

interface TableRowProps {
  item: Luminaire;
  index: number;
  customColumns: CustomColumn[];
  onEdit: (item: Luminaire) => void;
  onDeleteRow: (id: number) => void;
  templates: any[];
}

function TableRow({ item, index, customColumns, onEdit, onDeleteRow, templates }: TableRowProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [local, setLocal] = useState(item);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setLocal(item);
  }, [item]);

  async function handleFieldSave(field: keyof Luminaire, value: string) {
    if (local[field] === value) return;
    
    const prev = { ...local };
    const updated = { ...local, [field]: value };
    setLocal(updated); // Optimistic UI update

    try {
      const res = await fetch(`/api/luminaires/${item.id}`, {
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
    const prev = { ...local };
    const nextCustom = { ...(local.customData || {}), [name]: value };
    const updated = { ...local, customData: nextCustom };
    setLocal(updated);

    try {
      const res = await fetch(`/api/luminaires/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customData: { [name]: value } }),
      });
      if (!res.ok) throw new Error("Failed to save custom field");
    } catch (err) {
      console.error(err);
      setLocal(prev);
    }
  }

  async function handleExport() {
    const tid = local.pdfTemplate;
    if (!tid || tid === "modern" || tid === "compact" || tid === "detailed") {
      alert("Please select a custom template from the builder first.");
      return;
    }
    setIsExporting(true);
    try {
      const res = await fetch(`/api/luminaires/${item.id}/templates/${tid}/export`, { method: "POST" });
      const data = await res.json();
      if (res.ok) window.open(data.document.fileUrl, "_blank");
      else alert(data.detail || "Export failed");
    } catch (err) { console.error(err); }
    finally { setIsExporting(false); }
  }

  return (
    <>
      <tr className="table-row group">
        <td style={{ width: 50, textAlign: 'center', background: 'var(--th-bg)', position: 'sticky', left: 0, zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <span className="row-index" style={{ color: 'var(--muted)', fontSize: 12 }}>{index + 1}</span>
            <button className="expand-record-btn" onClick={() => onEdit(local)} title="Expand record">
              <Maximize2 size={12} />
            </button>
          </div>
        </td>
        <td>
          <EditableCell value={local.type} onSave={(v) => handleFieldSave("type", v)} />
        </td>
        <td>
          {local.productImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={local.productImageUrl}
              alt="product"
              className="thumb"
              onClick={() => setLightboxUrl(local.productImageUrl)}
            />
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        <td>
          {local.diagramImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={local.diagramImageUrl}
              alt="diagram"
              className="thumb"
              onClick={() => setLightboxUrl(local.diagramImageUrl)}
            />
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        <td><EditableCell value={local.manufacturer} onSave={(v) => handleFieldSave("manufacturer", v)} /></td>
        <td><EditableCell value={local.product} onSave={(v) => handleFieldSave("product", v)} /></td>
        <td><EditableCell value={local.specCode} onSave={(v) => handleFieldSave("specCode", v)} /></td>
        <td className="desc-cell">
          <EditableCell value={local.description} onSave={(v) => handleFieldSave("description", v)} />
        </td>
        <td><EditableCell value={local.colour} onSave={(v) => handleFieldSave("colour", v)} /></td>
        <td><EditableCell value={local.cct} onSave={(v) => handleFieldSave("cct", v)} /></td>
        <td><EditableCell value={local.cri} onSave={(v) => handleFieldSave("cri", v)} /></td>
        <td><EditableCell value={local.unitWatts} onSave={(v) => handleFieldSave("unitWatts", v)} /></td>
        <td><EditableCell value={local.dimming} onSave={(v) => handleFieldSave("dimming", v)} /></td>
        <td><EditableCell value={local.quantity} onSave={(v) => handleFieldSave("quantity", v)} /></td>
        <td><EditableCell value={local.ipRating} onSave={(v) => handleFieldSave("ipRating", v)} /></td>
        <td><EditableCell value={local.totalWatts} onSave={(v) => handleFieldSave("totalWatts", v)} /></td>
        
        {customColumns.map((col) => (
          <td key={col.id}>
            <EditableCell 
              value={local.customData?.[col.name] || ""} 
              onSave={(v) => handleCustomFieldSave(col.name, v)} 
            />
          </td>
        ))}

        <td>
          <a
            href={item.sourceUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className="doc-link"
          >
            Open PDF
          </a>
        </td>
        <td>
          <div style={{display: 'flex', gap: '8px', alignItems: 'center', padding: '0 12px'}}>
            <select 
              className="template-select"
              value={local.pdfTemplate || ""}
              onChange={e => handleFieldSave("pdfTemplate", e.target.value)}
            >
              <option value="">Select Template</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button 
              className="print-btn" 
              disabled={isExporting}
              onClick={handleExport}
            >
              {isExporting ? "..." : "Download PDF"}
            </button>
          </div>
        </td>
        <td style={{ textAlign: "center" }}>
          <button 
            className="delete-row-btn"
            onClick={() => onDeleteRow(item.id)}
            title="Delete Row"
            style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', opacity: 0.6 }}
            onMouseOver={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(255, 92, 92, 0.1)'; }}
            onMouseOut={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'transparent'; }}
          >
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
      <Lightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </>
  );
}

interface LuminaireTableProps {
  items: Luminaire[];
  customColumns: CustomColumn[];
  onAddColumn: (name: string) => void;
  onDeleteColumn: (id: number) => void;
  onEditColumn: (id: number, name: string) => void;
  onAddRow: () => void;
  onDeleteRow: (id: number) => void;
  onEdit: (item: Luminaire) => void;
}

export default function LuminaireTable({ 
  items, 
  customColumns, 
  onAddColumn, 
  onDeleteColumn, 
  onEditColumn,
  onAddRow,
  onDeleteRow,
  onEdit 
}: LuminaireTableProps) {
  
  const [isAddColModalOpen, setAddColModalOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [editingColId, setEditingColId] = useState<number | null>(null);
  const [editingColName, setEditingColName] = useState("");
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    const fetchTemplates = async () => {
      const res = await fetch("/api/templates");
      const data = await res.json();
      setTemplates(data.templates || []);
    };
    fetchTemplates();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = () => setActiveMenuId(null);
    if (activeMenuId !== null) {
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [activeMenuId]);

  const handleAddNewColumnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newColName.trim()) {
      onAddColumn(newColName.trim());
      setNewColName("");
      setAddColModalOpen(false);
    }
  };

  const calculateColSpan = () => 17 + customColumns.length;

  return (
    <section className="table-card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 50, position: 'sticky', left: 0, zIndex: 12, background: 'var(--th-bg)' }}></th>
              <th><div className="th-content"><Type size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Type</div></th>
              <th className="img-col"><div className="th-content"><ImageIcon size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Photo</div></th>
              <th className="img-col"><div className="th-content"><ImageIcon size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Diagram</div></th>
              <th><div className="th-content"><Tag size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Manufacturer</div></th>
              <th><div className="th-content"><Tag size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Product</div></th>
              <th><div className="th-content"><Hash size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Spec Code</div></th>
              <th><div className="th-content"><AlignLeft size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Description</div></th>
              <th><div className="th-content"><Palette size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Colour</div></th>
              <th><div className="th-content"><Settings size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> CCT</div></th>
              <th><div className="th-content"><Settings size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> CRI</div></th>
              <th><div className="th-content"><Hash size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Unit Watts</div></th>
              <th><div className="th-content"><Settings size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Dimming</div></th>
              <th><div className="th-content"><Hash size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Qty</div></th>
              <th><div className="th-content"><Settings size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> IP Rating</div></th>
              <th><div className="th-content"><Hash size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Total Watts</div></th>
              
              {customColumns.map((c) => (
                <th key={c.id} className="custom-th text-accent" style={{ position: 'relative' }}>
                  <div className="th-content" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                    {editingColId === c.id ? (
                      <input 
                        autoFocus
                        style={{ background: 'transparent', border: 'none', color: 'inherit', outline: 'none', width: '100%', fontSize: '12px', fontWeight: 600 }}
                        value={editingColName}
                        onChange={e => setEditingColName(e.target.value)}
                        onBlur={() => {
                          if (editingColName.trim() && editingColName.trim() !== c.name) {
                            onEditColumn(c.id, editingColName.trim());
                          }
                          setEditingColId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                      />
                    ) : (
                      <>
                        <span style={{flex: 1}}>{c.name}</span>
                        <button 
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === c.id ? null : c.id);
                          }}
                        >
                          <ChevronDown size={14} />
                        </button>
                      </>
                    )}
                  </div>
                  
                  {activeMenuId === c.id && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, 
                      background: 'var(--panel)', border: '1px solid var(--line)',
                      boxShadow: 'var(--shadow)', borderRadius: '6px', padding: '4px',
                      zIndex: 20, display: 'flex', flexDirection: 'column', minWidth: '160px'
                    }} onClick={e => e.stopPropagation()}>
                      <button style={{
                        display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
                        padding: '8px 12px', background: 'transparent', border: 'none',
                        color: 'var(--text)', cursor: 'pointer', textAlign: 'left', borderRadius: '4px'
                      }} onMouseOver={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => {
                        setEditingColId(c.id);
                        setEditingColName(c.name);
                        setActiveMenuId(null);
                      }}>
                        <Edit2 size={12}/> Edit field
                      </button>
                      <button style={{
                        display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
                        padding: '8px 12px', background: 'transparent', border: 'none',
                        color: 'var(--danger)', cursor: 'pointer', textAlign: 'left', borderRadius: '4px'
                      }} onMouseOver={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => {
                        onDeleteColumn(c.id);
                        setActiveMenuId(null);
                      }}>
                        <Trash2 size={12}/> Delete field
                      </button>
                    </div>
                  )}
                </th>
              ))}

              <th><div className="th-content"><FileText size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Document</div></th>
              <th><div className="th-content"><LayoutTemplate size={14} style={{marginRight: 6, color: 'var(--muted)'}}/> Template PDF</div></th>
              <th>
                <button className="add-col-btn" onClick={() => setAddColModalOpen(true)} title="Add custom column" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--muted)'}}>
                  <Plus size={14} /> 
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={calculateColSpan()} className="empty-state">
                  No luminaires imported yet.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <TableRow 
                  key={item.id} 
                  item={item} 
                  index={idx}
                  customColumns={customColumns}
                  templates={templates}
                  onEdit={onEdit} 
                  onDeleteRow={onDeleteRow}
                />
              ))
            )}
            
            {/* Airtable-style Add Row Button */}
            <tr>
              <td style={{ textAlign: 'center', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 2, borderBottom: 'none' }}>
                <button 
                  onClick={onAddRow} 
                  title="Add empty row"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--muted)', width: '100%', height: '32px', display: 'grid', placeItems: 'center'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--button-bg)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Plus size={16} />
                </button>
              </td>
              <td colSpan={50} style={{ borderBottom: 'none' }}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {isAddColModalOpen && (
        <div 
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddColModalOpen(false);
          }}
        >
          <div className="modal" style={{ maxWidth: '440px', paddingBottom: '32px', height: 'auto', maxHeight: 'none' }}>
            <button className="close-button" onClick={() => setAddColModalOpen(false)}>
              ✕
            </button>
            
            <div>
              <div className="modal-header">
                <p className="eyebrow">Database Settings</p>
                <h2>Add Custom Column</h2>
                <p>Add a new field to track details across all your luminaires.</p>
              </div>
              
              <form className="modal-form" onSubmit={handleAddNewColumnSubmit}>
                <label className="field">
                  <span>Column Name</span>
                  <input 
                    autoFocus 
                    value={newColName} 
                    onChange={e => setNewColName(e.target.value)} 
                    placeholder="e.g. Warranty" 
                    required 
                  />
                </label>
                
                <div className="actions">
                  <button type="button" className="ghost-button" onClick={() => setAddColModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-button">
                    Add Column
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
