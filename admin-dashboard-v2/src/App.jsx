import { useState, useEffect, useRef } from 'react';
import { KeyRound, Users, Send, Settings, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';

function App() {
  const [activeTab, setActiveTab] = useState('single');
  
  // Global Settings
  const [adminSecret, setAdminSecret] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState('https://script.google.com/macros/s/AKfycbzcduRbPRxFLYLMOB5oOXPZqazf4_xlqwWz3zBjKG-R6h3QSSdhI7aZvv2a7ALHvLxn/exec');

  // Single Form State
  const [singleName, setSingleName] = useState('');
  const [singleEmail, setSingleEmail] = useState('');
  const [singlePlan, setSinglePlan] = useState('pro');
  
  // Bulk State
  const [bulkData, setBulkData] = useState([]);
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: string, key?: string, generatedEmail?: string }
  const fileInputRef = useRef(null);

  // Load saved settings on mount
  useEffect(() => {
    const savedSecret = localStorage.getItem('cg_admin_secret');
    const savedUrl = localStorage.getItem('cg_apps_script_url');
    if (savedSecret) setAdminSecret(savedSecret);
    if (savedUrl) setAppsScriptUrl(savedUrl);
  }, []);

  // Save settings when they change
  useEffect(() => {
    if (adminSecret) localStorage.setItem('cg_admin_secret', adminSecret);
    if (appsScriptUrl) localStorage.setItem('cg_apps_script_url', appsScriptUrl);
  }, [adminSecret, appsScriptUrl]);

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!adminSecret || !appsScriptUrl || !singleName || !singleEmail) {
      setStatus({ type: 'error', message: 'Please fill in all required fields.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'generate',
          adminSecret,
          name: singleName,
          email: singleEmail,
          plan: singlePlan
        })
      });

      if (!response.ok) throw new Error('Network error');
      const data = await response.json();

      if (data.success) {
        const planName = singlePlan === "beta" ? "Beta" : singlePlan.charAt(0).toUpperCase() + singlePlan.slice(1);
        const template = `Welcome to Captiongrit!\n\nThank you for getting Captiongrit ${planName}.\nYour official license key is: ${data.key}\n\nPlease install the Captiongrit plugin and enter your email (${singleEmail}) along with this key to activate it.\n\nHappy editing!\nThe Flogrit Team`;
        setStatus({ type: 'success', message: 'License generated successfully!', key: data.key, generatedEmail: template });
        setSingleName('');
        setSingleEmail('');
      } else {
        setStatus({ type: 'error', message: data.message || data.reason || 'Unknown server error' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedData = results.data.map(row => ({
          name: row.Name || row.name || '',
          email: row.Email || row.email || '',
          plan: (row.Plan || row.plan || 'basic').toLowerCase()
        })).filter(row => row.name && row.email);

        if (parsedData.length === 0) {
          setStatus({ type: 'error', message: 'No valid rows found. CSV must contain Name and Email columns.' });
        } else {
          setBulkData(parsedData);
          setStatus({ type: 'success', message: `Loaded ${parsedData.length} valid users from CSV.` });
        }
      },
      error: (error) => {
        setStatus({ type: 'error', message: 'CSV Parse Error: ' + error.message });
      }
    });
  };

  const handleBulkSubmit = async () => {
    if (!adminSecret || !appsScriptUrl) {
      setStatus({ type: 'error', message: 'Please set your Admin Secret and Apps Script URL.' });
      return;
    }
    if (bulkData.length === 0) {
      setStatus({ type: 'error', message: 'No valid data to process.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'bulk_generate',
          adminSecret,
          users: bulkData
        })
      });

      if (!response.ok) throw new Error('Network error');
      const data = await response.json();

      if (data.success) {
        setStatus({ 
          type: 'success', 
          message: `Successfully generated and emailed ${data.generated} licenses! ${data.errors.length > 0 ? `(${data.errors.length} failed)` : ''}` 
        });
        if (data.errors && data.errors.length === 0) {
            setBulkData([]);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
      } else {
        setStatus({ type: 'error', message: data.message || data.reason || 'Bulk generation failed' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 md:p-12 font-sans flex items-center justify-center">
      <div className="max-w-4xl w-full mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3 tracking-tight">
              <span className="p-2 bg-blue-500/20 text-blue-400 rounded-xl"><KeyRound size={28} /></span>
              Captiongrit Admin
            </h1>
            <p className="text-slate-400 mt-2 ml-14">License Generation & Distribution System</p>
          </div>
          
          <div className="flex gap-2 ml-14 md:ml-0 bg-slate-800/50 p-1 rounded-xl border border-slate-700/50 backdrop-blur-md">
            <button 
              onClick={() => setActiveTab('single')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'single' ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Single License
            </button>
            <button 
              onClick={() => setActiveTab('bulk')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'bulk' ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Bulk CSV
            </button>
          </div>
        </div>

        {/* Global Settings Panel */}
        <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Settings size={18} className="text-slate-400" /> API Settings</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Admin Secret</label>
              <input 
                type="password" 
                value={adminSecret}
                onChange={e => setAdminSecret(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder="Enter secret key..."
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Apps Script URL</label>
              <input 
                type="url" 
                value={appsScriptUrl}
                onChange={e => setAppsScriptUrl(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder="https://script.google.com/macros/s/..."
              />
            </div>
          </div>
        </div>

        {status && (
          <div className={`p-4 rounded-xl border flex flex-col gap-3 backdrop-blur-md animate-in slide-in-from-top-2 ${status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            <div className="flex items-start gap-3">
              {status.type === 'success' ? <CheckCircle2 className="shrink-0 mt-0.5" /> : <AlertCircle className="shrink-0 mt-0.5" />}
              <div>
                <p className="font-medium">{status.message}</p>
                {status.key && <div className="mt-2 text-xl font-mono tracking-widest text-emerald-300 font-bold bg-emerald-950/50 inline-block px-4 py-2 rounded-lg border border-emerald-800">{status.key}</div>}
              </div>
            </div>
            {status.type === 'success' && status.generatedEmail && (
              <div className="mt-4 pt-4 border-t border-emerald-500/20 w-full">
                <label className="block text-xs font-bold text-emerald-300/80 uppercase tracking-wider mb-2">Manual Email Template (Edit before copying)</label>
                <textarea 
                  className="w-full bg-slate-900/50 border border-emerald-500/30 text-emerald-100 rounded-lg p-3 font-mono text-sm resize-y focus:outline-none focus:border-emerald-400"
                  rows="6"
                  defaultValue={status.generatedEmail}
                  id="email-template-area"
                />
                <button 
                  onClick={(e) => {
                    const el = document.getElementById("email-template-area");
                    if (el) {
                      navigator.clipboard.writeText(el.value);
                      const old = e.target.innerText;
                      e.target.innerText = "Copied!";
                      setTimeout(() => { e.target.innerText = old; }, 2000);
                    }
                  }}
                  className="mt-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded px-4 py-2 transition-all"
                >
                  Copy Email Template
                </button>
              </div>
            )}
          </div>
        )}

        {/* Content Panels */}
        <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
          
          {/* SINGLE TAB */}
          {activeTab === 'single' && (
            <form onSubmit={handleSingleSubmit} className="space-y-5 animate-in fade-in">
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Customer Name</label>
                  <input 
                    type="text" required
                    value={singleName} onChange={e => setSingleName(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
                  <input 
                    type="email" required
                    value={singleEmail} onChange={e => setSingleEmail(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Plan Tier</label>
                <select 
                  value={singlePlan} onChange={e => setSinglePlan(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all appearance-none"
                >
                  <option value="basic">Basic (1 Device)</option>
                  <option value="pro">Pro (1 Device)</option>
                  <option value="extreme">Extreme (3 Devices)</option>
                  <option value="beta">Beta (7 Days)</option>
                </select>
              </div>

              <button 
                type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-6 py-3.5 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25"
              >
                {loading ? <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span> : <><Send size={18} /> Generate & Send License</>}
              </button>
            </form>
          )}

          {/* BULK TAB */}
          {activeTab === 'bulk' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center bg-slate-900/20 hover:bg-slate-900/40 transition-all">
                <input 
                  type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload}
                  className="hidden" id="csv-upload"
                />
                <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center gap-3">
                  <div className="p-4 bg-slate-800 rounded-full text-blue-400"><UploadCloud size={32} /></div>
                  <div>
                    <p className="text-white font-medium">Click to upload CSV file</p>
                    <p className="text-slate-400 text-sm mt-1">Required columns: Name, Email. Optional: Plan</p>
                  </div>
                </label>
              </div>

              {bulkData.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-medium flex items-center gap-2"><Users size={16}/> Ready to Process ({bulkData.length})</h3>
                  </div>
                  
                  <div className="bg-slate-900/50 border border-slate-700 rounded-lg overflow-hidden">
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 sticky top-0">
                          <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Plan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkData.map((row, i) => (
                            <tr key={i} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-800/30">
                              <td className="px-4 py-3 text-white font-medium">{row.name}</td>
                              <td className="px-4 py-3 text-slate-300">{row.email}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 rounded bg-slate-800 text-xs text-blue-300 border border-slate-700 uppercase">{row.plan}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <button 
                    onClick={handleBulkSubmit} disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg px-6 py-3.5 flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/25"
                  >
                    {loading ? <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span> : <><Send size={18} /> Bulk Generate & Send Emails</>}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default App;
