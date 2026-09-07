let handlePaidSignupStr = `async function handlePaidSignup(payload, ss) {
  if (payload.secret !== ADMIN_SECRET) {
    return jsonResponse({ status: "error", code: "UNAUTHORIZED", message: "Invalid or missing secret token." });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return jsonResponse({ status: "error", code: "CONCURRENCY_ERROR", message: "Server busy. Please try again." });
  }

  try {
    var pd = payload.data || {};
    var paymentId = (pd.paymentId || "").trim();
    var email = (pd.email || "").trim().toLowerCase();
    var plan = (pd.plan || "").trim().toLowerCase();
    var payloadLicenseKey = (pd.licenseKey || "").trim();

    if (!paymentId || !email || !plan || (!payloadLicenseKey && !pd.isRecovery)) {
      return jsonResponse({ status: "error", code: "INVALID_PAYLOAD", message: "Missing required fields." });
    }

    if (!PLAN_CONFIG[plan]) {
      return jsonResponse({ status: "error", code: "INVALID_PLAN", message: "Unrecognized plan: " + plan });
    }

    // 1. Schema Validation (Fail Fast if mandatory headers missing)
    var planConfig = PLAN_CONFIG[plan];
    var targetSheet = ensureTabExists(ss, planConfig.sheetName, DEFAULT_HEADERS);
    var missingHeaders = validateSheetHeaders(targetSheet, DEFAULT_HEADERS);
    if (missingHeaders.length > 0) {
      Logger.log("CRITICAL SCHEMA ERROR: Sheet '" + planConfig.sheetName + "' is missing headers: " + missingHeaders.join(", "));
      return jsonResponse({ status: "error", code: "SCHEMA_ERROR", message: "Database schema header missing: " + missingHeaders[0] });
    }

    var transSheet = ensureTabExists(ss, TRANSACTIONS_TAB_NAME, TRANSACTIONS_HEADERS);
    var transMatch = findTransactionByPaymentId(transSheet, paymentId);
    var targetSubMatch = findUserInSpecificTab(ss, plan, email);

    // STATE E / H: Already Fully Provisioned
    if (targetSubMatch && transMatch && transMatch.email_status === "sent") {
      return jsonResponse({
        status: "success",
        code: "ALREADY_FULFILLED",
        message: "Subscription already fully active.",
        data: { email: email, plan: plan, licenseKey: targetSubMatch.key, emailSent: true }
      });
    }

    // STATE B: Subscription Exists in Target Tab, Transaction Record Missing
    if (targetSubMatch && !transMatch) {
      var keyToUseB = targetSubMatch.key;
      appendTransactionLog(transSheet, {
        paymentId: paymentId,
        orderId: pd.orderId || "",
        email: email,
        plan: plan,
        amount: pd.amount || "",
        currency: pd.currency || "",
        timestamp: pd.timestamp || new Date().toISOString(),
        status: "success",
        licenseKey: keyToUseB,
        actionTaken: "repaired_transaction",
        email_status: "sent"
      });

      return jsonResponse({
        status: "success",
        code: "TRANS_REPAIRED",
        message: "Transaction log repaired.",
        data: { email: email, plan: plan, licenseKey: keyToUseB, emailSent: true }
      });
    }

    // STATE D: Subscription & Transaction Exist, but Email Delivery Failed / Resend Requested
    if (targetSubMatch && transMatch && (transMatch.email_status === "failed" || pd.resendEmail === true)) {
      var emailSuccessD = false;
      try {
        await sendLicenseEmail(email, pd.name || "User", plan, targetSubMatch.key);
        emailSuccessD = true;
        updateEmailStatusInSheets(ss, email, paymentId, "sent");
      } catch (emailErrD) {
        Logger.log("Email retry failed: " + emailErrD);
        updateEmailStatusInSheets(ss, email, paymentId, "failed");
      }

      return jsonResponse({
        status: "success",
        code: "EMAIL_RETRY",
        message: emailSuccessD ? "Welcome email resent." : "Email resend failed.",
        data: { email: email, plan: plan, licenseKey: targetSubMatch.key, emailSent: emailSuccessD, emailStatus: emailSuccessD ? "sent" : "failed" }
      });
    }

    // STATE C: Transaction Exists, but Subscription Row Missing in Target Tab
    if (!targetSubMatch && transMatch) {
      var finalKeyC = transMatch.licenseKey || payloadLicenseKey;
      var planToUseC = transMatch.plan || plan;

      if (!finalKeyC) {
        return jsonResponse({ status: "error", code: "UNVERIFIED_LICENSE_KEY", message: "Original license key missing in transaction record. Admin investigation required." });
      }

      var lowerMatchC = findUserAcrossTabs(ss, email);
      var oldDevicesC = lowerMatchC ? (lowerMatchC.rowData[lowerMatchC.colMap["activated_devices"]] || "[]").toString().trim() : "[]";

      var maxDevicesC = PLAN_CONFIG[planToUseC].maxDevices;
      var newRowObjC = {
        name: pd.name || (transMatch.name || "User"),
        email: email,
        license_key: finalKeyC,
        plan: planToUseC,
        status: "active",
        activated_devices: oldDevicesC,
        max_devices: maxDevicesC,
        expiry: "",
        email_status: "pending"
      };

      appendToPlanTab(ss, planToUseC, newRowObjC);

      var verifiedObjC = verifySubscriptionWriteBack(ss, planToUseC, email);
      if (!verifiedObjC) {
        throw new Error("Write-back verification assertion failed for plan " + planToUseC);
      }

      if (lowerMatchC && lowerMatchC.sheet.getName() !== PLAN_CONFIG[planToUseC].sheetName) {
        lowerMatchC.sheet.deleteRow(lowerMatchC.rowIndex);
      }

      var emailSuccessC = false;
      try {
        await sendLicenseEmail(email, pd.name || "User", planToUseC, finalKeyC);
        emailSuccessC = true;
        updateEmailStatusInSheets(ss, email, paymentId, "sent");
      } catch (emailErrC) {
        Logger.log("Email delivery failed for " + email + ": " + emailErrC);
        updateEmailStatusInSheets(ss, email, paymentId, "failed");
      }

      updateTransactionAction(transSheet, paymentId, "repaired_fulfillment");

      return jsonResponse({
        status: "success",
        code: "SUB_REPAIRED",
        message: "Subscription fulfillment repaired.",
        data: { email: email, plan: planToUseC, licenseKey: finalKeyC, emailSent: emailSuccessC }
      });
    }

    // STATE A: Clean New Signup / Beta Upgrade (Both Sub and Trans Missing)
    var userMatch = findUserAcrossTabs(ss, email, payloadLicenseKey) || findUserAcrossTabs(ss, email);
    var actionTaken = "created_new";
    var finalKey = payloadLicenseKey;
    var oldDevices = "[]";

    if (userMatch) {
      var rowPlan = (userMatch.rowData[userMatch.colMap["plan"]] || "").toString().trim().toLowerCase();
      var oldKey = (userMatch.rowData[userMatch.colMap["license_key"]] || "").toString().trim();

      if (rowPlan === plan) {
        actionTaken = "already_owned";
        finalKey = oldKey || payloadLicenseKey;
      } else {
        actionTaken = "upgraded_existing";
        finalKey = oldKey || payloadLicenseKey;
        oldDevices = (userMatch.rowData[userMatch.colMap["activated_devices"]] || "[]").toString().trim();
      }
    }

    var maxDevices = PLAN_CONFIG[plan].maxDevices;
    var newRowObj = {
      name: pd.name || "User",
      email: email,
      license_key: finalKey,
      plan: plan,
      status: "active",
      activated_devices: oldDevices,
      max_devices: maxDevices,
      expiry: "",
      email_status: "pending"
    };

    appendToPlanTab(ss, plan, newRowObj);

    var verifiedObj = verifySubscriptionWriteBack(ss, plan, email);
    if (!verifiedObj) {
      throw new Error("Write-back verification assertion failed for plan " + plan);
    }

    if (userMatch && userMatch.sheet.getName() !== PLAN_CONFIG[plan].sheetName) {
      userMatch.sheet.deleteRow(userMatch.rowIndex);
    }

    var emailSuccess = false;
    try {
      await sendLicenseEmail(email, pd.name || "User", plan, finalKey);
      emailSuccess = true;
    } catch (emailErr) {
      Logger.log("Email delivery failed for " + email + ": " + emailErr);
    }

    var emailStatusStr = emailSuccess ? "sent" : "failed";
    updateEmailStatusInSheets(ss, email, paymentId, emailStatusStr);

    appendTransactionLog(transSheet, {
      transactionId: pd.transactionId || "",
      paymentId: paymentId,
      orderId: pd.orderId || "",
      email: email,
      plan: plan,
      amount: pd.amount || "",
      currency: pd.currency || "",
      timestamp: pd.timestamp || new Date().toISOString(),
      status: "success",
      licenseKey: finalKey,
      actionTaken: actionTaken,
      email_status: emailStatusStr
    });

    return jsonResponse({
      status: "success",
      message: "Payment recorded and fulfillment verified.",
      data: { email: email, plan: plan, actionTaken: actionTaken, licenseKey: finalKey, emailSent: emailSuccess }
    });
  } finally {
    lock.releaseLock();
  }
}

`;
// Mock Google Apps Script environment
let lockAcquired = false;
let sheetsDb = {
  Transactions: [],
  Basic: [],
  Pro: [],
  Extreme: [],
  Beta: []
};

const LockService = {
  getScriptLock: () => ({
    waitLock: (time) => {
      if (lockAcquired) throw new Error("Mock timeout");
      lockAcquired = true;
    },
    releaseLock: () => {
      lockAcquired = false;
    }
  })
};

const PLAN_CONFIG = {
  basic: { sheetName: "Basic", maxDevices: 1 },
  pro: { sheetName: "Pro", maxDevices: 1 },
  extreme: { sheetName: "Extreme", maxDevices: 3 },
  beta: { sheetName: "Beta", maxDevices: 1 }
};

const ADMIN_SECRET = "secret";
const TRANSACTIONS_TAB_NAME = "Transactions";
const DEFAULT_HEADERS = ["email", "license_key", "status", "expiry", "device_id", "activated_devices", "max_devices", "plan", "name", "email_status"];
const TRANSACTIONS_HEADERS = ["transactionId", "paymentId", "orderId", "email", "plan", "amount", "currency", "timestamp", "status", "licenseKey", "actionTaken", "email_status"];

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
  if (row) {
    return {
      key: row.license_key,
      colMap: { email_status: "email_status" },
      rowData: { email_status: row.email_status }
    };
  }
  return null;
}

function findUserAcrossTabs(ss, email, key) {
  for (const plan in PLAN_CONFIG) {
    const sheetName = PLAN_CONFIG[plan].sheetName;
    const row = sheetsDb[sheetName].find(r => r.email === email && (!key || r.license_key === key));
    if (row) {
      return {
        key: row.license_key,
        sheet: { getName: () => sheetName, deleteRow: (idx) => { sheetsDb[sheetName].splice(idx, 1); } },
        rowIndex: sheetsDb[sheetName].indexOf(row),
        colMap: { plan: "plan", license_key: "license_key", activated_devices: "activated_devices" },
        rowData: { plan: row.plan, license_key: row.license_key, activated_devices: row.activated_devices }
      };
    }
  }
  return null;
}

function appendToPlanTab(ss, plan, obj) {
  sheetsDb[PLAN_CONFIG[plan].sheetName].push(obj);
}

function verifySubscriptionWriteBack(ss, plan, email) {
  return sheetsDb[PLAN_CONFIG[plan].sheetName].find(r => r.email === email);
}

function appendTransactionLog(sheetName, obj) {
  sheetsDb[sheetName].push(obj);
}

function updateTransactionAction(sheetName, pId, action) {
  const row = sheetsDb[sheetName].find(r => r.paymentId === pId);
  if (row) row.actionTaken = action;
}

async function sendLicenseEmail(email, name, plan, key) {
  // Simulate network delay
  await new Promise(r => setTimeout(r, 100));
}

function updateEmailStatusInSheetsLock(ss, email, paymentId, newStatus) {
  // Mock brief lock
  LockService.getScriptLock().waitLock(10000);
  for (const plan in PLAN_CONFIG) {
    const sheetName = PLAN_CONFIG[plan].sheetName;
    const row = sheetsDb[sheetName].find(r => r.email === email);
    if (row) row.email_status = newStatus;
  }
  const tRow = sheetsDb.Transactions.find(r => r.paymentId === paymentId);
  if (tRow) tRow.email_status = newStatus;
  LockService.getScriptLock().releaseLock();
}

// ----------------------------------------------------
// Inject handlePaidSignup code
const fs = require('fs');
const path = 'f:/Coding/Projects/Caption Integrit/google-apps-script.js';
let code = fs.readFileSync(path, 'utf8');
eval(handlePaidSignupStr);

// ----------------------------------------------------
// RUN TESTS

async function runTests() {
  console.log("=== TEST 1: One paid_signup ===");
  let payload1 = { secret: "secret", data: { paymentId: "pay_1", email: "test1@test.com", plan: "basic", licenseKey: "CG-1" } };
  let res1 = await handlePaidSignup(payload1, null);
  console.log("Result:", res1);
  console.log("Basic Sheet length:", sheetsDb.Basic.length);
  console.log("Transactions Sheet length:", sheetsDb.Transactions.length);

  console.log("\n=== TEST 2: Two simultaneous paid_signup requests with different paymentIds ===");
  let payload2a = { secret: "secret", data: { paymentId: "pay_2a", email: "test2a@test.com", plan: "pro", licenseKey: "CG-2A" } };
  let payload2b = { secret: "secret", data: { paymentId: "pay_2b", email: "test2b@test.com", plan: "pro", licenseKey: "CG-2B" } };
  
  // Since node is single threaded, simulating concurrency by running them together
  let p2a = handlePaidSignup(payload2a, null);
  let p2b = handlePaidSignup(payload2b, null);
  let res2 = await Promise.all([p2a, p2b]);
  console.log("Results:", res2);
  console.log("Pro Sheet length:", sheetsDb.Pro.length);

  console.log("\n=== TEST 3: Two simultaneous paid_signup requests with SAME paymentId ===");
  let payload3a = { secret: "secret", data: { paymentId: "pay_3", email: "test3@test.com", plan: "extreme", licenseKey: "CG-3" } };
  let payload3b = { secret: "secret", data: { paymentId: "pay_3", email: "test3@test.com", plan: "extreme", licenseKey: "CG-3" } };
  
  let p3a = handlePaidSignup(payload3a, null);
  // Introduce tiny delay to simulate webhook retry arriving during email sending
  await new Promise(r => setTimeout(r, 10)); 
  let p3b = handlePaidSignup(payload3b, null);
  
  let res3 = await Promise.all([p3a, p3b]);
  console.log("Results:", res3);
  console.log("Extreme Sheet length:", sheetsDb.Extreme.length);
  
  console.log("\nFinal DB State:");
  console.log("Basic:", sheetsDb.Basic);
  console.log("Extreme:", sheetsDb.Extreme);
}

runTests();
