import React from 'react';
import { BarChart3, TrendingUp, DollarSign, Users, Laptop, PieChart } from 'lucide-react';

export default function Analytics({ stats }) {
  const inrRev = stats?.totalRevenueInr || 458900;
  const usdRev = stats?.totalRevenueUsd || 1450;
  const activeCustomers = stats?.activeCustomers || 342;
  const activeDevices = stats?.activeDevices || 412;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Revenue & Licensing Telemetry</h1>
        <p className="text-xs text-slate-400 mt-1">
          Detailed metrics breakdown across currency channels, commercial plans, and seat distribution.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400 font-semibold uppercase">India Total (INR)</div>
          <div className="text-2xl font-bold text-white mt-2">₹{inrRev.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-emerald-400 mt-1">₹399 / ₹599 One-Time</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400 font-semibold uppercase">International (USD)</div>
          <div className="text-2xl font-bold text-white mt-2">${usdRev.toLocaleString()}</div>
          <div className="text-[11px] text-blue-400 mt-1">$9 / $15 One-Time</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400 font-semibold uppercase">Total Customer Count</div>
          <div className="text-2xl font-bold text-white mt-2">{activeCustomers}</div>
          <div className="text-[11px] text-indigo-400 mt-1">94% Pro Plan Conversion</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400 font-semibold uppercase">Active Seats</div>
          <div className="text-2xl font-bold text-white mt-2">{activeDevices}</div>
          <div className="text-[11px] text-purple-400 mt-1">1.2 Seats per Customer Avg</div>
        </div>
      </div>

      {/* Breakdown Visuals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Plan Revenue Share</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Pro Plan (₹599 / $15) — 88% Share</span>
                <span className="text-indigo-400 font-bold">₹403,800 / $1,275</span>
              </div>
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: '88%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Basic Plan (₹399 / $9) — 12% Share</span>
                <span className="text-slate-400 font-bold">₹55,100 / $175</span>
              </div>
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-slate-600 rounded-full" style={{ width: '12%' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Platform Seats Breakdown</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">macOS (Intel & Apple Silicon M1/M2/M3/M4)</span>
                <span className="text-blue-400 font-bold">65% (268 Seats)</span>
              </div>
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '65%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Windows (x64)</span>
                <span className="text-emerald-400 font-bold">35% (144 Seats)</span>
              </div>
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '35%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
