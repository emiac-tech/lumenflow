import { apiFetch } from "./api";

export type BrandTemplate = "standard" | "compact";

export interface StudioDefaults {
  studioName: string;
  accent: string;
  template: BrandTemplate;
  logoUrl: string;
  saved: boolean;
}

export interface ProjectBrand {
  projectId: number;
  name: string;
  location: string;
  revision: string;
  issueDate: string;
  studioName: string;
  accent: string;
  template: BrandTemplate;
  logoUrl: string;
  hasOwnLogo: boolean;
}

export const TEMPLATE_LABEL: Record<BrandTemplate, string> = {
  standard: "RISE Standard",
  compact: "Compact",
};

export const LOGO_TYPES = ["image/png", "image/jpeg"];
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function checkLogoFile(file: File | undefined | null): string {
  if (!file) return "";
  if (!LOGO_TYPES.includes(file.type) || file.size > LOGO_MAX_BYTES) return "Choose a PNG or JPEG smaller than 2 MB.";
  return "";
}

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail || `Request failed (${res.status})`);
  return data as T;
}

export const fetchStudio = async () => readJson<StudioDefaults>(await apiFetch("/api/studio"));

export const saveStudio = async (body: { studioName: string; accent: string; template: BrandTemplate; removeLogo?: boolean }) =>
  readJson<StudioDefaults>(
    await apiFetch("/api/studio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );

export const uploadStudioLogo = async (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return readJson<{ logoUrl: string }>(await apiFetch("/api/studio/logo", { method: "POST", body: form }));
};

export const fetchProjectBrand = async (projectId: number) =>
  readJson<ProjectBrand>(await apiFetch(`/api/projects/${projectId}/brand`));

export const saveProjectBrand = async (
  projectId: number,
  body: Omit<ProjectBrand, "projectId" | "logoUrl" | "hasOwnLogo"> & { useStudioLogo?: boolean },
) =>
  readJson<ProjectBrand>(
    await apiFetch(`/api/projects/${projectId}/brand`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

export const uploadProjectLogo = async (projectId: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return readJson<{ logoUrl: string }>(
    await apiFetch(`/api/projects/${projectId}/specification-logo`, { method: "POST", body: form }),
  );
};

export const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Backend timestamps are naive UTC (no "Z"); parse them as UTC. */
export const parseServerDate = (value?: string) => {
  if (!value) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
