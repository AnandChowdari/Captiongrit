import React from 'react';
import { 
  LayoutDashboard, Users, KeyRound, Smartphone, CreditCard, RefreshCw, 
  Receipt, Mail, TestTube2, BarChart3, HelpCircle, Activity, ShieldCheck, 
  Layers, LogOut, Cpu, Database
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'licenses', label: 'Licenses', icon: KeyRound },
  { id: 'devices', label: 'Devices', icon: Smartphone },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'recovery', label: 'Payment Recovery', icon: RefreshCw, badge: 'High Risk' },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'emails', label: 'Email Center', icon: Mail },
  { id: 'beta', label: 'Beta Program', icon: TestTube2 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'support', label: 'Support & CEP', icon: HelpCircle },
  { id: 'health', label: 'Backend Health', icon: Activity },
  { id: 'integrity', label: 'Integrity Scanner', icon: ShieldCheck },
  { id: 'audit', label: 'Audit Log', icon: Database },
  { id: 'version', label: 'Version Center', icon: Layers },
];

export default function Sidebar({ currentView, activeTab, onNavigate, setActiveTab, onLogout }) {
  const current = currentView || activeTab || 'dashboard';
  const handleSelect = onNavigate || setActiveTab || (() => {});

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
      {/* Branding */}
      <div className="p-5 border-b border-slate-800 flex items-center gap-3">
        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
          <Cpu size={24} />
        </div>
        <div>
          <h1 className="text-base font-bold text-white tracking-tight">Captiongrit</h1>
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Command Center</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
                  isActive ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info & Forget Credentials Button */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/60 space-y-3">
        {onLogout && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLogout();
            }}
            className="w-full py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Forget Credentials</span>
          </button>
        )}

        <div className="text-[10px] text-slate-500 flex items-center justify-between">
          <span>v1.0.3 Operations</span>
          <span className="text-emerald-400 font-mono">Local Console</span>
        </div>
      </div>
    </aside>
  );
}
