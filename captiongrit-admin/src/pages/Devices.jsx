import React, { useState } from 'react';
import { Laptop, Search, Filter, Trash2, ShieldAlert, Cpu, HardDrive } from 'lucide-react';

export default function Devices({ devices = [], onExecuteAction }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [osFilter, setOsFilter] = useState('ALL');

  const filteredDevices = devices.filter(d => {
    const matchesSearch = d.machineId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          d.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOs = osFilter === 'ALL' || (d.os && d.os.toLowerCase().includes(osFilter.toLowerCase()));
    return matchesSearch && matchesOs;
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Registered Hardware Seats</h1>
          <p className="text-xs text-slate-400 mt-1">
            Monitor registered machine hardware fingerprints, OS platforms, and force deauthorize seats.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search Machine ID or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors w-64"
            />
          </div>

          <select
            value={osFilter}
            onChange={(e) => setOsFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All OS Platforms</option>
            <option value="macOS">macOS</option>
            <option value="Windows">Windows</option>
          </select>
        </div>
      </div>

      {/* Hardware Seat Cards / Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDevices.map((device) => (
          <div key={device.machineId} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative space-y-4 hover:border-slate-700 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-white">{device.machineId}</div>
                  <div className="text-[11px] text-slate-400">{device.email}</div>
                </div>
              </div>

              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                device.os?.toLowerCase().includes('mac') ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              }`}>
                {device.os || 'macOS'}
              </span>
            </div>

            <div className="space-y-1.5 text-xs bg-slate-950/60 rounded-xl p-3 border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center space-x-1"><Cpu className="w-3 h-3 text-slate-500" /><span>CPU Specs:</span></span>
                <span className="text-slate-200 font-mono text-[11px]">{device.cpu || 'Apple M1 / Intel x86'}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center space-x-1"><HardDrive className="w-3 h-3 text-slate-500" /><span>Plugin Version:</span></span>
                <span className="text-indigo-400 font-semibold text-[11px]">{device.pluginVersion || 'v2.5.0'}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Registered:</span>
                <span className="text-slate-300">{device.registeredAt || '2026-02-18'}</span>
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                onClick={() => onExecuteAction({
                  type: 'remove_device',
                  customer: { email: device.email },
                  deviceId: device.machineId,
                  title: 'Deauthorize Hardware Seat',
                  description: `Force deauthorize hardware seat ${device.machineId} for ${device.email}. The user will be required to re-authenticate on next Premiere Pro launch.`,
                  severity: 'HIGH'
                })}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Deauthorize Seat</span>
              </button>
            </div>
          </div>
        ))}

        {filteredDevices.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-2xl">
            No registered hardware seats matching current filters.
          </div>
        )}
      </div>
    </div>
  );
}
