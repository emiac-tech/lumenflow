"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import AuthLayout from "@/components/AuthLayout";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      if (res.ok) {
        const data = await res.json();
        login(data.access_token, data.user);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Login failed");
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
      variant="login"
      story={
        <>
          <p className="rise-eyebrow">Design More. Admin Less.</p>
          <h1 className="rise-auth2-headline">
            Lighting workflow automation.
            <span>Built around your studio.</span>
          </h1>
          <p className="rise-auth-tag">Your expertise, augmented by AI.</p>
          <ul className="rise-auth2-priorities">
            <li>Your templates.</li>
            <li>Your workflow.</li>
            <li>Your data requirements.</li>
          </ul>
        </>
      }
    >
      <p className="rise-eyebrow rise-desktop-only">Welcome back</p>
      <h2>
        <span className="rise-desktop-only">Back to your design work.</span>
        <span className="rise-mobile-only">Welcome back.</span>
      </h2>
      <p className="rise-auth-desc">Sign in to your RISE OS workspace.</p>

      <form onSubmit={handleEmailLogin} className="rise-auth-form">
        {error && <div className="rise-auth-msg error" role="alert">{error}</div>}
        <label className="field">
          <span>Email address</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <div className="field">
          <label htmlFor="rise-password"><span>Password</span></label>
          <div className="rise-pw">
            <input
              id="rise-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <button type="submit" className="primary-button rise-auth-submit" disabled={loading}>
          <span>{loading ? "Signing in…" : "Sign in"}</span>
          <span aria-hidden>→</span>
        </button>
      </form>

      <div className="rise-auth-switch">
        New to RISE OS? <Link href="/signup">Create an account →</Link>
      </div>
    </AuthLayout>
  );
}
