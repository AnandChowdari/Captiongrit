const fs = require('fs');

let code = fs.readFileSync('f:/Coding/Projects/Caption Integrit/google-apps-script.js', 'utf8');
let idx = code.indexOf('function handlePaidSignup(payload, ss)');
let endIdx = code.indexOf('function handleBetaSignup');
let handlePaidSignupStr = code.substring(idx, endIdx);

handlePaidSignupStr = handlePaidSignupStr.replace(/sendLicenseEmail\(/g, "await sendLicenseEmail(");
handlePaidSignupStr = handlePaidSignupStr.replace(/function handlePaidSignup/, "async function handlePaidSignup");

const testCode = `
let lockAcquired = false;
let sheetsDb = { Transactions: [], Basic: [], Pro: [], Extreme: [], Beta: [] };

const LockService = {
  getScriptLock: () => ({
    waitLock: (time) => { if (lockAcquired) throw new Error("Mock timeout"); lockAcquired = true; },
    releaseLock: () => { lockAcquired = false; }
  })
};

const PLAN_CONFIG = { basic: { sheetName: "Basic", maxDevices: 1 }, pro: { sheetName: "Pro", maxDevices: 1 }, extreme: { sheetName: "Extreme", maxDevices: 3 } };
const ADMIN_SECRET = "secret";
const TRANSACTIONS_TAB_NAME = "Transactions";
const DEFAULT_HEADERS = [];
const TRANSACTIONS_HEADERS = [];

const Logger = { log: console.log };

function jsonResponse(obj) { return obj; }
function ensureTabExists(ss, name) { return name; }
function validateSheetHeaders() { return []; }

function findTransactionByPaymentId(sheetName, pId) {
  const row = sheetsDb[sheetName].find(r => r.paymentId === pId);
  return row ? { ...row } : null;
}

function findUserInSpecificTab(ss, plan, email) {
  const sheetName = PLAN_CONFIG[plan].sheetName;
  const row = sheetsDb[sheetName].find(r => r.email === email);
  if (row) return { key: row.license_key, colMap: { email_status: "email_status" }, rowData: { email_status: row.email_status } };
  return null;
}

function findUserAcrossTabs(ss, email, key) {
  for (const plan in PLAN_CONFIG) {
    const sheetName = PLAN_CONFIG[plan].sheetName;
    const row = sheetsDb[sheetName].find(r => r.email === email && (!key || r.license_key === key));
    if (row) return { key: row.license_key, sheet: { getName: () => sheetName, deleteRow: (idx) => { sheetsDb[sheetName].splice(idx, 1); } }, rowIndex: sheetsDb[sheetName].indexOf(row), colMap: { plan: "plan", license_key: "license_key", activated_devices: "activated_devices" }, rowData: { plan: row.plan, license_key: row.license_key, activated_devices: row.activated_devices } };
  }
  return null;
}

function appendToPlanTab(ss, plan, obj) { sheetsDb[PLAN_CONFIG[plan].sheetName].push(obj); }
function verifySubscriptionWriteBack(ss, plan, email) { return sheetsDb[PLAN_CONFIG[plan].sheetName].find(r => r.email === email); }
function appendTransactionLog(sheetName, obj) { sheetsDb[sheetName].push(obj); }
function updateTransactionAction(sheetName, pId, action) { const row = sheetsDb[sheetName].find(r => r.paymentId === pId); if (row) row.actionTaken = action; }

async function sendLicenseEmail(email, name, plan, key) {
  console.log("--> 📧 Sending email to " + email);
  await new Promise(r => setTimeout(r, 100)); // Simulate slow MailApp
}

function updateEmailStatusInSheetsLock(ss, email, paymentId, newStatus) {
  for (const plan in PLAN_CONFIG) {
    const row = sheetsDb[PLAN_CONFIG[plan].sheetName].find(r => r.email === email);
    if (row) row.email_status = newStatus;
  }
  const tRow = sheetsDb.Transactions.find(r => r.paymentId === paymentId);
  if (tRow) tRow.email_status = newStatus;
  console.log("--> ✏️ Updated email status to " + newStatus);
}

${handlePaidSignupStr}

async function runTests() {
  console.log("=== TEST 1: One paid_signup ===");
  let payload1 = { secret: "secret", data: { paymentId: "pay_1", email: "test1@test.com", plan: "basic", licenseKey: "CG-1" } };
  let res1 = await handlePaidSignup(payload1, null);
  console.log("Result:", res1.code || res1.status);
  console.log("Basic Sheet len:", sheetsDb.Basic.length);

  console.log("\\n=== TEST 2: Two simultaneous paid_signup (different paymentIds) ===");
  let p2a = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_2a", email: "test2a@test.com", plan: "pro", licenseKey: "CG-2A" } }, null);
  let p2b = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_2b", email: "test2b@test.com", plan: "pro", licenseKey: "CG-2B" } }, null);
  let res2 = await Promise.all([p2a, p2b].map(p => p.catch(e => ({ error: e.message }))));
  console.log("Result 2A:", res2[0].code || res2[0].status || res2[0].error);
  console.log("Result 2B:", res2[1].code || res2[1].status || res2[1].error);
  console.log("Pro Sheet len:", sheetsDb.Pro.length);

  console.log("\\n=== TEST 3: Two simultaneous paid_signup (SAME paymentId) ===");
  let p3a = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_3", email: "test3@test.com", plan: "extreme", licenseKey: "CG-3" } }, null);
  await new Promise(r => setTimeout(r, 10)); // Request 3b arrives while 3a is sending email outside lock
  let p3b = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_3", email: "test3@test.com", plan: "extreme", licenseKey: "CG-3" } }, null);
  let res3 = await Promise.all([p3a, p3b].map(p => p.catch(e => ({ error: e.message }))));
  console.log("Result 3A:", res3[0].code || res3[0].status);
  console.log("Result 3B:", res3[1].code || res3[1].status);
  console.log("Extreme Sheet len:", sheetsDb.Extreme.length, "Transactions:", sheetsDb.Transactions.filter(r => r.paymentId === "pay_3").length);
}
runTests();
`;

fs.writeFileSync('f:/Coding/Projects/Caption Integrit/test_runner.js', testCode, 'utf8');
