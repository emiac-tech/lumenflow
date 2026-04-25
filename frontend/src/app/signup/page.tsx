"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import { GoogleLogin } from "@react-oauth/google";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, invite_code: inviteCode }),
      });

      if (res.ok) {
        const data = await res.json();
        login(data.access_token, data.user);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Signup failed");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async (credentialResponse: any) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });

      if (res.ok) {
        const data = await res.json();
        login(data.access_token, data.user);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Google signup failed");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      width: "100%",
      background: "var(--body-bg-gradient)",
      padding: "20px"
    }}>
      <div style={{
        background: "var(--panel)",
        backdropFilter: "blur(12px)",
        border: "1px solid var(--line)",
        padding: "40px",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        width: "100%",
        maxWidth: "420px",
        display: "flex",
        flexDirection: "column",
        gap: "24px"
      }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "28px", fontWeight: "700", marginBottom: "8px" }}>
            Create an account
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>
            Join LumenFlow to start managing your luminaires
          </p>
        </div>

        {error && (
          <div style={{
            background: "rgba(255, 92, 92, 0.1)",
            border: "1px solid rgba(255, 92, 92, 0.2)",
            color: "var(--danger)",
            padding: "12px 16px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "500"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleEmailSignup} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <label className="field">
            <span>Email Address</span>
            <input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Confirm Password</span>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Invite Code</span>
            <input
              type="text"
              placeholder="TRIAL10, PRO100..."
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
            />
          </label>

          <button 
            type="submit" 
            className="primary-button" 
            disabled={loading}
            style={{ width: "100%", marginTop: "8px", justifyContent: "center" }}
          >
            {loading ? "Signing up..." : "Sign up"}
          </button>
        </form>

        <div style={{ position: "relative", textAlign: "center", margin: "8px 0" }}>
          <div style={{ position: "absolute", top: "50%", left: 0, right: 0, borderTop: "1px solid var(--line)", zIndex: 1 }}></div>
          <span style={{ 
            position: "relative", 
            background: "var(--panel)", 
            padding: "0 12px", 
            color: "var(--muted)", 
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            zIndex: 2 
          }}>
            Or sign up with
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <GoogleLogin
            onSuccess={handleGoogleSignup}
            onError={() => setError("Google Signup Failed")}
            theme="filled_black"
          />
        </div>

        <div style={{ textAlign: "center", fontSize: "14px", color: "var(--muted)", marginTop: "16px" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: "600" }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
