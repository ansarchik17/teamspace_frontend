import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SmartAgentTable } from "./types";
import { LocalStorageAuthSessionStore } from "../../../../infrastructure/storage/LocalStorageAuthSessionStore";
import { authorizedFetch } from "../../../../infrastructure/http/authorizedFetch";

const authSessionStore = new LocalStorageAuthSessionStore();

/** Remove implementation identifiers from assistant text before it reaches the UI. */
export function sanitizeSmartAgentAssistantText(value: string): string {
  const identifierValue = String.raw`[A-Za-z0-9][A-Za-z0-9_-]*`;
  const identifierLabel = String.raw`(?:id|идентификатор)(?:\s+[^\s:,.!?()]+){0,3}\s*[:#]\s*${identifierValue}`;
  let sanitized = String(value || "");
  sanitized = sanitized.replace(/(?:\buser\s+(?:hasn't|has\s+not)\s+responded\s+yet\b|\bwaiting\s+for\s+(?:the\s+)?user(?:'s)?\s+response\b|\bwaiting\s+for\s+a\s+user\s+response\b|\bwe\s+wait\s+for\s+user\b|\bawaiting\s+user\s+response\b|\bwaiting\s+on\s+user\b).*$/gis, "");
  sanitized = sanitized.replace(/(?:\s*\(\s*(?:ожидаем|ожидаю|ждём|ждем|жду)(?:\s+ответ(?:а|ом)?)?\s*\))+\s*/gi, "");
  sanitized = sanitized.replace(/\(\s*(?:ожидаем|ожидаю|ждём|ждем|жду)(?:\s+ответ(?:а|ом)?)?\s*\).*$/gis, "");
  sanitized = sanitized.replace(/\b(?:ожидаем|ожидаю|ждём|ждем|жду)\s+(?:ответ(?:а|ом)?|пользователя)\b.*$/gis, "");
  sanitized = sanitized.replace(
    new RegExp(
      String.raw`\s*\(\s*${identifierLabel}\s*\)`,
      "gi",
    ),
    "",
  );
  sanitized = sanitized.replace(
    new RegExp(
      String.raw`\b${identifierLabel}\b`,
      "gi",
    ),
    "",
  );
  sanitized = sanitized.replace(
    new RegExp(
      String.raw`\b(?:id|идентификатор)\s*[:#]?\s*${identifierValue}\b`,
      "gi",
    ),
    "",
  );
  return sanitized
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])(?=[А-ЯA-ZӘәҒғҚқҢңӨөҰұҮүІі])/g, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Parses markdown tables from a text string and converts them into structured tables.
 * Also fixes the "merged table header" bug (e.g. prefix text directly before table headers on the same line).
 */
export function preprocessAndExtractTables(
  text: string,
  existingTables?: SmartAgentTable[] | null
): { text: string; tables: SmartAgentTable[] } {
  if (!text) {
    return { text: "", tables: existingTables || [] };
  }

  const tables: SmartAgentTable[] = existingTables ? [...existingTables] : [];
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const processedLines: string[] = [];

  const isDelimiterRow = (line: string) => {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|") && /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(trimmed);
  };

  const isTableRow = (line: string) => {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|");
  };

  // Phase 1: Fix the merged header bug
  for (let i = 0; i < rawLines.length; i++) {
    const currentLine = rawLines[i] || "";
    
    // Check if the next line is a delimiter row
    if (i + 1 < rawLines.length && isDelimiterRow(rawLines[i + 1] || "")) {
      const firstPipeIdx = currentLine.indexOf("|");
      if (firstPipeIdx > 0) {
        let prefix = currentLine.substring(0, firstPipeIdx);
        const tableHeader = currentLine.substring(firstPipeIdx);

        // Close unmatched bold markers in prefix
        const boldMatches = prefix.match(/\*\*/g);
        if (boldMatches && boldMatches.length % 2 !== 0) {
          prefix = prefix.trim() + "**";
        }

        processedLines.push(prefix);
        processedLines.push(tableHeader);
        continue;
      }
    }
    processedLines.push(currentLine);
  }

  // Phase 2: Extract markdown tables and replace with [table:idx]
  const finalLines: string[] = [];
  let i = 0;
  while (i < processedLines.length) {
    const currentLine = processedLines[i] || "";
    
    // Check if we are at a delimiter row
    if (isDelimiterRow(currentLine) && i > 0 && isTableRow(processedLines[i - 1] || "")) {
      const headerLine = processedLines[i - 1] || "";
      const headers = headerLine
        .split("|")
        .slice(1, -1)
        .map((h) => h.trim());

      const rows: string[][] = [];
      let j = i + 1;
      while (j < processedLines.length && isTableRow(processedLines[j] || "") && !isDelimiterRow(processedLines[j] || "")) {
        const rowLine = processedLines[j] || "";
        const cols = rowLine
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        rows.push(cols);
        j++;
      }

      // Pop the header line that we pushed in the previous iteration
      finalLines.pop();

      // Create the table and add it
      const tableIdx = tables.length;
      tables.push({
        title: "",
        headers,
        rows,
      });

      // Insert the table placeholder
      finalLines.push(`[table:${tableIdx}]`);

      // Skip the lines belonging to the table
      i = j;
    } else {
      finalLines.push(currentLine);
      i++;
    }
  }

  return {
    text: finalLines.join("\n"),
    tables,
  };
}

/**
 * Parses file names from assistant message containing "Источники: file1, file2..."
 */
export function parseSourcesFromText(text: string): string[] {
  if (!text) return [];
  const match = text.match(/Источники\s*:\s*(.+)$/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.replace(/\*\*/g, "").replace(/\.$/, "").trim())
    .filter((s) => s.length > 0);
}

interface SmartAgentSourceFilesProps {
  fileNames: string[];
}

export function SmartAgentSourceFiles({ fileNames }: SmartAgentSourceFilesProps) {
  const [resolvedFiles, setResolvedFiles] = useState<Record<string, { id: string; folderPath?: string }>>({});

  useEffect(() => {
    let active = true;
    
    const trySearch = async (query: string): Promise<{ id: string; folderPath?: string } | null> => {
      try {
        const response = await authorizedFetch(
          authSessionStore,
          `/api/v1/drive/search?q=${encodeURIComponent(query)}&limit=1`
        );
        if (response.ok) {
          const data = await response.json();
          const items = Array.isArray(data) ? data : (data?.items || []);
          if (items.length > 0) {
            const item = items[0];
            const actualFile = item.file || item.folder || item;
            const fileId = actualFile.id || item.id || actualFile.file_id || item.file_id;
            const folderPath = actualFile.folder_path || actualFile.folderPath || item.folder_path || item.folderPath;
            if (fileId) {
              return {
                id: fileId,
                folderPath: folderPath,
              };
            }
          }
        }
      } catch (err) {
        console.error("Error in trySearch for query:", query, err);
      }
      return null;
    };

    const resolveAll = async () => {
      const results: Record<string, { id: string; folderPath?: string }> = {};
      for (const name of fileNames) {
        try {
          // Try searching for full name first
          let resolved = await trySearch(name);
          console.log(`[SmartAgentSourceFiles] Resolve full name "${name}":`, resolved);
          
          // If not found, try searching without extension
          if (!resolved) {
            const lastDotIdx = name.lastIndexOf(".");
            const nameWithoutExt = lastDotIdx !== -1 ? name.substring(0, lastDotIdx) : name;
            if (nameWithoutExt !== name) {
              resolved = await trySearch(nameWithoutExt);
              console.log(`[SmartAgentSourceFiles] Resolve without extension "${nameWithoutExt}":`, resolved);
            }
          }
          
          if (active && resolved) {
            results[name] = resolved;
          }
        } catch (err) {
          console.error("Failed to resolve file:", name, err);
        }
      }
      if (active) {
        setResolvedFiles(results);
      }
    };
    
    void resolveAll();
    return () => {
      active = false;
    };
  }, [fileNames]);

  if (fileNames.length === 0) return null;

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 2 }}>
        Источники ответа (Team Drive)
      </div>
      {fileNames.map((name, index) => {
        const fileData = resolvedFiles[name];
        const fileId = fileData?.id;
        const folderPath = fileData?.folderPath;

        const content = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              cursor: fileId ? "pointer" : "default",
              transition: "all 0.15s ease",
            }}
            className={fileId ? "hover:border-[#9DBCF7] hover:bg-[#F4F8FF] hover:shadow-[0_8px_20px_rgba(24,72,150,0.08)]" : ""}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#EEF2FF",
                color: "#2458D3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {index + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {name}
              </div>
              {folderPath && (
                <div style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                  {folderPath}
                </div>
              )}
            </div>
            {fileId && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#1D5FD1",
                  background: "#EEF2FF",
                  padding: "4px 10px",
                  borderRadius: 12,
                  flexShrink: 0,
                }}
              >
                Открыть
              </span>
            )}
          </div>
        );

        if (fileId) {
          return (
            <Link
              key={name}
              to={`/drive/editor/${encodeURIComponent(fileId)}`}
              style={{ textDecoration: "none" }}
            >
              {content}
            </Link>
          );
        }

        return <div key={name}>{content}</div>;
      })}
    </div>
  );
}
