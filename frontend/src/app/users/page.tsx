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
}

interface UserRecord {
  id: number;
  email: string;
  role: string;
  tokens: number;
  inviteCode: string | null;
  inviteCodeId: number | null;
  inviteTokenAmount: number | null;
  createdAt: string;
}

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit modal state
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [selectedCodeId, setSelectedCodeId] = useState<string>("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [setTokensAmount, setSetTokensAmount] = useState("");
  const [topUpMode, setTopUpMode] = useState<"topup" | "set">("topup");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, codesRes] = await Promise.all([
        apiFetch("/api/users"),
        apiFetch("/api/admin/invite-codes"),
      ]);
      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(d.users || []);
      }
      if (codesRes.ok) {
        const d = await codesRes.json();
        setInviteCodes(d.codes || []);
      }
    } catch {
      setError("Error connecting to server");
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

  function openEdit(u: UserRecord) {
    setEditUser(u);
    setSelectedCodeId(u.inviteCodeId?.toString() ?? "");
    setTopUpAmount("");
    setSetTokensAmount(u.tokens.toString());
    setTopUpMode("topup");
    setError("");
    setSuccess("");
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const body: Record<string, number> = {};
    if (selectedCodeId) body.invite_code_id = parseInt(selectedCodeId);
    if (topUpMode === "topup" && topUpAmount) body.top_up_tokens = parseInt(topUpAmount);
    if (topUpMode === "set" && setTokensAmount !== "") body.set_tokens = parseInt(setTokensAmount);

    try {
      const res = await apiFetch(`/api/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated: UserRecord = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        setSuccess(`✓ ${updated.email} updated successfully!`);
        setEditUser(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Failed to update user");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="shell">
        <Sidebar />
        <main className="main" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="muted">Loading users...</div>
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
            <h1>Manage Users</h1>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", alignSelf: "flex-end" }}>
            {users.length} registered users
          </div>
        </header>

        {error && (
          <div style={{
            background: "rgba(255,92,92,0.1)", border: "1px solid rgba(255,92,92,0.2)",
            color: "var(--danger)", padding: "12px 16px", borderRadius: "8px",
            fontSize: "14px", marginBottom: "24px",
          }}>{error}</div>
        )}
        {success && (
          <div style={{
            background: "rgba(61,216,163,0.1)", border: "1px solid rgba(61,216,163,0.2)",
            color: "var(--success,#3dd8a3)", padding: "12px 16px", borderRadius: "8px",
            fontSize: "14px", marginBottom: "24px",
          }}>{success}</div>
        )}

        <div className="table-card" style={{ marginTop: 28 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><div className="th-content">ID</div></th>
                  <th><div className="th-content">Email</div></th>
                  <th><div className="th-content">Role</div></th>
                  <th><div className="th-content">Credits Left</div></th>
                  <th><div className="th-content">Invite Code</div></th>
                  <th><div className="th-content">Code Credits</div></th>
                  <th><div className="th-content">Registered On</div></th>
                  <th><div className="th-content">Actions</div></th>
                </tr>
              </thead>
              <tbody>
                {users.length > 0 ? (
                  users.map((u) => (
                    <tr key={u.id} className="table-row">
                      <td style={{ padding: 12, color: "var(--muted)", fontSize: 12 }}>{u.id}</td>
                      <td style={{ padding: 12, fontWeight: 500 }}>{u.email}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: u.role === "admin" ? "var(--accent-soft)" : "rgba(61,216,163,0.12)",
                          color: u.role === "admin" ? "var(--accent)" : "var(--success,#3dd8a3)",
                        }}>{u.role}</span>
                      </td>
                      <td style={{ padding: 12 }}>
                        {u.role === "admin" ? (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
                            background: "var(--accent-soft)", color: "var(--accent)",
                          }}>∞ Unlimited</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 700, color: u.tokens === 0 ? "var(--danger)" : "var(--foreground)" }}>
                              {u.tokens}
                            </span>
                            {u.tokens === 0 && (
                              <span style={{
                                fontSize: 9, background: "var(--danger)", color: "white",
                                padding: "1px 5px", borderRadius: 8, fontWeight: 700,
                              }}>EXPIRED</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>
                        {u.inviteCode ? (
                          <span style={{
                            fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                            background: "var(--surface-low,rgba(255,255,255,0.05))",
                            padding: "3px 8px", borderRadius: 5,
                            border: "1px solid var(--line)", color: "var(--accent)",
                          }}>{u.inviteCode}</span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>
                        {u.inviteTokenAmount != null ? `${u.inviteTokenAmount} credits` : "—"}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "var(--muted)" }}>
                        {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ padding: 12 }}>
                        {u.role === "client" && (
                          <button
                            onClick={() => openEdit(u)}
                            style={{
                              padding: "5px 14px", border: "1px solid var(--line)", borderRadius: 6,
                              fontSize: 12, fontWeight: 600, cursor: "pointer",
                              background: "var(--accent-soft)", color: "var(--accent)",
                            }}
                          >
                            ✏ Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="empty-state">No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ── Edit User Modal ── */}
      {editUser && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditUser(null); }}>
          <div className="modal" style={{ maxWidth: 480, height: "auto", paddingBottom: 32 }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setEditUser(null)}>✕</button>

            <div className="modal-header">
              <p className="eyebrow" style={{ color: "var(--accent)" }}>Edit User</p>
              <h2>{editUser.email}</h2>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Current credits: <strong style={{ color: "var(--foreground)" }}>{editUser.tokens}</strong>
                {editUser.inviteCode && (
                  <> &nbsp;·&nbsp; Code: <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>{editUser.inviteCode}</span></>
                )}
              </p>
            </div>

            <form className="modal-form" onSubmit={handleSaveEdit}>

              {/* Invite Code Change */}
              <div className="field">
                <span>Change Invite Code</span>
                <select
                  value={selectedCodeId}
                  onChange={(e) => setSelectedCodeId(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--foreground)", fontSize: 13 }}
                >
                  <option value="">— Keep current code —</option>
                  {inviteCodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} ({c.tokenAmount} credits, {c.usageLimit - c.currentUsage} spots left)
                    </option>
                  ))}
                </select>
                <small style={{ color: "var(--muted)" }}>Changing the code does not automatically update credits.</small>
              </div>

              {/* Credit Top-Up */}
              <div className="field">
                <span>Credit Action</span>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setTopUpMode("topup")}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${topUpMode === "topup" ? "var(--accent)" : "var(--line)"}`,
                      background: topUpMode === "topup" ? "var(--accent-soft)" : "transparent",
                      color: topUpMode === "topup" ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    + Add Credits
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopUpMode("set")}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${topUpMode === "set" ? "var(--accent)" : "var(--line)"}`,
                      background: topUpMode === "set" ? "var(--accent-soft)" : "transparent",
                      color: topUpMode === "set" ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    = Set Exact Credits
                  </button>
                </div>

                {topUpMode === "topup" ? (
                  <>
                    <input
                      type="number"
                      min={1}
                      placeholder="e.g. 50  (will add to existing balance)"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                    />
                    {topUpAmount && (
                      <small style={{ color: "var(--success,#3dd8a3)", fontWeight: 600 }}>
                        {editUser.tokens} + {topUpAmount} = {editUser.tokens + parseInt(topUpAmount || "0")} credits
                      </small>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      min={0}
                      placeholder="Set credits to exact amount"
                      value={setTokensAmount}
                      onChange={(e) => setSetTokensAmount(e.target.value)}
                    />
                    <small style={{ color: "var(--muted)" }}>This will replace the current balance.</small>
                  </>
                )}
              </div>

              {error && (
                <p style={{ color: "var(--danger)", fontSize: 13, margin: "4px 0" }}>⚠ {error}</p>
              )}

              <div className="actions" style={{ marginTop: 20 }}>
                <button type="button" className="ghost-button" onClick={() => setEditUser(null)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
