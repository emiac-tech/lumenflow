"use client";

import React, { useState, useRef } from "react";
import { ImportResponse, Luminaire } from "@/types/luminaire";
import { apiFetch } from "@/utils/api";
import { useAuth } from "./AuthContext";

type ModalState = "upload" | "processing" | "edit";

interface AddLuminaireModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  project_id: number | null;
}

const EMPTY_FIELDS = {
  manufacturer: "",
  product: "",
  specCode: "",
  colour: "",
  cct: "",
  cri: "",
  ipRating: "",
  unitWatts: "",
  dimming: "",
  type: "",
  description: "",
  quantity: "",
  totalWatts: "",
};

export default function AddLuminaireModal({
  isOpen,
  onClose,
  onComplete,
  project_id,
}: AddLuminaireModalProps) {
  const { user, refreshUser } = useAuth();
  const [state, setState] = useState<ModalState>("upload");
  const [urlText, setUrlText] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Edit queue state
  const [editQueue, setEditQueue] = useState<Luminaire[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editFields, setEditFields] = useState(EMPTY_FIELDS);
  const [editProductImg, setEditProductImg] = useState<string | null>(null);
  const [editDiagramImg, setEditDiagramImg] = useState<string | null>(null);
  const [editPolarImg, setEditPolarImg] = useState<string | null>(null);

  function resetToUpload() {
    setState("upload");
    setError("");
    setEditQueue([]);
    setCurrentIndex(0);
    if (fileRef.current) fileRef.current.value = "";
  }

  function loadEditItem(items: Luminaire[], index: number) {
    const item = items[index];
    setState("edit");
    setEditProductImg(item.productImageUrl);
    setEditDiagramImg(item.diagramImageUrl);
    setEditPolarImg(item.polarImageUrl ?? null);
    setEditFields({
      manufacturer: item.manufacturer || "",
      product: item.product || "",
      specCode: item.specCode || "",
      colour: item.colour || "",
      cct: item.cct || "",
      cri: item.cri || "",
      ipRating: item.ipRating || "",
      unitWatts: item.unitWatts || "",
      dimming: item.dimming || "",
      type: item.type || "",
      description: item.description || "",
      quantity: item.quantity || "1",
      totalWatts: item.totalWatts || "",
    });
  }

  async function handleSubmitUpload(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Count how many items are being submitted
    const fileCount = fileRef.current?.files?.length ?? 0;
    const urlCount = urlText.split("\n").map(u => u.trim()).filter(Boolean).length;
    const totalItems = fileCount + urlCount;

    // Client-side token guard for non-admin users
    if (user?.role === "client" && (user?.tokens ?? 0) < totalItems) {
      setError(
        `Insufficient credits. You have ${user?.tokens ?? 0} credit(s) but are trying to import ${totalItems} PDF(s). Please reduce the number of imports or contact your administrator.`
      );
      return;
    }

    setState("processing");

    const formData = new FormData();
    const files = fileRef.current?.files;
    if (files) {
      for (const file of files) formData.append("files", file);
    }

    const urls = urlText
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    formData.append("urls", JSON.stringify(urls));

    try {
      const res = await apiFetch(`/api/luminaires/import?project_id=${project_id}`, {
        method: "POST",
        body: formData,
      });
      const data: ImportResponse = await res.json();
      if (!res.ok) throw new Error((data as { detail?: string }).detail || "Upload failed.");

      // Refresh token count in sidebar after successful import
      await refreshUser();

      if (data.created.length > 0) {
        setEditQueue(data.created);
        setCurrentIndex(0);
        loadEditItem(data.created, 0);
      } else {
        const failMsg = data.failures.length
          ? ` Failures: ${data.failures.map((f) => `${f.source}: ${f.error}`).join(" | ")}`
          : "";
        setError(`0 items created.${failMsg}`);
        resetToUpload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      resetToUpload();
    }
  }

  async function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    const item = editQueue[currentIndex];

    try {
      await apiFetch(`/api/luminaires/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFields),
      });
    } catch (err) {
      console.error("Failed to save edit", err);
    }

    const next = currentIndex + 1;
    if (next < editQueue.length) {
      setCurrentIndex(next);
      loadEditItem(editQueue, next);
    } else {
      onClose();
      resetToUpload();
      onComplete();
    }
  }

  function handleEditBack() {
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      setCurrentIndex(prev);
      loadEditItem(editQueue, prev);
    } else {
      resetToUpload();
    }
  }

  function handleClose() {
    onClose();
    resetToUpload();
  }

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className={`modal ${state === "edit" ? "modal-wide" : ""}`}>
        <button className="close-button" onClick={handleClose}>
          ✕
        </button>

        {/* ─── Upload State ─── */}
        {state === "upload" && (
          <div>
            <div className="modal-header">
              <p className="eyebrow">Add Luminaire</p>
              <h2>Choose how you want to add documents</h2>
              <p>
                Upload 1 to 20 PDFs, paste direct PDF URLs, or mix both in the
                same batch.
              </p>
              {/* Credits badge — only for client users */}
              {user?.role === "client" && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  marginTop: 10, padding: "6px 12px", borderRadius: 20,
                  background: (user?.tokens ?? 0) === 0 ? "rgba(255,92,92,0.10)" : "rgba(61,216,163,0.10)",
                  border: `1px solid ${(user?.tokens ?? 0) === 0 ? "rgba(255,92,92,0.25)" : "rgba(61,216,163,0.25)"}`,
                  fontSize: 12, fontWeight: 700,
                  color: (user?.tokens ?? 0) === 0 ? "var(--danger)" : "var(--success, #3dd8a3)",
                }}>
                  🪙 {user?.tokens ?? 0} credits remaining
                  {(user?.tokens ?? 0) === 0 && " — Contact admin to top up"}
                </div>
              )}
            </div>
            <form className="modal-form" onSubmit={handleSubmitUpload}>

              <label className="field">
                <span>Upload PDF files</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  disabled={user?.role === "client" && (user?.tokens ?? 0) === 0}
                />
                <small>Use Ctrl/Cmd select for multiple files. Each PDF costs 1 credit.</small>
              </label>
              <label className="field">
                <span>PDF URLs</span>
                <textarea
                  rows={5}
                  placeholder="One PDF URL per line"
                  value={urlText}
                  onChange={(e) => setUrlText(e.target.value)}
                  disabled={user?.role === "client" && (user?.tokens ?? 0) === 0}
                />
                <small>Paste up to 20 direct PDF URLs. Each URL costs 1 credit.</small>
              </label>
              {error && <p className="feedback-error">{error}</p>}
              <div className="actions">
                <button type="button" className="ghost-button" onClick={handleClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={user?.role === "client" && (user?.tokens ?? 0) === 0}
                >
                  Process Documents
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── Processing State ─── */}
        {state === "processing" && (
          <div className="processing-state">
            <div className="spinner" />
            <h2>Processing documents...</h2>
            <p className="muted">Extracting metadata and images with Vision AI.</p>
          </div>
        )}

        {/* ─── Edit State ─── */}
        {state === "edit" && (
          <form className="edit-form" onSubmit={handleSubmitEdit}>
            {/* Images + Description row */}
            <div className="edit-header-row">
              <div className="edit-img-box">
                <p className="eyebrow">Photo</p>
                {editProductImg ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={editProductImg}
                    alt="Product"
                    className="edit-img"
                  />
                ) : (
                  <div className="edit-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--muted)', fontSize: '12px', border: '1px dashed var(--line)' }}>No Photo</div>
                )}
              </div>
              <div className="edit-img-box">
                <p className="eyebrow">Diagram</p>
                {editDiagramImg ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={editDiagramImg}
                    alt="Diagram"
                    className="edit-img"
                  />
                ) : (
                  <div className="edit-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--muted)', fontSize: '12px', border: '1px dashed var(--line)' }}>No Diagram</div>
                )}
              </div>
              <div className="edit-img-box">
                <p className="eyebrow">Polar Curve</p>
                {editPolarImg ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={editPolarImg}
                    alt="Polar Curve"
                    className="edit-img"
                  />
                ) : (
                  <div className="edit-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--muted)', fontSize: '12px', border: '1px dashed var(--line)' }}>No Polar Curve</div>
                )}
              </div>
              <label className="field edit-desc">
                <span>Description</span>
                <textarea
                  rows={5}
                  placeholder="Product description..."
                  value={editFields.description}
                  onChange={(e) =>
                    setEditFields((p) => ({ ...p, description: e.target.value }))
                  }
                />
              </label>
            </div>

            {/* Fields grid */}
            <div className="edit-grid">
              {(
                [
                  ["manufacturer", "Manufacturer"],
                  ["product", "Product"],
                  ["specCode", "Spec Code"],
                  ["colour", "Colour"],
                  ["cct", "CCT"],
                  ["cri", "CRI"],
                  ["ipRating", "IP Rating"],
                  ["unitWatts", "Watts"],
                  ["dimming", "Dimming"],
                  ["type", "Fitting Type"],
                  ["quantity", "Quantity"],
                  ["totalWatts", "Total Watts"],
                ] as [keyof typeof EMPTY_FIELDS, string][]
              ).map(([key, label]) => (
                <label key={key} className="field">
                  <span className="eyebrow">{label}</span>
                  <input
                    type={key === "quantity" ? "number" : "text"}
                    value={editFields[key]}
                    onChange={(e) =>
                      setEditFields((p) => ({ ...p, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
            </div>

            {/* Footer */}
            <div className="edit-footer-actions">
              <small className="muted">
                {currentIndex + 1} of {editQueue.length} items to review
              </small>
              <div className="actions">
                <button type="button" className="ghost-button" onClick={handleEditBack}>
                  ← Back
                </button>
                <button type="submit" className="primary-button">
                  {currentIndex + 1 < editQueue.length
                    ? "Save & Next →"
                    : "+ Add Luminaire"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
