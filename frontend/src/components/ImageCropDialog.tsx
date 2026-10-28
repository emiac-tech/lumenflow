"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type CropSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragHandle = "nw" | "ne" | "sw" | "se";

type DragState =
  | {
      mode: "new";
      pointerId: number;
      startX: number;
      startY: number;
      rect: DOMRect;
    }
  | {
      mode: "move";
      pointerId: number;
      startX: number;
      startY: number;
      rect: DOMRect;
      selection: CropSelection;
    }
  | {
      mode: "resize";
      pointerId: number;
      startX: number;
      startY: number;
      rect: DOMRect;
      selection: CropSelection;
      handle: DragHandle;
    };

interface ImageCropDialogProps {
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void>;
  saving?: boolean;
  title: string;
}

const DEFAULT_SELECTION: CropSelection = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

const MIN_SELECTION_SIZE = 0.08;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function ImageCropDialog({
  imageUrl,
  isOpen,
  onClose,
  onSave,
  saving = false,
  title,
}: ImageCropDialogProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<CropSelection>(DEFAULT_SELECTION);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setDragState(null);
      setError("");
      return;
    }
    setSelection(DEFAULT_SELECTION);
    setImageReady(false);
    setError("");
  }, [isOpen, imageUrl]);

  function getPoint(clientX: number, clientY: number, rect: DOMRect) {
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function pointInSelection(x: number, y: number) {
    return (
      x >= selection.x &&
      x <= selection.x + selection.width &&
      y >= selection.y &&
      y <= selection.y + selection.height
    );
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!frameRef.current || !imageReady) return;

    const rect = frameRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const point = getPoint(event.clientX, event.clientY, rect);
    const handle = (event.target as HTMLElement).dataset.handle as DragHandle | undefined;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (handle) {
      setDragState({
        mode: "resize",
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        rect,
        selection,
        handle,
      });
      return;
    }

    if (pointInSelection(point.x, point.y)) {
      setDragState({
        mode: "move",
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        rect,
        selection,
      });
      return;
    }

    setSelection({
      x: point.x,
      y: point.y,
      width: MIN_SELECTION_SIZE,
      height: MIN_SELECTION_SIZE,
    });
    setDragState({
      mode: "new",
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      rect,
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const point = getPoint(event.clientX, event.clientY, dragState.rect);

    if (dragState.mode === "new") {
      const left = clamp(Math.min(dragState.startX, point.x), 0, 1);
      const top = clamp(Math.min(dragState.startY, point.y), 0, 1);
      const right = clamp(Math.max(dragState.startX, point.x), left + MIN_SELECTION_SIZE, 1);
      const bottom = clamp(Math.max(dragState.startY, point.y), top + MIN_SELECTION_SIZE, 1);
      setSelection({
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      });
      return;
    }

    if (dragState.mode === "move") {
      const deltaX = point.x - dragState.startX;
      const deltaY = point.y - dragState.startY;
      const nextX = clamp(dragState.selection.x + deltaX, 0, 1 - dragState.selection.width);
      const nextY = clamp(dragState.selection.y + deltaY, 0, 1 - dragState.selection.height);
      setSelection({
        ...dragState.selection,
        x: nextX,
        y: nextY,
      });
      return;
    }

    const start = dragState.selection;
    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;

    if (dragState.handle.includes("w")) {
      left = clamp(point.x, 0, right - MIN_SELECTION_SIZE);
    }
    if (dragState.handle.includes("e")) {
      right = clamp(point.x, left + MIN_SELECTION_SIZE, 1);
    }
    if (dragState.handle.includes("n")) {
      top = clamp(point.y, 0, bottom - MIN_SELECTION_SIZE);
    }
    if (dragState.handle.includes("s")) {
      bottom = clamp(point.y, top + MIN_SELECTION_SIZE, 1);
    }

    setSelection({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }

  function endPointerDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragState(null);
  }

  async function handleSave() {
    if (!imageRef.current || !imageReady) return;

    try {
      const image = imageRef.current;
      const sx = Math.round(selection.x * image.naturalWidth);
      const sy = Math.round(selection.y * image.naturalHeight);
      const sw = Math.max(1, Math.round(selection.width * image.naturalWidth));
      const sh = Math.max(1, Math.round(selection.height * image.naturalHeight));

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not prepare cropped image.");
      }

      context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (!value) {
            reject(new Error("Could not create cropped image."));
            return;
          }
          resolve(value);
        }, "image/png");
      });

      await onSave(blob);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to crop image.");
    }
  }

  if (!isOpen || !imageUrl) return null;

  // Rendered on <body> so it is never nested inside another modal's blurred
  // backdrop (nested backdrop-filters made the crop dialog look greyed out).
  const dialog = (
    <div
      className="crop-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="crop-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="crop-modal-header">
          <div>
            <p className="eyebrow">{title}</p>
            <h3>Adjust the visible area</h3>
            <p className="muted crop-modal-copy">
              Drag to create a crop, drag inside the box to move it, and use the corners to resize.
            </p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>

        <div className="crop-stage-shell">
          <div className="crop-stage">
            <div
              ref={frameRef}
              className="crop-image-frame"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endPointerDrag}
              onPointerCancel={endPointerDrag}
            >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Crop source"
              className="crop-stage-image"
              onLoad={() => {
                setImageReady(true);
                setSelection(DEFAULT_SELECTION);
              }}
            />
            {imageReady && (
              <div
                className="crop-selection"
                style={{
                  left: `${selection.x * 100}%`,
                  top: `${selection.y * 100}%`,
                  width: `${selection.width * 100}%`,
                  height: `${selection.height * 100}%`,
                }}
              >
                <span className="crop-handle crop-handle-nw" data-handle="nw" />
                <span className="crop-handle crop-handle-ne" data-handle="ne" />
                <span className="crop-handle crop-handle-sw" data-handle="sw" />
                <span className="crop-handle crop-handle-se" data-handle="se" />
              </div>
            )}
            </div>
          </div>
        </div>

        {error && <p className="feedback-error crop-feedback">{error}</p>}

        <div className="crop-modal-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setSelection(DEFAULT_SELECTION)}
            disabled={saving}
          >
            Reset Crop
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleSave}
            disabled={saving || !imageReady}
          >
            {saving ? "Saving..." : "Use Cropped Image"}
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
