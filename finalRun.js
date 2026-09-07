
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

function getRazorpayCredentials() { return { key_id: 'test', key_secret: 'test' }; }
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

function handlePaidSignup(payload, ss) {
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
    sendLicenseEmail(email, pd.name || "User", plan, finalKey);
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


function recoverFailedPayment(targetPaymentId) {
  var pId = (targetPaymentId || "").trim();
  if (!pId) return { status: "error", code: "MISSING_PAYMENT_ID", message: "Missing paymentId parameter." };

  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var transSheet = ss.getSheetByName(TRANSACTIONS_TAB_NAME);
  var planToProvision = null;
  var email = null;
  var name = "User";
  var keyToUse = null;
  var emailSent = false;
  var sendEmailOutsideLock = false;

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var transMatch = findTransactionByPaymentId(transSheet, pId);
    var emailToSearch = transMatch ? transMatch.email : "";
    var subMatch = emailToSearch ? findUserAcrossTabs(ss, emailToSearch) : null;

    if (!transMatch && !subMatch) {
      return { 
        status: "error", 
        code: "UNVERIFIED_RECOVERY_DETAILS", 
        message: "Cannot establish verified payment records for paymentId: " + pId + ". Manual admin investigation required." 
      };
    }

    planToProvision = transMatch ? transMatch.plan : (subMatch ? subMatch.rowData[subMatch.colMap["plan"]] : null);
    email = transMatch ? transMatch.email : (subMatch ? subMatch.rowData[subMatch.colMap["email"]] : null);
    name = transMatch ? transMatch.name : (subMatch ? subMatch.rowData[subMatch.colMap["name"]] : "User");
    keyToUse = transMatch ? transMatch.licenseKey : (subMatch ? subMatch.rowData[subMatch.colMap["license_key"]] : null);

    if (!planToProvision || !PLAN_CONFIG[planToProvision.toLowerCase()]) {
      return {
        status: "error",
        code: "UNVERIFIED_PLAN",
        message: "Purchased plan could not be established from trusted records for paymentId: " + pId + ". Manual investigation required."
      };
    }

    if (!keyToUse) {
      return {
        status: "error",
        code: "UNVERIFIED_LICENSE_KEY",
        message: "Original license key could not be established from trusted database records for paymentId: " + pId + ". Manual admin investigation required."
      };
    }

    planToProvision = planToProvision.toLowerCase();

    if (!subMatch) {
      var maxDevices = PLAN_CONFIG[planToProvision].maxDevices;
      var newRowObj = { name: name, email: email, license_key: keyToUse, plan: planToProvision, status: "active", activated_devices: "[]", max_devices: maxDevices, expiry: "", email_status: "pending" };
      appendToPlanTab(ss, planToProvision, newRowObj);
      var verifiedObj = verifySubscriptionWriteBack(ss, planToProvision, email);
      if (!verifiedObj) throw new Error("Write-back verification failed during admin recovery.");
    }

    if (!transMatch) {
      appendTransactionLog(transSheet, { paymentId: pId, email: email, plan: planToProvision, licenseKey: keyToUse, actionTaken: "repaired_transaction", email_status: "pending" });
    }

    var currentEmailStatus = transMatch ? transMatch.email_status : "pending";
    if (currentEmailStatus !== "sent") {
      sendEmailOutsideLock = true;
    } else {
      emailSent = true;
    }
  } finally {
    lock.releaseLock();
  }

  if (sendEmailOutsideLock) {
    try {
      sendLicenseEmail(email, name, planToProvision, keyToUse);
      emailSent = true;
      updateEmailStatusInSheetsLock(ss, email, pId, "sent");
    } catch (e) {
      Logger.log("Recovery email send failed: " + e);
      updateEmailStatusInSheetsLock(ss, email, pId, "failed");
    }
  }

  return { status: "success", message: "Payment recovery completed successfully.", paymentId: pId, plan: planToProvision, licenseKey: keyToUse, emailSent: emailSent };
}


function recoverRazorpayPayments(confirmGuard, paymentIdList, fromDateStr, toDateStr) {
  Logger.log("=================================================");
  Logger.log(" RAZORPAY PAYMENT RECOVERY (LIVE MUTATION EXECUTION)");
  Logger.log("=================================================");

  if (confirmGuard !== "CONFIRM_RECOVERY") {
    var guardErr = "RECOVERY CANCELLED: Safety guard failed! First argument must equal 'CONFIRM_RECOVERY'.";
    Logger.log("❌ " + guardErr);
    return { status: "error", code: "GUARD_FAILED", message: guardErr };
  }

  var creds = getRazorpayCredentials();
  if (!creds) {
    return { status: "error", code: "CREDENTIALS_MISSING", message: "Razorpay credentials missing in Script Properties." };
  }

  var targetPaymentIds = [];

  if (Array.isArray(paymentIdList) && paymentIdList.length > 0) {
    targetPaymentIds = paymentIdList;
  } else {
    // Run preview to extract actionable payment IDs automatically
    var prev = previewRazorpayRecoveries(fromDateStr, toDateStr);
    if (prev.status === "error") return prev;
    targetPaymentIds = prev.actionable.map(function(item) { return item.paymentId; });
  }

  if (targetPaymentIds.length === 0) {
    Logger.log("ℹ️ No target payments specified or found for recovery.");
    return { status: "ok", message: "No payments required recovery.", recovered: 0, errors: 0 };
  }

  var results = {
    totalTargeted: targetPaymentIds.length,
    recoveredCount: 0,
    skippedCount: 0,
    errorCount: 0,
    details: []
  };

  try {
    var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    var transSheet = ensureTabExists(ss, TRANSACTIONS_TAB_NAME, TRANSACTIONS_HEADERS);

    for (var i = 0; i < targetPaymentIds.length; i++) {
      var pId = targetPaymentIds[i].trim();
      Logger.log("-------------------------------------------------");
      Logger.log("Processing Recovery [" + (i + 1) + "/" + targetPaymentIds.length + "]: " + pId);

      try {
        var paymentObj = fetchSingleRazorpayPayment(pId);
        if (!paymentObj) {
          Logger.log("❌ Could not fetch payment " + pId + " from Razorpay REST API.");
          results.errorCount++;
          results.details.push({ paymentId: pId, status: "error", reason: "API_FETCH_FAILED" });
          continue;
        }

        var pStatus = (paymentObj.status || "").toLowerCase();
        if (pStatus !== "captured") {
          Logger.log("⏭️ Payment " + pId + " status is '" + pStatus + "'. Skipping non-captured payment.");
          results.skippedCount++;
          results.details.push({ paymentId: pId, status: "skipped", reason: "NOT_CAPTURED" });
          continue;
        }

        var email = (paymentObj.email || (paymentObj.notes ? paymentObj.notes.email : "") || "").trim().toLowerCase();
        if (!email) {
          Logger.log("❌ Payment " + pId + " missing customer email.");
          results.errorCount++;
          results.details.push({ paymentId: pId, status: "error", reason: "MISSING_EMAIL" });
          continue;
        }

        var orderId = paymentObj.order_id || "";
        var orderObj = orderId ? fetchRazorpayOrderFromApi(orderId) : null;
        var planToProvision = determinePlanFromRazorpayMetadata(paymentObj, orderObj);
        
        var keyToUse = null;
        var actionTaken = "";
        var needsEmail = false;

        var lock = LockService.getScriptLock();
        lock.waitLock(20000);
        try {
          var transMatch = findTransactionByPaymentId(transSheet, pId);
          var userMatch = findUserAcrossTabs(ss, email);

          if (!planToProvision) {
            if (transMatch && transMatch.plan) planToProvision = transMatch.plan.toLowerCase();
            else if (userMatch && userMatch.rowData[userMatch.colMap["plan"]]) planToProvision = userMatch.rowData[userMatch.colMap["plan"]].toString().toLowerCase();
          }

          if (!planToProvision || !PLAN_CONFIG[planToProvision]) {
            Logger.log("❌ Cannot establish trusted plan for payment " + pId + ". Skipping.");
            results.errorCount++;
            results.details.push({ paymentId: pId, status: "error", reason: "UNVERIFIED_PLAN" });
            continue;
          }

          var targetPlanMatch = findUserInSpecificTab(ss, planToProvision, email);

          var subEmailStatus = targetPlanMatch && targetPlanMatch.colMap["email_status"] !== undefined
            ? (targetPlanMatch.rowData[targetPlanMatch.colMap["email_status"]] || "").toString().trim().toLowerCase()
            : "";
          var transEmailStatus = transMatch ? (transMatch.email_status || "").toString().trim().toLowerCase() : "";

          if (targetPlanMatch && transMatch && (subEmailStatus === "sent" || transEmailStatus === "sent")) {
            Logger.log("⏭️ Payment " + pId + " for " + email + " is already fully fulfilled. Skipping.");
            results.skippedCount++;
            results.details.push({ paymentId: pId, status: "skipped", reason: "ALREADY_FULFILLED" });
            continue;
          }

          if (userMatch && userMatch.key) {
            keyToUse = userMatch.key;
          } else if (transMatch && transMatch.licenseKey) {
            keyToUse = transMatch.licenseKey;
          } else {
            keyToUse = generateLicenseKey();
          }

          var activatedDevices = userMatch ? (userMatch.rowData[userMatch.colMap["activated_devices"]] || "[]").toString().trim() : "[]";
          var name = (paymentObj.notes ? paymentObj.notes.name : "") || (userMatch ? userMatch.rowData[userMatch.colMap["name"]] : null) || (transMatch ? transMatch.name : "User");

          actionTaken = "recovered_paid_signup";
          if (userMatch) {
            var oldPlan = (userMatch.rowData[userMatch.colMap["plan"]] || userMatch.sheet.getName()).toString().trim().toLowerCase();
            if (oldPlan === "beta" && planToProvision !== "beta") {
              actionTaken = "recovered_beta_upgrade";
            } else if (oldPlan !== planToProvision) {
              actionTaken = "recovered_plan_upgrade";
            } else {
              actionTaken = "recovered_existing_license";
            }
          }

          var maxDevices = PLAN_CONFIG[planToProvision].maxDevices;

          if (!targetPlanMatch) {
            var newRowObj = {
              name: name,
              email: email,
              license_key: keyToUse,
              plan: planToProvision,
              status: "active",
              activated_devices: activatedDevices,
              max_devices: maxDevices,
              expiry: "",
              email_status: "pending"
            };

            appendToPlanTab(ss, planToProvision, newRowObj);

            var verifiedObj = verifySubscriptionWriteBack(ss, planToProvision, email);
            if (!verifiedObj) {
              throw new Error("Write-back verification failed for " + email);
            }
            if (userMatch && userMatch.sheet.getName() !== PLAN_CONFIG[planToProvision].sheetName) {
              userMatch.sheet.deleteRow(userMatch.rowIndex);
            }
          }

          if (!transMatch) {
            appendTransactionLog(transSheet, {
              transactionId: "",
              paymentId: pId,
              orderId: orderId,
              email: email,
              plan: planToProvision,
              amount: (paymentObj.amount / 100).toString(),
              currency: paymentObj.currency || "INR",
              timestamp: new Date().toISOString(),
              status: "success",
              licenseKey: keyToUse,
              actionTaken: actionTaken,
              email_status: "pending"
            });
          } else if (transMatch.actionTaken !== actionTaken) {
            updateTransactionAction(transSheet, pId, actionTaken);
          }
          
          needsEmail = true;

        } finally {
          lock.releaseLock();
        }

        var emailSent = false;
        if (needsEmail) {
          try {
            sendLicenseEmail(email, name, planToProvision, keyToUse);
            emailSent = true;
            updateEmailStatusInSheetsLock(ss, email, pId, "sent");
          } catch (emailErr) {
            updateEmailStatusInSheetsLock(ss, email, pId, "failed");
          }
        }

        results.recoveredCount++;
        results.details.push({
          paymentId: pId,
          status: "success",
          email: email,
          plan: planToProvision,
          licenseKey: keyToUse,
          actionTaken: actionTaken,
          emailSent: emailSent,
          emailSkippedIdempotent: false
        });

      } catch (itemErr) {
        results.errorCount++;
        results.details.push({ paymentId: pId, status: "error", reason: "RECOVERY_EXCEPTION", error: itemErr.toString() });
      }
    }
  } catch (err) {
    return { status: "error", code: "EXECUTION_FAILED", message: err.toString() };
  }

  Logger.log("=================================================");
  Logger.log(" RECOVERY MUTATION EXECUTION COMPLETE");
  Logger.log(" Recovered: " + results.recoveredCount);
  Logger.log(" Skipped: " + results.skippedCount);
  Logger.log(" Errors: " + results.errorCount);
  Logger.log("=================================================");

  return results;
}

// ──────────────────────────────────────────
// NAMESPACED ADMIN CONTROL CENTER API
// ──────────────────────────────────────────



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
  console.log("\n=======================================================");
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
  global.fetchRazorpayPaymentList = function() {
    return [
       { id: "pay_7a", status: "captured", email: "test7a@test.com", amount: 59900, currency: "INR", notes: {} },
       { id: "pay_7b", status: "captured", email: "test7b@test.com", amount: 59900, currency: "INR", notes: {} },
       { id: "pay_7c", status: "captured", email: "test7c@test.com", amount: 59900, currency: "INR", notes: {} }
    ];
  };
  let start7 = Date.now();
  let b7 = JSON.parse(JSON.stringify(sheetsDb));
  let res7 = recoverRazorpayPayments("CONFIRM_RECOVERY", ["pay_7a", "pay_7b", "pay_7c"], null, null);
  printReport("7. Multiple recovery payments", "pay_7a, pay_7b, pay_7c", start7, res7, b7, sheetsDb, []);

}

runTests();
