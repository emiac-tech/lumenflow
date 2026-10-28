"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crop, ImageUp } from "lucide-react";
import ImageCropDialog from "./ImageCropDialog";

interface LightboxProps {
  imageUrl: string | null;
  onClose: () => void;
  /** Optional label, e.g. "Photo", "Diagram", "Polar Curve". */
  title?: string;
  /** Upload a replacement; resolve with the new image URL (or null on failure). */
  onReplace?: (file: File) => Promise<string | null>;
}

export default function Lightbox({ imageUrl, onClose, title, onReplace }: LightboxProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [current, setCurrent] = useState<string | null>(imageUrl);
  const [cropping, setCropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCurrent(imageUrl);
    setMessage("");
    setCropping(false);
  }, [imageUrl]);

  useEffect(() => {
    setMounted(true);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !cropping && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, cropping, busy]);

  if (!imageUrl || !current || !mounted) return null;

  const replaceWith = async (file: File, done: string) => {
    if (!onReplace) return null;
    setBusy(true);
    setMessage("");
    const next = await onReplace(file);
    setBusy(false);
    if (next) {
      setCurrent(next);
      setMessage(done);
    } else {
      setMessage("Could not update the image. Use a PNG, JPG or WebP file.");
    }
    return next;
  };

  return createPortal(
    <>
      <div
        className="lightbox"
        ref={backdropRef}
        onClick={(e) => {
          if (e.target === backdropRef.current && !busy) onClose();
        }}
      >
        <button className="close-button lightbox-close" onClick={onClose} disabled={busy} aria-label="Close">✕</button>
        <div className="lightbox-stack" onClick={(e) => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current} alt={title || "Preview"} className="lightbox-img" />
          {onReplace && (
            <div className="lightbox-toolbar">
              {title && <span className="lightbox-title">{title}</span>}
              <button type="button" className="ghost-button" onClick={() => setCropping(true)} disabled={busy}>
                <Crop size={15} /> Crop
              </button>
              <button type="button" className="ghost-button" onClick={() => fileRef.current?.click()} disabled={busy}>
                <ImageUp size={15} /> {busy ? "Saving…" : "Change image"}
              </button>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) await replaceWith(file, "Image changed and saved.");
                }}
              />
              {message && <span className="lightbox-msg" role="status">{message}</span>}
            </div>
          )}
        </div>
      </div>
      <ImageCropDialog
        isOpen={cropping}
        imageUrl={current}
        title={`Crop ${title || "image"}`}
        onClose={() => {
          if (!busy) setCropping(false);
        }}
        onSave={async (blob: Blob) => {
          const next = await replaceWith(new File([blob], "crop.png", { type: "image/png" }), "Cropped image saved.");
          if (next) setCropping(false);
        }}
        saving={busy}
      />
    </>,
    document.body,
  );
}
