import React from 'react';
import { Database, ShieldCheck, Download, Layers, CheckCircle2, HardDrive, WifiOff } from 'lucide-react';
import { DatabaseStatusResponse } from '../types/scripture.js';

interface HeaderProps {
  status: DatabaseStatusResponse | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ status, activeTab, setActiveTab }) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-40 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-4 gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white font-bold text-xl border border-indigo-400/30">
              SS
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  SermonSight
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> sermonsight.ss (Verified)
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400">
                Master Scripture Database & Preacher Recognition Foundation • <span className="text-slate-300 font-medium">The Kreadive Galaxy</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/90 border border-slate-700 text-slate-300">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              <span>Canon: <strong className="text-white">66 Books</strong> / <strong className="text-white">1,189 Ch</strong> / <strong className="text-white">31,102 Verses</strong></span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/60 border border-emerald-700/60 text-emerald-300">
              <WifiOff className="w-3.5 h-3.5 text-emerald-400" />
              <span>100% Offline SQLite</span>
            </div>

            <a
              href="/api/download/sermonsight.ss"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-sm transition-all text-xs"
              download
            >
              <Download className="w-3.5 h-3.5" />
              Download .ss DB
            </a>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 border-t border-slate-800 pt-2 pb-0 overflow-x-auto scrollbar-none">
          {[
            { id: 'recognize', label: 'Preacher Speech Recognition', icon: 'mic' },
            { id: 'search', label: 'Scripture Search Engine', icon: 'search' },
            { id: 'canon', label: '66-Book Canon Navigator', icon: 'book' },
            { id: 'translations', label: '5 Translation Layers', icon: 'layers' },
            { id: 'audit', label: 'Audit & Validation Report', icon: 'shield' },
            { id: 'export', label: 'Export & Schema Artifacts', icon: 'database' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-400 bg-slate-800/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
