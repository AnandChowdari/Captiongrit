import React, { useState } from 'react';
import { ShieldAlert, Plus, Clock, Users, ArrowUpRight, CheckCircle, RefreshCw } from 'lucide-react';

export default function BetaManagement({ betaKeys = [], onExecuteAction }) {
  const [searchTerm, setSearchTerm] = useState('');

  const mockBeta = [
    { key: 'CG-BETA-891A-22BF', email: 'beta.tester1@editing.io', expiresAt: '2026-03-15', status: 'Active', usageCount: 42 },
    { key: 'CG-BETA-4411-90FF', email: 'vfx.pro@studio.com', expiresAt: '2026-03-10', status: 'Expiring Soon', usageCount: 128 },
    { key: 'CG-BETA-0012-771A', email: 'vlogger@youtube.com', expiresAt: '2026-02-28', status: 'Expired', usageCount: 15 },
  ];

  const items = betaKeys.length > 0 ? betaKeys : mockBeta;

  const filtered = items.filter(b =>
    b.key?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Beta Program Management</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage early-access beta testers, grant duration extensions, and convert beta users to paid Pro plans.
          </p>
        </div>

        <button
          onClick={() => onExecuteAction({
            type: 'create_beta_key',
            title: 'Issue Early-Access Beta Key',
            description: 'Issue 30-day temporary early-access beta key.',
            severity: 'LOW'
          })}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center space-x-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Issue Beta Key</span>
        </button>
      </div>

      {/* Beta Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Beta Key</th>
                <th className="py-3.5 px-4">Tester Email</th>
                <th className="py-3.5 px-4">Expires On</th>
                <th className="py-3.5 px-4">Takes Processed</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((item) => (
                <tr key={item.key} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-white font-medium">{item.key}</td>
                  <td className="py-3.5 px-4 text-slate-300">{item.email}</td>
                  <td className="py-3.5 px-4 text-slate-400">{item.expiresAt}</td>
                  <td className="py-3.5 px-4 text-slate-300 font-mono">{item.usageCount} takes</td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      item.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' :
                      item.status === 'Expiring Soon' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-rose-500/10 text-rose-400'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-2">
                    <button
                      onClick={() => onExecuteAction({
                        type: 'convert_beta_to_pro',
                        customer: { email: item.email },
                        title: 'Convert Beta to Paid Pro',
                        description: `Upgrade ${item.email} from Beta tester to permanent Pro tier license (₹599 / $15).`,
                        severity: 'MEDIUM'
                      })}
                      className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded text-[11px] font-semibold"
                    >
                      Convert to Pro
                    </button>

                    <button
                      onClick={() => onExecuteAction({
                        type: 'extend_beta',
                        customer: { email: item.email },
                        title: 'Extend Beta Expiration',
                        description: `Extend beta expiration date by 30 additional days for ${item.email}.`,
                        severity: 'LOW'
                      })}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-semibold"
                    >
                      +30 Days
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
