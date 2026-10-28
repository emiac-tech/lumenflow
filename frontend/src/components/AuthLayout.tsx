"use client";

import React, { useEffect, useState } from "react";

const STEPS = [
  { n: "01", t: "Setup", s: "Your standards." },
  { n: "02", t: "Extract", s: "Data, organised." },
  { n: "03", t: "Review", s: "Your judgement." },
  { n: "04", t: "Deliver", s: "Documents, ready." },
];

export function RiseLockup() {
  return (
    <span className="rise-lockup">
      <span className="rise-word">RISE<b>OS</b></span>
      <span className="rise-lockup-sub">
        for Lighting Workflows
        <small>by RISE with AI</small>
      </span>
    </span>
  );
}

const STEP_MS = 2800;

/** The four workflow steps light up one after another (Setup → Extract → Review → Deliver). */
function WorkflowSteps() {
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

  // The active card's progress bar drives the change: when it fills, the next step lights up.
  // Hovering pauses the bar (CSS animation-play-state), so the timing never jumps.
  const next = () => setActive((i) => (i + 1) % STEPS.length);

  return (
    <div
      className={`rise-auth-steps ${paused ? "paused" : ""}`}
      aria-label="How RISE OS works"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {STEPS.map((st, i) => (
        <button
          type="button"
          key={st.n}
          className={`rise-auth-step ${i === active ? "active" : ""} ${i < active ? "done" : ""}`}
          aria-current={i === active ? "step" : undefined}
          onClick={() => setActive(i)}
        >
          <small>{st.n}</small>
          <b>{st.t}</b>
          <small>{st.s}</small>
          {i === active && !reduceMotion && (
            <span
              className="rise-auth-step-progress"
              style={{ animationDuration: `${STEP_MS}ms` }}
              key={`p-${active}`}
              onAnimationEnd={next}
            />
          )}
        </button>
      ))}
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rise-auth">
      <section className="rise-auth-story">
        <RiseLockup />
        <div>
          <p className="rise-eyebrow">● For lighting design studios</p>
          <h1>
            <span>Design More.</span>
            Admin Less.
          </h1>
          <p className="rise-auth-tag">Your expertise, augmented by AI.</p>
          <p className="rise-auth-copy">
            Bring manufacturer datasheets into a luminaire schedule. Review the details, then create Excel schedules and
            branded specification sheets.
          </p>
        </div>
        <WorkflowSteps />
      </section>
      <section className="rise-auth-panel">
        <div className="rise-auth-card">
          {children}
        </div>
        <p className="rise-auth-foot" style={{ marginTop: 18 }}>RISE OS for Lighting Workflows · RISE with AI</p>
      </section>
    </div>
  );
}
