"use client";

import { withBase } from "@/utils/basePath";
import React, { useState, useEffect } from "react";
import { Luminaire } from "@/types/luminaire";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { useBrand } from "@/components/BrandContext";
import { apiFetch } from "@/utils/api";

interface DesignItem {
  id: string;
  type: string; // "field", "text", "image", "shape"
  bindingKey: string;
  imageUrl: string;
  label: string;
  text: string;
  emptyText?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: {
    fontSize: number;
    color: string;
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    fontWeight: string;
    padding: number;
    textAlign?: "left" | "center" | "right";
    verticalAlign?: "top" | "middle" | "bottom";
  };
}

interface DesignJSON {
  items: DesignItem[];
}

const fieldBindings: [string, string][] = [
  ["manufacturer", "Manufacturer"],
  ["product", "Product"],
  ["specCode", "Spec Code"],
  ["description", "Description"],
  ["type", "Type"],
  ["colour", "Colour"],
  ["cct", "CCT"],
  ["cri", "CRI"],
  ["unitWatts", "Unit Watts"],
  ["dimming", "Dimming"],
  ["quantity", "Quantity"],
  ["ipRating", "IP Rating"],
  ["totalWatts", "Total Watts"],
  ["projectName", "Project Name"],
  ["projectLogoUrl", "Project Logo"],
  ["projectLocationCountry", "Project Location / Country"],
  ["projectRevision", "Project Revision"],
  ["projectIssueDate", "Project Issue Date"],
  ["luminaireReference", "Luminaire Reference"],
  ["luminaireLocation", "Luminaire Location"],
  ["productCode", "Product Code / Ref."],
  ["productName", "Product Name"],
  ["mountingType", "Mounting Type"],
  ["lightSource", "Light Source"],
  ["wattage", "Wattage"],
  ["colourTemperature", "Colour Temperature"],
  ["macadam", "MacAdam / SDCM"],
  ["beamDistribution", "Beam / Distribution"],
  ["deliveredLumens", "Delivered Lumens"],
  ["ledLifetime", "LED Lifetime"],
  ["inputVoltage", "Input Voltage"],
  ["emergencyProvision", "Emergency Provision"],
  ["dimensions", "Dimensions"],
  ["material", "Material"],
  ["finishColour", "Finish / Colour"],
  ["ikRating", "IK Rating"],
  ["weight", "Weight"],
  ["operatingTemperature", "Operating Temperature"],
  ["requiredAccessories", "Required Accessories"],
  ["generalNotes", "General Notes"],
  ["sourceDocument", "Source Document"],
  ["productImageUrl", "Product Image"],
  ["diagramImageUrl", "Diagram Image"],
];

const newId = () => Math.random().toString(36).substring(2, 9);

const blankStyle = () => ({
  fontSize: 14,
  color: "#111827",
  backgroundColor: "transparent",
  borderColor: "#30363d",
  borderWidth: 0,
  fontWeight: "normal",
  padding: 8,
  textAlign: "left" as const,
  verticalAlign: "middle" as const,
});

import Sidebar from "@/components/Sidebar";
import { useProjects } from "@/components/ProjectContext";
import { useTemplates } from "@/components/TemplateContext";

export default function PageDesigner() {
  const { companyName } = useBrand();
  const { activeProjectId } = useProjects();
  const { templates, selectedTemplateId, setSelectedTemplateId, refreshTemplates } = useTemplates();

  const [items, setItems] = useState<Luminaire[]>([]);
  const [selectedLuminaire, setSelectedLuminaire] = useState<Luminaire | null>(null);
  const [templateName, setTemplateName] = useState("Untitled Template");
  const [currentDesign, setCurrentDesign] = useState<DesignJSON>({ items: [] });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ itemId: string; startX: number; startY: number; mode: "move"|"resize"; startWidth?: number; startHeight?: number } | null>(null);
  const [customImages, setCustomImages] = useState<{ fileName: string; imageUrl: string }[]>([]);
  const [customColumns, setCustomColumns] = useState<any[]>([]);
  const [exports, setExports] = useState<any[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [zoom, setZoom] = useState(1.8);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [designerContext, setDesignerContext] = useState<Record<string, any>>({});

  useEffect(() => {
    if (activeProjectId === null) return;
    apiFetch(`/api/luminaires?project_id=${activeProjectId}`).then(r => r.json()).then(d => {
      setItems(d.items || []);
      if (d.items?.length > 0) setSelectedLuminaire(d.items[0]);
    });
    apiFetch(`/api/columns?project_id=${activeProjectId}`).then(r => r.json()).then(d => {
      setCustomColumns(d || []);
    });
    loadExports();
  }, [activeProjectId]);

  useEffect(() => {
    if (!selectedLuminaire) {
      setDesignerContext({});
      return;
    }
    apiFetch(`/api/luminaires/${selectedLuminaire.id}/designer-context`)
      .then((response) => response.ok ? response.json() : {})
      .then((data) => setDesignerContext(data || {}))
      .catch((error) => console.error("Failed to load designer context", error));
  }, [selectedLuminaire]);

  // React to sidebar template selection
  useEffect(() => {
    if (selectedTemplateId) {
      loadTemplateById(selectedTemplateId);
    } else {
      setTemplateName("Untitled Template");
      setCurrentDesign({ items: [] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId]);


  const loadExports = async () => {
    if (activeProjectId === null) return;
    try {
      const res = await apiFetch(`/api/exports?project_id=${activeProjectId}`);
      const data = await res.json();
      setExports(data.items || []);
    } catch (err) { console.error(err); }
  };

  const loadTemplateById = async (tid: string) => {
    setIsLoadingTemplate(true);
    try {
      const res = await apiFetch(`/api/templates/${tid}?project_id=${activeProjectId}`);
      if (!res.ok) { console.error("Failed to load template", res.status); return; }
      const data = await res.json();
      if (data && data.template) {
        setTemplateName(data.template.name);
        setCurrentDesign(data.template.designJson || { items: [] });
      }
    } catch (err) { console.error(err); }
    finally { setIsLoadingTemplate(false); }
  };

  const handleTemplateChange = async (tid: string) => {
    setSelectedTemplateId(tid); // updates context — sidebar will highlight it
    if (!tid) {
      setTemplateName("Untitled Template");
      setCurrentDesign({ items: [] });
      return;
    }
    await loadTemplateById(tid);
  };


  const addItem = (type: string, extra: any = {}) => {
    const item: DesignItem = {
      id: newId(),
      type,
      bindingKey: extra.bindingKey || "",
      imageUrl: extra.imageUrl || "",
      label: extra.label || "",
      text: type === "text" ? (extra.text || "Double-click to edit") : (extra.text || "New Block"),
      x: extra.dropX ?? 60,
      y: extra.dropY ?? 60,
      width: type === "image" ? 180 : 220,
      height: type === "shape" ? 80 : 60,
      style: blankStyle(),
    };
    if (type === "image") {
      item.height = 160;
      item.style.backgroundColor = "#ffffff";
    }
    if (type === "shape") {
      item.style.borderWidth = 1;
      item.style.borderColor = "#000000";
      item.style.backgroundColor = "transparent";
      item.style.padding = 0;
      item.text = "";
    }
    if (type === "line") {
      item.width = extra.vertical ? 2 : (extra.fullWidth ? 475 : 200);
      item.height = extra.vertical ? 200 : 2;
      item.style.backgroundColor = "#000000";
      item.style.borderWidth = 0;
      item.style.padding = 0;
      item.text = "";
    }
    setCurrentDesign(prev => ({ ...prev, items: [...prev.items, item] }));
    setSelectedItemId(item.id);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await apiFetch(`/api/projects/${activeProjectId}/designer-assets`, { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) setCustomImages(prev => [...prev, { fileName: data.fileName, imageUrl: data.imageUrl }]);
    } catch (err) { console.error(err); }
  };

  const handleSave = async () => {
    if (activeProjectId === null) return;
    try {
      const payload = {
        name: templateName,
        pageSize: "A4",
        pageWidth: 595,
        pageHeight: 842,
        designJson: currentDesign,
        luminaireId: selectedLuminaire?.id,
        project_id: activeProjectId
      };
      const method = selectedTemplateId ? "PUT" : "POST";
      const url = selectedTemplateId ? `/api/templates/${selectedTemplateId}?project_id=${activeProjectId}` : `/api/templates?project_id=${activeProjectId}`;
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (!selectedTemplateId) setSelectedTemplateId(data.template.id.toString());
        refreshTemplates();
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
    } catch (err) { console.error(err); }
  };

  const confirmDelete = () => {
    if (!selectedTemplateId) return;
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!selectedTemplateId || activeProjectId === null) return;
    try {
      const res = await apiFetch(`/api/templates/${selectedTemplateId}?project_id=${activeProjectId}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedTemplateId("");
        setTemplateName("Untitled Template");
        setCurrentDesign({ items: [] });
        refreshTemplates();
        setShowDeleteModal(false);
      }
    } catch (err) { console.error(err); }
  };

  const handleExport = async () => {
    if (!selectedLuminaire || !selectedTemplateId || activeProjectId === null) {
      alert("Please select a luminaire and a saved template first.");
      return;
    }
    try {
      const res = await apiFetch(`/api/luminaires/${selectedLuminaire.id}/templates/${selectedTemplateId}/export?project_id=${activeProjectId}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        window.open(withBase(data.document.fileUrl), "_blank");
        loadExports();
      }
    } catch (err) { console.error(err); }
  };

  const selectedItem = currentDesign.items.find(i => i.id === selectedItemId);
  const selectedTemplate = templates.find((template) => template.id.toString() === selectedTemplateId);

  const updateSelectedItem = (key: string, val: any) => {
    setCurrentDesign(prev => ({
      ...prev,
      items: prev.items.map(it => it.id === selectedItemId ? { ...it, [key]: val } : it)
    }));
  };

  const updateSelectedStyle = (key: string, val: any) => {
    if (!selectedItem) return;
    setCurrentDesign(prev => ({
      ...prev,
      items: prev.items.map(it => it.id === selectedItemId ? { ...it, style: { ...it.style, [key]: val } } : it)
    }));
  };

  return (
    <div className="shell">
      <Sidebar />

      {/* ── Main Content Area ── */}
      <main className="main" style={{ flexDirection: "row", padding: 0 }}>
        
        {/* ── Designer sidebar (Second Sidebar) ── */}
        <aside style={{ width: "260px", borderRight: "1px solid var(--line)", background: "var(--panel)", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto", borderLeft: '1px solid var(--line)' }}>
          <div style={{ padding: "20px" }}>
            <span style={{ background: 'var(--accent)', color: '#fff', fontSize: '9px', fontWeight: 900, padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginBottom: '16px', letterSpacing: '0.05em' }}>TEMPLATE TOOLS</span>
            <h1 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px", color: 'var(--text)', letterSpacing: '-0.02em' }}>Page Designer</h1>
            <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "24px", lineHeight: '1.4' }}>Drag and drop row values to build your PDF page.</p>

            <h3 style={{ fontSize: "11px", fontWeight: 700, marginBottom: "12px", color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Row values</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {fieldBindings.map(([key, label]) => {
                const isImage = key.includes("Image") || key === "projectLogoUrl";
                return (
                  <button 
                    key={key} 
                    className="designer-pill-btn"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ type: isImage ? "image" : "field", extra: { bindingKey: key, label } }))}
                    onClick={() => addItem(isImage ? "image" : "field", { bindingKey: key, label })}
                  >
                    {label}
                  </button>
                );
              })}
              {customColumns.map(col => (
                <button 
                  key={col.id} 
                  className="designer-pill-btn"
                  style={{ border: '1px solid var(--accent-soft)', color: 'var(--accent)' }}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ type: "field", extra: { bindingKey: col.name, label: col.name } }))}
                  onClick={() => addItem("field", { bindingKey: col.name, label: col.name })}
                >
                  {col.name}
                </button>
              ))}
            </div>

            <h3 style={{ fontSize: "11px", fontWeight: 700, marginTop: "24px", marginBottom: "12px", color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Static elements</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <button draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ type: "text", extra: { text: "Static Text" } }))} className="designer-pill-btn" onClick={() => addItem("text", { text: "Static Text" })}>Add text block</button>
              <button draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ type: "shape" }))} className="designer-pill-btn" onClick={() => addItem("shape")}>Add border block</button>
              <button draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ type: "line" }))} className="designer-pill-btn" onClick={() => addItem("line")}>Add horizontal line</button>
              <button draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ type: "line", extra: { vertical: true } }))} className="designer-pill-btn" onClick={() => addItem("line", { vertical: true })}>Add vertical line</button>
              <button draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ type: "line", extra: { fullWidth: true } }))} className="designer-pill-btn" onClick={() => addItem("line", { fullWidth: true })}>Add break line</button>
              <button draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ type: "image", extra: { bindingKey: "productImageUrl" } }))} className="designer-pill-btn" onClick={() => addItem("image", { bindingKey: "productImageUrl" })}>Add product image</button>
              <button draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ type: "image", extra: { bindingKey: "diagramImageUrl" } }))} className="designer-pill-btn" onClick={() => addItem("image", { bindingKey: "diagramImageUrl" })}>Add diagram image</button>
            </div>

            <h3 style={{ fontSize: "11px", fontWeight: 700, marginTop: "24px", marginBottom: "12px", color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom images</h3>
            <label className="designer-pill-btn" style={{ cursor: 'pointer', textAlign: 'center', display: 'block', background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px dashed var(--accent)' }}>
              Upload Logo
              <input type="file" hidden onChange={handleFileUpload} accept="image/*" />
            </label>
            <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {customImages.map((img, i) => (
                <div 
                  key={i} 
                  className="asset-thumb" 
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ type: "image", extra: { imageUrl: img.imageUrl, label: img.fileName } }))}
                  onClick={() => addItem("image", { imageUrl: img.imageUrl, label: img.fileName })}
                >
                  <img src={withBase(img.imageUrl)} alt="asset" />
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Editor Canvas Workspace ── */}
        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", background: "var(--bg)", overflow: "hidden" }}>
          <header style={{ padding: "12px 24px", borderBottom: "1px solid var(--line)", background: "var(--panel)", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, flexWrap: "wrap" }}>
             <div style={{ flexGrow: 1, minWidth: "200px" }}>
                <p className="eyebrow" style={{ color: 'var(--accent)' }}>WORKSPACE</p>
                <h2 style={{ fontSize: "16px", fontWeight: 700 }}>{selectedLuminaire?.manufacturer || "Product"} {selectedLuminaire?.specCode || ""}</h2>
             </div>
             <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select 
                  value={selectedTemplateId} 
                  onChange={e => handleTemplateChange(e.target.value)}
                  style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: '4px', fontSize: '13px' }}
                >
                  <option value="">New Template</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (Default)" : ""}</option>)}
                </select>
                <input 
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="Name"
                  style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: '4px', fontSize: '13px', width: '150px' }}
                />
                <button className="workspace-action-btn" onClick={() => handleTemplateChange("")}>New</button>
                <button className="primary-button" onClick={handleSave} style={{ alignSelf: 'center', height: '32px', fontSize: '13px' }}>Save</button>
                {selectedTemplateId && !selectedTemplate?.isDefault && (
                  <button className="workspace-action-btn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={confirmDelete}>Delete</button>
                )}
                <button className="primary-button" onClick={handleExport} style={{ alignSelf: 'center', height: '32px', fontSize: '13px', background: 'var(--accent)' }}>Export PDF</button>
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', paddingLeft: '12px', borderLeft: '1px solid var(--line)' }}>
                 <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Zoom: {Math.round(zoom * 100)}%</span>
                 <input type="range" min="0.5" max="2" step="0.1" value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ width: '80px', cursor: 'pointer' }} />
             </div>
          </header>

          <div style={{ flexGrow: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexGrow: 1, background: "var(--bg)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px", overflow: "auto" }}>
               <div 
                  style={{ 
                    width: "595px", height: "842px", background: "#fff", boxShadow: "0 0 20px rgba(0,0,0,0.4)", 
                    position: "relative", flexShrink: 0,
                    backgroundImage: 'linear-gradient(#f0f0f0 1px, transparent 1px), linear-gradient(90deg, #f0f0f0 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top center'
                  }}
                  onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedItemId(null); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const payload = e.dataTransfer.getData("application/json");
                    if (payload) {
                      try {
                        const data = JSON.parse(payload);
                        const rect = e.currentTarget.getBoundingClientRect();
                        addItem(data.type, { ...data.extra, dropX: (e.clientX - rect.left) / zoom, dropY: (e.clientY - rect.top) / zoom });
                      } catch (err) { console.error(err); }
                    }
                  }}
                  onMouseMove={(e) => {
                    if (dragState && selectedItem) {
                      if (dragState.mode === "move") {
                        const rect = e.currentTarget.getBoundingClientRect();
                        updateSelectedItem("x", ((e.clientX - rect.left) / zoom) - dragState.startX);
                        updateSelectedItem("y", ((e.clientY - rect.top) / zoom) - dragState.startY);
                      } else if (dragState.mode === "resize" && dragState.startWidth && dragState.startHeight) {
                        if (selectedItem.type === "line") {
                          // For lines, only resize the LENGTH dimension
                          if (selectedItem.width >= selectedItem.height) {
                            // Horizontal line — drag right/left changes width (length)
                            const newWidth = Math.max(5, dragState.startWidth + ((e.clientX - dragState.startX) / zoom));
                            updateSelectedItem("width", newWidth);
                          } else {
                            // Vertical line — drag up/down changes height (length)
                            const newHeight = Math.max(5, dragState.startHeight + ((e.clientY - dragState.startY) / zoom));
                            updateSelectedItem("height", newHeight);
                          }
                        } else {
                          const newWidth = Math.max(20, dragState.startWidth + ((e.clientX - dragState.startX) / zoom));
                          const newHeight = Math.max(20, dragState.startHeight + ((e.clientY - dragState.startY) / zoom));
                          updateSelectedItem("width", newWidth);
                          updateSelectedItem("height", newHeight);
                        }
                      }
                    }
                  }}
                  onMouseUp={() => setDragState(null)}
                  onMouseLeave={() => setDragState(null)}
                >
                  {currentDesign.items.map(item => {
                    const isSelected = item.id === selectedItemId;
                    let content: React.ReactNode = item.text;
                    if (item.type === "field" && selectedLuminaire) {
                      const val = designerContext[item.bindingKey] ?? (selectedLuminaire as any)[item.bindingKey];
                      const customVal = (selectedLuminaire as any).customData?.[item.bindingKey];
                      content = val || customVal || item.emptyText || `[${item.label}]`;
                    }
                    const isImage = item.type === "image";
                    const isLine = item.type === "line";
                    const url = item.imageUrl || designerContext[item.bindingKey] || (selectedLuminaire && (selectedLuminaire as any)[item.bindingKey]);

                    return (
                      <div
                        key={item.id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedItemId(item.id);
                          const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                          setDragState({ mode: "move", itemId: item.id, startX: ((e.clientX - rect.left) / zoom) - item.x, startY: ((e.clientY - rect.top) / zoom) - item.y });
                        }}
                        style={{
                          position: "absolute", left: item.x, top: item.y, width: item.width, height: item.height,
                          fontSize: item.style.fontSize, color: item.style.color,
                          backgroundColor: isLine ? item.style.backgroundColor : item.style.backgroundColor,
                          border: isSelected ? "2px solid var(--accent)" : (item.style.borderWidth > 0 ? `${item.style.borderWidth}px solid ${item.style.borderColor}` : "none"),
                          padding: isLine ? 0 : item.style.padding,
                          fontWeight: item.style.fontWeight, cursor: "move", display: "flex", overflow: "visible", boxSizing: 'border-box',
                          textAlign: item.style.textAlign || "left",
                          alignItems: item.style.verticalAlign === "top" ? "flex-start" : item.style.verticalAlign === "bottom" ? "flex-end" : "center",
                          userSelect: 'none', ...({"WebkitUserDrag": "none"} as React.CSSProperties),
                        }}
                      >
                        <div style={{
                          width: '100%', height: '100%', overflow: 'hidden',
                          display: 'flex',
                          alignItems: item.style.verticalAlign === "top" ? "flex-start" : item.style.verticalAlign === "bottom" ? "flex-end" : "center",
                          justifyContent: item.style.textAlign === "center" ? "center" : item.style.textAlign === "right" ? "flex-end" : "flex-start",
                        }}>
                            {isLine ? null : isImage && url ? <img src={withBase(url)} draggable={false} onDragStart={e => e.preventDefault()} style={{ width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }} alt="item" /> : content}
                        </div>
                        {isSelected && (
                          <div 
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setDragState({ mode: "resize", itemId: item.id, startX: e.clientX, startY: e.clientY, startWidth: item.width, startHeight: item.height });
                            }}
                            style={{
                              position: 'absolute', width: '12px', height: '12px',
                              background: 'var(--accent)', border: '2px solid #fff', zIndex: 10, borderRadius: '50%',
                              // Position at the END of the line (right for horizontal, bottom for vertical)
                              ...(isLine
                                ? (item.width >= item.height
                                  ? { right: '-6px', top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' }   // horizontal
                                  : { bottom: '-6px', left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' } // vertical
                                )
                                : { bottom: '-4px', right: '-4px', cursor: 'nwse-resize' })
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
            </div>
          </div>
        </div>

        {/* ── Properties (Right) ── */}
        <aside style={{ width: "280px", borderLeft: "1px solid var(--line)", background: "var(--panel)", display: "flex", flexDirection: "column", flexShrink: 0, padding: "20px", overflowY: "auto" }}>
           <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "20px" }}>Item Properties</h3>
           {selectedItem ? (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="prop-row"><label>Type</label><span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{selectedItem.type === 'line' ? 'Line / Divider' : selectedItem.type === 'shape' ? 'Border Block' : selectedItem.type}</span></div>

                {selectedItem.type === "text" && (
                  <div className="prop-row">
                    <label>Content</label>
                    <textarea value={selectedItem.text} onChange={e => updateSelectedItem("text", e.target.value)} style={{ height: '60px', width: '100%', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '4px', padding: '8px', color: 'var(--text)' }} />
                  </div>
                )}

                {/* Position & Size */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="prop-row"><label>X</label><input type="number" value={Math.round(selectedItem.x)} onChange={e => updateSelectedItem("x", Number(e.target.value))} /></div>
                  <div className="prop-row"><label>Y</label><input type="number" value={Math.round(selectedItem.y)} onChange={e => updateSelectedItem("y", Number(e.target.value))} /></div>
                  {selectedItem.type === 'line' ? (
                    <>
                      <div className="prop-row"><label>{selectedItem.width <= selectedItem.height ? 'Thickness' : 'Length'}</label><input type="number" step="0.1" min="0.5" value={selectedItem.width <= selectedItem.height ? Number(selectedItem.width.toFixed(1)) : Math.round(selectedItem.width)} onChange={e => updateSelectedItem("width", Number(e.target.value))} /></div>
                      <div className="prop-row"><label>{selectedItem.height <= selectedItem.width ? 'Thickness' : 'Length'}</label><input type="number" step="0.1" min="0.5" value={selectedItem.height <= selectedItem.width ? Number(selectedItem.height.toFixed(1)) : Math.round(selectedItem.height)} onChange={e => updateSelectedItem("height", Number(e.target.value))} /></div>
                    </>
                  ) : (
                    <>
                      <div className="prop-row"><label>Width</label><input type="number" value={Math.round(selectedItem.width)} onChange={e => updateSelectedItem("width", Number(e.target.value))} /></div>
                      <div className="prop-row"><label>Height</label><input type="number" value={Math.round(selectedItem.height)} onChange={e => updateSelectedItem("height", Number(e.target.value))} /></div>
                    </>
                  )}
                </div>

                {/* Font & text controls — only for field/text */}
                {(selectedItem.type === 'field' || selectedItem.type === 'text') && (
                  <>
                    <div className="prop-row"><label>Font Size</label><input type="number" value={selectedItem.style.fontSize} onChange={e => updateSelectedStyle("fontSize", Number(e.target.value))} /></div>
                    <div className="prop-row"><label>Text Color</label><input type="color" value={selectedItem.style.color || '#111827'} onChange={e => updateSelectedStyle("color", e.target.value)} style={{ height: '44px', width: '100%', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }} /></div>
                    <div className="prop-row"><label>Fill Color</label><input type="color" value={selectedItem.style.backgroundColor === 'transparent' ? '#ffffff' : (selectedItem.style.backgroundColor || '#ffffff')} onChange={e => updateSelectedStyle("backgroundColor", e.target.value)} style={{ height: '44px', width: '100%', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }} /></div>
                  </>
                )}

                {/* Line color — only for line type */}
                {selectedItem.type === 'line' && (
                  <div className="prop-row"><label>Line Color</label><input type="color" value={selectedItem.style.backgroundColor === 'transparent' ? '#000000' : (selectedItem.style.backgroundColor || '#000000')} onChange={e => updateSelectedStyle("backgroundColor", e.target.value)} style={{ height: '44px', width: '100%', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }} /></div>
                )}

                {/* Border controls — only for shape (border block) */}
                {selectedItem.type === 'shape' && (
                  <>
                    <div className="prop-row"><label>Fill Color</label><input type="color" value={selectedItem.style.backgroundColor === 'transparent' ? '#ffffff' : (selectedItem.style.backgroundColor || '#ffffff')} onChange={e => updateSelectedStyle("backgroundColor", e.target.value)} style={{ height: '44px', width: '100%', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }} /></div>
                    <div className="prop-row"><label>Border Color</label><input type="color" value={selectedItem.style.borderColor || '#000000'} onChange={e => updateSelectedStyle("borderColor", e.target.value)} style={{ height: '44px', width: '100%', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }} /></div>
                    <div className="prop-row"><label>Border Width</label><input type="number" step="0.1" min="0.5" max="20" value={Number(selectedItem.style.borderWidth.toFixed(1))} onChange={e => updateSelectedStyle("borderWidth", Math.max(0.5, Number(e.target.value)))} /></div>
                  </>
                )}

                <button className="del-btn" onClick={() => { setCurrentDesign(prev => ({ ...prev, items: prev.items.filter(it => it.id !== selectedItemId) })); setSelectedItemId(null); }}>Delete Element</button>
             </div>
           ) : <p style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>Select an element on canvas.</p>}
        </aside>

      </main>

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteModal && (
        <div 
          className="modal-backdrop" 
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
        >
          <div className="modal" style={{ maxWidth: '400px', height: 'auto', paddingBottom: '32px' }}>
            <button className="close-button" onClick={() => setShowDeleteModal(false)}>✕</button>
            <div className="modal-header">
              <p className="eyebrow" style={{ color: 'var(--danger)' }}>Warning</p>
              <h2>Delete Template</h2>
              <p>Are you sure you want to delete the template <strong>{templateName}</strong>? This action cannot be undone.</p>
            </div>
            <div className="actions" style={{ marginTop: '24px' }}>
              <button className="ghost-button" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button 
                className="primary-button" 
                style={{ background: 'var(--danger)' }} 
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Toast ── */}
      {showToast && (
        <div style={{
          position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--accent)', color: '#000', padding: '12px 24px', borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', fontWeight: 700, zIndex: 9999, fontSize: '14px'
        }}>
          ✅ Template saved successfully!
        </div>
      )}

      <style jsx>{`
        .designer-pill-btn {
          background: var(--button-bg);
          border: 1px solid var(--line);
          color: var(--text);
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          width: 100%;
          transition: all 0.2s ease;
          font-weight: 600;
        }
        .designer-pill-btn:hover { background: var(--button-hover); border-color: var(--accent); transform: translateX(2px); }
        .workspace-action-btn {
          padding: 7px 14px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--line);
          background: var(--bg);
          color: var(--text);
        }
        .workspace-action-btn.primary { background: #238636; color: #fff; border: none; }
        .workspace-action-btn.accent { background: var(--accent); color: #000; border: none; }
        .asset-thumb { height: 60px; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; cursor: pointer; background: var(--bg); }
        .asset-thumb img { width: 100%; height: 100%; object-fit: contain; }
        .prop-row label { display: block; font-size: 11px; color: var(--muted); margin-bottom: 4px; }
        .prop-row input:not([type="color"]) { width: 100%; background: var(--bg); border: 1px solid var(--line); border-radius: 4px; color: var(--text); padding: 8px; font-size: 13px; }
        .prop-row input[type="color"] { width: 100%; height: 44px; padding: 3px; border: 1px solid var(--line); border-radius: 4px; cursor: pointer; background: none; }
        .del-btn { margin-top: 10px; background: rgba(218, 54, 51, 0.1); color: #f85149; border: 1px solid rgba(218, 54, 51, 0.4); padding: 10px; border-radius: 4px; font-size: 13px; cursor: pointer; transition: 0.2s; }
        .del-btn:hover { background: #da3633; color: #fff; }
      `}</style>
    </div>
  );
}
