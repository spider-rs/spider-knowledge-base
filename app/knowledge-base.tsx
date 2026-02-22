"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import SearchBar from "./searchbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getSavedDomains, getPagesByDomain, clearDomain, clearAll, formatBytes, timeAgo, type DomainInfo, type StoredPage } from "@/lib/storage";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })));

export default function KnowledgeBase() {
  const [data, setData] = useState<any[] | null>(null);
  const [mode, setMode] = useState<"crawl" | "search">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StoredPage[]>([]);
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [selectedPage, setSelectedPage] = useState<StoredPage | null>(null);

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
            <div key={d.domain} className="flex items-center justify-between py-1 text-xs">
              <span className="truncate flex-1">{d.domain}</span>
              <Badge variant="outline" className="text-[10px] ml-1">{d.pageCount}</Badge>
              <button className="ml-1 text-red-400 hover:text-red-300" onClick={async () => { await clearDomain(d.domain); loadDomains(); }}>x</button>
            </div>
          ))}
          {domains.length > 0 && <Button size="sm" variant="ghost" className="w-full mt-2 text-xs text-destructive" onClick={async () => { await clearAll(); loadDomains(); setSearchResults([]); }}>Clear All</Button>}
        </div>
        {/* Main */}
        <div className="flex-1 overflow-auto">
          {selectedPage ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 p-3 border-b">
                <Button size="sm" variant="ghost" onClick={() => setSelectedPage(null)}>Back</Button>
                <span className="text-sm truncate">{selectedPage.url}</span>
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
                    <p className="text-sm text-muted-foreground">{searchResults.length} results</p>
                    {searchResults.map((page) => (
                      <button key={page.url} className="block w-full text-left p-4 border rounded-lg hover:bg-muted/50" onClick={() => setSelectedPage(page)}>
                        <p className="font-medium text-primary">{getTitle(page.content, page.url)}</p>
                        <p className="text-xs text-muted-foreground mb-1">{page.url}</p>
                        <p className="text-sm text-muted-foreground line-clamp-2">{getSnippet(page.content, searchQuery)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{page.domain} · {timeAgo(page.timestamp)}</p>
                      </button>
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
