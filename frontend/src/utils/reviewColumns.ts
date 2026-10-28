import { CustomColumn } from "@/types/luminaire";

export type ReviewFieldKey =
  | "type"
  | "manufacturer"
  | "product"
  | "specCode"
  | "description"
  | "colour"
  | "cct"
  | "cri"
  | "unitWatts"
  | "dimming"
  | "quantity"
  | "ipRating";

export type ReviewImageField = "productImageUrl" | "diagramImageUrl" | "polarImageUrl";

export interface ReviewColumnDef {
  key: string;
  label: string;
  field?: ReviewFieldKey;
  imageField?: ReviewImageField;
  customColumn?: CustomColumn;
  readOnlyField?: "totalWatts" | "document" | "templatePdf";
}

// Same keys and order as the table's base columns.
export const BASE_REVIEW_COLUMNS: ReviewColumnDef[] = [
  { key: "type", label: "Type", field: "type" },
  { key: "photo", label: "Photo", imageField: "productImageUrl" },
  { key: "diagram", label: "Diagram", imageField: "diagramImageUrl" },
  { key: "polar", label: "Polar Curve", imageField: "polarImageUrl" },
  { key: "manufacturer", label: "Manufacturer", field: "manufacturer" },
  { key: "product", label: "Product", field: "product" },
  { key: "specCode", label: "Spec Code", field: "specCode" },
  { key: "description", label: "Description", field: "description" },
  { key: "colour", label: "Colour", field: "colour" },
  { key: "cct", label: "CCT", field: "cct" },
  { key: "cri", label: "CRI", field: "cri" },
  { key: "unitWatts", label: "Unit Watts", field: "unitWatts" },
  { key: "dimming", label: "Dimming", field: "dimming" },
  { key: "quantity", label: "Qty", field: "quantity" },
  { key: "ipRating", label: "IP Rating", field: "ipRating" },
  { key: "totalWatts", label: "Total Watts", readOnlyField: "totalWatts" },
  { key: "document", label: "Document", readOnlyField: "document" },
  { key: "templatePdf", label: "Template PDF", readOnlyField: "templatePdf" },
];

/** Columns currently visible in the table, in the table's order. */
export function buildVisibleReviewColumns(
  customColumns: CustomColumn[],
  columnOrder: string[],
  hiddenColumns: string[],
  columnLabels: Record<string, string>,
): ReviewColumnDef[] {
  const baseColumns = BASE_REVIEW_COLUMNS.map((column) => ({
    ...column,
    label: columnLabels[column.key] || column.label,
  }));
  const customDefinitions: ReviewColumnDef[] = customColumns.map((column) => ({
    key: `custom:${column.id}`,
    label: column.name,
    customColumn: column,
  }));
  const allColumns = [...baseColumns, ...customDefinitions];
  const columnMap = new Map(allColumns.map((column) => [column.key, column]));
  const seen = new Set<string>();
  const ordered: ReviewColumnDef[] = [];
  for (const key of columnOrder) {
    if (seen.has(key)) continue;
    const column = columnMap.get(key);
    if (!column) continue;
    seen.add(key);
    ordered.push(column);
  }
  for (const column of allColumns) {
    if (seen.has(column.key)) continue;
    seen.add(column.key);
    ordered.push(column);
  }
  const hidden = new Set(hiddenColumns);
  // Template PDF is chosen in the table, never in the review/edit popups.
  return ordered.filter((column) => !hidden.has(column.key) && column.key !== "templatePdf");
}
