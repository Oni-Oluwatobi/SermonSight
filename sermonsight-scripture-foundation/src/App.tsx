import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { SpeechRecognizerTab } from './components/SpeechRecognizerTab.js';
import { SearchTab } from './components/SearchTab.js';
import { CanonNavigatorTab } from './components/CanonNavigatorTab.js';
import { TranslationLayersTab } from './components/TranslationLayersTab.js';
import { AuditReportTab } from './components/AuditReportTab.js';
import { ExportArtifactsTab } from './components/ExportArtifactsTab.js';
import { DatabaseStatusResponse } from './types/scripture.js';
import { ShieldCheck, HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('recognize');
  const [dbStatus, setDbStatus] = useState<DatabaseStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/db-status')
      .then((res) => res.json())
      .then((data) => {
        setDbStatus(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load DB status:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Header status={dbStatus} activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'recognize' && <SpeechRecognizerTab />}
        {activeTab === 'search' && <SearchTab />}
        {activeTab === 'canon' && <CanonNavigatorTab />}
        {activeTab === 'translations' && <TranslationLayersTab />}
        {activeTab === 'audit' && <AuditReportTab />}
        {activeTab === 'export' && <ExportArtifactsTab />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-6 text-slate-400 text-xs mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200">SermonSight Scripture Database (`sermonsight.ss`)</span>
            <span>•</span>
            <span>The Kreadive Galaxy</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-400 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" /> 31,102 Verses Verified
            </span>
            <span>•</span>
            <span className="text-slate-400">Strict Zero-AI Scripture Generation Rule</span>
            <span>•</span>
            <a href="/api/download/sermonsight.ss" className="text-indigo-400 hover:underline">
              Download .ss File
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
