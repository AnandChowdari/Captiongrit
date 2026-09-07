import React, { useState } from 'react';
import { Database, Search, ShieldCheck, Download, Calendar } from 'lucide-react';
import Papa from 'papaparse';

export default function AuditLog({ logs = [] }) {
  const [searchTerm, setSearchTerm] = useState('');

  const mockLogs = [
    { opId: 'ADM-20260301-9912', action: 'admin_payment_recover', target: 'pay_TYeW3anUti4N7V', secretPrefix: 'adm_sec_...9f2a', timestamp: '2026-03-01 14:25:01', status: 'SUCCESS', details: 'Guarded payment recovery write-back verified.' },
    { opId: 'ADM-20260301-8841', action: 'admin_customer_action (suspend)', target: 'bad.actor@spam.com', secretPrefix: 'adm_sec_...9f2a', timestamp: '2026-03-01 13:10:44', status: 'SUCCESS', details: 'Account access suspended.' },
    { opId: 'ADM-20260301-7102', action: 'admin_email_broadcast_send', target: 'Cohort: ALL_PRO (342 users)', secretPrefix: 'adm_sec_...9f2a', timestamp: '2026-03-01 10:00:12', status: 'SUCCESS', details: 'Version CEP v2.5 broadcast executed.' },
  ];

  const items = logs.length > 0 ? logs : mockLogs;

  const filtered = items.filter(l =>
    l.opId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.target?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportCsv = () => {
    const csv = Papa.unparse(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `captiongrit_admin_audit_log_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Database className="w-6 h-6 text-blue-400" />
            <span>Immutable Admin Audit Trail</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Every isolated admin mutation is assigned an operation ID and logged to the AdminAuditLog tab.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search operation ID or action..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors w-64"
            />
          </div>

          <button
            onClick={handleExportCsv}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Export Audit Log</span>
          </button>
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Operation ID</th>
                <th className="py-3.5 px-4">Action Routine</th>
                <th className="py-3.5 px-4">Target Entity</th>
                <th className="py-3.5 px-4">Auth Hash</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Timestamp</th>
                <th className="py-3.5 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((item) => (
                <tr key={item.opId} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-indigo-400 font-bold">{item.opId}</td>
                  <td className="py-3.5 px-4 font-mono text-white">{item.action}</td>
                  <td className="py-3.5 px-4 text-slate-300">{item.target}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">{item.secretPrefix}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">{item.timestamp}</td>
                  <td className="py-3.5 px-4 text-slate-300">{item.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
