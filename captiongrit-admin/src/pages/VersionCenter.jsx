import React, { useState } from 'react';
import { Radio, RefreshCw, CheckCircle2, AlertTriangle, Layers, Save, ArrowRight } from 'lucide-react';

export default function VersionCenter({ versionData, onSaveVersion }) {
  const [currentVersion, setCurrentVersion] = useState(versionData?.currentVersion || '1.0.3');
  const [latestVersion, setLatestVersion] = useState(versionData?.latestVersion || '1.0.3');
  const [minRequiredVersion, setMinRequiredVersion] = useState(versionData?.minRequiredVersion || '1.0.0');
  const [releaseStatus, setReleaseStatus] = useState(versionData?.releaseStatus || 'LIVE');
  const [downloadUrl, setDownloadUrl] = useState(versionData?.downloadUrl || 'https://captiongrit.com/download/latest');
  const [releaseDate, setReleaseDate] = useState(versionData?.releaseDate || '2026-03-01');
  const [releaseNotes, setReleaseNotes] = useState(versionData?.releaseNotes || 'Version 1.0.3 release: Fixed macOS CEP permission flags, updated double pass AI dictionary, unified version single source of truth.');

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    const payload = {
      currentVersion,
      latestVersion,
      minRequiredVersion,
      releaseStatus,
      downloadUrl,
      releaseDate,
      releaseNotes,
    };

    await onSaveVersion(payload);
    setSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const isMismatch = currentVersion !== latestVersion;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
          <Layers className="w-6 h-6 text-indigo-400" />
          <span>Single Source of Truth Version Center</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Unified version management for plugin update endpoints, broadcast emails, and GAS licensing backend.
        </p>
      </div>

      {/* Mismatch Warning Alert if any */}
      {isMismatch && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-3 text-xs text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
            <div>
              <span className="font-bold">VERSION MISMATCH DETECTED: </span>
              Current version ({currentVersion}) differs from latest broadcast target ({latestVersion}). Sync backend source of truth to resolve.
            </div>
          </div>
          <button
            onClick={() => setLatestVersion(currentVersion)}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-bold shrink-0 border border-amber-500/40"
          >
            Sync Target Version
          </button>
        </div>
      )}

      {/* Version Management Form */}
      <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 max-w-2xl shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Current Plugin Version
            </label>
            <input
              type="text"
              required
              value={currentVersion}
              onChange={(e) => setCurrentVersion(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Latest Broadcast Target
            </label>
            <input
              type="text"
              required
              value={latestVersion}
              onChange={(e) => setLatestVersion(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Min Required Version
            </label>
            <input
              type="text"
              required
              value={minRequiredVersion}
              onChange={(e) => setMinRequiredVersion(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Release Status Flag
            </label>
            <select
              value={releaseStatus}
              onChange={(e) => setReleaseStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="LIVE">LIVE (Recommended Update)</option>
              <option value="MANDATORY">MANDATORY (Enforced Update)</option>
              <option value="BETA">BETA RELEASE</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Official Release Date
            </label>
            <input
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Official Download Package URL
          </label>
          <input
            type="url"
            required
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Release Notes & Changelog
          </label>
          <textarea
            rows="4"
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="pt-2 flex items-center justify-between">
          {savedSuccess && (
            <div className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Version Single Source of Truth Updated Across GAS Backend!</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="ml-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Publish Version Update to Backend</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
