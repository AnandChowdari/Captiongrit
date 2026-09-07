import React, { useState } from 'react';
import { ShieldAlert, Search, RefreshCw, AlertTriangle, CheckCircle, Database, AlertCircle, Play } from 'lucide-react';

export default function IntegrityScanner({ onRunScan, onRemediate }) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState(null);

  const handleScan = async () => {
    setIsScanning(true);
    setScanResults(null);
    
    try {
      if (onRunScan) {
        const res = await onRunScan();
        // Assuming res.issues is an array of anomalies
        setScanResults(res.issues || []);
      }
    } catch (e) {
      console.error(e);
      setScanResults([{ id: 'err', type: 'error', severity: 'high', message: 'Scan failed: ' + e.message, date: new Date().toISOString() }]);
    } finally {
      setIsScanning(false);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'medium': return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
      case 'low': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      default: return 'text-slate-400 bg-slate-500/20 border-slate-500/30';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="text-red-400" />
            Integrity Scanner
          </h2>
          <p className="text-sm text-slate-400 mt-1">Scan database for orphaned records, anomalies, and schema violations</p>
        </div>
        
        <button 
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium shadow-lg shadow-red-900/20 disabled:opacity-50"
        >
          {isScanning ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Play className="w-5 h-5" />
          )}
          {isScanning ? 'Scanning Database...' : 'Run Deep Scan'}
        </button>
      </div>

      {scanResults && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
            <h3 className="font-semibold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-400" />
              Scan Results ({scanResults.length} Anomalies Found)
            </h3>
            <span className="text-xs text-slate-400">Completed just now</span>
          </div>
          
          <div className="divide-y divide-slate-700/50">
            {scanResults.length === 0 ? (
              <div className="p-8 text-center text-emerald-400 flex flex-col items-center gap-2">
                <CheckCircle className="w-12 h-12 mb-2" />
                <div className="font-semibold text-lg">System Integrity Verified</div>
                <div className="text-slate-400 text-sm">No anomalies or orphaned records found in the database.</div>
              </div>
            ) : (
              scanResults.map((result, idx) => (
                <div key={result.id || idx} className="p-4 flex items-start gap-4 hover:bg-slate-700/20 transition-colors">
                  <div className={`px-2 py-1 rounded text-xs font-semibold uppercase border ${getSeverityColor(result.severity)} mt-1`}>
                    {result.severity}
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-200">{result.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs font-mono text-slate-500">
                      <span>Type: {result.type || result.entity}</span>
                      <span>Detected: {result.date ? new Date(result.date).toLocaleString() : 'Just now'}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 italic">
                      Recommended: {result.recommendedAction}
                    </div>
                  </div>
                  <div>
                    <button 
                      onClick={() => onRemediate && onRemediate(result)}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-colors border border-slate-600"
                    >
                      Investigate
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {!scanResults && !isScanning && (
        <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 shadow-xl flex flex-col items-center justify-center text-center">
          <Database className="w-16 h-16 text-slate-600 mb-4" />
          <h3 className="text-xl font-semibold text-slate-300 mb-2">Ready to Scan</h3>
          <p className="text-slate-400 max-w-md">
            The Integrity Scanner will deeply analyze the GAS backend sheets for orphaned payments, duplicate emails, dangling device seats, and schema anomalies.
          </p>
        </div>
      )}
      
      {isScanning && (
         <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 shadow-xl flex flex-col items-center justify-center text-center">
          <RefreshCw className="w-16 h-16 text-blue-500 animate-spin mb-4" />
          <h3 className="text-xl font-semibold text-slate-300 mb-2">Analyzing Database...</h3>
          <p className="text-slate-400">
            Checking sheets, verifying relationships, and scanning for corruption. This may take a moment.
          </p>
        </div>
      )}

    </div>
  );
}
