import React, { useState } from 'react';
import { CreditCard, Search, Filter, AlertCircle, ArrowUpRight, DollarSign, CheckCircle } from 'lucide-react';

export default function Payments({ payments = [], onNavigate }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const mockPayments = [
    { paymentId: 'pay_TYeW3anUti4N7V', email: 'hemanthyedlas143@gmail.com', amount: 599, currency: 'INR', gateway: 'Razorpay', status: 'Captured', date: '2026-03-01 14:22' },
    { paymentId: 'pay_TYeNiX7kfbYsoD', email: 'yadavchaithu408@gmail.com', amount: 599, currency: 'INR', gateway: 'Razorpay', status: 'Captured', date: '2026-03-01 12:05' },
    { paymentId: 'pay_TYbQbtifJ3J8bn', email: 'veereboya@gmail.com', amount: 599, currency: 'INR', gateway: 'Razorpay', status: 'Captured', date: '2026-02-28 21:14' },
    { paymentId: 'pay_PP_9921821812', email: 'john.creator@usa.com', amount: 15, currency: 'USD', gateway: 'PayPal', status: 'Captured', date: '2026-02-27 18:30' },
  ];

  const items = payments.length > 0 ? payments : mockPayments;

  const filtered = items.filter(p => {
    const matchesSearch = p.paymentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || p.status?.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payment Ledger</h1>
          <p className="text-xs text-slate-400 mt-1">
            Complete transaction ledger across Razorpay & International payment gateways.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search payment ID or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors w-64"
            />
          </div>

          <button
            onClick={() => onNavigate('recovery')}
            className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all"
          >
            <AlertCircle className="w-4 h-4" />
            <span>Launch Recovery Center</span>
          </button>
        </div>
      </div>

      {/* Payment Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Payment ID</th>
                <th className="py-3.5 px-4">Customer Email</th>
                <th className="py-3.5 px-4">Amount</th>
                <th className="py-3.5 px-4">Gateway</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((item) => (
                <tr key={item.paymentId} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-white font-medium">
                    {item.paymentId}
                  </td>
                  <td className="py-3.5 px-4 text-slate-300">{item.email}</td>
                  <td className="py-3.5 px-4 font-bold text-white">
                    {item.currency === 'INR' ? `₹${item.amount}` : `$${item.amount}`}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">{item.gateway}</td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                      <CheckCircle className="w-3 h-3" />
                      <span>{item.status}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">{item.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
