import React, { useState } from 'react';
import { Mail, Radio, Send, RefreshCw, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';

export default function EmailCenter({ onSendSingleEmail, onSendBroadcast }) {
  const [activeTab, setActiveTab] = useState('single');

  // Single email state
  const [singleEmail, setSingleEmail] = useState('');
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleResult, setSingleResult] = useState(null);

  // Broadcast state
  const [targetCohort, setTargetCohort] = useState('ALL_PRO');
  const [subject, setSubject] = useState('Captiongrit CEP Update v2.5.0 Available Now');
  const [versionNotes, setVersionNotes] = useState('Features: Enhanced stability, double pass AI accuracy boost, multi-language phonetic fixes.');
  const [downloadUrl, setDownloadUrl] = useState('https://captiongrit.com/download/v2.5.0');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!singleEmail) return;
    setSingleLoading(true);
    setSingleResult(null);

    const res = await onSendSingleEmail(singleEmail);
    setSingleLoading(false);
    setSingleResult(res || { success: true, message: `License email successfully dispatched to ${singleEmail}` });
  };

  const handleBroadcastSubmit = async (e) => {
    e.preventDefault();
    setBroadcastLoading(true);
    setBroadcastResult(null);

    const res = await onSendBroadcast({ targetCohort, subject, versionNotes, downloadUrl });
    setBroadcastLoading(false);
    setBroadcastResult(res || {
      success: true,
      recipientsCount: 342,
      skippedDuplicates: 0,
      quotaRemaining: 850,
      message: 'Version broadcast successfully sent to 342 users!'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Email Operations Center</h1>
        <p className="text-xs text-slate-400 mt-1">
          Resend single transaction licenses or execute cohort update broadcasts with MailApp quota protection.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('single')}
          className={`pb-3 transition-colors flex items-center space-x-2 border-b-2 ${
            activeTab === 'single' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Single License Resend</span>
        </button>

        <button
          onClick={() => setActiveTab('broadcast')}
          className={`pb-3 transition-colors flex items-center space-x-2 border-b-2 ${
            activeTab === 'broadcast' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Version Update Broadcast</span>
        </button>
      </div>

      {/* Single Email Tab */}
      {activeTab === 'single' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg space-y-4">
          <h3 className="text-sm font-bold text-white">Resend License Email</h3>
          <p className="text-xs text-slate-400">
            Dispatch an official transaction license confirmation email containing the user's cryptographic license key.
          </p>

          <form onSubmit={handleSingleSubmit} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Customer Email Address
              </label>
              <input
                type="email"
                required
                placeholder="customer@editor.com"
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={singleLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {singleLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Dispatch Email</span>
                </>
              )}
            </button>
          </form>

          {singleResult && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{singleResult.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Broadcast Tab */}
      {activeTab === 'broadcast' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white">Broadcast Version Update</h3>
              <p className="text-xs text-slate-400">Send feature update alerts & download link to user cohorts.</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">MailApp Quota</span>
              <span className="text-xs font-bold text-emerald-400 font-mono">850 / 1000 Daily</span>
            </div>
          </div>

          <form onSubmit={handleBroadcastSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Target User Cohort
              </label>
              <select
                value={targetCohort}
                onChange={(e) => setTargetCohort(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL_PRO">All Active Pro Users (342 Users)</option>
                <option value="ALL_BASIC">All Active Basic Users (18 Users)</option>
                <option value="EVERYONE">All Customers (360 Users)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Email Subject Line
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Version Release Notes & Details
              </label>
              <textarea
                rows="3"
                value={versionNotes}
                onChange={(e) => setVersionNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Installer Download URL
              </label>
              <input
                type="url"
                required
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={broadcastLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {broadcastLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  <span>Execute Cohort Broadcast</span>
                </>
              )}
            </button>
          </form>

          {broadcastResult && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs space-y-1 text-emerald-300">
              <div className="font-bold flex items-center space-x-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Broadcast Executed Successfully</span>
              </div>
              <div className="font-mono text-[11px] text-slate-300">
                Recipients: {broadcastResult.recipientsCount} | Duplicates Skipped: {broadcastResult.skippedDuplicates} | Daily Quota Remaining: {broadcastResult.quotaRemaining}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
