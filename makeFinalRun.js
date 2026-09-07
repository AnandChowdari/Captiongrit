const fs = require('fs');

let code = fs.readFileSync('f:/Coding/Projects/Caption Integrit/google-apps-script.js', 'utf8');

function extractBlock(startMarker, endMarker) {
    let start = code.indexOf(startMarker);
    if (start === -1) throw new Error("Missing start: " + startMarker);
    let end = code.indexOf(endMarker, start + 1);
    if (end === -1) end = code.length;
    return code.substring(start, end);
}

let handlePaidSignupStr = extractBlock('function handlePaidSignup', 'function updateEmailStatusInSheetsLock');
let recStr = extractBlock('function recoverFailedPayment', 'function validateDatabaseSchemas');
let execStr = extractBlock('function recoverRazorpayPayments', 'function handleAdminAction');

const testCode = `
var lockAcquired = false;
var sheetsDb = { Transactions: [], Basic: [], Pro: [], Extreme: [], Beta: [] };
var logBuffer = [];
var emailFailures = 0;
var emailDispatches = 0;

var LockService = {
  getScriptLock: () => ({
    waitLock: (time) => { if (lockAcquired) throw new Error("CONCURRENCY_ERROR: Could not acquire script lock."); lockAcquired = true; },
    releaseLock: () => { lockAcquired = false; }
  })
};

var SpreadsheetApp = {
  openByUrl: () => ({
    getSheetByName: (name) => name
  })
};

var PropertiesService = { getScriptProperties: () => ({ getProperty: () => "secret" }) };

var PLAN_CONFIG = { basic: { sheetName: "Basic", maxDevices: 1 }, pro: { sheetName: "Pro", maxDevices: 1 }, extreme: { sheetName: "Extreme", maxDevices: 3 } };
var ADMIN_SECRET = "secret";
var TRANSACTIONS_TAB_NAME = "Transactions";
var DEFAULT_HEADERS = [];
var TRANSACTIONS_HEADERS = [];
var SPREADSHEET_URL = "test";

var Logger = { log: (msg) => { logBuffer.push(msg); } };

function jsonResponse(obj) { return obj; }
function ensureTabExists(ss, name) { return name; }
function validateSheetHeaders() { return []; }

function findTransactionByPaymentId(sheetName, pId) {
  const row = sheetsDb["Transactions"].find(r => r.paymentId === pId);
  return row ? { ...row } : null;
}

function findUserInSpecificTab(ss, plan, email) {
  if (!PLAN_CONFIG[plan]) return null;
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
function appendTransactionLog(sheetName, obj) { sheetsDb["Transactions"].push(obj); }
function updateTransactionAction(sheetName, pId, action) { const row = sheetsDb["Transactions"].find(r => r.paymentId === pId); if (row) row.actionTaken = action; }
function generateLicenseKey() { return "CG-GEN-" + Math.floor(Math.random()*1000); }

// Simulate slow synchronous MailApp!
function sendLicenseEmail(email, name, plan, key) {
  emailDispatches++;
  if (emailFailures > 0) {
    emailFailures--;
    throw new Error("Simulated MailApp Failure");
  }
  
  // To simulate concurrency during email sending, we will trigger a background payload 
  // if one is queued up.
  if (global.concurrentPayload) {
      console.log("    [Triggering concurrent payload while email is sending...]");
      let p = global.concurrentPayload;
      global.concurrentPayload = null;
      try {
          if (p.isRecovery) {
             global.concurrentRes = recoverRazorpayPayments("CONFIRM_RECOVERY", [p.data.paymentId], null, null);
          } else {
             global.concurrentRes = handlePaidSignup(p, null);
          }
      } catch(e) {
          global.concurrentError = e;
      }
  }

}

function updateEmailStatusInSheets(ss, email, paymentId, newStatus) {
  for (const plan in PLAN_CONFIG) {
    const row = sheetsDb[PLAN_CONFIG[plan].sheetName].find(r => r.email === email);
    if (row) row.email_status = newStatus;
  }
  const tRow = sheetsDb.Transactions.find(r => r.paymentId === paymentId);
  if (tRow) tRow.email_status = newStatus;
}

function updateEmailStatusInSheetsLock(ss, email, paymentId, newStatus) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    updateEmailStatusInSheets(ss, email, paymentId, newStatus);
  } catch (e) {
    Logger.log("Could not acquire lock to update email status to " + newStatus + " for " + email);
  } finally {
    lock.releaseLock();
  }
}

${handlePaidSignupStr}
${recStr}
${execStr}

function resetDb() {
  sheetsDb = { Transactions: [], Basic: [], Pro: [], Extreme: [], Beta: [] };
  logBuffer = [];
  emailDispatches = 0;
  lockAcquired = false;
  emailFailures = 0;
  global.concurrentPayload = null;
  global.concurrentError = null;
  global.concurrentRes = null;
}

function printReport(testName, input, startTime, result, beforeDb, afterDb, errors) {
  let endTime = Date.now();
  console.log("\\n=======================================================");
  console.log("TEST:", testName);
  console.log("INPUT:", JSON.stringify(input));
  console.log("EXECUTION TIME:", (endTime - startTime) + "ms");
  console.log("RESULT:", typeof result === 'object' ? JSON.stringify(result) : result);
  console.log("ROWS BEFORE:", JSON.stringify({ Basic: beforeDb.Basic.length, Pro: beforeDb.Pro.length, Extreme: beforeDb.Extreme.length, Trans: beforeDb.Transactions.length }));
  console.log("ROWS AFTER:", JSON.stringify({ Basic: afterDb.Basic.length, Pro: afterDb.Pro.length, Extreme: afterDb.Extreme.length, Trans: afterDb.Transactions.length }));
  
  let trans = afterDb.Transactions;
  if (trans.length > 0) {
    console.log("EMAIL STATUS(ES):", trans.map(t => t.email_status).join(", "));
  }
  
  let dupLicense = false, dupTrans = false;
  let allEmails = trans.map(t => t.email);
  if (new Set(allEmails).size !== allEmails.length) dupTrans = true; // basic heuristic
  if (trans.length > 1 && new Set(trans.map(t=>t.paymentId)).size !== trans.length) dupTrans = true;
  
  console.log("DUPLICATE LICENSE/TRANS?:", dupTrans ? "YES" : "NO");
  console.log("CONCURRENCY_ERROR OCCURRED?:", errors.some(e => String(e).includes("CONCURRENCY_ERROR")) ? "YES" : "NO");
  console.log("EMAILS DISPATCHED:", emailDispatches);
}

function runTests() {

  // TEST 1
  resetDb();
  let start1 = Date.now();
  let b1 = JSON.parse(JSON.stringify(sheetsDb));
  let res1 = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_1", email: "test1@test.com", plan: "basic", licenseKey: "CG-1" } }, null);
  printReport("1. Single standard paid_signup", "pay_1 (basic)", start1, res1, b1, sheetsDb, []);

  // TEST 2
  resetDb();
  let start2 = Date.now();
  let b2 = JSON.parse(JSON.stringify(sheetsDb));
  let res2a, res2b;
  let errs2 = [];
  try {
      global.concurrentPayload = { secret: "secret", data: { paymentId: "pay_2b", email: "test2b@test.com", plan: "pro", licenseKey: "CG-2B" } };
      res2a = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_2a", email: "test2a@test.com", plan: "pro", licenseKey: "CG-2A" } }, null);
      if (global.concurrentError) errs2.push(global.concurrentError);
  } catch(e) { errs2.push(e); }
  printReport("2. Two simultaneous paid_signup (different paymentIds)", "pay_2a, pay_2b", start2, [res2a, global.concurrentRes], b2, sheetsDb, errs2);

  // TEST 3
  resetDb();
  let start3 = Date.now();
  let b3 = JSON.parse(JSON.stringify(sheetsDb));
  let errs3 = [];
  let res3a;
  try {
      global.concurrentPayload = { secret: "secret", data: { paymentId: "pay_3", email: "test3@test.com", plan: "extreme", licenseKey: "CG-3" } };
      res3a = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_3", email: "test3@test.com", plan: "extreme", licenseKey: "CG-3" } }, null);
      if (global.concurrentError) errs3.push(global.concurrentError);
  } catch(e) { errs3.push(e); }
  printReport("3. Two simultaneous paid_signup (SAME paymentId)", "pay_3 (x2)", start3, [res3a, global.concurrentRes], b3, sheetsDb, errs3);

  // TEST 4
  resetDb();
  let start4 = Date.now();
  let b4 = JSON.parse(JSON.stringify(sheetsDb));
  emailFailures = 1;
  let res4 = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_4", email: "test4@test.com", plan: "basic", licenseKey: "CG-4" } }, null);
  printReport("4. Email failure after successful Sheet fulfillment", "pay_4", start4, res4, b4, sheetsDb, []);

  // TEST 5
  // keeping the state from test 4
  let start5 = Date.now();
  let b5 = JSON.parse(JSON.stringify(sheetsDb));
  emailDispatches = 0;
  let res5 = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_4", email: "test4@test.com", plan: "basic", licenseKey: "CG-4" }, resendEmail: true }, null);
  printReport("5. Retry after email failure", "pay_4 retry", start5, res5, b5, sheetsDb, []);

  // TEST 6
  resetDb();
  global.fetchSingleRazorpayPayment = function(pId) {
    return { id: pId, status: "captured", email: pId.replace("pay_", "recov_") + "@test.com", amount: 59900, currency: "INR", notes: {} };
  };
  global.fetchRazorpayOrderFromApi = function(oId) { return null; };
  global.determinePlanFromRazorpayMetadata = function(p, o) { return "basic"; };
  
  let start6 = Date.now();
  let b6 = JSON.parse(JSON.stringify(sheetsDb));
  let errs6 = [];
  let res6a;
  try {
      global.concurrentPayload = { isRecovery: true, data: { paymentId: "pay_6" } };
      res6a = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_6", email: "recov_6@test.com", plan: "basic", licenseKey: "CG-6" } }, null);
      if (global.concurrentError) errs6.push(global.concurrentError);
  } catch(e) { errs6.push(e); }
  printReport("6. Recovery running concurrently with paid_signup", "pay_6", start6, [res6a, global.concurrentRes], b6, sheetsDb, errs6);

  // TEST 7
  resetDb();
  let start7 = Date.now();
  let b7 = JSON.parse(JSON.stringify(sheetsDb));
  let res7 = recoverRazorpayPayments("CONFIRM_RECOVERY", ["pay_7a", "pay_7b", "pay_7c"], null, null);
  printReport("7. Multiple recovery payments", "pay_7a, pay_7b, pay_7c", start7, res7, b7, sheetsDb, []);

}

runTests();
`

fs.writeFileSync('f:/Coding/Projects/Caption Integrit/finalRun.js', testCode, 'utf8');
