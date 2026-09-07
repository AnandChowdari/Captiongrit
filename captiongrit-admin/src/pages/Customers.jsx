import React, { useState } from 'react';
import { 
  Search, Filter, Users, Key, Laptop, RefreshCw, AlertTriangle, 
  CheckCircle, XCircle, Mail, ShieldAlert, Edit3, Plus, ArrowRight, UserX, UserCheck
} from 'lucide-react';

export default function Customers({ customers = [], onExecuteAction, onSelectCustomer, selectedCustomer }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState('overview');
  const [noteText, setNoteText] = useState('');

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.licenseKey?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlan = planFilter === 'ALL' || c.plan.toUpperCase() === planFilter.toUpperCase();
    const matchesStatus = statusFilter === 'ALL' || c.status.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesPlan && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header & Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Customer Management</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage customer accounts, inspect device seats, and perform explicit isolated lifecycle actions.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search by email or key..."
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
            <option value="ALL">All Plans</option>
            <option value="BASIC">Basic (₹399 / $9)</option>
            <option value="PRO">Pro (₹599 / $15)</option>
            <option value="EXTREME">Extreme</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="REVOKED">Revoked</option>
          </select>
        </div>
      </div>

      {/* Customer List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Customer Email</th>
                <th className="py-3.5 px-4">Plan Tier</th>
                <th className="py-3.5 px-4">License Key</th>
                <th className="py-3.5 px-4">Device Seats</th>
                <th className="py-3.5 px-4">Account Status</th>
                <th className="py-3.5 px-4">Created Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredCustomers.map((customer) => (
                <tr
                  key={customer.email}
                  onClick={() => onSelectCustomer(customer)}
                  className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                    selectedCustomer?.email === customer.email ? 'bg-indigo-950/30' : ''
                  }`}
                >
                  <td className="py-3.5 px-4 font-medium text-white">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300">
                        {customer.email.charAt(0).toUpperCase()}
                      </div>
                      <span>{customer.email}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      customer.plan.toUpperCase() === 'PRO' 
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                        : customer.plan.toUpperCase() === 'EXTREME'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      {customer.plan}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-300 text-[11px]">
                    {customer.licenseKey || 'N/A'}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center space-x-1.5 text-slate-300">
                      <Laptop className="w-3.5 h-3.5 text-slate-400" />
                      <span>{customer.activeDevices || 0} / {customer.maxDevices || 1}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                      customer.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' :
                      customer.status === 'Suspended' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-rose-500/10 text-rose-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        customer.status === 'Active' ? 'bg-emerald-400' :
                        customer.status === 'Suspended' ? 'bg-amber-400' : 'bg-rose-400'
                      }`} />
                      <span>{customer.status}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">
                    {customer.createdAt || '2026-02-15'}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCustomer(customer);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition-colors"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}

              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 text-xs">
                    No customers found matching the search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Drawer / Modal Overlay */}
      {selectedCustomer && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-lg border border-indigo-500/30">
                {selectedCustomer.email.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{selectedCustomer.email}</h3>
                <p className="text-xs text-slate-400">Customer ID: {selectedCustomer.email} • Registered {selectedCustomer.createdAt || '2026-02-15'}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => onSelectCustomer(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>

          {/* Action Toolbar (Explicit Isolated Actions) */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 mr-2">Admin Actions:</span>

            {/* Suspend / Reactivate */}
            {selectedCustomer.status === 'Active' ? (
              <button
                onClick={() => onExecuteAction({
                  type: 'suspend',
                  customer: selectedCustomer,
                  title: 'Suspend Customer Account',
                  description: `Are you sure you want to suspend access for ${selectedCustomer.email}?`,
                  severity: 'HIGH'
                })}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Suspend Account</span>
              </button>
            ) : (
              <button
                onClick={() => onExecuteAction({
                  type: 'reactivate',
                  customer: selectedCustomer,
                  title: 'Reactivate Customer Account',
                  description: `Reactivate full system access for ${selectedCustomer.email}?`,
                  severity: 'MEDIUM'
                })}
                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Reactivate Account</span>
              </button>
            )}

            {/* Change Plan */}
            <button
              onClick={() => onExecuteAction({
                type: 'change_plan',
                customer: selectedCustomer,
                title: 'Change Subscription Plan',
                description: `Upgrade or downgrade plan tier for ${selectedCustomer.email}.`,
                severity: 'MEDIUM'
              })}
              className="px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Change Plan</span>
            </button>

            {/* Resend Email */}
            <button
              onClick={() => onExecuteAction({
                type: 'resend_email',
                customer: selectedCustomer,
                title: 'Resend License Email',
                description: `Send official license confirmation email with key to ${selectedCustomer.email}.`,
                severity: 'LOW'
              })}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-blue-400" />
              <span>Resend Email</span>
            </button>

            {/* Reset Devices */}
            <button
              onClick={() => onExecuteAction({
                type: 'reset_devices',
                customer: selectedCustomer,
                title: 'Reset Registered Device Seats',
                description: `Deauthorize all registered hardware seats for ${selectedCustomer.email}. User can register new device on next plugin login.`,
                severity: 'MEDIUM'
              })}
              className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Devices ({selectedCustomer.activeDevices || 0})</span>
            </button>

            {/* Revoke */}
            <button
              onClick={() => onExecuteAction({
                type: 'revoke',
                customer: selectedCustomer,
                title: 'Revoke License Key',
                description: `PERMANENTLY revoke license key ${selectedCustomer.licenseKey} for ${selectedCustomer.email}. This cannot be undone.`,
                severity: 'HIGH'
              })}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Revoke License</span>
            </button>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* License & Plan Info */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">License Metadata</h4>
              
              <div className="flex justify-between items-center text-xs border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">License Key:</span>
                <span className="font-mono text-white font-semibold">{selectedCustomer.licenseKey || 'N/A'}</span>
              </div>
              
              <div className="flex justify-between items-center text-xs border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Plan Tier:</span>
                <span className="font-bold text-indigo-300">{selectedCustomer.plan}</span>
              </div>

              <div className="flex justify-between items-center text-xs border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Conversion Max Duration:</span>
                <span className="text-white font-medium">
                  {selectedCustomer.plan?.toUpperCase() === 'PRO' ? '180 seconds (3 mins)' : '60 seconds'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Seat Limit:</span>
                <span className="text-white font-medium">
                  {selectedCustomer.activeDevices || 0} / {selectedCustomer.maxDevices || 1} Seats Active
                </span>
              </div>
            </div>

            {/* Hardware Seat Information */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">Registered Hardware Seats</h4>
              
              {selectedCustomer.devices && selectedCustomer.devices.length > 0 ? (
                <div className="space-y-2">
                  {selectedCustomer.devices.map((device, idx) => (
                    <div key={idx} className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-mono text-slate-200 text-[11px]">{device.machineId || 'MAC-88F9A'}</div>
                        <div className="text-[10px] text-slate-500">{device.os || 'macOS Monterey'} • CEP v2.4</div>
                      </div>
                      <button
                        onClick={() => onExecuteAction({
                          type: 'remove_device',
                          customer: selectedCustomer,
                          deviceId: device.machineId,
                          title: 'Deauthorize Single Seat',
                          description: `Deauthorize hardware seat ${device.machineId}?`,
                          severity: 'MEDIUM'
                        })}
                        className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded text-[10px] font-semibold"
                      >
                        Remove Seat
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic py-2">No hardware seats currently registered.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
