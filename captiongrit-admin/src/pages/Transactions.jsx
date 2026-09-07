import React, { useState } from 'react';
import { Download, Search, FileText, Calendar, Filter } from 'lucide-react';
import Papa from 'papaparse';

export default function Transactions({ transactions = [] }) {
  const [searchTerm, setSearchTerm] = useState('');

  const mockTransactions = [
    { txId: 'TXN-991201', email: 'hemanthyedlas143@gmail.com', plan: 'Pro', amount: '₹599', gateway: 'Razorpay', status: 'SUCCESS', timestamp: '2026-03-01 14:22' },
    { txId: 'TXN-991200', email: 'yadavchaithu408@gmail.com', plan: 'Pro', amount: '₹599', gateway: 'Razorpay', status: 'SUCCESS', timestamp: '2026-03-01 12:05' },
    { txId: 'TXN-991199', email: 'veereboya@gmail.com', plan: 'Pro', amount: '₹599', gateway: 'Razorpay', status: 'SUCCESS', timestamp: '2026-02-28 21:14' },
    { txId: 'TXN-991198', email: 'john.creator@usa.com', plan: 'Pro', amount: '$15', gateway: 'PayPal', status: 'SUCCESS', timestamp: '2026-02-27 18:30' },
  ];

  const items = transactions.length > 0 ? transactions : mockTransactions;

  const filtered = items.filter(t =>
    t.txId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportCsv = () => {
    const csv = Papa.unparse(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `captiongrit_transactions_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Export */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Transaction Ledger</h1>
          <p className="text-xs text-slate-400 mt-1">
            Complete financial transaction history recorded in Google Sheets database.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Filter transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors w-64"
            />
          </div>

          <button
            onClick={handleExportCsv}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center space-x-2 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Transaction ID</th>
                <th className="py-3.5 px-4">Customer Email</th>
                <th className="py-3.5 px-4">Plan</th>
                <th className="py-3.5 px-4">Amount</th>
                <th className="py-3.5 px-4">Gateway</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((item) => (
                <tr key={item.txId} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-white font-medium">{item.txId}</td>
                  <td className="py-3.5 px-4 text-slate-300">{item.email}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {item.plan}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-emerald-400">{item.amount}</td>
                  <td className="py-3.5 px-4 text-slate-400">{item.gateway}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">{item.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
