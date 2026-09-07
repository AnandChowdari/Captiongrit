import React, { useState } from 'react';
import { HelpCircle, Terminal, Copy, Check, MessageSquare, AlertTriangle } from 'lucide-react';

export default function Support({ supportTickets = [] }) {
  const [copiedCmd, setCopiedCmd] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const copyToClipboard = (cmd) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(''), 2000);
  };

  const filteredTickets = supportTickets.filter(ticket => 
    ticket.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    ticket.issue.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <HelpCircle className="text-slate-400" />
          Support & Diagnostics
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Support Tickets */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              Recent Support Tickets
            </h3>
            <div className="text-sm text-slate-400">
              Showing active issues
            </div>
          </div>

          <div className="mb-4">
            <input 
              type="text" 
              placeholder="Search tickets by email or issue..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {filteredTickets.length > 0 ? (
            <div className="space-y-4">
              {filteredTickets.map(ticket => (
                <div key={ticket.id} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-mono text-sm text-blue-400">{ticket.email}</div>
                      <div className="text-xs text-slate-500">{new Date(ticket.timestamp).toLocaleString()}</div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      ticket.status === 'open' ? 'bg-orange-500/20 text-orange-400' : 
                      ticket.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                    }`}>
                      {ticket.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 mt-2">{ticket.issue}</p>
                  {ticket.systemInfo && (
                    <div className="mt-3 text-xs font-mono bg-slate-950 p-2 rounded text-slate-400">
                      OS: {ticket.systemInfo.os} | CC Ver: {ticket.systemInfo.ccVersion} | Plugin: {ticket.systemInfo.pluginVersion}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No support tickets found.
            </div>
          )}
        </div>

        {/* Diagnostic Tools */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 shadow-xl h-fit">
           <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Terminal className="w-5 h-5 text-purple-400" />
            CEP Plugin Diagnostics
          </h3>
          <p className="text-sm text-slate-400 mb-6">
            Ask the user to run these commands in their terminal/command prompt to gather diagnostic logs for Captiongrit.
          </p>

          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-2">Windows (PowerShell)</h4>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-950 p-3 rounded-lg text-sm text-purple-300 font-mono overflow-x-auto whitespace-nowrap border border-slate-800">
                  Get-Content $env:APPDATA\Captiongrit\logs\plugin.log -Tail 50
                </code>
                <button 
                  onClick={() => copyToClipboard('Get-Content $env:APPDATA\\Captiongrit\\logs\\plugin.log -Tail 50')}
                  className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors flex-shrink-0"
                >
                  {copiedCmd === 'Get-Content $env:APPDATA\\Captiongrit\\logs\\plugin.log -Tail 50' ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-2">macOS (Terminal)</h4>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-950 p-3 rounded-lg text-sm text-purple-300 font-mono overflow-x-auto whitespace-nowrap border border-slate-800">
                  tail -n 50 ~/Library/Logs/Captiongrit/plugin.log
                </code>
                <button 
                  onClick={() => copyToClipboard('tail -n 50 ~/Library/Logs/Captiongrit/plugin.log')}
                  className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors flex-shrink-0"
                >
                   {copiedCmd === 'tail -n 50 ~/Library/Logs/Captiongrit/plugin.log' ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>
            
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg mt-6">
               <div className="flex gap-3">
                 <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                 <div>
                   <h4 className="text-sm font-medium text-orange-400">Common Issue: LocalStorage Corrupt</h4>
                   <p className="text-xs text-slate-400 mt-1">If the plugin hangs on launch, ask the user to clear Premiere Pro CEP cache or reinstall the ZXP.</p>
                 </div>
               </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
