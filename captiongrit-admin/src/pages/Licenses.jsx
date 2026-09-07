import React, { useState } from 'react';
import { Key, Plus, Copy, Check, Filter, Search, Laptop, ShieldCheck, Clock } from 'lucide-react';

export default function Licenses({ licenses = [], onGenerateKey }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  // Form state for generating license
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('PRO');
  const [maxDevices, setMaxDevices] = useState(1);
  const [customDuration, setCustomDuration] = useState('');

  const filteredLicenses = licenses.filter(l => {
    const matchesSearch = l.licenseKey?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          l.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlan = planFilter === 'ALL' || l.plan?.toUpperCase() === planFilter.toUpperCase();
    return matchesSearch && matchesPlan;
  });

  const handleCopy = (key) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleGenerate = (e) => {
    e.preventDefault();
    if (!email) return;

    let duration = plan === 'PRO' ? 180 : plan === 'BASIC' ? 60 : parseInt(customDuration) || 9999;
    onGenerateKey({ email, plan, maxDevices, maxDuration: duration });
    setShowModal(false);
    setEmail('');
  };

  return (
    <div className="space-y-6">
      {/* Header & Generate Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">License Key Vault</h1>
          <p className="text-xs text-slate-400 mt-1">
            Issue, inspect, and manage Captiongrit cryptographic license keys.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search keys or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors w-64"
            />
          </div>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Tier Keys</option>
            <option value="BASIC">Basic Keys</option>
            <option value="PRO">Pro Keys</option>
          </select>

          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center space-x-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Generate New Key</span>
          </button>
        </div>
      </div>

      {/* License Inventory Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">License Key</th>
                <th className="py-3.5 px-4">Assigned Email</th>
                <th className="py-3.5 px-4">Plan Tier</th>
                <th className="py-3.5 px-4">Max Duration</th>
                <th className="py-3.5 px-4">Device Seats</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredLicenses.map((item) => (
                <tr key={item.licenseKey} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-white font-medium flex items-center space-x-2">
                    <Key className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>{item.licenseKey}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300">{item.email}</td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      item.plan?.toUpperCase() === 'PRO' 
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      {item.plan}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{item.maxDuration || (item.plan === 'PRO' ? 180 : 60)}s</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300">
                    <div className="flex items-center space-x-1">
                      <Laptop className="w-3 h-3 text-purple-400" />
                      <span>{item.activeDevices || 0} / {item.maxDevices || 1}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                      item.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'Active' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <span>{item.status}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleCopy(item.licenseKey)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors inline-flex items-center space-x-1 text-[11px]"
                    >
                      {copiedKey === item.licenseKey ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Key Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Key className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Generate Manual License Key</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Customer Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="editor@creator.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Plan Tier Contract
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPlan('BASIC')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      plan === 'BASIC' ? 'bg-indigo-950/50 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold">BASIC TIER</div>
                    <div className="text-[10px] mt-0.5">₹399 / $9 • 60s max take</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlan('PRO')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      plan === 'PRO' ? 'bg-indigo-950/50 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold">PRO TIER</div>
                    <div className="text-[10px] mt-0.5">₹599 / $15 • 180s max take</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Allowed Hardware Seats
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={maxDevices}
                  onChange={(e) => setMaxDevices(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20"
                >
                  Issue License Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
