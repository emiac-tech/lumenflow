export interface CustomColumn {
  id: number;
  name: string;
  aiEnabled: boolean;
  aiDescription: string;
}

export interface Luminaire {
  id: number;
  sourceType: string;
  sourceName: string;
  sourceUrl: string | null;
  documentUrl: string | null;
  type: string | null;
  manufacturer: string | null;
  product: string | null;
  specCode: string | null;
  description: string | null;
  colour: string | null;
  cct: string | null;
  cri: string | null;
  unitWatts: string | null;
  dimming: string | null;
  quantity: string | null;
  ipRating: string | null;
  totalWatts: string | null;
  diagramImageUrl: string | null;
  productImageUrl: string | null;
  polarImageUrl: string | null;
  customData?: Record<string, string>;
  pdfTemplate?: string | null;
}

export interface ImportResponse {
  created: Luminaire[];
  failures: { source: string; error: string }[];
  summary: {
    requested: number;
    created: number;
    failed: number;
  };
}
