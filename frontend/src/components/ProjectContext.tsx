"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/utils/api";
import { useAuth } from "./AuthContext";
import { usePathname } from "next/navigation";

export interface Project {
  id: number;
  name: string;
  createdAt?: string;
  luminaireCount?: number;
  documentCount?: number;
  location?: string;
  revision?: string;
  template?: "standard" | "compact";
  studioName?: string;
}

interface ProjectContextValue {
  projects: Project[];
  activeProjectId: number | null;
  setActiveProjectId: (id: number) => void;
  isLoading: boolean;
  refreshProjects: () => Promise<void>;
  addProject: (name: string, location: string, extra?: { revision?: string; issueDate?: string }) => Promise<Project | null>;
  renameProject: (id: number, name: string) => Promise<Project | null>;
  deleteProject: (id: number) => Promise<boolean>;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  activeProjectId: null,
  setActiveProjectId: () => {},
  isLoading: true,
  refreshProjects: async () => {},
  addProject: async () => null,
  renameProject: async () => null,
  deleteProject: async () => false,
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { token, isLoading: isAuthLoading } = useAuth();
  const pathname = usePathname();

  const clearActiveProject = useCallback(() => {
    setActiveProjectIdState(null);
    localStorage.removeItem("activeProjectId");
  }, []);

  const readJsonSafely = useCallback(async (res: Response) => {
    const text = await res.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error("Failed to parse projects response as JSON", {
        url: res.url,
        status: res.status,
        body: text.slice(0, 200),
        error,
      });
      throw new Error(text.slice(0, 200) || `Request failed with status ${res.status}`);
    }
  }, []);

  const fetchProjectsWithTimeout = useCallback(async () => {
    return await Promise.race([
      apiFetch("/api/projects"),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out while loading projects")), 8000)
      ),
    ]);
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!token) {
      setProjects([]);
      clearActiveProject();
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetchProjectsWithTimeout();
      if (!res.ok) {
        console.error("Failed to load projects", res.status, res.statusText);
        setProjects([]);
        clearActiveProject();
        return;
      }

      const data = await readJsonSafely(res);
      const list = Array.isArray(data?.projects) ? data.projects : [];
      setProjects(list);

      if (list.length === 0) {
        clearActiveProject();
        return;
      }

      const savedId = localStorage.getItem("activeProjectId");
      const savedProject = list.find((p: Project) => p.id.toString() === savedId);
      const currentProject = list.find((p: Project) => p.id === activeProjectId);

      if (currentProject) {
        return;
      }

      if (savedProject) {
        setActiveProjectIdState(savedProject.id);
        return;
      }

      setActiveProjectIdState(list[0].id);
    } catch (err) {
      console.error("Failed to load projects", err);
      setProjects([]);
      clearActiveProject();
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, clearActiveProject, fetchProjectsWithTimeout, readJsonSafely, token]);

  const setActiveProjectId = (id: number) => {
    setActiveProjectIdState(id);
    localStorage.setItem("activeProjectId", id.toString());
  };

  const addProject = async (name: string, location: string, extra?: { revision?: string; issueDate?: string }) => {
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, location, revision: extra?.revision, issueDate: extra?.issueDate, source_project_id: activeProjectId }),
      });
      if (res.ok) {
        const newProject = await res.json();
        await refreshProjects();
        setActiveProjectId(newProject.id);
        return newProject;
      }
    } catch (err) {
      console.error("Failed to add project", err);
    }
    return null;
  };

  const renameProject = async (id: number, name: string) => {
    try {
      const res = await apiFetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const updatedProject = await res.json();
        setProjects((prev) => prev.map((project) => (project.id === id ? { ...project, ...updatedProject } : project)));
        return updatedProject;
      }
    } catch (err) {
      console.error("Failed to rename project", err);
    }
    return null;
  };

  const deleteProject = async (id: number) => {
    try {
      const remainingProjects = projects.filter((project) => project.id !== id);
      const fallbackProjectId = remainingProjects[0]?.id ?? null;

      const res = await apiFetch(`/api/projects/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) return false;

      setProjects(remainingProjects);

      if (activeProjectId === id) {
        if (fallbackProjectId !== null) {
          setActiveProjectId(fallbackProjectId);
        } else {
          clearActiveProject();
        }
      }

      return true;
    } catch (err) {
      console.error("Failed to delete project", err);
      return false;
    }
  };

  useEffect(() => {
    const isAuthPage = pathname === "/login" || pathname === "/signup";

    if (isAuthLoading) return;
    if (isAuthPage) {
      setProjects([]);
      clearActiveProject();
      setIsLoading(false);
      return;
    }
    if (!token) {
      setProjects([]);
      clearActiveProject();
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, pathname, token]);

  return (
    <ProjectContext.Provider value={{ 
      projects, 
      activeProjectId, 
      setActiveProjectId, 
      isLoading, 
      refreshProjects,
      addProject,
      renameProject,
      deleteProject,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  return useContext(ProjectContext);
}
