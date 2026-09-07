import React, { useState, useEffect } from 'react';
import { getStoredAppsScriptUrl, getStoredAdminSecret, forgetCredentials } from './services/authService';
import adminApi from './services/adminApi';
import mockData from './services/mockData';

import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import ActionModal from './components/ui/ActionModal';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Licenses from './pages/Licenses';
import Devices from './pages/Devices';
import Payments from './pages/Payments';
import PaymentRecovery from './pages/PaymentRecovery';
import Transactions from './pages/Transactions';
import EmailCenter from './pages/EmailCenter';
import BetaManagement from './pages/BetaManagement';
import Analytics from './pages/Analytics';
import Support from './pages/Support';
import SystemHealth from './pages/SystemHealth';
import IntegrityScanner from './pages/IntegrityScanner';
import AuditLog from './pages/AuditLog';
import VersionCenter from './pages/VersionCenter';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [connectionStatus, setConnectionStatus] = useState(adminApi.getStatus());

  // Operational Data State
  const [dashboardData, setDashboardData] = useState(mockData.dashboard);
  const [customers, setCustomers] = useState(mockData.customers);
  const [licenses, setLicenses] = useState(mockData.licenses);
  const [devices, setDevices] = useState(mockData.devices);
  const [payments, setPayments] = useState(mockData.payments);
  const [orphanedPayments, setOrphanedPayments] = useState(mockData.orphanedPayments);
  const [transactions, setTransactions] = useState(mockData.transactions);
  const [auditLogs, setAuditLogs] = useState(mockData.auditLogs);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Global Action Modal State
  const [modalConfig, setModalConfig] = useState(null);
  const [globalLoading, setGlobalLoading] = useState(false);

  // Check initial authentication
  useEffect(() => {
    const url = getStoredAppsScriptUrl();
    const secret = getStoredAdminSecret();
    if (url && secret) {
      setIsAuthenticated(true);
      refreshBackendData();
    }
  }, []);

  // Listen to adminApi status updates
  useEffect(() => {
    const unsubscribe = adminApi.subscribeStatus((status) => {
      setConnectionStatus(status);
    });
    return () => unsubscribe();
  }, []);

  const refreshBackendData = async () => {
    setGlobalLoading(true);
    try {
      const dbData = await adminApi.fetchDashboardData();
      if (dbData) {
        if (dbData.stats) setDashboardData(dbData);
        if (dbData.customers) setCustomers(dbData.customers);
        if (dbData.licenses) setLicenses(dbData.licenses);
        if (dbData.devices) setDevices(dbData.devices);
        if (dbData.transactions) setTransactions(dbData.transactions);
        if (dbData.orphanedPayments) setOrphanedPayments(dbData.orphanedPayments);
        if (dbData.auditLogs) setAuditLogs(dbData.auditLogs);
      }
    } catch (e) {
      console.warn('Backend fetch fallback to local state', e);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleConnect = ({ url, secret }) => {
    setIsDemoMode(false);
    setIsAuthenticated(true);
    refreshBackendData();
  };

  const handleUseDemo = () => {
    setIsDemoMode(true);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    forgetCredentials();
    setIsAuthenticated(false);
    setIsDemoMode(false);
  };

  const handleSelectSearchResult = (entity) => {
    if (entity.type === 'customer') {
      const found = customers.find(c => c.email.toLowerCase() === entity.value.toLowerCase());
      if (found) setSelectedCustomer(found);
      setCurrentView('customers');
    } else if (entity.type === 'license') {
      setCurrentView('licenses');
    } else if (entity.type === 'device') {
      setCurrentView('devices');
    }
  };

  // Open Modal for Explicit Actions
  const handleOpenActionModal = (actionPayload) => {
    setModalConfig({
      ...actionPayload,
      onConfirm: async ({ reason }) => {
        setGlobalLoading(true);
        const res = await adminApi.executeCustomerAction({
          action: actionPayload.type,
          email: actionPayload.customer?.email || actionPayload.email,
          reason,
          deviceId: actionPayload.deviceId,
          plan: actionPayload.newPlan
        });
        setGlobalLoading(false);
        setModalConfig(null);
        refreshBackendData();
      }
    });
  };

  // Quick action from dashboard
  const handleQuickAction = (type) => {
    if (type === 'generate_license') {
      setCurrentView('licenses');
    }
  };

  if (!isAuthenticated) {
    return <Login onConnected={handleConnect} onUseDemo={handleUseDemo} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        onLogout={handleLogout}
      />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <Topbar
          connectionStatus={connectionStatus}
          isDemo={isDemoMode}
          onSelectResult={handleSelectSearchResult}
          onForget={handleLogout}
        />

        {/* Dynamic Page Workspace */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {currentView === 'dashboard' && (
            <Dashboard
              data={dashboardData}
              onNavigate={setCurrentView}
              onQuickAction={handleQuickAction}
              isDemo={isDemoMode}
            />
          )}

          {currentView === 'customers' && (
            <Customers
              customers={customers}
              selectedCustomer={selectedCustomer}
              onSelectCustomer={setSelectedCustomer}
              onExecuteAction={handleOpenActionModal}
            />
          )}

          {currentView === 'licenses' && (
            <Licenses
              licenses={licenses}
              onGenerateKey={async (payload) => {
                await adminApi.executeCustomerAction({ action: 'generate_key', ...payload });
                refreshBackendData();
              }}
            />
          )}

          {currentView === 'devices' && (
            <Devices
              devices={devices}
              onExecuteAction={handleOpenActionModal}
            />
          )}

          {currentView === 'payments' && (
            <Payments
              payments={payments}
              onNavigate={setCurrentView}
            />
          )}

          {currentView === 'recovery' && (
            <PaymentRecovery
              orphanedPayments={orphanedPayments}
              onPreviewRecovery={async (paymentId) => {
                return await adminApi.previewPaymentRecovery(paymentId);
              }}
              onExecuteRecovery={async (paymentId, confirmStr) => {
                const res = await adminApi.executePaymentRecovery(paymentId, confirmStr);
                refreshBackendData();
                return res;
              }}
            />
          )}

          {currentView === 'transactions' && (
            <Transactions transactions={transactions} />
          )}

          {currentView === 'emails' && (
            <EmailCenter
              onSendSingleEmail={async (email) => {
                return await adminApi.executeCustomerAction({ action: 'resend_email', email });
              }}
              onSendBroadcast={async (payload) => {
                return await adminApi.sendVersionBroadcast(payload);
              }}
            />
          )}

          {currentView === 'beta' && (
            <BetaManagement
              betaKeys={[]}
              onExecuteAction={handleOpenActionModal}
            />
          )}

          {currentView === 'analytics' && (
            <Analytics stats={dashboardData?.stats} />
          )}

          {currentView === 'support' && (
            <Support />
          )}

          {currentView === 'health' && (
            <SystemHealth
              healthData={null}
              isDemo={isDemoMode}
              onRefreshHealth={refreshBackendData}
            />
          )}

          {currentView === 'integrity' && (
            <IntegrityScanner
              onRunScan={async () => {
                return await adminApi.runIntegrityScan();
              }}
              onRemediate={async (anomaly) => {
                handleOpenActionModal({
                  type: 'remediate_anomaly',
                  title: `Auto Remediate ${anomaly.type}`,
                  description: `Execute automated fix for ${anomaly.details}.`,
                  severity: 'HIGH'
                });
              }}
            />
          )}

          {currentView === 'audit' && (
            <AuditLog logs={auditLogs} />
          )}

          {currentView === 'version' && (
            <VersionCenter
              versionData={null}
              onSaveVersion={async (payload) => {
                return await adminApi.updateVersionConfig(payload);
              }}
            />
          )}

          {currentView === 'settings' && (
            <Login onConnected={handleConnect} onUseDemo={handleUseDemo} />
          )}
        </main>
      </div>

      {/* Global 3-Level Action Modal */}
      {modalConfig && (
        <ActionModal
          isOpen={true}
          onClose={() => setModalConfig(null)}
          onConfirm={modalConfig.onConfirm}
          title={modalConfig.title}
          description={modalConfig.description}
          severity={modalConfig.severity}
          requireReason={modalConfig.severity === 'HIGH'}
          confirmGuardString={modalConfig.confirmGuardString}
          loading={globalLoading}
        />
      )}
    </div>
  );
}
