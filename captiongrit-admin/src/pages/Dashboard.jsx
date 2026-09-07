import React from 'react';
import { 
  Users, Key, Laptop, AlertCircle, TrendingUp, DollarSign, 
  ShieldCheck, RefreshCw, ArrowUpRight, Zap, Radio, Database
} from 'lucide-react';

export default function Dashboard({ data, onNavigate, onQuickAction, isDemo }) {
  const stats = data?.counts ? {
    totalRevenueInr: 0, // Revenue calculation can be added later if needed
    totalRevenueUsd: 0,
    activeCustomers: data.counts.total || 0,
    activeLicenses: data.counts.active || 0,
    activeDevices: 0, // This could be aggregated from licenses if needed
    pendingRecoveries: 0,
    systemStatus: 'Live',
  } : {
    totalRevenueInr: 0,
    totalRevenueUsd: 0,
    activeCustomers: 0,
    activeLicenses: 0,
    activeDevices: 0,
    pendingRecoveries: 0,
    systemStatus: 'Unknown',
  };

  const recentActivity = data?.recentTransactions || [];

  return (
    <div className="space-y-6">
      {/* Demo Warning Banner */}
      {isDemo && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
              !
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-300">DEMO DATA — BACKEND OFFLINE</h4>
              <p className="text-xs text-amber-400/80">
                You are currently viewing simulated local demo data. Connect your Google Apps Script Web App URL in settings to switch to live production data.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('settings')}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-semibold border border-amber-500/40 transition-colors shrink-0"
          >
            Configure GAS URL
          </button>
        </div>
      )}

      {/* Hero Welcome & Quick Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Executive Dashboard</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time telemetry and operational overview for Captiongrit licensing & payment engine.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => onQuickAction('generate_license')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center space-x-2 transition-all"
          >
            <Key className="w-4 h-4" />
            <span>Generate License Key</span>
          </button>

          <button
            onClick={() => onNavigate('recovery')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all"
          >
            <AlertCircle className="w-4 h-4" />
            <span>Recovery Center ({stats.pendingRecoveries})</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* INR Revenue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">India Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              ₹
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">₹{stats.totalRevenueInr?.toLocaleString('en-IN')}</div>
            <p className="text-[11px] text-emerald-400 mt-1 flex items-center space-x-1">
              <TrendingUp className="w-3 h-3" />
              <span>One-Time Licensing • Basic ₹399 / Pro ₹599</span>
            </p>
          </div>
        </div>

        {/* USD Revenue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Intl Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">${stats.totalRevenueUsd?.toLocaleString()}</div>
            <p className="text-[11px] text-blue-400 mt-1 flex items-center space-x-1">
              <TrendingUp className="w-3 h-3" />
              <span>Basic $9 / Pro $15</span>
            </p>
          </div>
        </div>

        {/* Active Customers */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Customers</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">{stats.activeCustomers}</div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
              <span>{stats.activeLicenses} Active Licenses</span>
              <button onClick={() => onNavigate('customers')} className="text-indigo-400 hover:underline">View</button>
            </div>
          </div>
        </div>

        {/* Registered Devices */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Registered Seats</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Laptop className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">{stats.activeDevices}</div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
              <span>Max seats enforced</span>
              <button onClick={() => onNavigate('devices')} className="text-purple-400 hover:underline">Manage</button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Layout: Action Cards & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Commercial Contract & Version Status (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Commercial Plans Reference Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Commercial Tier Reference</h3>
                <p className="text-xs text-slate-400">Strict commercial pricing rules enforced in backend</p>
              </div>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Single Source of Truth
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Basic Tier */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-indigo-400">BASIC PLAN</span>
                  <span className="text-[10px] text-slate-400 uppercase">One-Time</span>
                </div>
                <div className="text-lg font-bold text-white mb-2">₹399 <span className="text-xs font-normal text-slate-400">/ $9</span></div>
                <ul className="text-xs text-slate-300 space-y-1">
                  <li className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>Max 60s per take</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>95% Accuracy • 24 Languages</span>
                  </li>
                  <li className="flex items-center space-x-1.5 text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span>
                    <span>No Word-by-Word / AI Double Pass</span>
                  </li>
                </ul>
              </div>

              {/* Pro Tier */}
              <div className="bg-gradient-to-b from-indigo-950/40 to-slate-950/60 border border-indigo-500/30 rounded-xl p-4 relative">
                <div className="absolute -top-2.5 right-3 bg-indigo-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                  MOST POPULAR
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-indigo-300">PRO PLAN</span>
                  <span className="text-[10px] text-indigo-400 uppercase">One-Time</span>
                </div>
                <div className="text-lg font-bold text-white mb-2">₹599 <span className="text-xs font-normal text-slate-400">/ $15</span></div>
                <ul className="text-xs text-slate-300 space-y-1">
                  <li className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>Max 180s (3 min) per take</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>98% Accuracy • Word-by-Word</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>AI Double Pass & Custom Dictionary</span>
                  </li>
                </ul>
              </div>

              {/* Extreme Tier */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 opacity-75">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-400">EXTREME PLAN</span>
                  <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    COMING SOON
                  </span>
                </div>
                <div className="text-lg font-bold text-slate-400 mb-2">Unlimited Take</div>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    <span>Unlimited Duration</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    <span>Multi-seat Team License</span>
                  </li>
                  <li className="flex items-center space-x-1.5 text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span>
                    <span>Not available for retail purchase</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Quick Operations Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-white mb-4">Command Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => onNavigate('recovery')}
                className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition-all group"
              >
                <AlertCircle className="w-5 h-5 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-white">Payment Recovery</div>
                <div className="text-[10px] text-slate-400">2-stage guarded recovery</div>
              </button>

              <button
                onClick={() => onNavigate('emails')}
                className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition-all group"
              >
                <Radio className="w-5 h-5 text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-white">Version Broadcast</div>
                <div className="text-[10px] text-slate-400">Email updates to users</div>
              </button>

              <button
                onClick={() => onNavigate('integrity')}
                className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition-all group"
              >
                <ShieldCheck className="w-5 h-5 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-white">Integrity Scanner</div>
                <div className="text-[10px] text-slate-400">Audit db anomalies</div>
              </button>

              <button
                onClick={() => onNavigate('audit')}
                className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition-all group"
              >
                <Database className="w-5 h-5 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-white">Audit Trail</div>
                <div className="text-[10px] text-slate-400">Immutable admin log</div>
              </button>
            </div>
          </div>
        </div>

        {/* Activity Stream Sidebar (1 col) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Real-Time Audit Activity</h3>
              <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
            </div>

            <div className="space-y-4">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex space-x-3 pb-3 border-b border-slate-800/80 last:border-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                  <div>
                    <p className="text-xs text-slate-200 leading-snug">{item.message}</p>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNavigate('audit')}
            className="w-full mt-6 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1 transition-colors"
          >
            <span>View Full Audit Log</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
