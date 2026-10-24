import React, { useState, useEffect } from 'react';
import { Layers, ShieldCheck, Key, ExternalLink, Lock, CheckCircle2, FileText, BookOpen } from 'lucide-react';
import { Translation } from '../types/scripture.js';

export const TranslationLayersTab: React.FC = () => {
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [selectedTranslation, setSelectedTranslation] = useState<Translation | null>(null);

  useEffect(() => {
    fetch('/api/db-status')
      .then(res => res.json())
      .then(data => {
        setTranslations(data.translations || []);
        if (data.translations && data.translations.length > 0) {
          setSelectedTranslation(data.translations[0]);
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <Layers className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              The 5 Translation Layers & Acquisition Architecture
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                Rule #1 & #7 Compliant
              </span>
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              SermonSight maps all five required translations (<strong>KJV</strong>, <strong>NIV</strong>, <strong>NLT</strong>, <strong>NKJV</strong>, <strong>MSG</strong>) to identical canonical coordinates. The public-domain KJV is fully verified and packaged offline, while modern copyright-protected translations maintain rigorous licensing manifests.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Translation Cards */}
        <div className="lg:col-span-5 space-y-3">
          {translations.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedTranslation(t)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedTranslation?.id === t.id
                  ? 'bg-slate-800 border-indigo-500 shadow-md shadow-indigo-500/10'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-white text-base font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-700">
                    {t.id}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{t.name}</h3>
                    <span className="text-[11px] text-slate-400">{t.publisher}</span>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                  t.text_status === 'verified'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}>
                  {t.text_status}
                </span>
              </div>

              <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-slate-800/80">
                <div className="flex justify-between">
                  <span>Source:</span>
                  <span className="text-slate-300">{t.source}</span>
                </div>
                <div className="flex justify-between">
                  <span>License:</span>
                  <span className="text-slate-300 truncate max-w-[200px]">{t.license_status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: In-Depth Manifest & Acquisition Protocol */}
        <div className="lg:col-span-7 space-y-4">
          {selectedTranslation && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {selectedTranslation.name} ({selectedTranslation.id})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Language: {selectedTranslation.language.toUpperCase()} • Year: {selectedTranslation.year}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-mono font-semibold ${
                  selectedTranslation.text_status === 'verified'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}>
                  {selectedTranslation.text_status}
                </span>
              </div>

              {/* Copyright Notice */}
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  Authoritative Copyright Notice & License
                </span>
                <p className="text-xs text-slate-300 leading-relaxed font-mono">
                  {selectedTranslation.copyright_notice}
                </p>
              </div>

              {/* Source & Acquisition Details */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block mb-1">Source Repository / API</span>
                  <span className="text-white font-medium">{selectedTranslation.source}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block mb-1">Access Method</span>
                  <span className="text-indigo-300 font-mono">{selectedTranslation.access_method}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 col-span-2">
                  <span className="text-slate-500 block mb-1">Official Provider URL</span>
                  <a
                    href={selectedTranslation.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    {selectedTranslation.source_url} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Acquisition Protocol Guide */}
              <div className="p-4 rounded-lg bg-indigo-950/30 border border-indigo-800/50 space-y-2">
                <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="w-4 h-4" />
                  Authorized Acquisition & Scripture Integrity Protocol
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedTranslation.id === 'KJV' ? (
                    'The King James Version is in the public domain and is 100% packaged, verified, and indexed in sermonsight.ss with 31,102 verses ready for zero-latency offline lookup.'
                  ) : (
                    `To populate the ${selectedTranslation.id} layer for church production use:
                    1. Obtain an authorized API key or license agreement from ${selectedTranslation.publisher}.
                    2. Ingest Scripture text directly via the official authorized endpoint (${selectedTranslation.source_url}).
                    3. Under Rule #2 (Absolute Scripture-Integrity), AI models and automated systems are strictly prohibited from generating, paraphrasing, or guessing verse text.`
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
