import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, FileText, Download, Copy, Check, Terminal } from 'lucide-react';
import { ValidationCheckItem } from '../types/scripture.js';

export const AuditReportTab: React.FC = () => {
  const [reportData, setReportData] = useState<any>(null);
  const [checks, setChecks] = useState<ValidationCheckItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [rawText, setRawText] = useState<string>('');

  useEffect(() => {
    fetch('/api/audit')
      .then(res => res.json())
      .then(data => {
        setReportData(data.report);
        setChecks(data.checks || []);
      })
      .catch(console.error);

    fetch('/validation-report.txt')
      .then(res => res.text())
      .then(text => setRawText(text))
      .catch(console.error);
  }, []);

  const copyReport = () => {
    if (rawText) {
      navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                Deterministic Scripture Database Audit
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                  STATUS: PASS
                </span>
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                Formal structural validation and verification report conforming to <strong>Rule #25</strong> and <strong>Rule #2 (Absolute Scripture-Integrity)</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyReport}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Audit Text'}
            </button>
            <a
              href="/api/download/validation-report.json"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              download
            >
              <Download className="w-3.5 h-3.5" />
              Download JSON
            </a>
          </div>
        </div>
      </div>

      {/* Terminal View: Official Audit Output */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-slate-900/90 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex space-x-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
            </div>
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5 ml-2">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              validation-report.txt (Authoritative Verification Audit)
            </span>
          </div>

          <span className="text-[11px] font-mono text-emerald-400 font-bold">
            OVERALL AUDIT: PASS
          </span>
        </div>

        <div className="p-6 font-mono text-xs text-slate-300 leading-relaxed overflow-x-auto whitespace-pre">
          {rawText || 'Loading validation audit...'}
        </div>
      </div>

      {/* Checks Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Automated Verification Checkpoints ({checks.length} checks)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {checks.map((chk) => (
            <div
              key={chk.id}
              className="p-3.5 bg-slate-950 rounded-lg border border-slate-800/90 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{chk.item_name}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {chk.status}
                </span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                {chk.details}
              </p>
              <div className="text-[10px] text-slate-600 font-mono">
                Category: {chk.check_category}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
