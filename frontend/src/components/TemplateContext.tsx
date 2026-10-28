"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useProjects } from "./ProjectContext";
import { apiFetch } from "@/utils/api";

export interface Template {
  id: number;
  name: string;
  isDefault?: boolean;
}

interface TemplateContextValue {
  templates: Template[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  refreshTemplates: () => Promise<void>;
  createTemplate: (name: string, projectIds: number[]) => Promise<Template | null>;
  renameTemplate: (id: number, name: string) => Promise<Template | null>;
}

const TemplateContext = createContext<TemplateContextValue>({
  templates: [],
  selectedTemplateId: "",
  setSelectedTemplateId: () => {},
  refreshTemplates: async () => {},
  createTemplate: async () => null,
  renameTemplate: async () => null,
});

export function TemplateProvider({ children }: { children: React.ReactNode }) {
  const { activeProjectId } = useProjects();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const refreshTemplates = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const res = await apiFetch(`/api/templates?project_id=${activeProjectId}`);
      const data = await res.json();
      const nextTemplates: Template[] = data.templates || [];
      setTemplates(nextTemplates);
      setSelectedTemplateId((current) => {
        if (current && nextTemplates.some((template) => template.id.toString() === current)) return current;
        const projectDefault = nextTemplates.find((template) => template.isDefault);
        return projectDefault ? projectDefault.id.toString() : "";
      });
    } catch (err) {
      console.error("Failed to load templates", err);
    }
  }, [activeProjectId]);

  // Reset on project change
  useEffect(() => {
    setSelectedTemplateId("");
    setTemplates([]);
    refreshTemplates();
  }, [activeProjectId]);

  const createTemplate = async (name: string, projectIds: number[]): Promise<Template | null> => {
    if (!projectIds.length) return null;
    let lastTemplate: Template | null = null;
    for (const pid of projectIds) {
      try {
        const res = await apiFetch(`/api/templates?project_id=${pid}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            pageSize: "A4",
            pageWidth: 595,
            pageHeight: 842,
            designJson: { items: [] },
            project_id: pid,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          lastTemplate = data.template;
        }
      } catch (err) {
        console.error("Failed to create template", err);
      }
    }
    await refreshTemplates();
    if (lastTemplate) {
      setSelectedTemplateId(lastTemplate.id.toString());
    }
    return lastTemplate;
  };

  const renameTemplate = async (id: number, name: string): Promise<Template | null> => {
    if (!activeProjectId) return null;
    try {
      const res = await apiFetch(`/api/templates/${id}?project_id=${activeProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        const updatedTemplate = data.template;
        setTemplates((prev) => prev.map((template) => (template.id === id ? updatedTemplate : template)));
        return updatedTemplate;
      }
    } catch (err) {
      console.error("Failed to rename template", err);
    }
    return null;
  };

  return (
    <TemplateContext.Provider value={{ templates, selectedTemplateId, setSelectedTemplateId, refreshTemplates, createTemplate, renameTemplate }}>
      {children}
    </TemplateContext.Provider>
  );
}

export function useTemplates() {
  return useContext(TemplateContext);
}
