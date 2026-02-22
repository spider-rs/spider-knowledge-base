"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import SearchBar from "./searchbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSavedDomains, getPagesByDomain, clearDomain, clearAll, formatBytes, timeAgo, type DomainInfo, type StoredPage } from "@/lib/storage";

type ExportFormat = "json" | "csv" | "markdown" | "html";

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSV(str: string): string {
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function exportPages(pages: StoredPage[], format: ExportFormat, filenamePrefix: string) {
  const timestamp = new Date().toISOString().slice(0, 10);
  switch (format) {
    case "json": {
      const data = pages.map((p) => ({ url: p.url, content: p.content, status: p.status, domain: p.domain, timestamp: p.timestamp }));
      downloadBlob(JSON.stringify(data, null, 2), `${filenamePrefix}-${timestamp}.json`, "application/json");
      break;
    }
    case "csv": {
      const header = "url,domain,status,content_size,timestamp\n";
      const rows = pages.map((p) => `${escapeCSV(p.url)},${escapeCSV(p.domain)},${p.status || ""},${p.contentSize},${new Date(p.timestamp).toISOString()}`).join("\n");
      downloadBlob(header + rows, `${filenamePrefix}-${timestamp}.csv`, "text/csv");
      break;
    }
    case "markdown": {
      const lines = pages.map((p) => {
        const title = p.content.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || p.url;
        const text = p.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return `## ${title}\n\n**URL:** ${p.url}\n\n${text.slice(0, 2000)}${text.length > 2000 ? "..." : ""}\n\n---\n`;
      });
      downloadBlob(lines.join("\n"), `${filenamePrefix}-${timestamp}.md`, "text/markdown");
      break;
    }
    case "html": {
      const htmlPages = pages.map((p) => `<!-- URL: ${p.url} -->\n${p.content}`).join("\n\n<hr/>\n\n");
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filenamePrefix} Export</title></head><body>\n${htmlPages}\n</body></html>`;
      downloadBlob(html, `${filenamePrefix}-${timestamp}.html`, "text/html");
      break;
    }
  }
}

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })));

export default function KnowledgeBase() {
  const [data, setData] = useState<any[] | null>(null);
  const [mode, setMode] = useState<"crawl" | "search">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StoredPage[]>([]);
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [selectedPage, setSelectedPage] = useState<StoredPage | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [exporting, setExporting] = useState(false);

  const loadDomains = useCallback(async () => {
    try { setDomains(await getSavedDomains()); } catch {}
  }, []);

  useEffect(() => { loadDomains(); }, [loadDomains]);

  const search = async () => {
    if (!searchQuery.trim()) return;
    const lowerQuery = searchQuery.toLowerCase().split(/\s+/);
    const results: (StoredPage & { relevance: number })[] = [];
    for (const domain of domains) {
      const pages = await getPagesByDomain(domain.domain);
      for (const page of pages) {
        const text = (page.content || "").toLowerCase();
        const matches = lowerQuery.filter((term) => text.includes(term)).length;
        if (matches > 0) results.push({ ...page, relevance: matches / lowerQuery.length });
      }
    }
    results.sort((a, b) => b.relevance - a.relevance);
    setSearchResults(results.slice(0, 50));
  };

  const getSnippet = (content: string, query: string): string => {
    const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const idx = text.toLowerCase().indexOf(query.toLowerCase().split(/\s+/)[0]);
    if (idx === -1) return text.slice(0, 200) + "...";
    const start = Math.max(0, idx - 80);
    return (start > 0 ? "..." : "") + text.slice(start, start + 200) + "...";
  };

  const getTitle = (content: string, url: string): string => {
    const match = content.match(/<title[^>]*>([^<]*)<\/title>/i) || content.match(/^#\s+(.+)/m);
    return match?.[1]?.trim() || new URL(url).pathname;
  };

  const totalPages = domains.reduce((s, d) => s + d.pageCount, 0);
  const totalSize = domains.reduce((s, d) => s + d.totalSize, 0);

  const exportAll = async () => {
    setExporting(true);
    try {
      const allPages: StoredPage[] = [];
      for (const d of domains) {
        const pages = await getPagesByDomain(d.domain);
        allPages.push(...pages);
      }
      await exportPages(allPages, exportFormat, "knowledge-base");
    } finally {
      setExporting(false);
    }
  };

  const exportDomain = async (domain: string) => {
    const pages = await getPagesByDomain(domain);
    await exportPages(pages, exportFormat, domain);
  };

  const exportSinglePage = (page: StoredPage) => {
    const ext = exportFormat === "json" ? "json" : exportFormat === "csv" ? "csv" : exportFormat === "markdown" ? "md" : "html";
    exportPages([page], exportFormat, page.url.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50));
  };

  return (
    <div className="flex flex-col h-screen">
      <SearchBar setDataValues={setData} onSaveComplete={loadDomains} />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r overflow-auto p-3 text-sm shrink-0">
          <div className="flex gap-2 mb-3">
            <Button size="sm" variant={mode === "search" ? "default" : "outline"} onClick={() => setMode("search")} className="flex-1 text-xs">Search</Button>
            <Button size="sm" variant={mode === "crawl" ? "default" : "outline"} onClick={() => setMode("crawl")} className="flex-1 text-xs">Crawl</Button>
          </div>
          <div className="mb-4 text-xs text-muted-foreground">
            <p>{totalPages} pages indexed</p>
            <p>{formatBytes(totalSize)} stored</p>
          </div>
          <h3 className="font-bold mb-2 text-xs">Indexed Domains</h3>
          {domains.map((d) => (
            <div key={d.domain} className="flex items-center justify-between py-1 text-xs group">
              <span className="truncate flex-1">{d.domain}</span>
              <Badge variant="outline" className="text-[10px] ml-1">{d.pageCount}</Badge>
              <button className="ml-1 text-primary/70 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" title="Download domain" onClick={() => exportDomain(d.domain)}>↓</button>
              <button className="ml-1 text-red-400 hover:text-red-300" onClick={async () => { await clearDomain(d.domain); loadDomains(); }}>x</button>
            </div>
          ))}
          {domains.length > 0 && (
            <>
              <div className="mt-4 pt-3 border-t">
                <h3 className="font-bold mb-2 text-xs">Export</h3>
                <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                  <SelectTrigger className="h-7 text-xs mb-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="markdown">Markdown</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={exportAll} disabled={exporting}>
                  {exporting ? "Exporting..." : "Download All"}
                </Button>
              </div>
              <Button size="sm" variant="ghost" className="w-full mt-2 text-xs text-destructive" onClick={async () => { await clearAll(); loadDomains(); setSearchResults([]); }}>Clear All</Button>
            </>
          )}
        </div>
        {/* Main */}
        <div className="flex-1 overflow-auto">
          {selectedPage ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 p-3 border-b">
                <Button size="sm" variant="ghost" onClick={() => setSelectedPage(null)}>Back</Button>
                <span className="text-sm truncate flex-1">{selectedPage.url}</span>
                <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={() => exportSinglePage(selectedPage)}>Download</Button>
              </div>
              <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
                <MonacoEditor height="100%" language={selectedPage.content.startsWith("<") ? "html" : "markdown"} value={selectedPage.content} theme="vs-dark" options={{ readOnly: true, minimap: { enabled: false }, wordWrap: "on" }} />
              </Suspense>
            </div>
          ) : mode === "search" ? (
            <div className="p-6">
              <div className="max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold text-center mb-6">Search Knowledge Base</h2>
                <form className="flex gap-2 mb-6" onSubmit={(e) => { e.preventDefault(); search(); }}>
                  <Input className="text-lg h-12" placeholder="Search across all crawled content..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  <Button size="lg" type="submit">Search</Button>
                </form>
                {searchResults.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">{searchResults.length} results</p>
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => exportPages(searchResults, exportFormat, "search-results")}>Download Results</Button>
                    </div>
                    {searchResults.map((page) => (
                      <div key={page.url} className="p-4 border rounded-lg hover:bg-muted/50 group">
                        <button className="block w-full text-left" onClick={() => setSelectedPage(page)}>
                          <p className="font-medium text-primary">{getTitle(page.content, page.url)}</p>
                          <p className="text-xs text-muted-foreground mb-1">{page.url}</p>
                          <p className="text-sm text-muted-foreground line-clamp-2">{getSnippet(page.content, searchQuery)}</p>
                          <p className="text-xs text-muted-foreground mt-1">{page.domain} · {timeAgo(page.timestamp)}</p>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {searchResults.length === 0 && searchQuery && <p className="text-center text-muted-foreground">No results found. Try crawling more content.</p>}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-muted-foreground">
              <p className="text-lg mb-2">Use the search bar above to crawl websites.</p>
              <p>Crawled content will be saved to your local knowledge base for searching.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
