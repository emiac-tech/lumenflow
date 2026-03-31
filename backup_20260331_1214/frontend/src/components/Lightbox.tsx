"use client";

import React, { useEffect, useRef } from "react";

interface LightboxProps {
  imageUrl: string | null;
  onClose: () => void;
}

export default function Lightbox({ imageUrl, onClose }: LightboxProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!imageUrl) return null;

  return (
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
    </div>
  );
}
