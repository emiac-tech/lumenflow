"use client";

import React, { useEffect, useState } from "react";
import RiseOsLogo from "@/components/RiseOsLogo";

const STEPS = [
  { t: "Setup", s: "Your standards." },
  { t: "Extract", s: "Data, organised." },
  { t: "Review", s: "Your judgement." },
  { t: "Deliver", s: "Documents, ready." },
];

/** Public RISE OS landing page (used by "Back to RISE OS"). */
export const RISE_LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || "https://risewithai.io";

export function RiseLockup() {
  return <RiseOsLogo size="lg" />;
}

const STEP_MS = 2800;

/** Setup → Extract → Review → Deliver, lit one after another, with a Pause control. */
function WorkflowFlow() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(media.matches);
    const onChange = () => setReduceMotion(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const next = () => setActive((i) => (i + 1) % STEPS.length);
  const moving = !paused && !reduceMotion;

  return (
    <section className={`rise-flow ${moving ? "" : "paused"}`} aria-label="How RISE OS works">
      <ol className="rise-flow-steps">
        {STEPS.map((st, i) => (
          <li key={st.t} className={`rise-flow-step ${i === active ? "active" : ""}`}>
            <button type="button" onClick={() => setActive(i)} aria-current={i === active ? "step" : undefined}>
              <b>{st.t}</b>
              <small>{st.s}</small>
              {i === active && (
                <span
                  className="rise-flow-progress"
                  style={{ animationDuration: `${STEP_MS}ms` }}
                  key={`p-${active}`}
                  onAnimationEnd={next}
                />
              )}
            </button>
            {i < STEPS.length - 1 && <span className="rise-flow-chevron" aria-hidden>›</span>}
          </li>
        ))}
      </ol>
      {!reduceMotion && (
        <button type="button" className="rise-flow-pause" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? "Play" : "Pause"}
        </button>
      )}
    </section>
  );
}

export default function AuthLayout({ story, children }: { story: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rise-auth2">
      <div className="rise-auth2-wrap">
        <header className="rise-auth2-head">
          <RiseLockup />
        </header>
        <WorkflowFlow />
        <div className="rise-auth2-body">
          <section className="rise-auth2-story">{story}</section>
          <section className="rise-auth2-panel">
            <div className="rise-auth-card">{children}</div>
          </section>
        </div>
        <footer className="rise-auth2-foot">RISE OS for Lighting Workflows / RISE with AI</footer>
      </div>
    </div>
  );
}
