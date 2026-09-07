
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

async function handlePaidSignup(payload, ss) {
  if (payload.secret !== ADMIN_SECRET) {
    return jsonResponse({ status: "error", code: "UNAUTHORIZED", message: "Invalid or missing secret token." });
  }

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

  // 1. Schema Validation (Fail Fast if mandatory headers missing) - OUTSIDE LOCK
  var planConfig = PLAN_CONFIG[plan];
  var targetSheet = ensureTabExists(ss, planConfig.sheetName, DEFAULT_HEADERS);
  var missingHeaders = validateSheetHeaders(targetSheet, DEFAULT_HEADERS);
  if (missingHeaders.length > 0) {
    Logger.log("CRITICAL SCHEMA ERROR: Sheet '" + planConfig.sheetName + "' is missing headers: " + missingHeaders.join(", "));
    return jsonResponse({ status: "error", code: "SCHEMA_ERROR", message: "Database schema header missing: " + missingHeaders[0] });
  }

  var transSheet = ensureTabExists(ss, TRANSACTIONS_TAB_NAME, TRANSACTIONS_HEADERS);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return jsonResponse({ status: "error", code: "CONCURRENCY_ERROR", message: "Server busy. Please try again." });
  }

  var fulfillmentState = ""; // A, B, C, D, E
  var finalKey = payloadLicenseKey;
  var actionTaken = "";
  var targetSubMatch = null;
  var transMatch = null;

  try {
    transMatch = findTransactionByPaymentId(transSheet, paymentId);
    targetSubMatch = findUserInSpecificTab(ss, plan, email);

    // STATE E / H: Already Fully Provisioned
    if (targetSubMatch && transMatch && transMatch.email_status === "sent") {
      fulfillmentState = "E";
      finalKey = targetSubMatch.key;
    }
    // STATE D: Email Delivery Pending or Failed or Resend Requested
    else if (targetSubMatch && transMatch && (transMatch.email_status === "failed" || transMatch.email_status === "pending" || pd.resendEmail === true)) {
      fulfillmentState = "D";
      finalKey = targetSubMatch.key;
    }
    // STATE B: Subscription Exists in Target Tab, Transaction Record Missing
    else if (targetSubMatch && !transMatch) {
      fulfillmentState = "B";
      finalKey = targetSubMatch.key;
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
        actionTaken: "repaired_transaction",
        email_status: "pending"
      });
    }
    // STATE C: Transaction Exists, but Subscription Row Missing in Target Tab
    else if (!targetSubMatch && transMatch) {
      fulfillmentState = "C";
      finalKey = transMatch.licenseKey || payloadLicenseKey;
      var planToUseC = transMatch.plan || plan;

      if (!finalKey) {
        throw new Error("UNVERIFIED_LICENSE_KEY: Original license key missing in transaction record.");
      }

      var lowerMatchC = findUserAcrossTabs(ss, email);
      var oldDevicesC = lowerMatchC ? (lowerMatchC.rowData[lowerMatchC.colMap["activated_devices"]] || "[]").toString().trim() : "[]";
      var maxDevicesC = PLAN_CONFIG[planToUseC].maxDevices;
      
      var newRowObjC = {
        name: pd.name || (transMatch.name || "User"),
        email: email,
        license_key: finalKey,
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

      updateTransactionAction(transSheet, paymentId, "repaired_fulfillment");
    }
    // STATE A: Clean New Signup / Beta Upgrade (Both Sub and Trans Missing)
    else {
      fulfillmentState = "A";
      var userMatch = findUserAcrossTabs(ss, email, payloadLicenseKey) || findUserAcrossTabs(ss, email);
      actionTaken = "created_new";
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

      var maxDevices = planConfig.maxDevices;
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

      if (userMatch && userMatch.sheet.getName() !== planConfig.sheetName) {
        userMatch.sheet.deleteRow(userMatch.rowIndex);
      }

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
        email_status: "pending"
      });
    }
  } catch (criticalErr) {
    if (criticalErr.message.indexOf("UNVERIFIED_LICENSE_KEY") > -1) {
      return jsonResponse({ status: "error", code: "UNVERIFIED_LICENSE_KEY", message: "Admin investigation required." });
    }
    throw criticalErr; // Unhandled sheet errors
  } finally {
    // ALWAYS release lock immediately after authoritative duplicate check and writes
    lock.releaseLock();
  }

  // 3. Unlocked Email Dispatch and final JSON response
  if (fulfillmentState === "E") {
    return jsonResponse({
      status: "success",
      code: "ALREADY_FULFILLED",
      message: "Subscription already fully active.",
      data: { email: email, plan: plan, licenseKey: finalKey, emailSent: true }
    });
  }

  // State A, B, C, D requires email to be sent/retried OUTSIDE the lock
  var emailSuccess = false;
  try {
    await sendLicenseEmail(email, pd.name || "User", plan, finalKey);
    emailSuccess = true;
    updateEmailStatusInSheetsLock(ss, email, paymentId, "sent");
  } catch (emailErr) {
    Logger.log("Email delivery failed for " + email + ": " + emailErr);
    updateEmailStatusInSheetsLock(ss, email, paymentId, "failed");
  }

  var responseCode = "";
  var responseMsg = "";

  if (fulfillmentState === "B") {
    responseCode = "TRANS_REPAIRED";
    responseMsg = "Transaction log repaired.";
  } else if (fulfillmentState === "C") {
    responseCode = "SUB_REPAIRED";
    responseMsg = "Subscription fulfillment repaired.";
  } else if (fulfillmentState === "D") {
    responseCode = "EMAIL_RETRY";
    responseMsg = emailSuccess ? "Welcome email resent." : "Email resend failed.";
  } else {
    responseCode = "NEW_SIGNUP";
    responseMsg = "Payment recorded and fulfillment verified.";
  }

  var responseData = { email: email, plan: plan, licenseKey: finalKey, emailSent: emailSuccess, emailStatus: emailSuccess ? "sent" : "failed" };
  if (actionTaken) responseData.actionTaken = actionTaken;

  var responsePayload = {
    status: "success",
    message: responseMsg,
    data: responseData
  };
  if (responseCode) responsePayload.code = responseCode;

  return jsonResponse(responsePayload);
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



async function runTests() {
  console.log("=== TEST 1: One paid_signup ===");
  let payload1 = { secret: "secret", data: { paymentId: "pay_1", email: "test1@test.com", plan: "basic", licenseKey: "CG-1" } };
  let res1 = await handlePaidSignup(payload1, null);
  console.log("Result:", res1.code || res1.status);
  console.log("Basic Sheet len:", sheetsDb.Basic.length);

  console.log("\n=== TEST 2: Two simultaneous paid_signup (different paymentIds) ===");
  let p2a = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_2a", email: "test2a@test.com", plan: "pro", licenseKey: "CG-2A" } }, null);
  let p2b = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_2b", email: "test2b@test.com", plan: "pro", licenseKey: "CG-2B" } }, null);
  let res2 = await Promise.all([p2a, p2b].map(p => p.catch(e => ({ error: e.message }))));
  console.log("Result 2A:", res2[0].code || res2[0].status || res2[0].error);
  console.log("Result 2B:", res2[1].code || res2[1].status || res2[1].error);
  console.log("Pro Sheet len:", sheetsDb.Pro.length);

  console.log("\n=== TEST 3: Two simultaneous paid_signup (SAME paymentId) ===");
  let p3a = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_3", email: "test3@test.com", plan: "extreme", licenseKey: "CG-3" } }, null);
  await new Promise(r => setTimeout(r, 10)); // Request 3b arrives while 3a is sending email outside lock
  let p3b = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_3", email: "test3@test.com", plan: "extreme", licenseKey: "CG-3" } }, null);
  let res3 = await Promise.all([p3a, p3b].map(p => p.catch(e => ({ error: e.message }))));
  console.log("Result 3A:", res3[0].code || res3[0].status);
  console.log("Result 3B:", res3[1].code || res3[1].status);
  console.log("Extreme Sheet len:", sheetsDb.Extreme.length, "Transactions:", sheetsDb.Transactions.filter(r => r.paymentId === "pay_3").length);
}
runTests();
