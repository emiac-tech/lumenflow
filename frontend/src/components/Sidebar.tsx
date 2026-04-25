"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useBrand } from "./BrandContext";
import { useProjects } from "./ProjectContext";
import { useTemplates } from "./TemplateContext";
import { useAuth } from "./AuthContext";
import ThemeToggle from "./ThemeToggle";
import { Search, LayoutTemplate, Settings, ChevronDown, ChevronRight, Check, Users, LogOut, Pencil, Coins, Ticket, Trash2 } from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { companyName } = useBrand();
  const { projects, activeProjectId, setActiveProjectId, addProject, renameProject, deleteProject } = useProjects();
  const { templates, selectedTemplateId, setSelectedTemplateId, createTemplate, renameTemplate } = useTemplates();

  // ── Project state ──
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [editingProject, setEditingProject] = useState<{ id: number; name: string } | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<{ id: number; name: string } | null>(null);

  // ── Template state ──
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templatesExpanded, setTemplatesExpanded] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<{ id: number; name: string } | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");

  const handleOpenAddTemplate = () => {
    // Pre-select active project
    setSelectedProjectIds(activeProjectId ? [activeProjectId] : []);
    setNewTemplateName("");
    setShowAddTemplate(true);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await addProject(newProjectName);
    setNewProjectName("");
    setShowAddProject(false);
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim() || !selectedProjectIds.length) return;
    const tpl = await createTemplate(newTemplateName.trim(), selectedProjectIds);
    setNewTemplateName("");
    setShowAddTemplate(false);
    if (tpl) {
      router.push("/templates");
    }
  };

  const handleRenameProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !editProjectName.trim()) return;
    await renameProject(editingProject.id, editProjectName.trim());
    setEditingProject(null);
    setEditProjectName("");
  };

  const handleDeleteProject = async () => {
    if (!confirmDeleteProject) return;

    const deleted = await deleteProject(confirmDeleteProject.id);
    if (deleted) {
      if (editingProject?.id === confirmDeleteProject.id) {
        setEditingProject(null);
        setEditProjectName("");
      }
      setConfirmDeleteProject(null);
    }
  };

  const handleRenameTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate || !editTemplateName.trim()) return;
    await renameTemplate(editingTemplate.id, editTemplateName.trim());
    setEditingTemplate(null);
    setEditTemplateName("");
  };

  const toggleProjectForTemplate = (id: number) => {
    setSelectedProjectIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleSelectProject = (id: number) => {
    setActiveProjectId(id);
    // Navigate to home (project view) from wherever we are
    router.push("/");
  };

  const handleSelectTemplate = (id: number) => {
    setSelectedTemplateId(id.toString());
    router.push("/templates");
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const showProjectSearch = projects.length > 10;
  const showTemplateSearch = templates.length > 10;

  return (
    <>
      <aside className="sidebar" style={{ display: "flex", flexDirection: "column", gap: 0, padding: "20px 0 16px" }}>
        {/* Brand */}
        <div style={{ padding: "0 18px 16px" }}>
          <div className="brand">{companyName}</div>
        </div>

        {/* Scrollable nav area */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, minHeight: 0 }}>

          {/* ── Projects Section ── */}
          <div className="sidebar-section">
            <div
              className="sidebar-section-header"
              onClick={() => setProjectsExpanded(v => !v)}
              role="button"
              tabIndex={0}
            >
              <span>Projects</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  className="sidebar-pill-btn"
                  onClick={e => { e.stopPropagation(); setShowAddProject(true); }}
                  title="New Project"
                >+ New</button>
                {projectsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            </div>

            {projectsExpanded && (
              <div className="sidebar-list-container">
                {showProjectSearch && (
                  <div className="sidebar-search">
                    <Search size={12} className="sidebar-search-icon" />
                    <input
                      placeholder="Search projects…"
                      value={projectSearch}
                      onChange={e => setProjectSearch(e.target.value)}
                    />
                  </div>
                )}
                <div className={`sidebar-list ${projects.length > 10 ? "sidebar-list-scroll" : ""}`}>
                  {filteredProjects.length === 0 ? (
                    <p className="sidebar-empty">No projects found</p>
                  ) : (
                    filteredProjects.map(p => (
                      <button
                        key={p.id}
                        className={`sidebar-list-item ${activeProjectId === p.id ? "active" : ""}`}
                        onClick={() => handleSelectProject(p.id)}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                          <line x1="1" y1="5" x2="15" y2="5" stroke="currentColor" strokeWidth="1.2"/>
                          <line x1="5" y1="5" x2="5" y2="15" stroke="currentColor" strokeWidth="1.2"/>
                        </svg>
                        <span className="sidebar-item-label">{p.name}</span>
                        <span className="sidebar-item-actions">
                          <span
                            className="sidebar-item-action danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteProject({ id: p.id, name: p.name });
                            }}
                            title="Delete project"
                          >
                            <Trash2 size={12} />
                          </span>
                          <span
                            className="sidebar-item-action"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProject({ id: p.id, name: p.name });
                              setEditProjectName(p.name);
                            }}
                            title="Edit project name"
                          >
                            <Pencil size={12} />
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Templates Section ── */}
          <div className="sidebar-section">
            <div
              className="sidebar-section-header"
              onClick={() => setTemplatesExpanded(v => !v)}
              role="button"
              tabIndex={0}
            >
              <span>Templates</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  className="sidebar-pill-btn"
                  onClick={e => { e.stopPropagation(); handleOpenAddTemplate(); }}
                  title="New Template"
                >+ New</button>
                {templatesExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            </div>

            {templatesExpanded && (
              <div className="sidebar-list-container">
                {showTemplateSearch && (
                  <div className="sidebar-search">
                    <Search size={12} className="sidebar-search-icon" />
                    <input
                      placeholder="Search templates…"
                      value={templateSearch}
                      onChange={e => setTemplateSearch(e.target.value)}
                    />
                  </div>
                )}
                <div className={`sidebar-list ${templates.length > 10 ? "sidebar-list-scroll" : ""}`}>
                  {!activeProjectId ? (
                    <p className="sidebar-empty">Select a project first</p>
                  ) : filteredTemplates.length === 0 ? (
                    <p className="sidebar-empty">No templates yet</p>
                  ) : (
                    filteredTemplates.map(t => (
                      <button
                        key={t.id}
                        className={`sidebar-list-item ${selectedTemplateId === t.id.toString() ? "active" : ""}`}
                        onClick={() => handleSelectTemplate(t.id)}
                      >
                        <LayoutTemplate size={14} style={{ flexShrink: 0 }} />
                        <span className="sidebar-item-label">{t.name}</span>
                        <span
                          className="sidebar-item-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTemplate({ id: t.id, name: t.name });
                            setEditTemplateName(t.name);
                          }}
                          title="Edit template name"
                        >
                          <Pencil size={12} />
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Other nav items ── */}
          <div style={{ padding: "8px 10px 0", flex: 1 }}>
            {user?.role === "admin" && (
              <>
                <Link href="/settings" className={`nav-item ${pathname === "/settings" ? "active" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                  <Settings size={15} /> Configuration
                </Link>
                <Link href="/users" className={`nav-item ${pathname === "/users" ? "active" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                  <Users size={15} /> Users
                </Link>
                <Link href="/invite-codes" className={`nav-item ${pathname === "/invite-codes" ? "active" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                  <Ticket size={15} /> Invite Codes
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Bottom */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Show credits only for client users */}
          {user?.role === "client" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--foreground)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Coins size={14} style={{ color: "var(--accent)" }} />
                <span>{user?.tokens ?? 0} Credits</span>
              </div>
              {(user?.tokens ?? 0) === 0 && (
                <span style={{ fontSize: "10px", background: "var(--danger)", color: "white", padding: "2px 6px", borderRadius: "10px", fontWeight: "700" }}>
                  EXPIRED
                </span>
              )}
            </div>
          )}
          
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "12px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "130px" }}>
              {user?.email}
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <ThemeToggle />
              <button onClick={logout} title="Logout" style={{ 
                 background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "flex" 
              }}>
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── New Project Modal ── */}
      {showAddProject && (
        <div className="modal-backdrop" onMouseDown={() => setShowAddProject(false)}>
          <div className="modal" style={{ maxWidth: "400px", height: "auto" }} onMouseDown={e => e.stopPropagation()}>
            <button className="close-button" onClick={() => setShowAddProject(false)}>✕</button>
            <div className="modal-header">
              <h2>New Project</h2>
              <p>Enter a name for your new lighting project workspace.</p>
            </div>
            <form onSubmit={handleCreateProject} className="modal-form">
              <div className="field">
                <span>Project Name</span>
                <input
                  autoFocus
                  placeholder="e.g. 5th Ave Office"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                />
              </div>
              <div className="actions">
                <button type="button" className="ghost-button" onClick={() => setShowAddProject(false)}>Cancel</button>
                <button type="submit" className="primary-button">Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingProject && (
        <div className="modal-backdrop" onMouseDown={() => setEditingProject(null)}>
          <div className="modal" style={{ maxWidth: "400px", height: "auto" }} onMouseDown={e => e.stopPropagation()}>
            <button className="close-button" onClick={() => setEditingProject(null)}>✕</button>
            <div className="modal-header">
              <h2>Edit Project</h2>
              <p>Update the project name shown in the sidebar and workspace.</p>
            </div>
            <form onSubmit={handleRenameProject} className="modal-form">
              <div className="field">
                <span>Project Name</span>
                <input
                  autoFocus
                  value={editProjectName}
                  onChange={e => setEditProjectName(e.target.value)}
                />
              </div>
              <div className="actions">
                <button type="button" className="ghost-button" onClick={() => setEditingProject(null)}>Cancel</button>
                <button type="submit" className="primary-button">Save Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeleteProject && (
        <div className="modal-backdrop" onMouseDown={() => setConfirmDeleteProject(null)}>
          <div className="modal" style={{ maxWidth: "400px", height: "auto" }} onMouseDown={e => e.stopPropagation()}>
            <button className="close-button" onClick={() => setConfirmDeleteProject(null)}>✕</button>
            <div className="modal-header">
              <h2>Delete Project</h2>
              <p>
                Delete <strong>{confirmDeleteProject.name}</strong>? This will remove its luminaires, templates,
                settings, and other project data.
              </p>
            </div>
            <div className="actions">
              <button type="button" className="ghost-button" onClick={() => setConfirmDeleteProject(null)}>Cancel</button>
              <button type="button" className="ghost-button danger-button" onClick={handleDeleteProject}>
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Template Modal ── */}
      {showAddTemplate && (
        <div className="modal-backdrop" onMouseDown={() => setShowAddTemplate(false)}>
          <div className="modal" style={{ maxWidth: "420px", height: "auto" }} onMouseDown={e => e.stopPropagation()}>
            <button className="close-button" onClick={() => setShowAddTemplate(false)}>✕</button>
            <div className="modal-header">
              <p className="eyebrow" style={{ color: "var(--accent)" }}>Template Builder</p>
              <h2>New Template</h2>
              <p>Create a blank template and assign it to one or more projects.</p>
            </div>
            <form onSubmit={handleCreateTemplate} className="modal-form">
              <div className="field">
                <span>Template Name</span>
                <input
                  autoFocus
                  placeholder="e.g. Spec Sheet"
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                />
              </div>

              {/* Project selector */}
              <div className="field">
                <span>Assign to Project(s)</span>
                <div className="project-checklist">
                  {projects.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>No projects available</p>
                  ) : (
                    projects.map(p => {
                      const checked = selectedProjectIds.includes(p.id);
                      return (
                        <label key={p.id} className={`project-check-item ${checked ? "checked" : ""}`}>
                          <span className="project-check-box">
                            {checked && <Check size={12} strokeWidth={3} />}
                          </span>
                          <input
                            type="checkbox"
                            hidden
                            checked={checked}
                            onChange={() => toggleProjectForTemplate(p.id)}
                          />
                          {p.name}
                        </label>
                      );
                    })
                  )}
                </div>
                {selectedProjectIds.length === 0 && (
                  <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>
                    Select at least one project
                  </p>
                )}
              </div>

              <div className="actions">
                <button type="button" className="ghost-button" onClick={() => setShowAddTemplate(false)}>Cancel</button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={!newTemplateName.trim() || selectedProjectIds.length === 0}
                >
                  Create Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingTemplate && (
        <div className="modal-backdrop" onMouseDown={() => setEditingTemplate(null)}>
          <div className="modal" style={{ maxWidth: "420px", height: "auto" }} onMouseDown={e => e.stopPropagation()}>
            <button className="close-button" onClick={() => setEditingTemplate(null)}>✕</button>
            <div className="modal-header">
              <h2>Edit Template</h2>
              <p>Update the template name used in the template list and designer.</p>
            </div>
            <form onSubmit={handleRenameTemplate} className="modal-form">
              <div className="field">
                <span>Template Name</span>
                <input
                  autoFocus
                  value={editTemplateName}
                  onChange={e => setEditTemplateName(e.target.value)}
                />
              </div>
              <div className="actions">
                <button type="button" className="ghost-button" onClick={() => setEditingTemplate(null)}>Cancel</button>
                <button type="submit" className="primary-button">Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
