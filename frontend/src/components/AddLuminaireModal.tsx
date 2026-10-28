"use client";

import { withBase } from "@/utils/basePath";
import React, { useRef, useState } from "react";
import ImageCropDialog from "@/components/ImageCropDialog";
import { useAuth } from "@/components/AuthContext";
import { CustomColumn, ImportResponse, Luminaire } from "@/types/luminaire";
import { apiFetch } from "@/utils/api";
import { hasMultipleOptions, MULTI_OPTION_HINT } from "@/utils/options";

type ModalState = "upload" | "processing" | "edit";
type ImageField = "productImageUrl" | "diagramImageUrl" | "polarImageUrl";

interface AddLuminaireModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  project_id: number | null;
  customColumns: CustomColumn[];
  columnOrder: string[];
  hiddenColumns: string[];
  columnLabels: Record<string, string>;
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
};

type EditableFieldKey = keyof typeof EMPTY_FIELDS;
type ReviewImageField = ImageField;

interface ReviewColumn {
  key: string;
  label: string;
  field?: EditableFieldKey;
  imageField?: ReviewImageField;
  customColumn?: CustomColumn;
  readOnlyField?: "totalWatts" | "document" | "templatePdf";
}

const BASE_REVIEW_COLUMNS: ReviewColumn[] = [
  { key: "type", label: "Type", field: "type" },
  { key: "photo", label: "Photo", imageField: "productImageUrl" },
  { key: "diagram", label: "Diagram", imageField: "diagramImageUrl" },
  { key: "polar", label: "Polar Curve", imageField: "polarImageUrl" },
  { key: "manufacturer", label: "Manufacturer", field: "manufacturer" },
  { key: "product", label: "Product", field: "product" },
  { key: "specCode", label: "Spec Code", field: "specCode" },
  { key: "description", label: "Description", field: "description" },
  { key: "colour", label: "Colour", field: "colour" },
  { key: "cct", label: "CCT", field: "cct" },
  { key: "cri", label: "CRI", field: "cri" },
  { key: "unitWatts", label: "Unit Watts", field: "unitWatts" },
  { key: "dimming", label: "Dimming", field: "dimming" },
  { key: "quantity", label: "Qty", field: "quantity" },
  { key: "ipRating", label: "IP Rating", field: "ipRating" },
  { key: "totalWatts", label: "Total Watts", readOnlyField: "totalWatts" },
  { key: "document", label: "Document", readOnlyField: "document" },
  { key: "templatePdf", label: "Template PDF", readOnlyField: "templatePdf" },
];

const LUMINAIRE_REF_ALIASES = new Set([
  "luminaireref",
  "luminairereference",
]);

function normalizeFieldName(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function deriveLuminaireRefFromSourceName(sourceName: string | null) {
  if (!sourceName) return "";
  const rawName = sourceName.split("?")[0].split("#")[0].split("/").pop() || sourceName;
  const nameParts = rawName.split(".");
  if (nameParts.length > 1) nameParts.pop();
  return nameParts.join(".").trim();
}

function findLuminaireRefFieldName(
  customColumns: CustomColumn[],
  customData?: Record<string, string>,
) {
  const customDataKey = Object.keys(customData || {}).find((key) =>
    LUMINAIRE_REF_ALIASES.has(normalizeFieldName(key)),
  );
  if (customDataKey) return customDataKey;

  return (
    customColumns.find((column) =>
      LUMINAIRE_REF_ALIASES.has(normalizeFieldName(column.name)),
    )?.name || null
  );
}

export default function AddLuminaireModal({
  isOpen,
  onClose,
  onComplete,
  project_id,
  customColumns,
  columnOrder,
  hiddenColumns,
  columnLabels,
}: AddLuminaireModalProps) {
  const { refreshUser } = useAuth();
  const [state, setState] = useState<ModalState>("upload");
  const [urlText, setUrlText] = useState("");
  const [error, setError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const productImageRef = useRef<HTMLInputElement>(null);
  const diagramImageRef = useRef<HTMLInputElement>(null);
  const polarImageRef = useRef<HTMLInputElement>(null);

  // Edit queue state
  const [editQueue, setEditQueue] = useState<Luminaire[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editFields, setEditFields] = useState(EMPTY_FIELDS);
  const [editCustomData, setEditCustomData] = useState<Record<string, string>>({});
  const [luminaireRefFieldName, setLuminaireRefFieldName] = useState<string | null>(null);
  const [editLuminaireRef, setEditLuminaireRef] = useState("");
  const [editProductImg, setEditProductImg] = useState<string | null>(null);
  const [editDiagramImg, setEditDiagramImg] = useState<string | null>(null);
  const [editPolarImg, setEditPolarImg] = useState<string | null>(null);
  const [imageBusyField, setImageBusyField] = useState<ImageField | null>(null);
  const [cropTargetField, setCropTargetField] = useState<ImageField | null>(null);

  const visibleReviewColumns = React.useMemo(() => {
    const baseColumns = BASE_REVIEW_COLUMNS.map((column) => ({
      ...column,
      label: columnLabels[column.key] || column.label,
    }));
    const customColumnDefinitions: ReviewColumn[] = customColumns.map((column) => ({
      key: `custom:${column.id}`,
      label: column.name,
      customColumn: column,
    }));
    const allColumns = [...baseColumns, ...customColumnDefinitions];
    const columnMap = new Map(allColumns.map((column) => [column.key, column]));
    const seen = new Set<string>();
    const orderedColumns: ReviewColumn[] = [];

    for (const key of columnOrder) {
      if (seen.has(key)) continue;
      const column = columnMap.get(key);
      if (!column) continue;
      seen.add(key);
      orderedColumns.push(column);
    }

    for (const column of allColumns) {
      if (seen.has(column.key)) continue;
      seen.add(column.key);
      orderedColumns.push(column);
    }

    const hidden = new Set(hiddenColumns);
    // Template PDF is chosen in the table, never in the review popup.
    return orderedColumns.filter(
      (column) => !hidden.has(column.key) && column.key !== "templatePdf",
    );
  }, [columnLabels, columnOrder, customColumns, hiddenColumns]);

  function resetToUpload(nextError = "") {
    setState("upload");
    setUrlText("");
    setError(nextError);
    setEditSaving(false);
    setDiscarding(false);
    setImageBusyField(null);
    setCropTargetField(null);
    setEditQueue([]);
    setCurrentIndex(0);
    setEditFields({ ...EMPTY_FIELDS });
    setEditCustomData({});
    setLuminaireRefFieldName(null);
    setEditLuminaireRef("");
    setEditProductImg(null);
    setEditDiagramImg(null);
    setEditPolarImg(null);
    if (fileRef.current) fileRef.current.value = "";
    if (productImageRef.current) productImageRef.current.value = "";
    if (diagramImageRef.current) diagramImageRef.current.value = "";
    if (polarImageRef.current) polarImageRef.current.value = "";
  }

  function loadEditItem(items: Luminaire[], index: number) {
    const item = items[index];
    const nextLuminaireRefFieldName = findLuminaireRefFieldName(customColumns, item.customData);
    const nextCustomData = { ...(item.customData || {}) };
    if (nextLuminaireRefFieldName) {
      nextCustomData[nextLuminaireRefFieldName] =
        deriveLuminaireRefFromSourceName(item.sourceName) ||
        nextCustomData[nextLuminaireRefFieldName] ||
        "";
    }
    setState("edit");
    setLuminaireRefFieldName(nextLuminaireRefFieldName);
    setEditLuminaireRef(
      nextLuminaireRefFieldName
        ? deriveLuminaireRefFromSourceName(item.sourceName) ||
            item.customData?.[nextLuminaireRefFieldName] ||
            ""
        : "",
    );
    setEditCustomData(nextCustomData);
    setEditProductImg(item.productImageUrl);
    setEditDiagramImg(item.diagramImageUrl);
    setEditPolarImg(item.polarImageUrl);
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
    });
  }

  function getImageRef(field: ImageField) {
    if (field === "productImageUrl") return productImageRef;
    if (field === "diagramImageUrl") return diagramImageRef;
    return polarImageRef;
  }

  function getImageValue(field: ImageField) {
    if (field === "productImageUrl") return editProductImg;
    if (field === "diagramImageUrl") return editDiagramImg;
    return editPolarImg;
  }

  function setImageValue(field: ImageField, value: string | null) {
    if (field === "productImageUrl") {
      setEditProductImg(value);
      return;
    }
    if (field === "diagramImageUrl") {
      setEditDiagramImg(value);
      return;
    }
    setEditPolarImg(value);
  }

  async function uploadReplacementImage(file: File, field: ImageField) {
    const item = editQueue[currentIndex];
    if (!item) return null;

    setError("");
    setImageBusyField(field);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await apiFetch(`/api/luminaires/${item.id}/designer-assets`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Failed to upload image.");
      }

      if (typeof data.imageUrl !== "string" || !data.imageUrl) {
        throw new Error("Image upload completed, but no image URL was returned.");
      }

      setImageValue(field, data.imageUrl);
      return data.imageUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image.");
      return null;
    } finally {
      setImageBusyField((current) => (current === field ? null : current));
    }
  }

  function openImagePicker(field: ImageField) {
    if (editSaving) return;
    getImageRef(field).current?.click();
  }

  async function handleImageUpload(
    event: React.ChangeEvent<HTMLInputElement>,
    field: ImageField,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadReplacementImage(file, field);
    event.target.value = "";
  }

  async function handleCropSave(blob: Blob) {
    if (!cropTargetField) return;
    const nextUrl = await uploadReplacementImage(
      new File([blob], `${cropTargetField}-crop.png`, { type: "image/png" }),
      cropTargetField,
    );
    if (nextUrl) {
      setCropTargetField(null);
    }
  }

  async function handleSubmitUpload(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
      await refreshUser();

      if (data.created.length > 0) {
        setEditQueue(data.created);
        setCurrentIndex(0);
        loadEditItem(data.created, 0);
      } else {
        const failMsg = data.failures.length
          ? ` Failures: ${data.failures.map((f) => `${f.source}: ${f.error}`).join(" | ")}`
          : "";
        resetToUpload(`0 items created.${failMsg}`);
      }
    } catch (err) {
      resetToUpload(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    const item = editQueue[currentIndex];
    if (!item) return;

    setError("");
    setEditSaving(true);

    const nextCustomData = {
      ...(item.customData || {}),
      ...editCustomData,
      ...(luminaireRefFieldName
        ? { [luminaireRefFieldName]: editLuminaireRef.trim() }
        : {}),
    };

    const nextItem: Luminaire = {
      ...item,
      ...editFields,
      customData: nextCustomData,
      productImageUrl: editProductImg,
      diagramImageUrl: editDiagramImg,
      polarImageUrl: editPolarImg,
    };

    try {
      const res = await apiFetch(`/api/luminaires/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editFields,
          customData: nextCustomData,
          productImageUrl: editProductImg,
          diagramImageUrl: editDiagramImg,
          polarImageUrl: editPolarImg,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Failed to save luminaire.");
      }

      const nextQueue = editQueue.map((entry, index) =>
        index === currentIndex ? nextItem : entry,
      );
      setEditQueue(nextQueue);

      const next = currentIndex + 1;
      if (next < nextQueue.length) {
        setCurrentIndex(next);
        loadEditItem(nextQueue, next);
      } else {
        onClose();
        resetToUpload();
        onComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save luminaire.");
    } finally {
      setEditSaving(false);
    }
  }

  async function discardImportedQueue() {
    if (!editQueue.length) return;

    setDiscarding(true);
    const rowsToDelete = [...editQueue];

    try {
      await Promise.allSettled(
        rowsToDelete.map((item) =>
          apiFetch(`/api/luminaires/${item.id}`, {
            method: "DELETE",
          }),
        ),
      );
      onClose();
      resetToUpload();
      onComplete();
    } catch {
      onClose();
      resetToUpload();
      onComplete();
    }
  }

  function handleEditBack() {
    if (editSaving || imageBusyField || discarding) return;

    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      setCurrentIndex(prev);
      loadEditItem(editQueue, prev);
    } else {
      void discardImportedQueue();
    }
  }

  function handleClose() {
    if (state === "edit" && editQueue.length > 0) {
      if (editSaving || imageBusyField || discarding) return;
      void discardImportedQueue();
      return;
    }

    onClose();
    resetToUpload();
  }

  function renderEditableImage(field: ImageField, label: string, imageUrl: string | null) {
    const hasImage = Boolean(imageUrl);
    const isBusy = imageBusyField === field;

    return (
      <div className="edit-img-box">
        <p className="eyebrow">{label}</p>
        <button
          type="button"
          className="edit-image-trigger"
          onClick={() => {
            if (hasImage) {
              setCropTargetField(field);
            } else {
              openImagePicker(field);
            }
          }}
          disabled={editSaving || discarding || isBusy}
        >
          {hasImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={withBase(imageUrl || "")} alt={label} className="edit-img" />
          ) : (
            <div className="edit-img edit-img-empty">Upload {label}</div>
          )}
          <span className="edit-image-hint">
            {hasImage ? "Click image to crop" : "Click image to upload"}
          </span>
        </button>
        <div className="edit-image-actions">
          <button
            type="button"
            className="ghost-button edit-image-button"
            onClick={() => openImagePicker(field)}
            disabled={editSaving || discarding || isBusy}
          >
            {isBusy ? "Uploading..." : hasImage ? "Replace" : "Upload"}
          </button>
          <button
            type="button"
            className="ghost-button edit-image-button"
            onClick={() => setCropTargetField(field)}
            disabled={!hasImage || editSaving || discarding || isBusy}
          >
            Crop
          </button>
        </div>
        <input
          ref={getImageRef(field)}
          type="file"
          hidden
          accept="image/*"
          onChange={(event) => handleImageUpload(event, field)}
        />
      </div>
    );
  }

  function renderReviewImage(column: ReviewColumn, _item: Luminaire) {
    if (column.imageField) {
      return (
        <React.Fragment key={column.key}>
          {renderEditableImage(
            column.imageField,
            column.label,
            getImageValue(column.imageField),
          )}
        </React.Fragment>
      );
    }

    return (
      <div className="edit-img-box" key={column.key}>
        <p className="eyebrow">{column.label}</p>
        <div className="edit-img edit-img-empty">Not available</div>
      </div>
    );
  }

  function getReadOnlyValue(column: ReviewColumn, item: Luminaire) {
    switch (column.readOnlyField) {
      case "totalWatts":
        return item.totalWatts || "";
      case "document":
        return item.sourceName || item.sourceUrl || item.documentUrl || "";
      case "templatePdf":
        return item.pdfTemplate || "";
      default:
        return "";
    }
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
                Upload 1 to 20 PDFs, paste PDF links or manufacturer product
                page links, or mix both in the same batch.
              </p>
            </div>
            <form className="modal-form" onSubmit={handleSubmitUpload}>
              <label className="field">
                <span>Upload PDF files</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                />
                <small>Use Ctrl/Cmd select for multiple files.</small>
              </label>
              <label className="field">
                <span>PDF or product page URLs</span>
                <textarea
                  rows={5}
                  placeholder="One URL per line (PDF link or product web page)"
                  value={urlText}
                  onChange={(e) => setUrlText(e.target.value)}
                />
                <small>Paste up to 20 links. Product pages are read directly; if a page has no usable data, its linked datasheet PDF is used.</small>
              </label>
              {error && <p className="feedback-error">{error}</p>}
              <div className="actions">
                <button type="button" className="ghost-button" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
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
            {(visibleReviewColumns.some((column) => column.imageField) ||
              visibleReviewColumns.some((column) => column.field === "description")) && (
              <div className="edit-header-row">
                <div className="edit-images-group">
                  {visibleReviewColumns
                    .filter((column) => column.imageField)
                    .map((column) => renderReviewImage(column, editQueue[currentIndex]))}
                </div>
                {visibleReviewColumns
                  .filter((column) => column.field === "description")
                  .map((column) => (
                    <label className="field edit-desc" key={column.key}>
                      <span>{column.label}</span>
                      <textarea
                        rows={5}
                        placeholder="Product description..."
                        value={editFields.description}
                        onChange={(e) =>
                          setEditFields((p) => ({ ...p, description: e.target.value }))
                        }
                      />
                    </label>
                  ))}
              </div>
            )}

            <div className="edit-grid">
              {visibleReviewColumns
                .filter((column) => !column.imageField && column.field !== "description")
                .map((column) => {
                  if (column.customColumn) {
                    const columnName = column.customColumn.name;
                    const isLuminaireRef = columnName === luminaireRefFieldName;
                    const customValue = isLuminaireRef
                      ? editLuminaireRef
                      : editCustomData[columnName] || "";
                    const customMulti = !isLuminaireRef && hasMultipleOptions(customValue);
                    return (
                      <label key={column.key} className={`field${customMulti ? " field-multi-option" : ""}`}>
                        <span className="eyebrow">{column.label}</span>
                        <input
                          type="text"
                          className={customMulti ? "multi-option-input" : undefined}
                          title={customMulti ? MULTI_OPTION_HINT : undefined}
                          value={customValue}
                          onChange={(e) => {
                            if (isLuminaireRef) {
                              setEditLuminaireRef(e.target.value);
                            } else {
                              setEditCustomData((previous) => ({
                                ...previous,
                                [columnName]: e.target.value,
                              }));
                            }
                          }}
                        />
                        {customMulti && <small className="multi-option-hint">{MULTI_OPTION_HINT}</small>}
                      </label>
                    );
                  }

                  if (column.field) {
                    const field = column.field;
                    const fieldMulti = field !== "quantity" && hasMultipleOptions(editFields[field]);
                    return (
                      <label key={column.key} className={`field${fieldMulti ? " field-multi-option" : ""}`}>
                        <span className="eyebrow">{column.label}</span>
                        <input
                          type={field === "quantity" ? "number" : "text"}
                          className={fieldMulti ? "multi-option-input" : undefined}
                          title={fieldMulti ? MULTI_OPTION_HINT : undefined}
                          value={editFields[field]}
                          onChange={(e) =>
                            setEditFields((previous) => ({
                              ...previous,
                              [field]: e.target.value,
                            }))
                          }
                        />
                        {fieldMulti && <small className="multi-option-hint">{MULTI_OPTION_HINT}</small>}
                      </label>
                    );
                  }

                  return (
                    <label key={column.key} className="field">
                      <span className="eyebrow">{column.label}</span>
                      <input
                        type="text"
                        value={getReadOnlyValue(column, editQueue[currentIndex])}
                        placeholder="Not available"
                        readOnly
                      />
                    </label>
                  );
                })}
            </div>

            {error && <p className="feedback-error edit-form-feedback">{error}</p>}

            <div className="edit-footer-actions">
              <small className="muted">
                {currentIndex + 1} of {editQueue.length} items to review
              </small>
              <div className="actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleEditBack}
                  disabled={editSaving || discarding || Boolean(imageBusyField)}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={editSaving || discarding || Boolean(imageBusyField)}
                >
                  {editSaving || discarding
                    ? discarding
                      ? "Discarding..."
                      : "Saving..."
                    : currentIndex + 1 < editQueue.length
                      ? "Save & Next →"
                      : "+ Add Luminaire"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      <ImageCropDialog
        isOpen={Boolean(cropTargetField)}
        imageUrl={cropTargetField ? getImageValue(cropTargetField) : null}
        title={
          cropTargetField === "diagramImageUrl"
            ? "Crop Diagram"
            : cropTargetField === "polarImageUrl"
              ? "Crop Polar Curve"
              : "Crop Photo"
        }
        onClose={() => {
          if (!imageBusyField) setCropTargetField(null);
        }}
        onSave={handleCropSave}
        saving={Boolean(cropTargetField && imageBusyField === cropTargetField)}
      />
    </div>
  );
}
