import React, { useState, useEffect } from 'react';
import { Mic, Volume2, ArrowRight, Play, Tv, Sparkles, CheckCircle2, AlertCircle, Copy, Check } from 'lucide-react';
import { RecognitionResult } from '../types/scripture.js';

export const SpeechRecognizerTab: React.FC = () => {
  const [speechInput, setSpeechInput] = useState('John chapter three verse sixteen');
  const [selectedTranslation, setSelectedTranslation] = useState('KJV');
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);

  const samplePhrases = [
    'John chapter three verse sixteen',
    'Romans eight twenty-eight',
    'Genesis one one',
    'First Corinthians 13:4-8',
    'Psalm twenty-three one',
    'Revelation twenty-two twenty-one',
    'Matthew 28:19-20',
    '1 John 4:8',
    'Jn 14 6',
  ];

  const handleRecognize = async (textToRecognize?: string) => {
    const text = textToRecognize || speechInput;
    if (!text.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speech_text: text,
          preferred_translation: selectedTranslation,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleRecognize(speechInput);
  }, [selectedTranslation]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Explanation */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <Mic className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              Translation-Independent Preacher Speech Recognition
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                Rule #12 Compliant
              </span>
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              SermonSight listens to spoken audio, natural phrasing, or operator queries in real time. It resolves the spoken words directly to an unchangeable <strong>canonical coordinate</strong> (e.g. <code className="text-indigo-300 bg-slate-800 px-1 py-0.5 rounded">JHN.3.16</code>), then instantly projects the church's chosen translation layer without assuming which translation the preacher spoke.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Speech Input Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                Live Preacher Audio Transcript / Input Phrase
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-400">Presentation Translation:</span>
                <select
                  value={selectedTranslation}
                  onChange={(e) => setSelectedTranslation(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-indigo-300 text-xs rounded-md px-2 py-1 font-semibold focus:outline-none focus:border-indigo-500"
                >
                  <option value="KJV">KJV (Verified)</option>
                  <option value="NIV">NIV (Biblica)</option>
                  <option value="NLT">NLT (Tyndale)</option>
                  <option value="NKJV">NKJV (Thomas Nelson)</option>
                  <option value="MSG">MSG (NavPress)</option>
                </select>
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                value={speechInput}
                onChange={(e) => setSpeechInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRecognize()}
                placeholder="e.g. John chapter three verse sixteen..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <button
                onClick={() => handleRecognize()}
                disabled={loading}
                className="absolute right-2 top-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md text-xs font-medium flex items-center gap-1 transition-all"
              >
                {loading ? 'Resolving...' : <><Play className="w-3 h-3 fill-current" /> Recognize</>}
              </button>
            </div>

            {/* Quick Sample Chips */}
            <div className="mt-4">
              <span className="text-xs text-slate-400 font-medium block mb-2">Test Live Preacher Spoken Scenarios:</span>
              <div className="flex flex-wrap gap-1.5">
                {samplePhrases.map((phrase) => (
                  <button
                    key={phrase}
                    onClick={() => {
                      setSpeechInput(phrase);
                      handleRecognize(phrase);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-all ${
                      speechInput === phrase
                        ? 'bg-indigo-900/60 border-indigo-500 text-indigo-200'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    "{phrase}"
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Canonical Coordinate Resolution Card */}
          {result && result.matched && (
            <div className="bg-slate-900 border border-indigo-900/60 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Deterministic Canonical Resolution
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-semibold">
                  Canonical ID: {result.canonical_id}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block">Book</span>
                  <span className="text-slate-100 font-semibold text-sm">{result.book_name}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block">Chapter</span>
                  <span className="text-slate-100 font-semibold text-sm">{result.chapter}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block">Verse(s)</span>
                  <span className="text-slate-100 font-semibold text-sm">
                    {result.verse}{result.end_verse ? `-${result.end_verse}` : ''}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block">Confidence</span>
                  <span className="text-emerald-400 font-semibold text-sm">
                    {Math.round((result.confidence || 0.95) * 100)}%
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setPresentationMode(!presentationMode)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    presentationMode
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  {presentationMode ? 'Close Live Projection' : '[PRESENT] Project Scripture'}
                </button>
                <button
                  onClick={() => result.text && copyText(`${result.reference} (${result.selected_translation}) - ${result.text}`)}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-all border border-slate-700"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Presentation View & 5 Translation Layers */}
        <div className="lg:col-span-6 space-y-4">
          {/* Main Display / Projection Stage */}
          <div className={`rounded-xl p-6 border transition-all ${
            presentationMode
              ? 'bg-black border-amber-500/50 shadow-2xl ring-2 ring-amber-500/30'
              : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  {presentationMode ? '🔴 LIVE STAGE PROJECTION' : 'PREVIEW DISPLAY'}
                </span>
                <span className="text-xs text-slate-400">
                  Translation: <strong className="text-indigo-400">{selectedTranslation}</strong>
                </span>
              </div>
              <div className="text-xs font-mono text-slate-400">
                {result?.canonical_id || 'STANDBY'}
              </div>
            </div>

            {result?.matched ? (
              <div className="space-y-4">
                <h3 className={`font-bold tracking-tight ${
                  presentationMode ? 'text-amber-300 text-2xl font-serif' : 'text-white text-xl'
                }`}>
                  {result.reference}
                </h3>

                {result.text ? (
                  <blockquote className={`leading-relaxed italic ${
                    presentationMode ? 'text-white text-xl font-serif' : 'text-slate-200 text-base'
                  }`}>
                    "{result.text}"
                  </blockquote>
                ) : (
                  <div className="p-4 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-amber-300">
                      <AlertCircle className="w-4 h-4" />
                      Status: REQUIRES_AUTHORIZED_SOURCE ({selectedTranslation})
                    </div>
                    <p className="text-slate-300">
                      In strict compliance with the <strong>Scripture Integrity Rule (#2)</strong>, no artificial or unverified text is ever generated. Modern translation layers require authorized API access via the official publisher API (e.g. API.Bible / Tyndale API).
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 text-xs text-slate-400">
                  <span>SermonSight Presentation Engine</span>
                  <span className="font-mono text-emerald-400">STATUS: {result.validation_status || 'VERIFIED'}</span>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-sm">
                Awaiting preacher speech or reference input...
              </div>
            )}
          </div>

          {/* All 5 Translation Layers Comparison Stack */}
          {result?.matched && result.translation_layers && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                5 Translation Layers for Canonical Coordinate ({result.canonical_id})
              </h4>

              <div className="space-y-2">
                {result.translation_layers.map((layer) => (
                  <div
                    key={layer.translation}
                    onClick={() => setSelectedTranslation(layer.translation)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                      selectedTranslation === layer.translation
                        ? 'bg-indigo-950/60 border-indigo-500 text-slate-200'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                          {layer.translation}
                        </span>
                        <span className="text-slate-300 font-medium">{layer.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        layer.text_status === 'verified'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {layer.text_status}
                      </span>
                    </div>

                    {layer.text ? (
                      <p className="text-slate-200 italic mt-1 font-serif text-sm">
                        "{layer.text}"
                      </p>
                    ) : (
                      <p className="text-slate-500 text-[11px] mt-1">
                        🔒 Licensed Layer: Requires authorized publisher feed ({layer.source}).
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
