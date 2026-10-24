import React, { useState, useEffect } from 'react';
import { Search, Filter, BookOpen, Copy, Check, Tv, Sparkles, AlertCircle } from 'lucide-react';
import { SearchResultItem } from '../types/scripture.js';

export const SearchTab: React.FC = () => {
  const [query, setQuery] = useState('love your enemies');
  const [translation, setTranslation] = useState('KJV');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [presentedVerse, setPresentedVerse] = useState<SearchResultItem | null>(null);

  const popularKeywords = ['faith', 'love', 'salvation', 'wisdom', 'forgiveness', 'grace', 'hope', 'peace', 'courage'];
  const popularPhrases = ['love your enemies', 'be strong and courageous', 'fear not', 'in the beginning', 'the Lord is my shepherd', 'light of the world'];
  const sampleReferences = ['John 3:16', 'Romans 8:28', 'Genesis 1:1', 'Psalm 23:1', '1 Corinthians 13:4', 'Philippians 4:13'];

  const performSearch = async (searchQuery?: string, selectedTrans?: string) => {
    const q = searchQuery !== undefined ? searchQuery : query;
    const t = selectedTrans !== undefined ? selectedTrans : translation;
    if (!q.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&translation=${encodeURIComponent(t)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    performSearch(query, translation);
  }, [translation]);

  const copyToClipboard = (verse: SearchResultItem) => {
    navigator.clipboard.writeText(`${verse.reference} (${verse.translation}) - ${verse.text}`);
    setCopiedId(verse.canonical_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <Search className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              Exact Offline Scripture Search Engine
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                Rule #13 & #28 Compliant (Zero Network Dependency)
              </span>
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              Deterministic offline search querying indexed token maps and canonical references directly from <code className="text-indigo-300 bg-slate-800 px-1 py-0.5 rounded">sermonsight.ss</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar & Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && performSearch()}
              placeholder="Search reference (e.g. John 3:16), keyword (faith), or phrase (fear not)..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Translation:</span>
              <select
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                className="bg-transparent text-indigo-300 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="KJV" className="bg-slate-900">KJV (Verified)</option>
                <option value="NIV" className="bg-slate-900">NIV</option>
                <option value="NLT" className="bg-slate-900">NLT</option>
                <option value="NKJV" className="bg-slate-900">NKJV</option>
                <option value="MSG" className="bg-slate-900">MSG</option>
              </select>
            </div>

            <button
              onClick={() => performSearch()}
              disabled={loading}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 font-medium">References:</span>
            {sampleReferences.map((ref) => (
              <button
                key={ref}
                onClick={() => {
                  setQuery(ref);
                  performSearch(ref);
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                {ref}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 font-medium">Phrases:</span>
            {popularPhrases.map((phrase) => (
              <button
                key={phrase}
                onClick={() => {
                  setQuery(phrase);
                  performSearch(phrase);
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                "{phrase}"
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 font-medium">Keywords:</span>
            {popularKeywords.map((kw) => (
              <button
                key={kw}
                onClick={() => {
                  setQuery(kw);
                  performSearch(kw);
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                {kw}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Presented Verse Modal / Banner */}
      {presentedVerse && (
        <div className="bg-black border-2 border-amber-500 rounded-xl p-6 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                🔴 LIVE CHURCH PRESENTATION STAGE
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {presentedVerse.canonical_id} • {presentedVerse.translation}
              </span>
            </div>
            <button
              onClick={() => setPresentedVerse(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
            >
              Dismiss
            </button>
          </div>

          <h3 className="text-2xl font-bold font-serif text-amber-300">
            {presentedVerse.reference}
          </h3>

          <p className="text-xl font-serif text-white leading-relaxed">
            "{presentedVerse.text}"
          </p>
        </div>
      )}

      {/* Search Results List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>Search Results ({results.length} matched canonical verses)</span>
          <span>Active Layer: <strong className="text-indigo-400">{translation}</strong></span>
        </div>

        {results.length === 0 && !loading && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-sm">
            No verses found matching "<span className="text-white">{query}</span>" in {translation}.
          </div>
        )}

        {results.map((result) => (
          <div
            key={result.canonical_id}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all shadow-sm space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  {result.reference}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                  {result.canonical_id}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {result.translation}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPresentedVerse(result)}
                  className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1 transition-all"
                >
                  <Tv className="w-3 h-3" />
                  [PRESENT]
                </button>
                <button
                  onClick={() => copyToClipboard(result)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 border border-slate-700 transition-all"
                >
                  {copiedId === result.canonical_id ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copiedId === result.canonical_id ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <p className="text-sm text-slate-200 font-serif leading-relaxed pl-2 border-l-2 border-indigo-500/50">
              "{result.text}"
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
