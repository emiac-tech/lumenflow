"use client";
import "@/utils/basePath";

import React, { createContext, useContext, useEffect, useState } from "react";

interface BrandContextValue {
  companyName: string;
  setCompanyName: (name: string) => void;
}

const BrandContext = createContext<BrandContextValue>({
  companyName: "LumenFlow",
  setCompanyName: () => {},
});

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [companyName, setCompanyName] = useState("\u00A0"); // Non-breaking space prevents layout shift during load

  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => r.json())
      .then((data) => {
        if (data.companyName) {
            setCompanyName(data.companyName);
        } else {
            setCompanyName("LumenFlow");
        }
      })
      .catch(() => {
          setCompanyName("LumenFlow");
      });
  }, []);

  return (
    <BrandContext.Provider value={{ companyName, setCompanyName }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
