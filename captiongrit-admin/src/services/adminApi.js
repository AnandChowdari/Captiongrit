/**
 * Captiongrit Command Center — Centralized Admin API Bridge
 *
 * ARCHITECTURE RULES:
 * - Admin UI calls adminApi.js -> GAS Admin API -> existing GAS business logic.
 * - React NEVER directly mutates spreadsheet cells.
 * - Secret is passed from runtime memory (authService.getAdminSecret()).
 * - Secret is NEVER logged, outputted in console, or exposed in URLs.
 * - Tracks connection health status (connected, unconfigured, invalid_secret, error) & latency.
 * - If GAS is offline/unconfigured, returns mock data EXPLICITLY labeled as isDemoData: true.
 */

import { authService } from './authService';
let connectionStatus = {
  state: 'unconfigured', // 'connected' | 'unconfigured' | 'invalid_secret' | 'error'
  lastSync: null,
  latencyMs: 0,
  message: 'Backend unconfigured'
};

const listeners = new Set();

function notifyStatusChange() {
  listeners.forEach(fn => fn({ ...connectionStatus }));
}

export const adminApi = {
  subscribeStatus(listener) {
    listeners.add(listener);
    listener({ ...connectionStatus });
    return () => listeners.delete(listener);
  },

  getStatus() {
    return { ...connectionStatus };
  },

  async callGas(actionPayload) {
    const url = authService.getAppsScriptUrl();
    const secret = authService.getAdminSecret();

    if (!secret || !url) {
      connectionStatus = {
        state: secret ? 'unconfigured' : 'invalid_secret',
        lastSync: new Date().toLocaleTimeString(),
        latencyMs: 0,
        message: secret ? 'Apps Script URL missing' : 'Admin Secret missing'
      };
      notifyStatusChange();
      throw new Error(connectionStatus.message);
    }

    const startTime = performance.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          ...actionPayload,
          adminSecret: secret
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.code === 'UNAUTHORIZED') {
        connectionStatus = {
          state: 'invalid_secret',
          lastSync: new Date().toLocaleTimeString(),
          latencyMs,
          message: 'Invalid Admin Secret'
        };
        notifyStatusChange();
        return { isDemoData: false, ...data };
      }

      connectionStatus = {
        state: 'connected',
        lastSync: new Date().toLocaleTimeString(),
        latencyMs,
        message: 'Backend Connected'
      };
      notifyStatusChange();

      return { isDemoData: false, ...data };

    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      connectionStatus = {
        state: 'error',
        lastSync: new Date().toLocaleTimeString(),
        latencyMs,
        message: err.name === 'AbortError' ? 'Timeout (12s)' : err.message
      };
      notifyStatusChange();

      throw err;
    }
  },

  // --- API Endpoint Wrappers ---

  async fetchDashboardData() {
    const res = await this.callGas({ action: 'admin_dashboard_data' });
    if (!res.counts) throw new Error("Invalid response: Missing counts");
    return { isDemoData: false, data: res };
  },

  async fetchCustomerList(tab = 'all', search = '') {
    const res = await this.callGas({ action: 'admin_customer_list', tab, search });
    if (!res.customers) throw new Error("Invalid response: Missing customers array");
    return { isDemoData: false, customers: res.customers, count: res.count };
  },

  async executeCustomerAction(subAction, email, params = {}) {
    const res = await this.callGas({
      action: 'admin_customer_action',
      subAction,
      email,
      ...params
    });
    return res;
  },

  async fetchTransactionList() {
    const res = await this.callGas({ action: 'admin_transaction_list' });
    if (!res.transactions) throw new Error("Invalid response: Missing transactions");
    return { isDemoData: false, transactions: res.transactions, count: res.count };
  },

  async previewPaymentRecovery(fromDateStr, toDateStr) {
    const res = await this.callGas({ action: 'admin_payment_preview_recovery', fromDateStr, toDateStr });
    if (res.status === 'error') throw new Error(res.message || "Preview failed");
    return { isDemoData: false, summary: res };
  },

  async recoverPayments(confirmGuard, paymentIdList, fromDateStr, toDateStr) {
    if (confirmGuard !== 'CONFIRM_RECOVERY') {
      return { status: 'error', code: 'GUARD_FAILED', message: 'Safety guard string must equal "CONFIRM_RECOVERY".' };
    }
    return await this.callGas({ action: 'admin_payment_recover', confirmGuard, paymentIdList, fromDateStr, toDateStr });
  },

  async previewBroadcast(opts) {
    return await this.callGas({ action: 'admin_email_broadcast_preview', ...opts });
  },

  async sendBroadcast(opts) {
    return await this.callGas({ action: 'admin_email_broadcast_send', ...opts });
  },

  async fetchHealthCheck() {
    const res = await this.callGas({ action: 'admin_health_check' });
    return res;
  },

  async runIntegrityScan() {
    const res = await this.callGas({ action: 'admin_integrity_scan' });
    if (!res.issues) throw new Error("Invalid response: Missing issues array");
    return { isDemoData: false, issueCount: res.issueCount, issues: res.issues };
  },

  async fetchVersionInfo() {
    const res = await this.callGas({ action: 'admin_version_info' });
    return res;
  },

  async fetchAuditList() {
    const res = await this.callGas({ action: 'admin_audit_list' });
    if (!res.logs) throw new Error("Invalid response: Missing logs array");
    return { isDemoData: false, logs: res.logs };
  }
};

export default adminApi;
