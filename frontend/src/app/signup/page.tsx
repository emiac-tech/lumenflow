"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import AuthLayout from "@/components/AuthLayout";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studioName, setStudioName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

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
          setSuccess(data.message);
          setPassword("");
          setConfirmPassword("");
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
    <AuthLayout>
      <p className="rise-eyebrow">Your beta starts here</p>
      <h2>Make room for your next idea.</h2>
      <p className="rise-auth-desc">Create your RISE OS workspace. New accounts start with 5 PDF extraction credits.</p>

      {success ? (
        <div className="rise-auth-form">
          <div className="rise-auth-msg success" role="status">{success}</div>
          <Link href="/login" className="primary-button rise-auth-submit">
            <span>Go to sign in</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleEmailSignup} className="rise-auth-form">
          {error && <div className="rise-auth-msg error" role="alert">{error}</div>}
          <label className="field">
            <span>Your name</span>
            <input autoComplete="name" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>Email address</span>
            <input type="email" autoComplete="email" placeholder="you@studio.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Business or studio name <em>(optional)</em></span>
            <input autoComplete="organization" placeholder="Your business or studio" value={studioName} onChange={(e) => setStudioName(e.target.value)} />
          </label>
          <div className="field">
            <label htmlFor="rise-password"><span>Create a password</span></label>
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
            <span>Confirm password</span>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Type it again"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="primary-button rise-auth-submit" disabled={loading}>
            <span>{loading ? "Creating your workspace…" : "Create account & open OS"}</span>
            <span aria-hidden>→</span>
          </button>
        </form>
      )}

      <div className="rise-auth-switch">
        Already have an account? <Link href="/login">Sign in →</Link>
      </div>
    </AuthLayout>
  );
}
