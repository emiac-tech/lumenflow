import React from "react";
import { appPath } from "@/utils/basePath";

/** Official RISE OS logo: red head mark + "RISE OS" + "by RISE with AI". */
export default function RiseOsLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`rise-logo rise-logo-${size}`} aria-label="RISE OS by RISE with AI">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rise-logo-mark" src={appPath("/rise-os-mark.png")} alt="" aria-hidden />
      <span className="rise-logo-text" aria-hidden>
        <span className="rise-logo-word">RISE <b>OS</b></span>
        <span className="rise-logo-by">by <b>RISE with AI</b></span>
      </span>
    </span>
  );
}
