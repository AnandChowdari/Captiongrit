import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, X } from 'lucide-react';

export default function ActionModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  level = 'low', // 'low' | 'high' | 'critical'
  requiredGuardString = '',
  actionLabel = 'Confirm Action',
  isLoading = false
}) {
  const [reason, setReason] = useState('');
  const [typedGuard, setTypedGuard] = useState('');

  if (!isOpen) return null;

  const isHighOrCritical = level === 'high' || level === 'critical';
  const isCritical = level === 'critical';

  const isConfirmDisabled = isLoading || 
    (isHighOrCritical && !reason.trim()) ||
    (isCritical && typedGuard.trim() !== requiredGuardString);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isConfirmDisabled) return;
    onConfirm({ reason: reason.trim(), guardString: typedGuard.trim() });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isCritical ? 'bg-red-500/20 text-red-400 border-red-500/30' :
              isHighOrCritical ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
              'bg-blue-500/20 text-blue-400 border-blue-500/30'
            }`}>
              {isCritical ? <ShieldAlert size={24} /> : <AlertTriangle size={24} />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isHighOrCritical && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Reason for Action <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Explain why this action is being taken..."
                className="w-full bg-slate-950/60 border border-slate-800 text-white rounded-lg p-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                rows="3"
              />
            </div>
          )}

          {isCritical && requiredGuardString && (
            <div>
              <label className="block text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
                Type <span className="font-mono bg-red-950/60 px-1.5 py-0.5 rounded border border-red-800">{requiredGuardString}</span> to Confirm
              </label>
              <input
                type="text"
                required
                value={typedGuard}
                onChange={e => setTypedGuard(e.target.value)}
                placeholder={`Type "${requiredGuardString}" exactly`}
                className="w-full bg-slate-950/60 border border-red-500/40 text-red-200 font-mono text-xs rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isConfirmDisabled}
              className={`px-5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all shadow-lg ${
                isCritical
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed'
                  : isHighOrCritical
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20 disabled:opacity-50'
              }`}
            >
              {isLoading ? (
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
              ) : (
                actionLabel
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
