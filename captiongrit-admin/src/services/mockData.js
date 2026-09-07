/**
 * Captiongrit Command Center — Mock/Fallback Data
 * Explicitly labeled DEMO DATA for offline/unconfigured local development.
 */

export const mockDashboardData = {
  counts: {
    total: 148,
    basic: 42,
    pro: 86,
    extreme: 0, // Extreme is Coming Soon
    beta: 20,
    active: 135,
    inactive: 13
  },
  recentTransactions: [
    { paymentId: "pay_TYeW3anUti4N7V", email: "hemanthyedlas143@gmail.com", plan: "pro", amount: "599", actionTaken: "recovered_beta_upgrade", timestamp: "2026-09-06T11:40:00Z" },
    { paymentId: "pay_TYeNiX7kfbYsoD", email: "yadavchaithu408@gmail.com", plan: "pro", amount: "599", actionTaken: "recovered_beta_upgrade", timestamp: "2026-09-06T11:20:00Z" },
    { paymentId: "pay_TYbQbtifJ3J8bn", email: "veereboya@gmail.com", plan: "pro", amount: "599", actionTaken: "recovered_paid_signup", timestamp: "2026-09-06T10:15:00Z" },
    { paymentId: "pay_TRiwoJPqfMgimw", email: "suman.redfm@gmail.com", plan: "pro", amount: "599", actionTaken: "recovered_existing_license", timestamp: "2026-09-05T18:00:00Z" }
  ],
  systemTime: new Date().toISOString()
};

export const mockCustomers = [
  { name: "Hemanth Yedlas", email: "hemanthyedlas143@gmail.com", licenseKey: "CG-HEM1-PRO7-9912", plan: "pro", status: "active", tabName: "Pro", maxDevices: 1, activatedDevices: '["DEV-MAC-PRO-1"]', emailStatus: "sent", expiry: "" },
  { name: "Chaithanya Yadav", email: "yadavchaithu408@gmail.com", licenseKey: "CG-YAD2-PRO8-4421", plan: "pro", status: "active", tabName: "Pro", maxDevices: 1, activatedDevices: '["DEV-WIN-PC-2"]', emailStatus: "sent", expiry: "" },
  { name: "Veereboya Creator", email: "veereboya@gmail.com", licenseKey: "CG-VEE3-PRO9-8833", plan: "pro", status: "active", tabName: "Pro", maxDevices: 1, activatedDevices: '[]', emailStatus: "sent", expiry: "" },
  { name: "Suman RedFM", email: "suman.redfm@gmail.com", licenseKey: "CG-SUM4-PRO1-1144", plan: "pro", status: "active", tabName: "Pro", maxDevices: 1, activatedDevices: '["DEV-MAC-STUDIO"]', emailStatus: "sent", expiry: "" },
  { name: "Rohan Basic", email: "rohan@example.com", licenseKey: "CG-ROH5-BAS2-5566", plan: "basic", status: "active", tabName: "Basic", maxDevices: 1, activatedDevices: '["DEV-WIN-LAPTOP"]', emailStatus: "sent", expiry: "" },
  { name: "Beta Tester One", email: "beta1@example.com", licenseKey: "CG-BET6-TRY3-7788", plan: "beta", status: "active", tabName: "Beta", maxDevices: 1, activatedDevices: '["DEV-TEST-1"]', emailStatus: "sent", expiry: "2026-09-09T00:00:00Z" }
];

export const mockTransactions = [
  { transactionId: "TXN-1001", paymentId: "pay_TYeW3anUti4N7V", orderId: "order_TYeW3anUti4N7V", email: "hemanthyedlas143@gmail.com", plan: "pro", amount: "599", currency: "INR", timestamp: "2026-09-06T11:40:00Z", status: "success", licenseKey: "CG-HEM1-PRO7-9912", actionTaken: "recovered_beta_upgrade", email_status: "sent" },
  { transactionId: "TXN-1002", paymentId: "pay_TYeNiX7kfbYsoD", orderId: "order_TYeNiX7kfbYsoD", email: "yadavchaithu408@gmail.com", plan: "pro", amount: "599", currency: "INR", timestamp: "2026-09-06T11:20:00Z", status: "success", licenseKey: "CG-YAD2-PRO8-4421", actionTaken: "recovered_beta_upgrade", email_status: "sent" },
  { transactionId: "TXN-1003", paymentId: "pay_TYbQbtifJ3J8bn", orderId: "order_TYbQbtifJ3J8bn", email: "veereboya@gmail.com", plan: "pro", amount: "599", currency: "INR", timestamp: "2026-09-06T10:15:00Z", status: "success", licenseKey: "CG-VEE3-PRO9-8833", actionTaken: "recovered_paid_signup", email_status: "sent" },
  { transactionId: "TXN-1004", paymentId: "pay_TRiwoJPqfMgimw", orderId: "order_TRiwoJPqfMgimw", email: "suman.redfm@gmail.com", plan: "pro", amount: "599", currency: "INR", timestamp: "2026-09-05T18:00:00Z", status: "success", licenseKey: "CG-SUM4-PRO1-1144", actionTaken: "recovered_existing_license", email_status: "sent" }
];

export const mockIntegrityIssues = [
  { severity: "HIGH", entity: "Customer", explanation: "Legacy user-level copy detected for user beta1@example.com", recommendedAction: "Run clean migration script" },
  { severity: "MEDIUM", entity: "Device", explanation: "Activated device count is 0 for active Pro user veereboya@gmail.com", recommendedAction: "User will register device on next login" }
];

export const mockAuditLogs = [
  { timestamp: "2026-09-06T11:40:05Z", opId: "ADM-20260906-8812", admin: "Admin", action: "recovered_beta_upgrade", customer: "hemanthyedlas143@gmail.com", entity: "Subscription", reason: "Razorpay payment recovery executed" },
  { timestamp: "2026-09-06T11:20:10Z", opId: "ADM-20260906-7734", admin: "Admin", action: "recovered_beta_upgrade", customer: "yadavchaithu408@gmail.com", entity: "Subscription", reason: "Razorpay payment recovery executed" }
];

export const mockData = {
  dashboard: mockDashboardData,
  customers: mockCustomers,
  transactions: mockTransactions,
  integrityIssues: mockIntegrityIssues,
  auditLogs: mockAuditLogs,
  licenses: mockCustomers,
  devices: [
    { machineId: 'DEV-MAC-PRO-1', email: 'hemanthyedlas143@gmail.com', os: 'macOS Monterey', cpu: 'Apple M1', pluginVersion: 'v2.5.0', registeredAt: '2026-03-01' },
    { machineId: 'DEV-WIN-PC-2', email: 'yadavchaithu408@gmail.com', os: 'Windows 11', cpu: 'Intel i7-12700K', pluginVersion: 'v2.5.0', registeredAt: '2026-03-01' },
  ],
  payments: mockTransactions.map(t => ({
    paymentId: t.paymentId,
    email: t.email,
    amount: t.amount,
    currency: t.currency,
    gateway: 'Razorpay',
    status: 'Captured',
    date: t.timestamp
  })),
  orphanedPayments: [
    { paymentId: 'pay_TYeW3anUti4N7V', email: 'hemanthyedlas143@gmail.com', plan: 'Pro', amount: 599, date: '2026-03-01 14:22', state: 'LICENSE_ONLY_MISSING_TRANSACTION' }
  ]
};

export default mockData;
