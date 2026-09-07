import React, { useState } from 'react';
import { Shield, Key, Link as LinkIcon, AlertTriangle, CheckCircle, Lock, ArrowRight, Trash2 } from 'lucide-react';
import { getStoredAppsScriptUrl, getStoredAdminSecret, isSecretPersisted, setStoredCredentials, forgetCredentials } from '../services/authService';

export default function Login({ onConnected, onUseDemo }) {
  const [url, setUrl] = useState(getStoredAppsScriptUrl() || '');
  const [secret, setSecret] = useState(getStoredAdminSecret() || '');
  const [persist, setPersist] = useState(isSecretPersisted());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('Please provide a Google Apps Script Web App URL.');
      return;
    }
    if (!secret.trim()) {
      setError('Please enter the Admin Secret.');
      return;
    }

    setLoading(true);
    setError('');

    // Save credentials via auth service
    setStoredCredentials(url, secret, persist);

    setTimeout(() => {
      setLoading(false);
      onConnected({ url, secret });
    }, 400);
  };

  const handleClear = (e) => {
    if (e) e.preventDefault();
    forgetCredentials();
    setUrl('');
    setSecret('');
    setPersist(false);
    setError('Credentials cleared from memory and storage.');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-8 bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-900 border-b border-slate-800">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Captiongrit Command Center</h1>
              <p className="text-xs text-indigo-400 font-medium">Local Operations Console</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Connect to your Google Apps Script backend to manage licenses, verify payments, and inspect system audit logs.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Google Apps Script Web App URL
            </label>
            <div className="relative">
              <LinkIcon className="w-4 h-4 absolute left-3 top-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Admin Secret Key
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-3.5 text-slate-500" />
              <input
                type="password"
                placeholder="••••••••••••••••"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 flex items-center space-x-1">
              <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Held in runtime memory. Never logged or exposed in URLs.</span>
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={persist}
                onChange={(e) => setPersist(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Remember secret on this computer</span>
            </label>

            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center space-x-1 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Forget Credentials</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Connect Command Center</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-2 text-slate-500">Or</span></div>
          </div>

          <button
            type="button"
            onClick={onUseDemo}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium rounded-xl border border-slate-700 flex items-center justify-center space-x-2 transition-colors text-xs"
          >
            <span>Launch in Demo Mode (Mock Backend)</span>
          </button>
        </form>

        <div className="p-4 bg-slate-950/50 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-500">
            Captiongrit Console v2.5 • Single Source of Truth GAS Router
          </p>
        </div>
      </div>
    </div>
  );
}
