"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Diamond, LayoutGrid, FileText, Users, Ticket } from "lucide-react";
import { useAuth } from "./AuthContext";

type NavItem = { href: string; label: string; icon: React.ReactNode; match: string[] };

const WORKSPACE_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: <House size={17} />, match: ["/"] },
  { href: "/setup", label: "Setup", icon: <Diamond size={16} />, match: ["/setup", "/settings", "/templates"] },
  { href: "/projects", label: "Projects", icon: <LayoutGrid size={16} />, match: ["/projects", "/schedule", "/print"] },
  { href: "/documents", label: "Documentation", icon: <FileText size={16} />, match: ["/documents"] },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/users", label: "Users", icon: <Users size={16} />, match: ["/users"] },
  { href: "/invite-codes", label: "Invite codes", icon: <Ticket size={16} />, match: ["/invite-codes"] },
];

function isActive(pathname: string, item: NavItem) {
  return item.match.some((m) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`)));
}

/**
 * RISE OS chrome. Renders the full-width header and the left workspace
 * navigation as two grid children of `.shell`, so every existing page that
 * uses <div className="shell"><Sidebar /><main/></div> gets the new layout.
 */
export default function Sidebar() {
  const pathname = usePathname() || "/";
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const tokens = user?.tokens ?? 0;
  const displayName = user?.name || user?.email || "";

  const renderNav = (items: NavItem[]) => (
    <nav className="rise-side-nav">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={isActive(pathname, item) ? "page" : undefined}>
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      <header className="rise-top">
        <Link href="/" className="rise-lockup" aria-label="RISE OS for Lighting Workflows, by RISE with AI">
          <span className="rise-word">
            RISE<b>OS</b>
          </span>
          <span className="rise-lockup-sub">
            for Lighting Workflows
            <small>by RISE with AI</small>
          </span>
        </Link>
        <div className="rise-top-account">
          <span className="rise-top-user" title={user?.email}>{displayName}</span>
          <button type="button" className="rise-btn-outline" onClick={logout}>
            Sign out →
          </button>
        </div>
      </header>

      <aside className="sidebar rise-side">
        <p className="rise-side-label">Your workspace</p>
        {renderNav(WORKSPACE_NAV)}

        {isAdmin && (
          <>
            <p className="rise-side-label">Admin</p>
            {renderNav(ADMIN_NAV)}
          </>
        )}

        <div className="rise-credits">
          {isAdmin ? (
            <>
              <p className="rise-side-label">Admin workspace</p>
              <strong>Unlimited extractions</strong>
              <div className="rise-credits-bar"><span style={{ width: "100%" }} /></div>
              <p>Manage users, invite codes and studio standards.</p>
            </>
          ) : (
            <>
              <p className="rise-side-label">
                {user?.accountType === "invited" ? "Invited account" : "Beta / freemium"}
              </p>
              <strong>
                {tokens} PDF extraction{tokens === 1 ? "" : "s"} available
              </strong>
              <div className="rise-credits-bar">
                <span style={{ width: `${Math.min(100, Math.max(tokens > 0 ? 6 : 0, (tokens / Math.max(tokens, 5)) * 100))}%` }} />
              </div>
              <p>{tokens === 0 ? "No credits left. Contact RISE to continue." : "Each PDF or product link uses one credit."}</p>
            </>
          )}
        </div>

        <div className="rise-side-bottom">
          <span title={user?.email} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.email}
          </span>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </aside>
    </>
  );
}
