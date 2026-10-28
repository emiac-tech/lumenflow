"use client";

import { withBase } from "@/utils/basePath";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ImageCropDialog from "@/components/ImageCropDialog";
import { CustomColumn, Luminaire } from "@/types/luminaire";
import { apiFetch } from "@/utils/api";
import { hasMultipleOptions, MULTI_OPTION_HINT } from "@/utils/options";
import {
  buildVisibleReviewColumns,
  ReviewColumnDef,
  ReviewFieldKey,
  ReviewImageField,
} from "@/utils/reviewColumns";

type ImageValues = Record<ReviewImageField, string | null>;

interface EditLuminaireModalProps {
  item: Luminaire | null;
  onClose: () => void;
  onSaved: () => void;
  projectId?: number | null;
  customColumns?: CustomColumn[];
  columnOrder?: string[];
  hiddenColumns?: string[];
  columnLabels?: Record<string, string>;
}

type FieldValues = Record<ReviewFieldKey, string>;

interface TemplateOption {
  id: number;
  name: string;
  isDefault?: boolean;
}

const EMPTY_FIELDS: FieldValues = {
  type: "",
  manufacturer: "",
  product: "",
  specCode: "",
  description: "",
  colour: "",
  cct: "",
  cri: "",
  unitWatts: "",
  dimming: "",
  quantity: "",
  ipRating: "",
};

export default function EditLuminaireModal({
  item,
  onClose,
  onSaved,
  projectId = null,
  customColumns = [],
  columnOrder = [],
  hiddenColumns = [],
  columnLabels = {},
}: EditLuminaireModalProps) {
  const [fields, setFields] = useState<FieldValues>({ ...EMPTY_FIELDS });
  const [customData, setCustomData] = useState<Record<string, string>>({});
  const [pdfTemplate, setPdfTemplate] = useState("");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<ImageValues>({ productImageUrl: null, diagramImageUrl: null, polarImageUrl: null });
  const [imageBusy, setImageBusy] = useState<ReviewImageField | null>(null);
  const [cropField, setCropField] = useState<ReviewImageField | null>(null);
  const productInput = useRef<HTMLInputElement>(null);
  const diagramInput = useRef<HTMLInputElement>(null);
  const polarInput = useRef<HTMLInputElement>(null);
  const inputFor = (field: ReviewImageField) =>
    field === "productImageUrl" ? productInput : field === "diagramImageUrl" ? diagramInput : polarInput;

  const columns = useMemo(
    () => buildVisibleReviewColumns(customColumns, columnOrder, hiddenColumns, columnLabels),
    [customColumns, columnOrder, hiddenColumns, columnLabels],
  );
  const showTemplate = columns.some((column) => column.readOnlyField === "templatePdf");

  useEffect(() => {
    if (!item) return;
    setFields({
      type: item.type || "",
      manufacturer: item.manufacturer || "",
      product: item.product || "",
      specCode: item.specCode || "",
      description: item.description || "",
      colour: item.colour || "",
      cct: item.cct || "",
      cri: item.cri || "",
      unitWatts: item.unitWatts || "",
      dimming: item.dimming || "",
      quantity: item.quantity || "",
      ipRating: item.ipRating || "",
    });
    setCustomData({ ...(item.customData || {}) });
    setImages({
      productImageUrl: item.productImageUrl || null,
      diagramImageUrl: item.diagramImageUrl || null,
      polarImageUrl: item.polarImageUrl || null,
    });
    setCropField(null);
    setImageBusy(null);
    setPdfTemplate(/^\d+$/.test(String(item.pdfTemplate || "")) ? String(item.pdfTemplate) : "");
    setError("");
  }, [item]);

  useEffect(() => {
    if (!item || !showTemplate || !projectId) return;
    let cancelled = false;
    apiFetch(`/api/templates?project_id=${projectId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setTemplates(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item, showTemplate, projectId]);

  if (!item) return null;

  const imageColumns = columns.filter((column) => column.imageField);
  const descriptionColumn = columns.find((column) => column.field === "description");
  const gridColumns = columns.filter((column) => !column.imageField && column.field !== "description");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = { ...fields, customData };
      (Object.keys(images) as ReviewImageField[]).forEach((field) => {
        if ((images[field] || null) !== (item[field] || null)) body[field] = images[field] || "";
      });
      if (showTemplate && pdfTemplate) body.pdfTemplate = pdfTemplate;
      const res = await apiFetch(`/api/luminaires/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to save luminaire.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save luminaire.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File, field: ReviewImageField) {
    if (!item) return null;
    setError("");
    setImageBusy(field);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch(`/api/luminaires/${item.id}/designer-assets`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.imageUrl !== "string") throw new Error(data.detail || "Failed to upload image.");
      setImages((prev) => ({ ...prev, [field]: data.imageUrl }));
      return data.imageUrl as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image.");
      return null;
    } finally {
      setImageBusy((current) => (current === field ? null : current));
    }
  }

  function renderImage(column: ReviewColumnDef) {
    const field = column.imageField as ReviewImageField;
    const url = images[field];
    const busy = imageBusy === field;
    return (
      <div className="edit-img-box" key={column.key}>
        <p className="eyebrow">{column.label}</p>
        <button
          type="button"
          className="edit-image-trigger"
          onClick={() => (url ? setCropField(field) : inputFor(field).current?.click())}
          disabled={saving || busy}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={withBase(url)} alt={column.label} className="edit-img" />
          ) : (
            <div className="edit-img edit-img-empty">Upload {column.label}</div>
          )}
          <span className="edit-image-hint">{url ? "Click image to crop" : "Click image to upload"}</span>
        </button>
        <div className="edit-image-actions">
          <button
            type="button"
            className="ghost-button edit-image-button"
            onClick={() => inputFor(field).current?.click()}
            disabled={saving || busy}
          >
            {busy ? "Uploading..." : url ? "Replace" : "Upload"}
          </button>
          <button
            type="button"
            className="ghost-button edit-image-button"
            onClick={() => setCropField(field)}
            disabled={!url || saving || busy}
          >
            Crop
          </button>
        </div>
        <input
          ref={inputFor(field)}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) await uploadImage(file, field);
            event.target.value = "";
          }}
        />
      </div>
    );
  }

  function renderGridField(column: ReviewColumnDef) {
    if (column.customColumn) {
      const name = column.customColumn.name;
      const value = customData[name] || "";
      const multi = hasMultipleOptions(value);
      return (
        <label key={column.key} className={`field${multi ? " field-multi-option" : ""}`}>
          <span className="eyebrow">{column.label}</span>
          <input
            type="text"
            className={multi ? "multi-option-input" : undefined}
            title={multi ? MULTI_OPTION_HINT : undefined}
            value={value}
            onChange={(e) => setCustomData((previous) => ({ ...previous, [name]: e.target.value }))}
          />
          {multi && <small className="multi-option-hint">{MULTI_OPTION_HINT}</small>}
        </label>
      );
    }

    if (column.field) {
      const field = column.field;
      const multi = field !== "quantity" && hasMultipleOptions(fields[field]);
      return (
        <label key={column.key} className={`field${multi ? " field-multi-option" : ""}`}>
          <span className="eyebrow">{column.label}</span>
          <input
            type={field === "quantity" ? "number" : "text"}
            className={multi ? "multi-option-input" : undefined}
            title={multi ? MULTI_OPTION_HINT : undefined}
            value={fields[field]}
            onChange={(e) => setFields((previous) => ({ ...previous, [field]: e.target.value }))}
          />
          {multi && <small className="multi-option-hint">{MULTI_OPTION_HINT}</small>}
        </label>
      );
    }

    if (column.readOnlyField === "templatePdf") {
      const projectDefault = templates.find((template) => template.isDefault);
      return (
        <label key={column.key} className="field">
          <span className="eyebrow">{column.label}</span>
          <select
            className="template-select"
            value={pdfTemplate || projectDefault?.id?.toString() || ""}
            onChange={(e) => setPdfTemplate(e.target.value)}
          >
            <option value="">Select Template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.isDefault ? " (Default)" : ""}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (column.readOnlyField === "document") {
      const link = item?.sourceUrl || item?.documentUrl || "";
      return (
        <label key={column.key} className="field">
          <span className="eyebrow">{column.label}</span>
          {link ? (
            <a href={withBase(link)} target="_blank" rel="noreferrer" className="doc-link edit-doc-link">
              {item?.sourceType === "webpage" ? "Open Page" : "Open PDF"}
            </a>
          ) : (
            <input type="text" value="" placeholder="Not available" readOnly />
          )}
        </label>
      );
    }

    return (
      <label key={column.key} className="field">
        <span className="eyebrow">{column.label}</span>
        <input
          type="text"
          value={item?.totalWatts || ""}
          placeholder="Calculated from Unit Watts and Qty"
          title="Calculated from Unit Watts and Qty"
          readOnly
        />
      </label>
    );
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

        <form className="edit-form" onSubmit={handleSubmit}>
          {(imageColumns.length > 0 || descriptionColumn) && (
            <div className="edit-header-row">
              <div className="edit-images-group">{imageColumns.map(renderImage)}</div>
              {descriptionColumn && (
                <label className="field edit-desc">
                  <span>{descriptionColumn.label}</span>
                  <textarea
                    rows={5}
                    placeholder="Product description..."
                    value={fields.description}
                    onChange={(e) => setFields((previous) => ({ ...previous, description: e.target.value }))}
                  />
                </label>
              )}
            </div>
          )}

          <div className="edit-grid">{gridColumns.map(renderGridField)}</div>

          {error && <p className="feedback-error edit-form-feedback">{error}</p>}

          <div className="edit-footer-actions">
            <small className="muted">Showing the {columns.length} columns visible in the table.</small>
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
      <ImageCropDialog
        isOpen={Boolean(cropField)}
        imageUrl={cropField ? images[cropField] : null}
        title={cropField === "diagramImageUrl" ? "Crop Diagram" : cropField === "polarImageUrl" ? "Crop Polar Curve" : "Crop Photo"}
        onClose={() => {
          if (!imageBusy) setCropField(null);
        }}
        onSave={async (blob: Blob) => {
          if (!cropField) return;
          const url = await uploadImage(new File([blob], `${cropField}-crop.png`, { type: "image/png" }), cropField);
          if (url) setCropField(null);
        }}
        saving={Boolean(cropField && imageBusy === cropField)}
      />
    </div>
  );
}
