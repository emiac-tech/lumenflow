"use client";

import { withBase } from "@/utils/basePath";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Luminaire, CustomColumn } from "@/types/luminaire";
import { apiFetch } from "@/utils/api";

export default function PrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const layout = searchParams.get("layout") || "modern";
  
  const [data, setData] = useState<Luminaire | null>(null);
  const [cols, setCols] = useState<CustomColumn[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetch(`/api/luminaires/${id}`).then(r => r.json()),
      apiFetch(`/api/columns`).then(r => r.json()),
    ]).then(([lumData, colData]) => {
      setData(lumData);
      setCols(colData);
      setTimeout(() => window.print(), 800);
    });
  }, [id]);

  if (!data) return <div style={{padding: 40}}>Loading print view...</div>;

  return (
    <div className="print-container">
      <style dangerouslySetInnerHTML={{__html: `
        @page { size: A4 portrait; margin: 20mm; }
        body { background: white !important; color: black !important; font-family: Inter, sans-serif; }
        nav, aside, header { display: none !important; }
        
        .print-container { max-width: 800px; margin: 0 auto; padding: 20px; }
        
        /* Modern Layout */
        .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; color: #111; font-weight: 700; text-transform: uppercase; letter-spacing: -0.5px; }
        .header p { margin: 4px 0 0; color: #555; font-size: 14px; font-weight: 500; }
        
        .images { display: flex; gap: 20px; margin-bottom: 30px; }
        .img-box { flex: 1; border: 1px solid #ddd; padding: 15px; text-align: center; border-radius: 4px; background: #fff; }
        .img-box img { max-width: 100%; max-height: 250px; object-fit: contain; mix-blend-mode: multiply; }
        .img-box p { margin: 10px 0 0; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }

        .details-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 30px; }
        .detail-item { padding: 8px 0; border-bottom: 1px solid #eaeaea; display: flex; justify-content: space-between; align-items: baseline; }
        .d-label { text-transform: uppercase; font-size: 10px; color: #666; font-weight: 600; letter-spacing: 0.5px; }
        .d-val { font-size: 14px; font-weight: 600; color: #000; text-align: right; }
        
        .desc-section { background: #f8f9fa; padding: 20px; border-radius: 4px; margin-bottom: 30px; border: 1px solid #eaeaea; }
        .desc-section h3 { margin-top: 0; font-size: 12px; margin-bottom: 10px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }

        /* Compact Spec overrides */
        .layout-compact .images { flex-direction: column; }
        .layout-compact .img-box { padding: 5px; }
        .layout-compact .img-box img { max-height: 180px; }
        .layout-compact .details-grid { grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .layout-compact .detail-item { flex-direction: column; align-items: flex-start; }
        .layout-compact .d-val { text-align: left; margin-top: 2px; }

        /* Detailed View overrides */
        .layout-detailed .details-grid { grid-template-columns: 1fr; border: 1px solid #ddd; padding: 15px; border-radius: 4px; gap: 0; }
        .layout-detailed .detail-item { padding: 12px 0; }
        .layout-detailed .detail-item:last-child { border-bottom: none; }

        @media screen {
          .print-container { box-shadow: 0 10px 30px rgba(0,0,0,0.15); margin-top: 40px; margin-bottom: 80px; background: white; border-radius: 8px; }
          body { background: #e0e0e0 !important; }
        }
      `}} />

      <div className={`layout-${layout}`}>
        <div className="header">
          <h1>{data.manufacturer || "Unknown"} — {data.product || "Unnamed Product"}</h1>
          <p>Spec Code: {data.specCode || "N/A"} | Quantity: {data.quantity || 1}</p>
        </div>

        <div className="images">
          {data.productImageUrl && (
            <div className="img-box">
              <img src={withBase(data.productImageUrl)} alt="Product" />
              <p>Product Appearance</p>
            </div>
          )}
          {data.diagramImageUrl && (
            <div className="img-box">
              <img src={withBase(data.diagramImageUrl)} alt="Diagram" />
              <p>Dimensions / Schematic</p>
            </div>
          )}
        </div>

        {data.description && (
          <div className="desc-section">
            <h3>Description</h3>
            <p style={{margin: 0, fontSize: '13px', lineHeight: 1.6, color: '#333'}}>{data.description}</p>
          </div>
        )}

        <div className="details-grid">
          <div className="detail-item"><span className="d-label">Type</span> <span className="d-val">{data.type || "N/A"}</span></div>
          <div className="detail-item"><span className="d-label">Colour</span> <span className="d-val">{data.colour || "N/A"}</span></div>
          <div className="detail-item"><span className="d-label">CCT</span> <span className="d-val">{data.cct || "N/A"}</span></div>
          <div className="detail-item"><span className="d-label">CRI</span> <span className="d-val">{data.cri || "N/A"}</span></div>
          <div className="detail-item"><span className="d-label">IP Rating</span> <span className="d-val">{data.ipRating || "N/A"}</span></div>
          <div className="detail-item"><span className="d-label">Dimming</span> <span className="d-val">{data.dimming || "N/A"}</span></div>
          <div className="detail-item"><span className="d-label">Unit Watts</span> <span className="d-val">{data.unitWatts || "N/A"} W</span></div>
          <div className="detail-item"><span className="d-label">Total Watts</span> <span className="d-val">{data.totalWatts || "N/A"} W</span></div>
          
          {cols.map(c => (
             <div className="detail-item" key={c.id}>
               <span className="d-label">{c.name}</span>
               <span className="d-val">{data.customData?.[c.name] || "—"}</span>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}
