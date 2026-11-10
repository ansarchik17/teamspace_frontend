import React from "react";
import type { SmartAgentTable as SmartAgentTableType } from "../types";

interface SmartAgentTableProps {
  table: SmartAgentTableType;
  variant?: "messenger" | "panel";
}

export function SmartAgentTable({ table, variant = "messenger" }: SmartAgentTableProps) {
  if (!table) return null;
  const headers = Array.isArray(table.headers) ? table.headers : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const title = String(table.title || "").trim();

  const isPanel = variant === "panel";

  // Styles based on variant
  const containerStyle: React.CSSProperties = {
    margin: "12px 0",
    border: isPanel ? "1px solid rgba(148, 163, 184, 0.15)" : "1px solid rgba(0, 0, 0, 0.08)",
    borderRadius: "12px",
    background: isPanel ? "rgba(15, 23, 42, 0.4)" : "rgba(255, 255, 255, 0.6)",
    overflow: "hidden",
    boxShadow: isPanel
      ? "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
      : "0 2px 6px rgba(0, 0, 0, 0.04)",
  };

  const titleStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 600,
    color: isPanel ? "#e2e8f0" : "#475569",
    background: isPanel ? "rgba(148, 163, 184, 0.08)" : "rgba(0, 0, 0, 0.02)",
    borderBottom: isPanel ? "1px solid rgba(148, 163, 184, 0.15)" : "1px solid rgba(0, 0, 0, 0.06)",
  };

  const scrollStyle: React.CSSProperties = {
    overflowX: "auto",
    width: "100%",
  };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
    textAlign: "left",
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontWeight: 600,
    color: isPanel ? "#94a3b8" : "#64748b",
    background: isPanel ? "rgba(15, 23, 42, 0.2)" : "rgba(0, 0, 0, 0.03)",
    borderBottom: isPanel ? "1px solid rgba(148, 163, 184, 0.15)" : "1px solid rgba(0, 0, 0, 0.06)",
    whiteSpace: "nowrap",
  };

  const tdStyle = (isLastRow: boolean): React.CSSProperties => ({
    padding: "10px 14px",
    color: isPanel ? "#cbd5e1" : "#1e293b",
    borderBottom: isLastRow ? "none" : (isPanel ? "1px solid rgba(148, 163, 184, 0.08)" : "1px solid rgba(0, 0, 0, 0.04)"),
  });

  return (
    <div style={containerStyle}>
      {title ? <div style={titleStyle}>{title}</div> : null}
      <div style={scrollStyle}>
        <table style={tableStyle}>
          {headers.length > 0 ? (
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
          ) : null}
          {rows.length > 0 ? (
            <tbody>
              {rows.map((row, rowIndex) => {
                const cols = Array.isArray(row) ? row : [];
                const colCount = Math.max(headers.length, cols.length);
                const isLastRow = rowIndex === rows.length - 1;

                return (
                  <tr key={rowIndex}>
                    {Array.from({ length: colCount }).map((_, colIndex) => (
                      <td key={colIndex} style={tdStyle(isLastRow)}>
                        {cols[colIndex] ?? ""}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ) : null}
        </table>
      </div>
    </div>
  );
}
