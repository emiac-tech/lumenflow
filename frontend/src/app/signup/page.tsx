"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import AuthLayout, { RISE_LANDING_URL } from "@/components/AuthLayout";

const BETA_CREDITS = 20;
const BETA_DAYS = 15;

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studioName, setStudioName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ credits: number; days: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: name.trim() || undefined,
          studio_name: studioName.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.requires_activation) {
          setPending({ credits: data.creditAllowance ?? BETA_CREDITS, days: data.creditDays ?? BETA_DAYS });
          setPassword("");
        } else {
          login(data.access_token, data.user);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Signup failed");
      }
    } catch (err) {
      console.error(err);
      setError("We could not reach RISE OS. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      story={
        <>
          <h1 className="rise-auth2-kicker-headline">
            <span>Design More.</span>
            Admin Less.
          </h1>
          <p className="rise-auth-tag">Your expertise, augmented by AI.</p>
        </>
      }
    >
      {pending ? (
        <div className="rise-auth-confirm" role="status">
          <p className="rise-eyebrow">You&apos;re on the list</p>
          <h2>Thanks for joining the RISE OS beta.</h2>
          <p className="rise-auth-desc">
            Your account has been created and is awaiting activation. We&apos;ll email you when your workspace is ready.
          </p>
          <div className="rise-auth-allowance">
            Once activated, you&apos;ll receive {pending.credits} free product extraction credits, valid for {pending.days} days.
          </div>
          <a href={RISE_LANDING_URL} className="primary-button rise-auth-submit">
            <span>Back to RISE OS</span>
            <span aria-hidden>→</span>
          </a>
        </div>
      ) : (
        <>
          <p className="rise-eyebrow">Start your free beta</p>
          <h2>Create your RISE OS workspace.</h2>
          <p className="rise-auth-desc">
            Get {BETA_CREDITS} free product extraction credits, valid for {BETA_DAYS} days from account activation.
          </p>

          <form onSubmit={handleEmailSignup} className="rise-auth-form">
            {error && <div className="rise-auth-msg error" role="alert">{error}</div>}
            <label className="field">
              <span>Full name</span>
              <input autoComplete="name" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Email address</span>
              <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <small className="rise-auth-hint">Personal emails are welcome.</small>
            </label>
            <div className="field">
              <label htmlFor="rise-password"><span>Password</span></label>
              <div className="rise-pw">
                <input
                  id="rise-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Choose a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <label className="field">
              <span>Business or studio name <em>(optional)</em></span>
              <input autoComplete="organization" placeholder="Your business or studio" value={studioName} onChange={(e) => setStudioName(e.target.value)} />
            </label>
            <button type="submit" className="primary-button rise-auth-submit" disabled={loading}>
              <span>{loading ? "Creating your workspace…" : "Start my free beta"}</span>
              <span aria-hidden>→</span>
            </button>
            <p className="rise-auth-note">Access begins once your account is activated.</p>
          </form>
        </>
      )}

      {!pending && (
        <div className="rise-auth-switch">
          Already have an account? <Link href="/login">Sign in →</Link>
        </div>
      )}
    </AuthLayout>
  );
}
