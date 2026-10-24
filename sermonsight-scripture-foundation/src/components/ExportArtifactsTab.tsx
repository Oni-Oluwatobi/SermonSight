import React, { useState, useEffect } from 'react';
import { Download, FileText, Database, Code, Check, Copy, ExternalLink, HardDrive } from 'lucide-react';

export const ExportArtifactsTab: React.FC = () => {
  const [schemaText, setSchemaText] = useState('');
  const [manifestText, setManifestText] = useState('');
  const [activeCodeTab, setActiveCodeTab] = useState<'schema' | 'manifest' | 'integration'>('schema');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch('/schema.sql')
      .then(res => res.text())
      .then(setSchemaText)
      .catch(console.error);

    fetch('/source-manifest.json')
      .then(res => res.text())
      .then(setManifestText)
      .catch(console.error);
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const integrationCode = `// SermonSight Desktop / Electron / Tauri Scripture Query Example
import { DatabaseSync } from 'node:sqlite';

// Open bundled offline database
const db = new DatabaseSync('sermonsight.ss', { readOnly: true });

// 1. Resolve canonical reference
export function getVerseByCanonicalId(canonicalId = 'JHN.3.16', translation = 'KJV') {
  return db.prepare(\`
    SELECT canonical_id, reference, translation_id, text, validation_status
    FROM verses
    WHERE canonical_id = ? AND translation_id = ?
  \`).get(canonicalId, translation);
}

// 2. Exact keyword / phrase search
export function searchScripture(query = 'love your enemies', translation = 'KJV', limit = 20) {
  const normalized = query.toLowerCase().replace(/[^\\w\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
  return db.prepare(\`
    SELECT canonical_id, reference, text 
    FROM search_index 
    WHERE normalized_text LIKE ? AND translation_id = ?
    LIMIT ?
  \`).all(\`%\${normalized}%\`, translation, limit);
}
`;

  const artifacts = [
    {
      name: 'sermonsight.ss',
      label: 'Master Scripture Database File',
      desc: 'Complete SQLite 3 binary database with 66 books, 1,189 chapters, 31,102 KJV verses, indexes, aliases & manifests.',
      size: '33 MB',
      format: 'Binary (.ss / SQLite)',
      url: '/api/download/sermonsight.ss',
    },
    {
      name: 'validation-report.json',
      label: 'Deterministic Validation Report',
      desc: 'Machine-readable audit report documenting canon integrity, verse counts, error detection & zero-AI compliance.',
      size: '5.2 KB',
      format: 'JSON',
      url: '/api/download/validation-report.json',
    },
    {
      name: 'validation-report.txt',
      label: 'Authoritative Audit Transcript',
      desc: 'Standard formatted text audit with section-by-section breakdown matching Rule #25 specification.',
      size: '2.4 KB',
      format: 'Plain Text',
      url: '/api/download/validation-report.txt',
    },
    {
      name: 'source-manifest.json',
      label: 'Source Attribution & License Manifest',
      desc: 'Detailed attribution records, official URLs, copyright notices and licensing statuses for all 5 translations.',
      size: '3.0 KB',
      format: 'JSON',
      url: '/api/download/source-manifest.json',
    },
    {
      name: 'schema.sql',
      label: 'Complete Database DDL Schema',
      desc: 'Full DDL with table schemas, constraints, foreign keys and performance indexes.',
      size: '3.1 KB',
      format: 'SQL DDL',
      url: '/api/download/schema.sql',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <Database className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              Master Database Artifacts & Portable Export
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                Rule #22 & #31 Compliant
              </span>
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              Deterministic, portable database and artifacts ready to bundle directly into SermonSight church desktop applications.
            </p>
          </div>
        </div>
      </div>

      {/* Artifacts Download Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {artifacts.map((art) => (
          <div
            key={art.name}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-3 transition-all"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-xs font-bold text-white px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                  {art.name}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{art.size}</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-200">{art.label}</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{art.desc}</p>
            </div>

            <a
              href={art.url}
              download
              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Download {art.name}
            </a>
          </div>
        ))}
      </div>

      {/* Code / DDL / Manifest Viewer */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm space-y-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2">
            {[
              { id: 'schema', label: 'schema.sql (DDL)' },
              { id: 'manifest', label: 'source-manifest.json' },
              { id: 'integration', label: 'Desktop Integration Snippet' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveCodeTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  activeCodeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white bg-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              const text =
                activeCodeTab === 'schema'
                  ? schemaText
                  : activeCodeTab === 'manifest'
                  ? manifestText
                  : integrationCode;
              copyToClipboard(text, activeCodeTab);
            }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium flex items-center gap-1 border border-slate-700"
          >
            {copied === activeCodeTab ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied === activeCodeTab ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="p-4 bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto max-h-[400px] scrollbar-thin">
          <pre className="whitespace-pre">
            {activeCodeTab === 'schema'
              ? schemaText || 'Loading schema...'
              : activeCodeTab === 'manifest'
              ? manifestText || 'Loading manifest...'
              : integrationCode}
          </pre>
        </div>
      </div>
    </div>
  );
};
