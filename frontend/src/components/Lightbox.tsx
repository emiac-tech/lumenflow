"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface LightboxProps {
  imageUrl: string | null;
  onClose: () => void;
}

export default function Lightbox({ imageUrl, onClose }: LightboxProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!imageUrl || !mounted) return null;

  return createPortal(
    <div
      className="lightbox"
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <button className="close-button lightbox-close" onClick={onClose}>✕</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="Preview" className="lightbox-img" />
    </div>,
    document.body
  );
}
