import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BrandProvider } from "@/components/BrandContext";
import { ProjectProvider } from "@/components/ProjectContext";
import { TemplateProvider } from "@/components/TemplateContext";
import { AuthProvider } from "@/components/AuthContext";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./globals.css";
import "./rise.css";

export const metadata: Metadata = {
  title: "RISE OS — Lighting Workflows",
  description:
    "Upload luminaire PDF spec sheets, extract product images and diagrams automatically, and manage your lighting project schedule.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light">
          <GoogleOAuthProvider clientId="1022130386766-3tsh8727j4eb72mcv76326qf04c6eib7.apps.googleusercontent.com">
            <AuthProvider>
              <BrandProvider>
              <ProjectProvider>
                <TemplateProvider>
                  {children}
                </TemplateProvider>
              </ProjectProvider>
            </BrandProvider>
          </AuthProvider>
          </GoogleOAuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
