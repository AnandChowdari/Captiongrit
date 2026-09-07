import React, { useState, useEffect } from 'react';
import { Activity, Server, Clock, Database, CheckCircle, XCircle, AlertTriangle, RefreshCw, Zap } from 'lucide-react';

export default function SystemHealth({ healthData, isDemo, onRefreshHealth }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (onRefreshHealth) {
      await onRefreshHealth();
    }
    setIsRefreshing(false);
  };

  const statusData = healthData || {
    gasLatency: 0,
    gasStatus: isDemo ? 'offline' : 'unknown',
    dbSize: 0,
    dbQuota: 100,
    activeConnections: 0,
    schema: { status: 'unknown' }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="text-emerald-400" />
            System Health
          </h2>
          <p className="text-sm text-slate-400 mt-1">Real-time status of backend services</p>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors border border-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Checking...' : 'Refresh Status'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Status Card */}
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-xl flex items-center gap-4">
          <div className={`p-3 rounded-full ${statusData.gasStatus === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
            {statusData.gasStatus === 'ok' ? <CheckCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
          </div>
          <div>
            <div className="text-sm text-slate-400">GAS Backend</div>
            <div className="text-lg font-bold capitalize">{statusData.gasStatus}</div>
          </div>
        </div>

        {/* Latency Card */}
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-xl flex items-center gap-4">
          <div className="p-3 rounded-full bg-blue-500/20 text-blue-400">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-slate-400">Avg Latency</div>
            <div className="text-lg font-bold">{statusData.gasLatency || 0} ms</div>
          </div>
        </div>

        {/* Database Quota Card */}
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-xl flex items-center gap-4">
          <div className="p-3 rounded-full bg-purple-500/20 text-purple-400">
            <Database className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-slate-400">DB Quota</div>
            <div className="text-lg font-bold">{statusData.dbSize || 0} / {statusData.dbQuota || 100} MB</div>
            <div className="w-full bg-slate-700 h-1.5 rounded-full mt-2">
              <div 
                className="bg-purple-500 h-1.5 rounded-full" 
                style={{ width: `${((statusData.dbSize || 0) / (statusData.dbQuota || 100)) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
        
        {/* Active Connections */}
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 shadow-xl flex items-center gap-4">
          <div className="p-3 rounded-full bg-orange-500/20 text-orange-400">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-slate-400">Active Connections</div>
            <div className="text-lg font-bold">{statusData.activeConnections || 0}</div>
          </div>
        </div>
      </div>

      {/* Services Breakdown */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Service Status</h3>
        <div className="space-y-4">
          {[
            { name: 'GAS Web App Router', status: statusData.gasStatus === 'ok' ? 'operational' : 'degraded', uptime: 'N/A', latency: `${statusData.gasLatency || 0}ms` },
            { name: 'Licensing Service', status: statusData.gasStatus === 'ok' ? 'operational' : 'degraded', uptime: 'N/A', latency: 'N/A' },
            { name: 'Database Schema', status: statusData.schema?.status === 'ok' ? 'operational' : 'degraded', uptime: 'N/A', latency: 'N/A', note: statusData.schema?.message },
            { name: 'Email Dispatcher', status: (statusData.emailQuotaRemaining || 0) > 10 ? 'operational' : 'degraded', uptime: 'N/A', latency: 'N/A', note: `Quota remaining: ${statusData.emailQuotaRemaining || 0}` },
          ].map((service, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3">
                {service.status === 'operational' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                )}
                <div>
                  <div className="font-medium text-slate-200">{service.name}</div>
                  {service.note && <div className="text-xs text-orange-400">{service.note}</div>}
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm text-slate-400">
                <div className="flex flex-col items-end">
                  <span className="text-xs">Uptime</span>
                  <span className="font-mono">{service.uptime}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs">Latency</span>
                  <span className="font-mono">{service.latency}</span>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-semibold capitalize ${
                  service.status === 'operational' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'
                }`}>
                  {service.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
