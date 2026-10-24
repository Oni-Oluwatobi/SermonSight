import React, { useState, useEffect } from 'react';
import { BookOpen, Layers, CheckCircle2, ChevronRight, Copy, Check, Tv, Tag } from 'lucide-react';
import { Book, VerseRecord } from '../types/scripture.js';

export const CanonNavigatorTab: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [testamentFilter, setTestamentFilter] = useState<'ALL' | 'OT' | 'NT'>('ALL');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [chapterVerses, setChapterVerses] = useState<VerseRecord[]>([]);
  const [selectedTranslation, setSelectedTranslation] = useState<string>('KJV');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/books')
      .then(res => res.json())
      .then(data => {
        setBooks(data);
        if (data.length > 0) {
          // Default to John (id: 43) or Genesis
          const defaultBook = data.find((b: Book) => b.osis_id === 'JHN') || data[0];
          setSelectedBook(defaultBook);
          setSelectedChapter(3);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedBook) return;
    setLoading(true);
    fetch(`/api/chapter/${selectedBook.id}/${selectedChapter}?translation=${selectedTranslation}`)
      .then(res => res.json())
      .then(data => {
        setChapterVerses(data.verses || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedBook, selectedChapter, selectedTranslation]);

  const filteredBooks = books.filter(b => {
    if (testamentFilter === 'OT') return b.testament === 'OT';
    if (testamentFilter === 'NT') return b.testament === 'NT';
    return true;
  });

  const copyVerse = (v: VerseRecord) => {
    navigator.clipboard.writeText(`${v.reference} (${v.translation_id}) - ${v.text}`);
    setCopiedId(v.canonical_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              Protestant 66-Book Canon Explorer
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                Rule #8 Standard Protestant Canon
              </span>
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              Full canonical tree covering <strong>39 Old Testament Books</strong> and <strong>27 New Testament Books</strong>. Every chapter and verse is indexed with OSIS identifiers and speech recognition aliases.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Canon Book Directory */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Canon Directory ({books.length} Books)
              </span>
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                {(['ALL', 'OT', 'NT'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setTestamentFilter(tab)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                      testamentFilter === tab
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab === 'ALL' ? 'All 66' : tab === 'OT' ? '39 OT' : '27 NT'}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[500px] overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
              {filteredBooks.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setSelectedBook(b);
                    setSelectedChapter(1);
                  }}
                  className={`w-full text-left p-2.5 rounded-lg text-xs flex items-center justify-between transition-all ${
                    selectedBook?.id === b.id
                      ? 'bg-indigo-600 text-white font-semibold shadow'
                      : 'bg-slate-950/60 hover:bg-slate-800/80 text-slate-300 border border-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/30">
                      {b.canonical_order}
                    </span>
                    <span>{b.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-80 text-[10px] font-mono">
                    <span>{b.chapter_count} Ch</span>
                    <span className="px-1 rounded bg-black/20">{b.osis_id}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Chapter & Verses Viewer */}
        <div className="lg:col-span-8 space-y-4">
          {selectedBook && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              {/* Header Info for Selected Book */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-white">{selectedBook.name}</h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                      OSIS: {selectedBook.osis_id}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {selectedBook.testament === 'OT' ? 'Old Testament' : 'New Testament'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Canonical Book #{selectedBook.canonical_order} • {selectedBook.chapter_count} Chapters
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Translation:</span>
                  <select
                    value={selectedTranslation}
                    onChange={(e) => setSelectedTranslation(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-indigo-300 text-xs rounded-md px-2.5 py-1.5 font-semibold focus:outline-none"
                  >
                    <option value="KJV">KJV (Verified)</option>
                    <option value="NIV">NIV</option>
                    <option value="NLT">NLT</option>
                    <option value="NKJV">NKJV</option>
                    <option value="MSG">MSG</option>
                  </select>
                </div>
              </div>

              {/* Chapter Pill Selector */}
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-2">Chapters:</span>
                <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
                  {Array.from({ length: selectedBook.chapter_count }, (_, i) => i + 1).map((ch) => (
                    <button
                      key={ch}
                      onClick={() => setSelectedChapter(ch)}
                      className={`w-8 h-8 rounded text-xs font-mono font-medium transition-all ${
                        selectedChapter === ch
                          ? 'bg-indigo-600 text-white font-bold shadow'
                          : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              {/* Verses List */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">
                    {selectedBook.name} Chapter {selectedChapter} ({chapterVerses.length} verses)
                  </span>
                  <span className="font-mono text-emerald-400">
                    {selectedTranslation} Layer
                  </span>
                </div>

                {loading ? (
                  <div className="py-8 text-center text-slate-400 text-sm">Loading verses...</div>
                ) : chapterVerses.length === 0 ? (
                  <div className="p-6 rounded-lg bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                    No verse data in this translation layer ({selectedTranslation}). Modern layers require authorized API access.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[480px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                    {chapterVerses.map((v) => (
                      <div
                        key={v.canonical_id}
                        className="p-3 bg-slate-950/70 hover:bg-slate-950 rounded-lg border border-slate-800/80 transition-all text-xs flex items-start gap-3 group"
                      >
                        <span className="font-mono font-bold text-indigo-400 w-7 pt-0.5 text-right select-none">
                          {v.verse_number}
                        </span>
                        <div className="flex-1 text-slate-200 font-serif text-sm leading-relaxed">
                          {v.text}
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <button
                            onClick={() => copyVerse(v)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                            title="Copy Verse"
                          >
                            {copiedId === v.canonical_id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
