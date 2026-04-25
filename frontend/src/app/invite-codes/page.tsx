"use client";

import React, { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/components/AuthContext";
import { apiFetch } from "@/utils/api";

interface InviteCode {
  id: number;
  code: string;
  tokenAmount: number;
  usageLimit: number;
  currentUsage: number;
  isActive: boolean;
  spotsLeft: number;
}

interface UserRecord {
  id: number;
  email: string;
  role: string;
  tokens: number;
  inviteCode: string | null;
  inviteTokenAmount: number | null;
  createdAt: string;
}

const cardStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  padding: "20px 24px",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const badgeStyle = (active: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  padding: "3px 10px",
  borderRadius: "20px",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  background: active ? "rgba(61,216,163,0.12)" : "rgba(255,92,92,0.10)",
  color: active ? "var(--success, #3dd8a3)" : "var(--danger, #ff5c5c)",
  border: `1px solid ${active ? "rgba(61,216,163,0.25)" : "rgba(255,92,92,0.20)"}`,
});

export default function InviteCodesPage() {
  const { user } = useAuth();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create form state
  const [formCode, setFormCode] = useState("");
  const [formTokens, setFormTokens] = useState("");
  const [formLimit, setFormLimit] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Edit invite code
  const [editCode, setEditCode] = useState<InviteCode | null>(null);
  const [editCodeName, setEditCodeName] = useState("");
  const [editTokens, setEditTokens] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Expanded row (show joined users)
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [codesRes, usersRes] = await Promise.all([
        apiFetch("/api/admin/invite-codes"),
        apiFetch("/api/users"),
      ]);
      if (codesRes.ok) {
        const d = await codesRes.json();
        setCodes(d.codes || []);
      }
      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(d.users || []);
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.role !== "admin") {
      setError("Unauthorized access.");
      setLoading(false);
      return;
    }
    if (user?.role === "admin") fetchData();
  }, [user, fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!formCode.trim() || !formTokens || !formLimit) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/admin/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: formCode.trim().toUpperCase(),
          token_amount: parseInt(formTokens),
          usage_limit: parseInt(formLimit),
        }),
      });
      if (res.ok) {
        setSuccess(`Invite code "${formCode.toUpperCase()}" created successfully!`);
        setFormCode("");
        setFormTokens("");
        setFormLimit("");
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Failed to create invite code");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (code: InviteCode) => {
    setError("");
    const res = await apiFetch(`/api/admin/invite-codes/${code.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !code.isActive }),
    });
    if (res.ok) fetchData();
    else setError("Failed to update code");
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    const res = await apiFetch(`/api/admin/invite-codes/${deleteId}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteId(null);
      fetchData();
    } else {
      setError("Failed to delete code");
    }
  };

  function openEdit(c: InviteCode) {
    setEditCode(c);
    setEditCodeName(c.code);
    setEditTokens(c.tokenAmount.toString());
    setEditLimit(c.usageLimit.toString());
    setError("");
    setSuccess("");
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCode) return;
    setEditSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await apiFetch(`/api/admin/invite-codes/${editCode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token_amount: parseInt(editTokens),
          usage_limit: parseInt(editLimit),
        }),
      });
      if (res.ok) {
        setSuccess(`Invite code "${editCodeName}" updated successfully!`);
        setEditCode(null);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Failed to update invite code");
      }
    } catch {
      setError("Network error");
    } finally {
      setEditSaving(false);
    }
  };

  // Get users who joined with a specific code
  const getUsersForCode = (code: string) =>
    users.filter((u) => u.inviteCode === code);

  const totalCodes = codes.length;
  const activeCodes = codes.filter((c) => c.isActive).length;
  const totalJoined = codes.reduce((s, c) => s + c.currentUsage, 0);

  if (loading) {
    return (
      <div className="shell">
        <Sidebar />
        <main className="main" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="muted">Loading invite codes...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Administration</p>
            <h1>Invite Codes</h1>
          </div>
        </header>

        {error && (
          <div style={{
            background: "rgba(255,92,92,0.10)", border: "1px solid rgba(255,92,92,0.20)",
            color: "var(--danger)", padding: "12px 16px", borderRadius: "10px",
            fontSize: 14, marginBottom: 20, fontWeight: 500,
          }}>
            ⚠ {error}
          </div>
        )}
        {success && (
          <div style={{
            background: "rgba(61,216,163,0.10)", border: "1px solid rgba(61,216,163,0.20)",
            color: "var(--success,#3dd8a3)", padding: "12px 16px", borderRadius: "10px",
            fontSize: 14, marginBottom: 20, fontWeight: 500,
          }}>
            ✓ {success}
          </div>
        )}

        {/* ── Summary Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
          <div style={cardStyle}>
            <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Codes</span>
            <span style={{ fontSize: 32, fontWeight: 800, color: "var(--foreground)", lineHeight: 1.1 }}>{totalCodes}</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{activeCodes} active</span>
          </div>
          <div style={cardStyle}>
            <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Users Joined</span>
            <span style={{ fontSize: 32, fontWeight: 800, color: "var(--accent)", lineHeight: 1.1 }}>{totalJoined}</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>via invite codes</span>
          </div>
          <div style={cardStyle}>
            <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Users Table</span>
            <span style={{ fontSize: 32, fontWeight: 800, color: "var(--foreground)", lineHeight: 1.1 }}>{users.length}</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>registered accounts</span>
          </div>
        </div>

        {/* ── Create New Code Form ── */}
        <div style={{ ...cardStyle, marginBottom: 28 }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Create New Code</p>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Generate Invite Code</h2>
          </div>
          <form onSubmit={handleCreate} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
            <label className="field">
              <span>Invite Code</span>
              <input
                type="text"
                placeholder="e.g. PARTNER50"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                required
                style={{ textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "0.08em" }}
              />
            </label>
            <label className="field">
              <span>Credits (Tokens)</span>
              <input
                type="number"
                placeholder="e.g. 100"
                min={1}
                value={formTokens}
                onChange={(e) => setFormTokens(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>User Limit</span>
              <input
                type="number"
                placeholder="Max users who can use this"
                min={1}
                value={formLimit}
                onChange={(e) => setFormLimit(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={creating}
              style={{ height: 42, whiteSpace: "nowrap", marginBottom: 0 }}
            >
              {creating ? "Creating..." : "+ Create Code"}
            </button>
          </form>
        </div>

        {/* ── Codes Table ── */}
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>All Invite Codes</h2>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{codes.length} total</span>
        </div>
        <div className="table-card" style={{ marginBottom: 36 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><div className="th-content">#</div></th>
                  <th><div className="th-content">Code</div></th>
                  <th><div className="th-content">Credits</div></th>
                  <th><div className="th-content">User Limit</div></th>
                  <th><div className="th-content">Joined Users</div></th>
                  <th><div className="th-content">Spots Left</div></th>
                  <th><div className="th-content">Status</div></th>
                  <th><div className="th-content">Actions</div></th>
                </tr>
              </thead>
              <tbody>
                {codes.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">No invite codes yet.</td></tr>
                ) : (
                  codes.map((c) => {
                    const joinedUsers = getUsersForCode(c.code);
                    const isExpanded = expandedId === c.id;
                    const usagePct = Math.round((c.currentUsage / c.usageLimit) * 100);
                    return (
                      <React.Fragment key={c.id}>
                        <tr className="table-row" style={{ cursor: "pointer" }} onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                          <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 12 }}>{c.id}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{
                              fontFamily: "monospace",
                              fontSize: 14,
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              background: "var(--surface-low, rgba(255,255,255,0.05))",
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: "1px solid var(--line)",
                              color: "var(--accent)",
                            }}>{c.code}</span>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>{c.tokenAmount}</span>
                            <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 4 }}>credits</span>
                          </td>
                          <td style={{ padding: "12px 16px", fontWeight: 600 }}>{c.usageLimit}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span style={{ fontWeight: 700 }}>{c.currentUsage} / {c.usageLimit}</span>
                              <div style={{ width: 80, height: 4, borderRadius: 4, background: "var(--line)", overflow: "hidden" }}>
                                <div style={{
                                  height: "100%",
                                  width: `${usagePct}%`,
                                  borderRadius: 4,
                                  background: usagePct >= 100 ? "var(--danger)" : usagePct > 70 ? "#f59e0b" : "var(--accent)",
                                  transition: "width 0.3s ease",
                                }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{
                              fontWeight: 700,
                              color: c.spotsLeft === 0 ? "var(--danger)" : c.spotsLeft < 5 ? "#f59e0b" : "var(--success,#3dd8a3)",
                            }}>{c.spotsLeft}</span>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={badgeStyle(c.isActive && c.spotsLeft > 0)}>
                              {c.isActive && c.spotsLeft > 0 ? "● Active" : c.spotsLeft === 0 ? "✕ Full" : "✕ Disabled"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => openEdit(c)}
                                style={{
                                  padding: "4px 12px", border: "1px solid var(--line)", borderRadius: 6,
                                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                                  background: "var(--accent-soft)", color: "var(--accent)",
                                }}
                              >
                                ✏ Edit
                              </button>
                              <button
                                onClick={() => handleToggleActive(c)}
                                style={{
                                  padding: "4px 12px", border: "1px solid var(--line)", borderRadius: 6,
                                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                                  background: c.isActive ? "rgba(255,92,92,0.08)" : "rgba(61,216,163,0.08)",
                                  color: c.isActive ? "var(--danger)" : "var(--success,#3dd8a3)",
                                }}
                              >
                                {c.isActive ? "Disable" : "Enable"}
                              </button>
                              <button
                                onClick={() => setDeleteId(c.id)}
                                style={{
                                  padding: "4px 12px", border: "1px solid rgba(255,92,92,0.25)", borderRadius: 6,
                                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                                  background: "rgba(255,92,92,0.08)", color: "var(--danger)",
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* ── Expanded: Joined Users ── */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0 }}>
                              <div style={{
                                background: "var(--surface-low, rgba(255,255,255,0.02))",
                                borderTop: "1px solid var(--line)",
                                borderBottom: "1px solid var(--line)",
                                padding: "16px 24px",
                              }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                                  Users who joined with <span style={{ color: "var(--accent)", fontFamily: "monospace" }}>{c.code}</span>
                                </p>
                                {joinedUsers.length === 0 ? (
                                  <p style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>No users have used this code yet.</p>
                                ) : (
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr style={{ borderBottom: "1px solid var(--line)" }}>
                                        <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Email</th>
                                        <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Role</th>
                                        <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Credits Left</th>
                                        <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Joined On</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {joinedUsers.map((u) => (
                                        <tr key={u.id} style={{ borderBottom: "1px solid var(--line)" }}>
                                          <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 500 }}>{u.email}</td>
                                          <td style={{ padding: "8px 12px" }}>
                                            <span style={{
                                              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                                              background: u.role === "admin" ? "var(--accent-soft)" : "rgba(61,216,163,0.12)",
                                              color: u.role === "admin" ? "var(--accent)" : "var(--success,#3dd8a3)",
                                            }}>{u.role}</span>
                                          </td>
                                          <td style={{ padding: "8px 12px", fontSize: 13 }}>
                                            {u.role === "admin" ? (
                                              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "var(--accent-soft)", color: "var(--accent)" }}>∞ Unlimited</span>
                                            ) : (
                                              <>
                                                <span style={{ fontWeight: 700, color: u.tokens === 0 ? "var(--danger)" : "var(--foreground)" }}>{u.tokens}</span>
                                                {u.tokens === 0 && (
                                                  <span style={{ marginLeft: 6, fontSize: 10, background: "var(--danger)", color: "white", padding: "1px 5px", borderRadius: 8, fontWeight: 700 }}>EXPIRED</span>
                                                )}
                                              </>
                                            )}
                                          </td>
                                          <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--muted)" }}>
                                            {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── All Users Table ── */}
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>All Registered Users</h2>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{users.length} users</span>
        </div>
        <div className="table-card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><div className="th-content">ID</div></th>
                  <th><div className="th-content">Email</div></th>
                  <th><div className="th-content">Role</div></th>
                  <th><div className="th-content">Credits Left</div></th>
                  <th><div className="th-content">Invite Code Used</div></th>
                  <th><div className="th-content">Code Credits</div></th>
                  <th><div className="th-content">Registered On</div></th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={7} className="empty-state">No users found.</td></tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="table-row">
                      <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 12 }}>{u.id}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 500 }}>{u.email}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: u.role === "admin" ? "var(--accent-soft)" : "rgba(61,216,163,0.12)",
                          color: u.role === "admin" ? "var(--accent)" : "var(--success,#3dd8a3)",
                        }}>{u.role}</span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {u.role === "admin" ? (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
                            background: "var(--accent-soft)", color: "var(--accent)",
                          }}>∞ Unlimited</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 700, color: u.tokens === 0 ? "var(--danger)" : "var(--foreground)" }}>{u.tokens}</span>
                            {u.tokens === 0 && (
                              <span style={{ fontSize: 9, background: "var(--danger)", color: "white", padding: "1px 5px", borderRadius: 8, fontWeight: 700 }}>EXPIRED</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {u.inviteCode ? (
                          <span style={{
                            fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                            background: "var(--surface-low, rgba(255,255,255,0.05))",
                            padding: "3px 8px", borderRadius: 5, border: "1px solid var(--line)",
                            color: "var(--accent)",
                          }}>{u.inviteCode}</span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 13 }}>
                        {u.inviteTokenAmount != null ? `${u.inviteTokenAmount} credits` : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>
                        {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ── Edit Invite Code Modal ── */}
      {editCode && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditCode(null); }}>
          <div className="modal" style={{ maxWidth: 460, height: "auto", paddingBottom: 32 }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setEditCode(null)}>✕</button>
            <div className="modal-header">
              <p className="eyebrow" style={{ color: "var(--accent)" }}>Edit Invite Code</p>
              <h2 style={{ fontFamily: "monospace", letterSpacing: "0.06em" }}>{editCode.code}</h2>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                {editCode.currentUsage} users joined · {editCode.spotsLeft} spots left
              </p>
            </div>
            <form className="modal-form" onSubmit={handleSaveEdit}>
              <div className="field">
                <span>Credits per Signup</span>
                <input
                  type="number"
                  min={1}
                  value={editTokens}
                  onChange={(e) => setEditTokens(e.target.value)}
                  required
                />
                <small style={{ color: "var(--muted)" }}>Number of credits new users get when they sign up with this code.</small>
              </div>
              <div className="field">
                <span>User Limit</span>
                <input
                  type="number"
                  min={editCode.currentUsage}
                  value={editLimit}
                  onChange={(e) => setEditLimit(e.target.value)}
                  required
                />
                <small style={{ color: "var(--muted)" }}>Max users who can use this code. Min: {editCode.currentUsage} (already joined).</small>
              </div>
              {parseInt(editLimit) < editCode.currentUsage && (
                <p style={{ fontSize: 12, color: "var(--danger)", margin: "4px 0" }}>
                  ⚠ Limit cannot be less than {editCode.currentUsage} (already used)
                </p>
              )}
              {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: "4px 0" }}>⚠ {error}</p>}
              <div className="actions" style={{ marginTop: 20 }}>
                <button type="button" className="ghost-button" onClick={() => setEditCode(null)}>Cancel</button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={editSaving || parseInt(editLimit) < editCode.currentUsage}
                >
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteId !== null && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteId(null); }}>
          <div className="modal" style={{ maxWidth: 400, height: "auto", paddingBottom: 32 }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setDeleteId(null)}>✕</button>
            <div className="modal-header">
              <p className="eyebrow" style={{ color: "var(--danger)" }}>Warning</p>
              <h2>Delete Invite Code</h2>
              <p>Are you sure you want to permanently delete this invite code? Users who already signed up with it will not be affected.</p>
            </div>
            <div className="actions" style={{ marginTop: 24 }}>
              <button className="ghost-button" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="primary-button" style={{ background: "var(--danger)" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
