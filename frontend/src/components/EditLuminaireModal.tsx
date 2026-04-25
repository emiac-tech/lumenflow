"use client";

import React, { useState, useEffect } from "react";
import { Luminaire } from "@/types/luminaire";
import { apiFetch } from "@/utils/api";

interface EditLuminaireModalProps {
  item: Luminaire | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditLuminaireModal({
  item,
  onClose,
  onSaved,
}: EditLuminaireModalProps) {
  const [fields, setFields] = useState({
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
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setFields({
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
        quantity: item.quantity || "",
        totalWatts: item.totalWatts || "",
      });
    }
  }, [item]);

  if (!item) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setSaving(true);
    try {
      await apiFetch(`/api/luminaires/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>✕</button>

        <div className="modal-header" style={{ marginBottom: "20px" }}>
          <p className="eyebrow">Edit Luminaire</p>
          <h2>Review & Update Details</h2>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Images + Description */}
          <div className="edit-header-row">
            <div className="edit-img-box">
              <p className="eyebrow">Photo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.productImageUrl || ""} alt="Product" className="edit-img" />
            </div>
            <div className="edit-img-box">
              <p className="eyebrow">Diagram</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.diagramImageUrl || ""} alt="Diagram" className="edit-img" />
            </div>
            <label className="field edit-desc">
              <span>Description</span>
              <textarea
                rows={5}
                placeholder="Product description..."
                value={fields.description}
                onChange={(e) => setFields((p) => ({ ...p, description: e.target.value }))}
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
              ] as [keyof typeof fields, string][]
            ).map(([key, label]) => (
              <label key={key} className="field">
                <span className="eyebrow">{label}</span>
                <input
                  type={key === "quantity" ? "number" : "text"}
                  value={fields[key]}
                  onChange={(e) =>
                    setFields((p) => ({ ...p, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>

          {/* Footer */}
          <div className="edit-footer-actions">
            <div />
            <div className="actions">
              <button type="button" className="ghost-button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
