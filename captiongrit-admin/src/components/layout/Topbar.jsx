import React, { useState, useEffect } from 'react';
import { Search, Bell, ShieldAlert, LogOut, Activity, UserCheck, AlertTriangle } from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { authService } from '../../services/authService';

export default function Topbar({ onSearchSelect, onLogout }) {
  const [status, setStatus] = useState(adminApi.getStatus());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    return adminApi.subscribeStatus(newStatus => setStatus(newStatus));
  }, []);

  const handleSearchChange = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim() || q.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    setShowResults(true);

    try {
      const res = await adminApi.fetchCustomerList('all', q);
      const customers = res.customers || [];

      const results = [];
      customers.forEach(c => {
        results.push({ type: 'CUSTOMER', title: c.name, subtitle: c.email, item: c });
        if (c.licenseKey) {
          results.push({ type: 'LICENSE', title: c.licenseKey, subtitle: `Plan: ${c.plan.toUpperCase()} (${c.email})`, item: c });
        }
        if (c.activatedDevices && c.activatedDevices !== '[]') {
          results.push({ type: 'DEVICE', title: c.activatedDevices, subtitle: `Owner: ${c.email}`, item: c });
        }
      });

      setSearchResults(results.slice(0, 8));
    } catch (err) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (res) => {
    setShowResults(false);
    setSearchQuery('');
    if (onSearchSelect) onSearchSelect(res);
  };

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Global Search Bar */}
      <div className="relative w-96">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
            placeholder="Search email, key, payment ID, device ID..."
            className="w-full bg-slate-950/60 border border-slate-800 text-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* Global Search Popup */}
        {showResults && (
          <div className="absolute left-0 top-full mt-2 w-full bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
            <div className="p-2 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
              <span>Search Results</span>
              {isSearching && <span className="text-blue-400">Searching...</span>}
            </div>
            <div className="max-h-72 overflow-y-auto custom-scrollbar">
              {searchResults.length === 0 ? (
                <div className="p-4 text-xs text-slate-400 text-center">No matching entities found</div>
              ) : (
                searchResults.map((res, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(res)}
                    className="w-full p-2.5 hover:bg-slate-800/80 text-left border-b border-slate-800/50 last:border-0 flex items-center justify-between transition-colors group"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors">{res.title}</div>
                      <div className="text-[11px] text-slate-400">{res.subtitle}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      res.type === 'CUSTOMER' ? 'bg-blue-500/20 text-blue-300' :
                      res.type === 'LICENSE' ? 'bg-purple-500/20 text-purple-300' :
                      'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {res.type}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Backend Status Indicator & Actions */}
      <div className="flex items-center gap-4">
        {/* Real-time Connection Badge */}
        {status.state === 'connected' ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Backend Connected</span>
            <span className="text-[10px] text-emerald-300/70 font-mono">({status.latencyMs}ms)</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium">
            <AlertTriangle size={14} className="shrink-0" />
            <span>DEMO DATA — BACKEND OFFLINE</span>
          </div>
        )}

        {/* Forget Credentials / Logout */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onLogout();
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 text-xs font-medium border border-slate-700 hover:border-rose-500/30 transition-all cursor-pointer z-50 select-none"
          title="Clear credentials from memory and storage"
        >
          <LogOut size={14} />
          <span>Forget Credentials</span>
        </button>
      </div>
    </header>
  );
}
