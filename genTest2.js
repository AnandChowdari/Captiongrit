
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

var PLAN_CONFIG = { basic: { sheetName: "Basic", maxDevices: 1 }, pro: { sheetName: "Pro", maxDevices: 1 }, extreme: { sheetName: "Extreme", maxDevices: 3 } };
var PropertiesService = { getScriptProperties: () => ({ getProperty: () => "secret" }) };
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
          handlePaidSignup(p, null);
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

function handleBetaSignup(data, ss) {
  var newEmail = (data.email || "").trim().toLowerCase();
  var name = (data.name || "Beta User").trim();

  if (!newEmail) {
    return jsonResponse({ success: false, reason: "missing_email" });
  }

  if (findUserAcrossTabs(ss, newEmail)) {
    return jsonResponse({ success: false, reason: "already_registered" });
  }

  var plan = "beta";
  var key = generateLicenseKey();

  var newRowObj = {
    name: name,
    email: newEmail,
    license_key: key,
    plan: plan,
    status: "active",
    activated_devices: "[]",
    max_devices: PLAN_CONFIG[plan].maxDevices,
    expiry: "" // Will be set on first login
  };

  appendToPlanTab(ss, plan, newRowObj);
  sendBetaEmail(newEmail, name, key);

  return jsonResponse({ success: true, email: newEmail });
}

function handleGenerate(data, ss) {
  if (data.adminSecret !== ADMIN_SECRET) {
    return jsonResponse({ success: false, reason: "unauthorized" });
  }

  var newEmail = (data.email || "").trim().toLowerCase();
  var plan = (data.plan || "basic").trim().toLowerCase();
  var name = (data.name || "User").trim();

  if (!newEmail || !plan || !PLAN_CONFIG[plan]) {
    return jsonResponse({ success: false, reason: "missing_or_invalid_fields" });
  }

  if (findUserAcrossTabs(ss, newEmail)) {
    return jsonResponse({ success: false, reason: "already_registered" });
  }

  var key = generateLicenseKey();
  var maxDevices = PLAN_CONFIG[plan].maxDevices;

  var newRowObj = {
    name: name,
    email: newEmail,
    license_key: key,
    plan: plan,
    status: "active",
    activated_devices: "[]",
    max_devices: maxDevices,
    expiry: ""
  };

  appendToPlanTab(ss, plan, newRowObj);
  sendLicenseEmail(newEmail, name, plan, key);

  return jsonResponse({ success: true, email: newEmail, key: key, plan: plan });
}

function handleVerify(data, ss) {
  var email = (data.email || "").trim().toLowerCase();
  var licenseKey = (data.licenseKey || "").trim();
  var deviceId = (data.deviceId || "").trim();

  if (!email || !licenseKey) {
    return jsonResponse({ valid: false, reason: "missing_fields" });
  }

  var userMatch = findUserAcrossTabs(ss, email, licenseKey);

  if (!userMatch) {
    return jsonResponse({ valid: false, reason: "invalid_license" });
  }

  var row = userMatch.rowData;
  var sheet = userMatch.sheet;
  var rowIndex = userMatch.rowIndex;
  var COL = userMatch.colMap;

  var rowPlan = (row[COL["plan"]] || "basic").toString().trim().toLowerCase();
  var rowActive = (row[COL["status"]] || "").toString().trim().toLowerCase();
  var rowDevicesStr = (row[COL["activated_devices"]] || "[]").toString();
  var rowMaxDevices = parseInt(row[COL["max_devices"]]) || 1;
  var rowExpiry = COL["expiry"] !== undefined ? row[COL["expiry"]] : null;

  if (rowActive !== "active") {
    return jsonResponse({ valid: false, reason: "license_deactivated" });
  }

  var today = new Date();
  var daysLeft = undefined;

  // Beta Expiry Logic
  if (rowPlan === "beta") {
    if (!rowExpiry) {
      var expiryDate = new Date();
      expiryDate.setDate(today.getDate() + BETA_DURATION_DAYS);
      if (COL["expiry"] !== undefined) {
        sheet.getRange(rowIndex, COL["expiry"] + 1).setValue(expiryDate.toISOString());
      }
      rowExpiry = expiryDate;
    }
    var exp = new Date(rowExpiry);
    if (exp < today) {
      return jsonResponse({ valid: false, reason: "beta_expired" });
    }
    daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  } else if (rowExpiry) {
    // Normal expiry check
    var expiryDate = new Date(rowExpiry);
    if (expiryDate < today) {
      return jsonResponse({ valid: false, reason: "license_expired" });
    }
  }

  var devices = [];
  try {
    devices = JSON.parse(rowDevicesStr);
    if (!Array.isArray(devices)) devices = [];
  } catch (pe) {
    devices = [];
  }

  var deviceIndex = devices.indexOf(deviceId);

  var planConfig = PLAN_CONFIG[rowPlan] || PLAN_CONFIG["basic"];

  if (deviceIndex >= 0) {
    return jsonResponse({
      authenticated: true,
      user: {
        email: email,
        plan: rowPlan,
        license: licenseKey,
        expires: rowExpiry ? rowExpiry : "never",
        lastValidated: new Date().toISOString()
      },
      capabilities: planConfig,
      maxDevices: rowMaxDevices,
      deviceCount: devices.length,
      betaDaysLeft: (typeof daysLeft !== 'undefined') ? Math.max(0, daysLeft) : undefined
    });
  }

  // New device check
  if (devices.length >= rowMaxDevices) {
    if (data.isRefresh === true || data.isStoredAuth === true) {
      return jsonResponse({
        valid: false,
        reason: "device_not_authorized",
        plan: rowPlan,
        maxDevices: rowMaxDevices,
        currentDevices: devices.length
      });
    }
    return jsonResponse({
      valid: false,
      reason: "device_limit_reached",
      canSwitch: true,
      plan: rowPlan,
      maxDevices: rowMaxDevices,
      currentDevices: devices.length
    });
  }

  // Register device
  devices.push(deviceId);
  sheet.getRange(rowIndex, COL["activated_devices"] + 1).setValue(JSON.stringify(devices));
  if (COL["device_id"] !== undefined) {
    sheet.getRange(rowIndex, COL["device_id"] + 1).setValue(devices.join(","));
  }

  return jsonResponse({
    authenticated: true,
    user: {
      email: email,
      plan: rowPlan,
      license: licenseKey,
      expires: rowExpiry ? rowExpiry : "never",
      lastValidated: new Date().toISOString()
    },
    capabilities: planConfig,
    maxDevices: rowMaxDevices,
    deviceCount: devices.length,
    betaDaysLeft: (typeof daysLeft !== 'undefined') ? Math.max(0, daysLeft) : undefined
  });
}

function handleSwitchDevice(data, ss) {
  var email = (data.email || "").trim().toLowerCase();
  var licenseKey = (data.licenseKey || "").trim();
  var deviceId = (data.deviceId || "").trim();

  if (!email || !licenseKey || !deviceId) {
    return jsonResponse({ valid: false, reason: "missing_fields" });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return jsonResponse({ valid: false, reason: "server_busy", message: "Server busy. Please try again." });
  }

  try {
    // 1. Re-validate email + license key
    var userMatch = findUserAcrossTabs(ss, email, licenseKey);
    if (!userMatch) {
      return jsonResponse({ valid: false, reason: "invalid_license" });
    }

    var row = userMatch.rowData;
    var sheet = userMatch.sheet;
    var rowIndex = userMatch.rowIndex;
    var COL = userMatch.colMap;

    var rowPlan = (row[COL["plan"]] || "basic").toString().trim().toLowerCase();
    var rowActive = (row[COL["status"]] || "").toString().trim().toLowerCase();
    var rowDevicesStr = (row[COL["activated_devices"]] || "[]").toString();
    var rowMaxDevices = parseInt(row[COL["max_devices"]]) || 1;
    var rowExpiry = COL["expiry"] !== undefined ? row[COL["expiry"]] : null;

    if (rowActive !== "active") {
      return jsonResponse({ valid: false, reason: "license_deactivated" });
    }

    var today = new Date();
    var daysLeft = undefined;

    if (rowPlan === "beta") {
      if (!rowExpiry) {
        var expiryDate = new Date();
        expiryDate.setDate(today.getDate() + BETA_DURATION_DAYS);
        if (COL["expiry"] !== undefined) {
          sheet.getRange(rowIndex, COL["expiry"] + 1).setValue(expiryDate.toISOString());
        }
        rowExpiry = expiryDate;
      }
      var exp = new Date(rowExpiry);
      if (exp < today) {
        return jsonResponse({ valid: false, reason: "beta_expired" });
      }
      daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    } else if (rowExpiry) {
      var expiryDate = new Date(rowExpiry);
      if (expiryDate < today) {
        return jsonResponse({ valid: false, reason: "license_expired" });
      }
    }

    // 2. Parse current device list
    var devices = [];
    try {
      devices = JSON.parse(rowDevicesStr);
      if (!Array.isArray(devices)) devices = [];
    } catch (pe) {
      devices = [];
    }

    // 3. Idempotency Check: If requested deviceId is already present
    var planConfig = PLAN_CONFIG[rowPlan] || PLAN_CONFIG["basic"];
    if (devices.indexOf(deviceId) >= 0) {
      return jsonResponse({
        authenticated: true,
        user: {
          email: email,
          plan: rowPlan,
          license: licenseKey,
          expires: rowExpiry ? rowExpiry : "never",
          lastValidated: new Date().toISOString()
        },
        capabilities: planConfig,
        maxDevices: rowMaxDevices,
        deviceCount: devices.length,
        betaDaysLeft: (typeof daysLeft !== 'undefined') ? Math.max(0, daysLeft) : undefined
      });
    }

    // 4. Perform Device Switch / Eviction
    if (devices.length < rowMaxDevices) {
      devices.push(deviceId);
    } else if (rowMaxDevices === 1) {
      devices = [deviceId];
    } else { // rowMaxDevices > 1 and limit is reached
      devices.shift(); // remove oldest device
      devices.push(deviceId);
    }

    // 5. Persist updated device list
    sheet.getRange(rowIndex, COL["activated_devices"] + 1).setValue(JSON.stringify(devices));
    if (COL["device_id"] !== undefined) {
      sheet.getRange(rowIndex, COL["device_id"] + 1).setValue(devices.join(","));
    }

    return jsonResponse({
      authenticated: true,
      user: {
        email: email,
        plan: rowPlan,
        license: licenseKey,
        expires: rowExpiry ? rowExpiry : "never",
        lastValidated: new Date().toISOString()
      },
      capabilities: planConfig,
      maxDevices: rowMaxDevices,
      deviceCount: devices.length,
      betaDaysLeft: (typeof daysLeft !== 'undefined') ? Math.max(0, daysLeft) : undefined
    });

  } catch (err) {
    return jsonResponse({ valid: false, reason: "server_error", message: err.message });
  } finally {
    try { lock.releaseLock(); } catch(le) {}
  }
}

function handleDeactivateDevice(data, ss) {
  var email = (data.email || "").trim().toLowerCase();
  var licenseKey = (data.licenseKey || "").trim();
  var deviceId = (data.deviceId || "").trim();

  if (!email || !licenseKey || !deviceId) {
    return jsonResponse({ success: false, reason: "missing_fields" });
  }

  var userMatch = findUserAcrossTabs(ss, email, licenseKey);
  if (!userMatch) {
    return jsonResponse({ success: false, reason: "invalid_license" });
  }

  var COL = userMatch.colMap;
  var devicesStr = (userMatch.rowData[COL["activated_devices"]] || "[]").toString();
  var devices = [];
  try { devices = JSON.parse(devicesStr); } catch (e) { devices = []; }

  var idx = devices.indexOf(deviceId);
  if (idx >= 0) {
    devices.splice(idx, 1);
    userMatch.sheet.getRange(userMatch.rowIndex, COL["activated_devices"] + 1)
      .setValue(JSON.stringify(devices));
    if (COL["device_id"] !== undefined) {
      userMatch.sheet.getRange(userMatch.rowIndex, COL["device_id"] + 1)
        .setValue(devices.join(","));
    }
  }

  return jsonResponse({ success: true, removedDevice: deviceId, remainingDevices: devices.length });
}

// ──────────────────────────────────────────
// DATABASE UTILITIES (Multi-Tab)
// ──────────────────────────────────────────

function getColMap(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var COL = {};
  for (var h = 0; h < headers.length; h++) {
    if (headers[h]) {
      COL[headers[h].toString().toLowerCase().trim()] = h;
    }
  }
  return COL;
}

function ensureTabExists(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers || DEFAULT_HEADERS);
  }
  return sheet;
}

function appendToPlanTab(ss, planId, rowObj) {
  var config = PLAN_CONFIG[planId] || PLAN_CONFIG["basic"];
  var sheet = ensureTabExists(ss, config.sheetName);
  var COL = getColMap(sheet);

  var newRow = new Array(Object.keys(COL).length).fill("");
  for (var key in rowObj) {
    if (COL[key] !== undefined) {
      newRow[COL[key]] = rowObj[key];
    }
  }
  sheet.appendRow(newRow);
}

function findUserAcrossTabs(ss, email, licenseKeyMatch) {
  var searchTabs = Object.keys(PLAN_CONFIG).map(function (k) { return PLAN_CONFIG[k].sheetName; });

  for (var t = 0; t < searchTabs.length; t++) {
    var sheet = ss.getSheetByName(searchTabs[t]);
    if (!sheet) continue;

    var rows = sheet.getDataRange().getValues();
    if (rows.length < 2) continue;

    var COL = getColMap(sheet);
    if (COL["email"] === undefined) continue;

    for (var i = 1; i < rows.length; i++) {
      var rowEmail = (rows[i][COL["email"]] || "").toString().trim().toLowerCase();
      if (rowEmail === email.toLowerCase().trim()) {
        var rowKey = (rows[i][COL["license_key"]] || "").toString().trim();
        var rowDevices = (rows[i][COL["activated_devices"]] || "[]").toString().trim();
        if (licenseKeyMatch) {
          if (rowKey === licenseKeyMatch.trim()) {
            return { sheet: sheet, rowIndex: i + 1, rowData: rows[i], colMap: COL, key: rowKey, activated_devices: rowDevices };
          }
        } else {
          return { sheet: sheet, rowIndex: i + 1, rowData: rows[i], colMap: COL, key: rowKey, activated_devices: rowDevices };
        }
      }
    }
  }
  return null;
}

function validateSheetHeaders(sheet, requiredHeaders) {
  if (!sheet) return requiredHeaders;
  var COL = getColMap(sheet);
  var missing = [];
  for (var i = 0; i < requiredHeaders.length; i++) {
    var h = requiredHeaders[i].toLowerCase().trim();
    if (COL[h] === undefined) {
      missing.push(requiredHeaders[i]);
    }
  }
  return missing;
}

function verifySubscriptionWriteBack(ss, planId, email) {
  var config = PLAN_CONFIG[planId] || PLAN_CONFIG["basic"];
  var sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) return null;

  var COL = getColMap(sheet);
  var rows = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    var rowEmail = (rows[i][COL["email"]] || "").toString().trim().toLowerCase();
    if (rowEmail === email.toLowerCase().trim()) {
      var key = (rows[i][COL["license_key"]] || "").toString().trim();
      var status = (rows[i][COL["status"]] || "").toString().trim();
      var plan = (rows[i][COL["plan"]] || "").toString().trim();
      var maxDevices = rows[i][COL["max_devices"]];
      var activatedDevicesStr = (rows[i][COL["activated_devices"]] || "").toString().trim();

      var isKeyValid = key.length >= 8;
      var isStatusActive = status === "active";
      var isPlanCorrect = plan.toLowerCase() === planId.toLowerCase();
      var isMaxDevicesCorrect = Number(maxDevices) === config.maxDevices;
      var isActivatedDevicesValid = activatedDevicesStr.startsWith("[") && activatedDevicesStr.endsWith("]");

      if (isKeyValid && isStatusActive && isPlanCorrect && isMaxDevicesCorrect && isActivatedDevicesValid) {
        return {
          email: rowEmail,
          license_key: key,
          status: status,
          plan: plan,
          max_devices: maxDevices,
          activated_devices: activatedDevicesStr
        };
      }
    }
  }
  return null;
}

function findTransactionByPaymentId(transSheet, paymentId) {
  if (!transSheet || !paymentId) return null;
  var rows = transSheet.getDataRange().getValues();
  if (rows.length < 2) return null;
  var COL = getColMap(transSheet);
  if (COL["paymentid"] === undefined) return null;

  for (var i = 1; i < rows.length; i++) {
    var pId = (rows[i][COL["paymentid"]] || "").toString().trim();
    if (pId === paymentId.trim()) {
      return {
        rowIndex: i + 1,
        paymentId: pId,
        orderId: COL["orderid"] !== undefined ? rows[i][COL["orderid"]] : "",
        email: COL["email"] !== undefined ? rows[i][COL["email"]] : "",
        name: COL["email"] !== undefined ? (rows[i][COL["name"]] || "User") : "User",
        plan: COL["plan"] !== undefined ? rows[i][COL["plan"]] : "",
        licenseKey: COL["licensekey"] !== undefined ? rows[i][COL["licensekey"]] : "",
        actionTaken: COL["actiontaken"] !== undefined ? rows[i][COL["actiontaken"]] : "",
        email_status: COL["email_status"] !== undefined ? rows[i][COL["email_status"]] : "pending",
        colMap: COL,
        rowData: rows[i]
      };
    }
  }
  return null;
}

function findUserInSpecificTab(ss, planId, email) {
  var config = PLAN_CONFIG[planId];
  if (!config) return null;
  var sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) return null;

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return null;
  var COL = getColMap(sheet);
  if (COL["email"] === undefined) return null;

  for (var i = 1; i < rows.length; i++) {
    var rowEmail = (rows[i][COL["email"]] || "").toString().trim().toLowerCase();
    if (rowEmail === email.toLowerCase().trim()) {
      return {
        sheet: sheet,
        rowIndex: i + 1,
        key: (rows[i][COL["license_key"]] || "").toString().trim(),
        status: (rows[i][COL["status"]] || "").toString().trim(),
        plan: (rows[i][COL["plan"]] || "").toString().trim(),
        rowData: rows[i],
        colMap: COL
      };
    }
  }
  return null;
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


/**
* Captiongrit — Google Apps Script (License Validation)
* 
* Multi-Tab Architecture:
* - Basic, Pro, Extreme, Beta tabs
* - Qualification tab for webhooks
* 
* REQUIRED HEADERS (Row 1):
* email | license_key | status | expiry | device_id | activated_devices | max_devices | plan
*/

// Secure secret for generating new licenses remotely.
// This is now fetched from Google Apps Script's Project Settings > Script Properties.
// Ensure you add a script property named 'ADMIN_SECRET' before deploying!
var ADMIN_SECRET = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET');

// IMPORTANT: Paste your full Google Sheet URL here (the one with the licenses)
var SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1p8sHgGEuG11aFqKG3X-vA8Q4SfPCg5MoKCCb8RjMhWQ/edit?gid=0#gid=0";

// IMPORTANT: Paste your direct ZIP file download link ID here
var UNIVERSAL_ZIP_ID = "1rSuR54SJmLKWQbO0jMJVj_U80guOWmly/view?usp=sharing";

// IMPORTANT: Paste your official website or pricing page URL here for the email CTA
var PURCHASE_URL = "https://www.flogrit.com/captiongrit#pricing";

// Optional: Feedback form URL. Leave as default or empty to disable feedback section.
var FEEDBACK_URL = "YOUR_FEEDBACK_FORM_URL";

// Centralized Beta trial duration
var BETA_DURATION_DAYS = 3;

// Single Source of Truth for Plan Configurations
var PLAN_CONFIG = {
  basic: { sheetName: "Basic", maxDuration: 60, maxDevices: 1, maxClips: 1, hasDoubleCheck: false, hasEditor: false, hasCustomDict: false, hasWordByWord: false, hasFullSentence: true, hasEnglishOutput: false, hasPresets: false, hasMogrt: false, hasBatch: false },
  pro: { sheetName: "Pro", maxDuration: 180, maxDevices: 1, maxClips: 1, hasDoubleCheck: true, hasEditor: true, hasCustomDict: true, hasWordByWord: true, hasFullSentence: true, hasEnglishOutput: true, hasPresets: false, hasMogrt: false, hasBatch: false },
  extreme: { sheetName: "Extreme", maxDuration: 0, maxDevices: 3, maxClips: 99, hasDoubleCheck: true, hasEditor: true, hasCustomDict: true, hasWordByWord: true, hasFullSentence: true, hasEnglishOutput: true, hasPresets: false, hasMogrt: false, hasBatch: true },
  beta: { sheetName: "Beta", maxDuration: 30, maxDevices: 1, maxClips: 1, hasDoubleCheck: false, hasEditor: false, hasCustomDict: false, hasWordByWord: false, hasFullSentence: true, hasEnglishOutput: false, hasPresets: false, hasMogrt: false, hasBatch: false }
};

var TRANSACTIONS_TAB_NAME = "Transactions";
var TRANSACTIONS_HEADERS = ["transactionId", "paymentId", "orderId", "email", "plan", "amount", "currency", "timestamp", "status", "licenseKey", "actionTaken", "email_status"];
var LEGACY_TAB_NAME = "Sheet1"; // The original sheet name for migration purposes

var DEFAULT_HEADERS = ["email", "license_key", "status", "expiry", "device_id", "activated_devices", "max_devices", "plan", "name", "email_status"];

// ──────────────────────────────────────────
// HTTP HANDLERS (ROUTER)
// ──────────────────────────────────────────

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  return jsonResponse({ status: "ok", service: "Captiongrit License Server (Multi-Tab)" });
}

function doPost(e) {
  try {
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      data = e.parameter;
    }

    var action = (data.action || "verify").trim().toLowerCase();
    var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);

    if (action === "check_update") return handleCheckUpdate(data);
    if (action === "bulk_generate") return handleBulkGenerate(data, ss);
    if (action === "beta_signup") return handleBetaSignup(data, ss);
    if (action === "generate") return handleGenerate(data, ss);
    if (action === "verify") return handleVerify(data, ss);
    if (action === "paid_signup") return handlePaidSignup(data, ss);
    if (action === "deactivate_device") return handleDeactivateDevice(data, ss);
    if (action === "switch_device") return handleSwitchDevice(data, ss);

    if (action.indexOf("admin_") === 0) return handleAdminAction(data, ss);

    return jsonResponse({ valid: false, reason: "unknown_action" });

  } catch (err) {
    return jsonResponse({ valid: false, reason: "server_error", message: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ──────────────────────────────────────────
// ACTION HANDLERS
// ──────────────────────────────────────────

function handleCheckUpdate(data) {
  return jsonResponse({
    latest_version: "1.0.2",
    download_url: getDownloadUrl(),
    message: "Captiongrit 1.0.2 is available! We have crushed the 'Max Devices' and random logout bug, and made stability improvements. Please update now!"
  });
}

function handleBulkGenerate(data, ss) {
  if (data.adminSecret !== ADMIN_SECRET) {
    return jsonResponse({ success: false, reason: "unauthorized" });
  }

  var users = data.users || [];
  if (!Array.isArray(users) || users.length === 0) {
    return jsonResponse({ success: false, reason: "missing_fields" });
  }

  var generatedCount = 0;
  var errors = [];

  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    var newEmail = (user.email || "").trim().toLowerCase();
    var plan = (user.plan || "basic").trim().toLowerCase();
    var name = (user.name || "User").trim();

    if (!newEmail || !plan || !PLAN_CONFIG[plan]) {
      errors.push({ email: newEmail, reason: "missing_or_invalid_fields" });
      continue;
    }

    if (findUserAcrossTabs(ss, newEmail)) {
      errors.push({ email: newEmail, reason: "already_registered" });
      continue;
    }

    var key = generateLicenseKey();
    var maxDevices = PLAN_CONFIG[plan].maxDevices;

    var newRowObj = {
      name: name,
      email: newEmail,
      license_key: key,
      plan: plan,
      status: "active",
      activated_devices: "[]",
      max_devices: maxDevices,
      expiry: ""
    };

    appendToPlanTab(ss, plan, newRowObj);
    sendLicenseEmail(newEmail, name, plan, key);
    generatedCount++;
  }

  return jsonResponse({ success: true, generated: generatedCount, errors: errors });
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

function handleBetaSignup(data, ss) {
  var newEmail = (data.email || "").trim().toLowerCase();
  var name = (data.name || "Beta User").trim();

  if (!newEmail) {
    return jsonResponse({ success: false, reason: "missing_email" });
  }

  if (findUserAcrossTabs(ss, newEmail)) {
    return jsonResponse({ success: false, reason: "already_registered" });
  }

  var plan = "beta";
  var key = generateLicenseKey();

  var newRowObj = {
    name: name,
    email: newEmail,
    license_key: key,
    plan: plan,
    status: "active",
    activated_devices: "[]",
    max_devices: PLAN_CONFIG[plan].maxDevices,
    expiry: "" // Will be set on first login
  };

  appendToPlanTab(ss, plan, newRowObj);
  sendBetaEmail(newEmail, name, key);

  return jsonResponse({ success: true, email: newEmail });
}

function handleGenerate(data, ss) {
  if (data.adminSecret !== ADMIN_SECRET) {
    return jsonResponse({ success: false, reason: "unauthorized" });
  }

  var newEmail = (data.email || "").trim().toLowerCase();
  var plan = (data.plan || "basic").trim().toLowerCase();
  var name = (data.name || "User").trim();

  if (!newEmail || !plan || !PLAN_CONFIG[plan]) {
    return jsonResponse({ success: false, reason: "missing_or_invalid_fields" });
  }

  if (findUserAcrossTabs(ss, newEmail)) {
    return jsonResponse({ success: false, reason: "already_registered" });
  }

  var key = generateLicenseKey();
  var maxDevices = PLAN_CONFIG[plan].maxDevices;

  var newRowObj = {
    name: name,
    email: newEmail,
    license_key: key,
    plan: plan,
    status: "active",
    activated_devices: "[]",
    max_devices: maxDevices,
    expiry: ""
  };

  appendToPlanTab(ss, plan, newRowObj);
  sendLicenseEmail(newEmail, name, plan, key);

  return jsonResponse({ success: true, email: newEmail, key: key, plan: plan });
}

function handleVerify(data, ss) {
  var email = (data.email || "").trim().toLowerCase();
  var licenseKey = (data.licenseKey || "").trim();
  var deviceId = (data.deviceId || "").trim();

  if (!email || !licenseKey) {
    return jsonResponse({ valid: false, reason: "missing_fields" });
  }

  var userMatch = findUserAcrossTabs(ss, email, licenseKey);

  if (!userMatch) {
    return jsonResponse({ valid: false, reason: "invalid_license" });
  }

  var row = userMatch.rowData;
  var sheet = userMatch.sheet;
  var rowIndex = userMatch.rowIndex;
  var COL = userMatch.colMap;

  var rowPlan = (row[COL["plan"]] || "basic").toString().trim().toLowerCase();
  var rowActive = (row[COL["status"]] || "").toString().trim().toLowerCase();
  var rowDevicesStr = (row[COL["activated_devices"]] || "[]").toString();
  var rowMaxDevices = parseInt(row[COL["max_devices"]]) || 1;
  var rowExpiry = COL["expiry"] !== undefined ? row[COL["expiry"]] : null;

  if (rowActive !== "active") {
    return jsonResponse({ valid: false, reason: "license_deactivated" });
  }

  var today = new Date();
  var daysLeft = undefined;

  // Beta Expiry Logic
  if (rowPlan === "beta") {
    if (!rowExpiry) {
      var expiryDate = new Date();
      expiryDate.setDate(today.getDate() + BETA_DURATION_DAYS);
      if (COL["expiry"] !== undefined) {
        sheet.getRange(rowIndex, COL["expiry"] + 1).setValue(expiryDate.toISOString());
      }
      rowExpiry = expiryDate;
    }
    var exp = new Date(rowExpiry);
    if (exp < today) {
      return jsonResponse({ valid: false, reason: "beta_expired" });
    }
    daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  } else if (rowExpiry) {
    // Normal expiry check
    var expiryDate = new Date(rowExpiry);
    if (expiryDate < today) {
      return jsonResponse({ valid: false, reason: "license_expired" });
    }
  }

  var devices = [];
  try {
    devices = JSON.parse(rowDevicesStr);
    if (!Array.isArray(devices)) devices = [];
  } catch (pe) {
    devices = [];
  }

  var deviceIndex = devices.indexOf(deviceId);

  var planConfig = PLAN_CONFIG[rowPlan] || PLAN_CONFIG["basic"];

  if (deviceIndex >= 0) {
    return jsonResponse({
      authenticated: true,
      user: {
        email: email,
        plan: rowPlan,
        license: licenseKey,
        expires: rowExpiry ? rowExpiry : "never",
        lastValidated: new Date().toISOString()
      },
      capabilities: planConfig,
      maxDevices: rowMaxDevices,
      deviceCount: devices.length,
      betaDaysLeft: (typeof daysLeft !== 'undefined') ? Math.max(0, daysLeft) : undefined
    });
  }

  // New device check
  if (devices.length >= rowMaxDevices) {
    if (data.isRefresh === true || data.isStoredAuth === true) {
      return jsonResponse({
        valid: false,
        reason: "device_not_authorized",
        plan: rowPlan,
        maxDevices: rowMaxDevices,
        currentDevices: devices.length
      });
    }
    return jsonResponse({
      valid: false,
      reason: "device_limit_reached",
      canSwitch: true,
      plan: rowPlan,
      maxDevices: rowMaxDevices,
      currentDevices: devices.length
    });
  }

  // Register device
  devices.push(deviceId);
  sheet.getRange(rowIndex, COL["activated_devices"] + 1).setValue(JSON.stringify(devices));
  if (COL["device_id"] !== undefined) {
    sheet.getRange(rowIndex, COL["device_id"] + 1).setValue(devices.join(","));
  }

  return jsonResponse({
    authenticated: true,
    user: {
      email: email,
      plan: rowPlan,
      license: licenseKey,
      expires: rowExpiry ? rowExpiry : "never",
      lastValidated: new Date().toISOString()
    },
    capabilities: planConfig,
    maxDevices: rowMaxDevices,
    deviceCount: devices.length,
    betaDaysLeft: (typeof daysLeft !== 'undefined') ? Math.max(0, daysLeft) : undefined
  });
}

function handleSwitchDevice(data, ss) {
  var email = (data.email || "").trim().toLowerCase();
  var licenseKey = (data.licenseKey || "").trim();
  var deviceId = (data.deviceId || "").trim();

  if (!email || !licenseKey || !deviceId) {
    return jsonResponse({ valid: false, reason: "missing_fields" });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return jsonResponse({ valid: false, reason: "server_busy", message: "Server busy. Please try again." });
  }

  try {
    // 1. Re-validate email + license key
    var userMatch = findUserAcrossTabs(ss, email, licenseKey);
    if (!userMatch) {
      return jsonResponse({ valid: false, reason: "invalid_license" });
    }

    var row = userMatch.rowData;
    var sheet = userMatch.sheet;
    var rowIndex = userMatch.rowIndex;
    var COL = userMatch.colMap;

    var rowPlan = (row[COL["plan"]] || "basic").toString().trim().toLowerCase();
    var rowActive = (row[COL["status"]] || "").toString().trim().toLowerCase();
    var rowDevicesStr = (row[COL["activated_devices"]] || "[]").toString();
    var rowMaxDevices = parseInt(row[COL["max_devices"]]) || 1;
    var rowExpiry = COL["expiry"] !== undefined ? row[COL["expiry"]] : null;

    if (rowActive !== "active") {
      return jsonResponse({ valid: false, reason: "license_deactivated" });
    }

    var today = new Date();
    var daysLeft = undefined;

    if (rowPlan === "beta") {
      if (!rowExpiry) {
        var expiryDate = new Date();
        expiryDate.setDate(today.getDate() + BETA_DURATION_DAYS);
        if (COL["expiry"] !== undefined) {
          sheet.getRange(rowIndex, COL["expiry"] + 1).setValue(expiryDate.toISOString());
        }
        rowExpiry = expiryDate;
      }
      var exp = new Date(rowExpiry);
      if (exp < today) {
        return jsonResponse({ valid: false, reason: "beta_expired" });
      }
      daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    } else if (rowExpiry) {
      var expiryDate = new Date(rowExpiry);
      if (expiryDate < today) {
        return jsonResponse({ valid: false, reason: "license_expired" });
      }
    }

    // 2. Parse current device list
    var devices = [];
    try {
      devices = JSON.parse(rowDevicesStr);
      if (!Array.isArray(devices)) devices = [];
    } catch (pe) {
      devices = [];
    }

    // 3. Idempotency Check: If requested deviceId is already present
    var planConfig = PLAN_CONFIG[rowPlan] || PLAN_CONFIG["basic"];
    if (devices.indexOf(deviceId) >= 0) {
      return jsonResponse({
        authenticated: true,
        user: {
          email: email,
          plan: rowPlan,
          license: licenseKey,
          expires: rowExpiry ? rowExpiry : "never",
          lastValidated: new Date().toISOString()
        },
        capabilities: planConfig,
        maxDevices: rowMaxDevices,
        deviceCount: devices.length,
        betaDaysLeft: (typeof daysLeft !== 'undefined') ? Math.max(0, daysLeft) : undefined
      });
    }

    // 4. Perform Device Switch / Eviction
    if (devices.length < rowMaxDevices) {
      devices.push(deviceId);
    } else if (rowMaxDevices === 1) {
      devices = [deviceId];
    } else { // rowMaxDevices > 1 and limit is reached
      devices.shift(); // remove oldest device
      devices.push(deviceId);
    }

    // 5. Persist updated device list
    sheet.getRange(rowIndex, COL["activated_devices"] + 1).setValue(JSON.stringify(devices));
    if (COL["device_id"] !== undefined) {
      sheet.getRange(rowIndex, COL["device_id"] + 1).setValue(devices.join(","));
    }

    return jsonResponse({
      authenticated: true,
      user: {
        email: email,
        plan: rowPlan,
        license: licenseKey,
        expires: rowExpiry ? rowExpiry : "never",
        lastValidated: new Date().toISOString()
      },
      capabilities: planConfig,
      maxDevices: rowMaxDevices,
      deviceCount: devices.length,
      betaDaysLeft: (typeof daysLeft !== 'undefined') ? Math.max(0, daysLeft) : undefined
    });

  } catch (err) {
    return jsonResponse({ valid: false, reason: "server_error", message: err.message });
  } finally {
    try { lock.releaseLock(); } catch(le) {}
  }
}

function handleDeactivateDevice(data, ss) {
  var email = (data.email || "").trim().toLowerCase();
  var licenseKey = (data.licenseKey || "").trim();
  var deviceId = (data.deviceId || "").trim();

  if (!email || !licenseKey || !deviceId) {
    return jsonResponse({ success: false, reason: "missing_fields" });
  }

  var userMatch = findUserAcrossTabs(ss, email, licenseKey);
  if (!userMatch) {
    return jsonResponse({ success: false, reason: "invalid_license" });
  }

  var COL = userMatch.colMap;
  var devicesStr = (userMatch.rowData[COL["activated_devices"]] || "[]").toString();
  var devices = [];
  try { devices = JSON.parse(devicesStr); } catch (e) { devices = []; }

  var idx = devices.indexOf(deviceId);
  if (idx >= 0) {
    devices.splice(idx, 1);
    userMatch.sheet.getRange(userMatch.rowIndex, COL["activated_devices"] + 1)
      .setValue(JSON.stringify(devices));
    if (COL["device_id"] !== undefined) {
      userMatch.sheet.getRange(userMatch.rowIndex, COL["device_id"] + 1)
        .setValue(devices.join(","));
    }
  }

  return jsonResponse({ success: true, removedDevice: deviceId, remainingDevices: devices.length });
}

// ──────────────────────────────────────────
// DATABASE UTILITIES (Multi-Tab)
// ──────────────────────────────────────────

function getColMap(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var COL = {};
  for (var h = 0; h < headers.length; h++) {
    if (headers[h]) {
      COL[headers[h].toString().toLowerCase().trim()] = h;
    }
  }
  return COL;
}

function ensureTabExists(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers || DEFAULT_HEADERS);
  }
  return sheet;
}

function appendToPlanTab(ss, planId, rowObj) {
  var config = PLAN_CONFIG[planId] || PLAN_CONFIG["basic"];
  var sheet = ensureTabExists(ss, config.sheetName);
  var COL = getColMap(sheet);

  var newRow = new Array(Object.keys(COL).length).fill("");
  for (var key in rowObj) {
    if (COL[key] !== undefined) {
      newRow[COL[key]] = rowObj[key];
    }
  }
  sheet.appendRow(newRow);
}

function findUserAcrossTabs(ss, email, licenseKeyMatch) {
  var searchTabs = Object.keys(PLAN_CONFIG).map(function (k) { return PLAN_CONFIG[k].sheetName; });

  for (var t = 0; t < searchTabs.length; t++) {
    var sheet = ss.getSheetByName(searchTabs[t]);
    if (!sheet) continue;

    var rows = sheet.getDataRange().getValues();
    if (rows.length < 2) continue;

    var COL = getColMap(sheet);
    if (COL["email"] === undefined) continue;

    for (var i = 1; i < rows.length; i++) {
      var rowEmail = (rows[i][COL["email"]] || "").toString().trim().toLowerCase();
      if (rowEmail === email.toLowerCase().trim()) {
        var rowKey = (rows[i][COL["license_key"]] || "").toString().trim();
        var rowDevices = (rows[i][COL["activated_devices"]] || "[]").toString().trim();
        if (licenseKeyMatch) {
          if (rowKey === licenseKeyMatch.trim()) {
            return { sheet: sheet, rowIndex: i + 1, rowData: rows[i], colMap: COL, key: rowKey, activated_devices: rowDevices };
          }
        } else {
          return { sheet: sheet, rowIndex: i + 1, rowData: rows[i], colMap: COL, key: rowKey, activated_devices: rowDevices };
        }
      }
    }
  }
  return null;
}

function validateSheetHeaders(sheet, requiredHeaders) {
  if (!sheet) return requiredHeaders;
  var COL = getColMap(sheet);
  var missing = [];
  for (var i = 0; i < requiredHeaders.length; i++) {
    var h = requiredHeaders[i].toLowerCase().trim();
    if (COL[h] === undefined) {
      missing.push(requiredHeaders[i]);
    }
  }
  return missing;
}

function verifySubscriptionWriteBack(ss, planId, email) {
  var config = PLAN_CONFIG[planId] || PLAN_CONFIG["basic"];
  var sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) return null;

  var COL = getColMap(sheet);
  var rows = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    var rowEmail = (rows[i][COL["email"]] || "").toString().trim().toLowerCase();
    if (rowEmail === email.toLowerCase().trim()) {
      var key = (rows[i][COL["license_key"]] || "").toString().trim();
      var status = (rows[i][COL["status"]] || "").toString().trim();
      var plan = (rows[i][COL["plan"]] || "").toString().trim();
      var maxDevices = rows[i][COL["max_devices"]];
      var activatedDevicesStr = (rows[i][COL["activated_devices"]] || "").toString().trim();

      var isKeyValid = key.length >= 8;
      var isStatusActive = status === "active";
      var isPlanCorrect = plan.toLowerCase() === planId.toLowerCase();
      var isMaxDevicesCorrect = Number(maxDevices) === config.maxDevices;
      var isActivatedDevicesValid = activatedDevicesStr.startsWith("[") && activatedDevicesStr.endsWith("]");

      if (isKeyValid && isStatusActive && isPlanCorrect && isMaxDevicesCorrect && isActivatedDevicesValid) {
        return {
          email: rowEmail,
          license_key: key,
          status: status,
          plan: plan,
          max_devices: maxDevices,
          activated_devices: activatedDevicesStr
        };
      }
    }
  }
  return null;
}

function findTransactionByPaymentId(transSheet, paymentId) {
  if (!transSheet || !paymentId) return null;
  var rows = transSheet.getDataRange().getValues();
  if (rows.length < 2) return null;
  var COL = getColMap(transSheet);
  if (COL["paymentid"] === undefined) return null;

  for (var i = 1; i < rows.length; i++) {
    var pId = (rows[i][COL["paymentid"]] || "").toString().trim();
    if (pId === paymentId.trim()) {
      return {
        rowIndex: i + 1,
        paymentId: pId,
        orderId: COL["orderid"] !== undefined ? rows[i][COL["orderid"]] : "",
        email: COL["email"] !== undefined ? rows[i][COL["email"]] : "",
        name: COL["email"] !== undefined ? (rows[i][COL["name"]] || "User") : "User",
        plan: COL["plan"] !== undefined ? rows[i][COL["plan"]] : "",
        licenseKey: COL["licensekey"] !== undefined ? rows[i][COL["licensekey"]] : "",
        actionTaken: COL["actiontaken"] !== undefined ? rows[i][COL["actiontaken"]] : "",
        email_status: COL["email_status"] !== undefined ? rows[i][COL["email_status"]] : "pending",
        colMap: COL,
        rowData: rows[i]
      };
    }
  }
  return null;
}

function findUserInSpecificTab(ss, planId, email) {
  var config = PLAN_CONFIG[planId];
  if (!config) return null;
  var sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) return null;

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return null;
  var COL = getColMap(sheet);
  if (COL["email"] === undefined) return null;

  for (var i = 1; i < rows.length; i++) {
    var rowEmail = (rows[i][COL["email"]] || "").toString().trim().toLowerCase();
    if (rowEmail === email.toLowerCase().trim()) {
      return {
        sheet: sheet,
        rowIndex: i + 1,
        key: (rows[i][COL["license_key"]] || "").toString().trim(),
        status: (rows[i][COL["status"]] || "").toString().trim(),
        plan: (rows[i][COL["plan"]] || "").toString().trim(),
        rowData: rows[i],
        colMap: COL
      };
    }
  }
  return null;
}

function updateEmailStatusInSheets(ss, email, paymentId, statusStr) {
  var userMatch = findUserAcrossTabs(ss, email.toLowerCase().trim());
  if (userMatch && userMatch.colMap["email_status"] !== undefined) {
    userMatch.sheet.getRange(userMatch.rowIndex, userMatch.colMap["email_status"] + 1).setValue(statusStr);
  }
  if (paymentId) {
    var transSheet = ss.getSheetByName(TRANSACTIONS_TAB_NAME);
    if (transSheet) {
      var transMatch = findTransactionByPaymentId(transSheet, paymentId);
      if (transMatch && transMatch.colMap && transMatch.colMap["email_status"] !== undefined) {
        transSheet.getRange(transMatch.rowIndex, transMatch.colMap["email_status"] + 1).setValue(statusStr);
      }
    }
  }
}

function appendTransactionLog(transSheet, dataObj) {
  var COL = getColMap(transSheet);
  var newRow = new Array(TRANSACTIONS_HEADERS.length).fill("");
  for (var k = 0; k < TRANSACTIONS_HEADERS.length; k++) {
    var h = TRANSACTIONS_HEADERS[k];
    var hLower = h.toLowerCase().trim();
    if (COL[hLower] !== undefined && dataObj[h] !== undefined) {
      newRow[COL[hLower]] = dataObj[h];
    } else if (COL[hLower] !== undefined && dataObj[hLower] !== undefined) {
      newRow[COL[hLower]] = dataObj[hLower];
    }
  }
  transSheet.appendRow(newRow);
}

function updateTransactionAction(transSheet, paymentId, actionStr) {
  var transMatch = findTransactionByPaymentId(transSheet, paymentId);
  if (transMatch && transMatch.colMap && transMatch.colMap["actiontaken"] !== undefined) {
    transSheet.getRange(transMatch.rowIndex, transMatch.colMap["actiontaken"] + 1).setValue(actionStr);
  }
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

function validateDatabaseSchemas() {
  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var planKeys = Object.keys(PLAN_CONFIG);
  var issues = [];

  for (var k = 0; k < planKeys.length; k++) {
    var p = planKeys[k];
    var sheet = ss.getSheetByName(PLAN_CONFIG[p].sheetName);
    if (!sheet) {
      issues.push("Sheet tab missing: " + PLAN_CONFIG[p].sheetName);
    } else {
      var missing = validateSheetHeaders(sheet, DEFAULT_HEADERS);
      if (missing.length > 0) {
        issues.push("Sheet tab '" + PLAN_CONFIG[p].sheetName + "' missing headers: " + missing.join(", "));
      }
    }
  }

  var transSheet = ss.getSheetByName(TRANSACTIONS_TAB_NAME);
  if (!transSheet) {
    issues.push("Transactions tab missing: " + TRANSACTIONS_TAB_NAME);
  } else {
    var missingTrans = validateSheetHeaders(transSheet, TRANSACTIONS_HEADERS);
    if (missingTrans.length > 0) {
      issues.push("Transactions tab missing headers: " + missingTrans.join(", "));
    }
  }

  if (issues.length === 0) {
    Logger.log("PASSED: All database schemas and headers are valid.");
    return { status: "ok", message: "All database schemas are valid." };
  } else {
    Logger.log("FAILED: Schema issues found: " + JSON.stringify(issues));
    return { status: "error", issues: issues };
  }
}

// ──────────────────────────────────────────
// EMAILS & UTILS
// ──────────────────────────────────────────

function extractFileId(input) {
  if (!input) return "";
  var match = input.match(/[-\w]{25,}/);
  if (match) return match[0];
  return input;
}

function generateLicenseKey() {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var key = "CG-";
  for (var g = 0; g < 3; g++) {
    for (var c = 0; c < 4; c++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (g < 2) key += "-";
  }
  return key;
}

function sendLicenseEmail(email, name, plan, key) {
  var subject = "Your Captiongrit " + (plan.charAt(0).toUpperCase() + plan.slice(1)) + " License Key";
  var downloadUrl = getDownloadUrl();
  var downloadHtml = downloadUrl ? "<div style='text-align: center; margin: 30px 0;'><a href='" + downloadUrl + "' style='background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;'>Download Installer</a></div>" : "";
  var downloadText = downloadUrl ? "Download Installer: " + downloadUrl + "\n\n" : "";

  var htmlBody = "<div style='font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;'>" +
    "<h2 style='color: #4CAF50;'>Welcome to Captiongrit, " + name + "!</h2>" +
    "<p>Thank you for purchasing Captiongrit " + plan.toUpperCase() + ".</p>" +
    "<p>Your official license key is:</p>" +
    "<div style='background-color: #f4f4f4; padding: 15px; border-radius: 5px; font-size: 20px; font-weight: bold; letter-spacing: 2px; text-align: center; margin: 20px 0;'>" + key + "</div>" +
    downloadHtml +
    "<p><strong>How to activate:</strong></p><ol>" +
    "<li>Install the Captiongrit plugin using the downloaded installer.</li>" +
    "<li>Open Premiere Pro or After Effects.</li>" +
    "<li>Go to <em>Window &gt; Extensions &gt; Captiongrit</em>.</li>" +
    "<li>Enter your email (<strong>" + email + "</strong>) and your license key.</li></ol>" +
    "<p>Happy editing!<br><strong>The Flogrit Team</strong></p></div>";

  var textBody = "Welcome to Captiongrit, " + name + "!\n\nYour " + plan.toUpperCase() + " license key is: " + key + "\n\n" + downloadText;

  try {
    MailApp.sendEmail({ to: email, subject: subject, name: "The Flogrit Team", body: textBody, htmlBody: htmlBody });
  } catch (e) { Logger.log("Email error: " + e); }
}

function sendBetaEmail(email, name, key) {
  var subject = "Your Captiongrit Beta License Key!";
  var downloadUrl = getDownloadUrl();
  var downloadHtml = downloadUrl ? "<div style='text-align: center; margin: 30px 0;'><a href='" + downloadUrl + "' style='background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;'>Download Beta Installer</a></div>" : "";
  var downloadText = downloadUrl ? "Download Beta Installer: " + downloadUrl + "\n\n" : "";

  var htmlBody = "<div style='font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;'>" +
    "<h2 style='color: #4CAF50;'>Welcome to the Captiongrit Beta, " + name + "!</h2>" +
    "<p>Your " + BETA_DURATION_DAYS + "-day Beta license key is:</p>" +
    "<div style='background-color: #f4f4f4; padding: 15px; border-radius: 5px; font-size: 20px; font-weight: bold; letter-spacing: 2px; text-align: center; margin: 20px 0;'>" + key + "</div>" +
    downloadHtml +
    "<p>Happy editing!<br><strong>The Flogrit Team</strong></p></div>";
  var textBody = "Welcome to the Captiongrit Beta, " + name + "!\n\nYour Beta license key is: " + key + "\n\n" + downloadText;

  try {
    MailApp.sendEmail({ to: email, subject: subject, name: "The Flogrit Team", body: textBody, htmlBody: htmlBody });
  } catch (e) { Logger.log("Email error: " + e); }
}

function getDownloadUrl() {
  if (UNIVERSAL_ZIP_ID && !UNIVERSAL_ZIP_ID.startsWith("PASTE_")) {
    return "https://drive.google.com/file/d/" + extractFileId(UNIVERSAL_ZIP_ID) + "/view?usp=sharing";
  }
  return "";
}

// ──────────────────────────────────────────
// ADMIN UTILITIES & MIGRATION
// ──────────────────────────────────────────

/**
 * NON-DESTRUCTIVE MIGRATION UTILITY
 * Run this once from the Apps Script editor to migrate legacy Sheet1 data to specific Plan tabs.
 * It copies data, verifies the copy, generates a summary, and leaves Sheet1 untouched.
 */
function migrateLegacyData() {
  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var legacySheet = ss.getSheetByName(LEGACY_TAB_NAME) || ss.getSheets()[0];

  if (!legacySheet) {
    Logger.log("No legacy sheet found.");
    return;
  }

  // Ensure Transactions tab exists for future use
  ensureTabExists(ss, TRANSACTIONS_TAB_NAME, TRANSACTIONS_HEADERS);

  var rows = legacySheet.getDataRange().getValues();
  if (rows.length < 2) {
    Logger.log("Legacy sheet has no data rows to migrate.");
    return;
  }

  var COL = getColMap(legacySheet);

  var stats = {
    totalEvaluated: 0,
    migrated: 0,
    skippedDuplicate: 0,
    skippedInvalid: 0,
    errors: 0
  };

  Logger.log("--- MIGRATION STARTED ---");

  for (var i = 1; i < rows.length; i++) {
    stats.totalEvaluated++;
    var row = rows[i];
    var email = (row[COL["email"]] || "").toString().trim().toLowerCase();
    var plan = (row[COL["plan"]] || "basic").toString().trim().toLowerCase();

    if (!email) {
      stats.skippedInvalid++;
      continue;
    }

    var targetPlan = plan;
    if (!PLAN_CONFIG[targetPlan]) {
      targetPlan = "basic"; // Fallback unrecognized plans to basic
    }

    // Check if already in the new system
    if (findUserAcrossTabs(ss, email)) {
      stats.skippedDuplicate++;
      continue;
    }

    // Copy to new tab
    try {
      var rowObj = {};
      for (var key in COL) {
        rowObj[key] = row[COL[key]];
      }
      appendToPlanTab(ss, targetPlan, rowObj);
      stats.migrated++;
    } catch (e) {
      Logger.log("Error migrating " + email + ": " + e);
      stats.errors++;
    }
  }

  Logger.log("--- MIGRATION COMPLETE ---");
  Logger.log("Total Evaluated: " + stats.totalEvaluated);
  Logger.log("Successfully Migrated: " + stats.migrated);
  Logger.log("Skipped (Already Exists): " + stats.skippedDuplicate);
  Logger.log("Skipped (Invalid/No Email): " + stats.skippedInvalid);
  Logger.log("Errors: " + stats.errors);
  Logger.log("Legacy sheet '" + legacySheet.getName() + "' has been left untouched as a backup.");
}

function addLicense(email, plan) {
  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var p = plan.toLowerCase().trim();
  if (!PLAN_CONFIG[p]) p = "basic";
  var key = generateLicenseKey();
  var rowObj = {
    email: email.toLowerCase().trim(),
    license_key: key,
    plan: p,
    status: "active",
    activated_devices: "[]",
    max_devices: PLAN_CONFIG[p].maxDevices,
    expiry: ""
  };
  appendToPlanTab(ss, p, rowObj);
  Logger.log("Added license: " + email + " | " + key + " | " + p);
  return key;
}

function removeDevice(email, deviceIdToRemove) {
  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var match = findUserAcrossTabs(ss, email.toLowerCase().trim());
  if (!match) {
    Logger.log("User not found: " + email);
    return;
  }

  var devicesStr = match.rowData[match.colMap["activated_devices"]] || "[]";
  var devices = JSON.parse(devicesStr);
  var idx = devices.indexOf(deviceIdToRemove);

  if (idx >= 0) {
    devices.splice(idx, 1);
    match.sheet.getRange(match.rowIndex, match.colMap["activated_devices"] + 1).setValue(JSON.stringify(devices));
    if (match.colMap["device_id"] !== undefined) {
      match.sheet.getRange(match.rowIndex, match.colMap["device_id"] + 1).setValue(devices.join(","));
    }
    Logger.log("Removed device " + deviceIdToRemove + " from " + email);
  } else {
    Logger.log("Device not found for " + email);
  }
}

// ──────────────────────────────────────────
// BETA LIFECYCLE & AUTOMATED EMAILS
// ──────────────────────────────────────────

var LIFECYCLE_COLUMNS = [
  "beta_email_2day_sent",
  "beta_email_1day_sent",
  "beta_email_expiry_sent",
  "beta_email_expired_sent"
];

/**
 * Safely ensure lifecycle tracking columns exist in the Beta tab.
 * Does not overwrite existing headers or data. Appends missing columns to the right side of Row 1.
 */
function ensureBetaLifecycleHeaders(betaSheet) {
  var lastCol = betaSheet.getLastColumn();
  if (lastCol === 0) return; // Empty sheet

  var headers = betaSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var existingCols = {};
  for (var h = 0; h < headers.length; h++) {
    if (headers[h]) {
      existingCols[headers[h].toString().toLowerCase().trim()] = h;
    }
  }

  var missingCols = [];
  for (var c = 0; c < LIFECYCLE_COLUMNS.length; c++) {
    if (existingCols[LIFECYCLE_COLUMNS[c].toLowerCase()] === undefined) {
      missingCols.push(LIFECYCLE_COLUMNS[c]);
    }
  }

  if (missingCols.length > 0) {
    betaSheet.getRange(1, lastCol + 1, 1, missingCols.length).setValues([missingCols]);
    Logger.log("Added missing lifecycle columns: " + missingCols.join(", "));
  }
}

/**
 * Deterministic date difference calculation using the spreadsheet timezone.
 * Returns days difference between today and expiry.
 * 2 = expires in 2 days. 1 = expires in 1 day. 0 = expires today. -1 = expired yesterday.
 */
function calculateDaysDifference(expiryDateObj, tz) {
  var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var expiryStr = Utilities.formatDate(expiryDateObj, tz, "yyyy-MM-dd");

  // Parse back as UTC to get clean calendar day difference
  var todayUTC = new Date(todayStr + "T00:00:00Z");
  var expiryUTC = new Date(expiryStr + "T00:00:00Z");

  var diffTime = expiryUTC.getTime() - todayUTC.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generates the HTML and subject for a specific lifecycle event.
 */
function buildBetaLifecycleEmail(type, name) {
  var safeName = escapeHtml(name || "Creator");
  var subject = "";
  var headline = "";
  var bodyContent = "";
  var showFeedback = false;
  var feedbackCopy = "";

  switch (type) {
    case "2_days":
      subject = "Your Captiongrit Beta is ending soon";
      headline = "Keep Your Workflow Fast";
      bodyContent = "<p>Hi " + safeName + ",</p>" +
        "<p>We hope you're enjoying the speed and convenience of Captiongrit. You have <strong>2 days left</strong> before your Beta trial concludes.</p>" +
        "<p>Secure your official license today so you never have to go back to repetitive, manual captioning.</p>";
      break;
    case "1_day":
      subject = "Action Required: Your Beta access ends tomorrow";
      headline = "Your Beta Ends Tomorrow";
      bodyContent = "<p>Hi " + safeName + ",</p>" +
        "<p>Just a quick heads-up that your Captiongrit Beta access will officially end <strong>tomorrow</strong>.</p>" +
        "<p>Don't let your editing workflow slow down. Upgrade your license now to keep generating perfect captions in seconds.</p>";
      break;
    case "expiry_day":
      subject = "Your Captiongrit Beta ends today";
      headline = "Today is the Final Day";
      bodyContent = "<p>Hi " + safeName + ",</p>" +
        "<p>Thank you for participating in the Captiongrit Beta! Your trial access will expire <strong>today</strong>.</p>" +
        "<p>We've loved having you with us. To continue using the plugin without any interruptions, you can grab your official license below.</p>";
      showFeedback = true;
      feedbackCopy = "Before you go, we'd love to hear from you. What did you think about Captiongrit?";
      break;
    case "expired_1_day":
      subject = "Your Beta has ended. Keep your workflow fast.";
      headline = "Your Beta Access Has Ended";
      bodyContent = "<p>Hi " + safeName + ",</p>" +
        "<p>Your Captiongrit Beta license has officially expired.</p>" +
        "<p>We know how much time the plugin saves when editing your videos. If you're ready to instantly reactivate your access and get back to creating faster, you can purchase your full license below.</p>";
      showFeedback = true;
      feedbackCopy = "Not ready to continue? Tell us why.";
      break;
    default:
      return null;
  }

  var ctaHtml = "<div style='text-align: center; margin: 35px 0;'>" +
    "<a href='" + PURCHASE_URL + "' style='background-color: #4CAF50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;'>Continue with Captiongrit</a>" +
    "</div>";

  var feedbackHtml = "";
  if (showFeedback && FEEDBACK_URL && FEEDBACK_URL !== "YOUR_FEEDBACK_FORM_URL") {
    feedbackHtml = "<div style='margin-top: 40px; padding-top: 25px; border-top: 1px solid #e0e0e0; text-align: center;'>" +
      "<p style='color: #666; font-size: 14px; margin-bottom: 15px;'>" + feedbackCopy + "</p>" +
      "<a href='" + FEEDBACK_URL + "' style='color: #666; text-decoration: none; border: 1px solid #ccc; padding: 8px 16px; border-radius: 4px; font-size: 13px; display: inline-block;'>Share Your Feedback</a>" +
      "</div>";
  }

  var uniqueStr = "<div style='display:none; color:transparent; visibility:hidden; mso-hide:all; font-size:0; max-height:0; width:0; line-height:0; overflow:hidden;'>Break Thread Trimming: " + new Date().getTime() + "_" + Math.random() + "</div>";

  var htmlBody = "<div style='background-color: #f4f5f7; padding: 20px 0;'>" +
    "<div style='font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px; border: 1px solid #e0e0e0;'>" +
    "<h2 style='color: #4CAF50; margin-top: 0; font-size: 24px;'>" + headline + "</h2>" +
    "<div style='font-size: 16px; line-height: 1.5;'>" + bodyContent + "</div>" +
    ctaHtml +
    "<p style='margin-top: 30px; font-size: 15px;'>Happy editing!<br><strong>The Flogrit Team</strong></p>" +
    feedbackHtml +
    "</div>" +
    "</div>" + uniqueStr;

  var textBody = headline + "\n\n" + bodyContent.replace(/<[^>]+>/g, '') + "\n\nContinue with Captiongrit here: " + PURCHASE_URL;
  if (showFeedback && FEEDBACK_URL && FEEDBACK_URL !== "YOUR_FEEDBACK_FORM_URL") {
    textBody += "\n\n" + feedbackCopy + "\nShare your feedback here: " + FEEDBACK_URL;
  }

  return { subject: subject, htmlBody: htmlBody, textBody: textBody };
}

/**
 * Main lifecycle execution logic. Intended to run daily.
 */
function sendBetaLifecycleEmails(dryRun) {
  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var tz = ss.getSpreadsheetTimeZone();
  var config = PLAN_CONFIG["beta"];
  if (!config) return;

  var sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) return;

  // Safe header initialization
  ensureBetaLifecycleHeaders(sheet);

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return;

  var COL = getColMap(sheet);
  if (COL["email"] === undefined) return;

  Logger.log("--- BETA LIFECYCLE RUN " + (dryRun ? "(DRY RUN) " : "") + "---");
  var emailsSent = 0;

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var email = (row[COL["email"]] || "").toString().trim().toLowerCase();
    var name = (row[COL["name"]] || "Creator").toString().trim();
    var status = (row[COL["status"]] || "").toString().trim().toLowerCase();
    var expiry = row[COL["expiry"]] !== undefined ? row[COL["expiry"]] : null;

    if (!email || status !== "active" || !expiry) continue;

    // Parse expiry date safely
    var expiryDate = new Date(expiry);
    if (isNaN(expiryDate.getTime())) continue; // Invalid date

    var daysLeft = calculateDaysDifference(expiryDate, tz);

    var emailType = null;
    var targetCol = null;

    if (daysLeft === 2 && COL["beta_email_2day_sent"] !== undefined) {
      if (!row[COL["beta_email_2day_sent"]]) {
        emailType = "2_days";
        targetCol = COL["beta_email_2day_sent"];
      }
    } else if (daysLeft === 1 && COL["beta_email_1day_sent"] !== undefined) {
      if (!row[COL["beta_email_1day_sent"]]) {
        emailType = "1_day";
        targetCol = COL["beta_email_1day_sent"];
      }
    } else if (daysLeft === 0 && COL["beta_email_expiry_sent"] !== undefined) {
      if (!row[COL["beta_email_expiry_sent"]]) {
        emailType = "expiry_day";
        targetCol = COL["beta_email_expiry_sent"];
      }
    } else if (daysLeft === -1 && COL["beta_email_expired_sent"] !== undefined) {
      if (!row[COL["beta_email_expired_sent"]]) {
        emailType = "expired_1_day";
        targetCol = COL["beta_email_expired_sent"];
      }
    }

    if (emailType) {
      if (dryRun) {
        Logger.log("[DRY RUN] Would send " + emailType + " to " + email);
      } else {
        var emailContent = buildBetaLifecycleEmail(emailType, name);
        if (emailContent) {
          try {
            MailApp.sendEmail({
              to: email,
              subject: emailContent.subject,
              name: "The Flogrit Team",
              body: emailContent.textBody,
              htmlBody: emailContent.htmlBody
            });
            // Mark as sent
            sheet.getRange(i + 1, targetCol + 1).setValue(new Date().toISOString());
            Logger.log("Sent " + emailType + " to " + email);
            emailsSent++;
          } catch (e) {
            Logger.log("Error sending " + emailType + " to " + email + ": " + e);
          }
        }
      }
    }
  }
  Logger.log("Total lifecycle emails sent: " + emailsSent);
}

function dryRunLifecycleEmails() {
  sendBetaLifecycleEmails(true);
}

function testBetaLifecycleEmail() {
  // IMPORTANT: Replace this email with your own testing address
  var testEmail = "YOUR_TEST_EMAIL@example.com";
  var testName = "Test User";

  var types = ["2_days", "1_day", "expiry_day", "expired_1_day"];
  for (var i = 0; i < types.length; i++) {
    var content = buildBetaLifecycleEmail(types[i], testName);
    Logger.log("Sending test email: " + types[i]);
    try {
      MailApp.sendEmail({
        to: testEmail,
        subject: "[TEST] " + content.subject,
        name: "The Flogrit Team",
        body: content.textBody,
        htmlBody: content.htmlBody
      });
    } catch (e) {
      Logger.log("Error sending test email: " + e);
    }
  }
  Logger.log("Sent all test emails to " + testEmail);
}

/**
 * Idempotent setup function for the daily lifecycle trigger.
 * Run this ONCE to automate the daily email checks.
 */
function setupBetaLifecycleTrigger() {
  var functionName = "sendBetaLifecycleEmails";
  var triggers = ScriptApp.getProjectTriggers();
  var exists = false;

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      exists = true;
      break;
    }
  }

  if (!exists) {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .everyDays(1)
      .atHour(9) // Runs around 9:00 AM in script timezone
      .create();
    Logger.log("Created daily trigger for " + functionName);
  } else {
    Logger.log("Trigger for " + functionName + " already exists.");
  }
}

// ──────────────────────────────────────────
// ADMIN BROADCAST & VERSION UPDATE EMAILS
// ──────────────────────────────────────────

/**
 * Standalone execution function for sending version update emails directly from the Apps Script Editor.
 * Includes strong safeguards against accidental sends, quota protection, deduplication, and persistent logging.
 */
function sendCaptiongritUpdateEmail() {
  // ──────────────────────────────────────────
  // CONFIGURATION
  // ──────────────────────────────────────────
  var VERSION = "1.0.3";
  var SUBJECT = "🚀 Important Update: Captiongrit v1.0.3 is here!";
  var DOWNLOAD_URL = getDownloadUrl();
  var RECIPIENT_MODE = "active_users"; // "active_users" | "all_users" | "paid_only"

  // ACCIDENTAL-SEND SAFEGUARDS:
  // Set DRY_RUN = false and set CONFIRMATION_GUARD = "CONFIRM_SEND_1.0.3" to execute an actual email broadcast.
  var DRY_RUN = true;
  var CONFIRMATION_GUARD = "PREVIEW_ONLY"; // Set to "CONFIRM_SEND_1.0.3" for live broadcast

  return executeVersionBroadcast({
    version: VERSION,
    subject: SUBJECT,
    downloadUrl: DOWNLOAD_URL,
    recipientMode: RECIPIENT_MODE,
    dryRun: DRY_RUN,
    confirmationGuard: CONFIRMATION_GUARD,
    expectedGuard: "CONFIRM_SEND_" + VERSION,
    source: "Editor"
  });
}

/**
 * UI Menu Trigger for Google Sheets
 */
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('Captiongrit Admin')
      .addItem('Broadcast Version Update Email', 'broadcastUpdateEmail')
      .addToUi();
  } catch (e) {
    // Suppress error if opened outside Google Sheets UI context
  }
}

/**
 * UI-driven version update broadcast (called via Google Sheets UI menu)
 */
function broadcastUpdateEmail() {
  var ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    Logger.log("UI context not available. Run sendCaptiongritUpdateEmail() instead.");
    return;
  }

  var VERSION = "1.0.3";
  var SUBJECT = "🚀 Important Update: Captiongrit v1.0.3 is here!";
  var DOWNLOAD_URL = getDownloadUrl();

  var response = ui.alert(
    'Confirm Broadcast',
    'Are you sure you want to run the Captiongrit update broadcast? A preview dry run will be generated first.',
    ui.ButtonSet.YES_NO
  );
  if (response == ui.Button.NO) return;

  // 1. Run dry run summary first
  var summary = executeVersionBroadcast({
    version: VERSION,
    subject: SUBJECT,
    downloadUrl: DOWNLOAD_URL,
    recipientMode: "active_users",
    dryRun: true,
    confirmationGuard: "CONFIRM_SEND_" + VERSION,
    expectedGuard: "CONFIRM_SEND_" + VERSION,
    source: "UI_Menu"
  });

  if (!summary.eligibleCount || summary.eligibleCount === 0) {
    ui.alert('No Eligible Recipients', 'No eligible recipients found or all recipients have already received version ' + VERSION + '.', ui.ButtonSet.OK);
    return;
  }

  var confirmStr = 'DRY RUN COMPLETE:\n' +
    '• Eligible Unique Recipients: ' + summary.eligibleCount + '\n' +
    '• Daily Email Quota Remaining: ' + summary.remainingQuota + '\n\n' +
    'Do you want to proceed with live email broadcast?';

  var proceed = ui.alert('Final Confirmation', confirmStr, ui.ButtonSet.YES_NO);
  if (proceed == ui.Button.NO) return;

  // 2. Execute live broadcast
  var result = executeVersionBroadcast({
    version: VERSION,
    subject: SUBJECT,
    downloadUrl: DOWNLOAD_URL,
    recipientMode: "active_users",
    dryRun: false,
    confirmationGuard: "CONFIRM_SEND_" + VERSION,
    expectedGuard: "CONFIRM_SEND_" + VERSION,
    source: "UI_Menu"
  });

  ui.alert('Broadcast Completed', 'Sent: ' + result.sentCount + '\nSkipped (Already Sent): ' + result.alreadySentCount + '\nErrors: ' + result.errorCount, ui.ButtonSet.OK);
}

/**
 * Core broadcast engine with active filtering, deduplication, quota check, safety guard, and EmailLog tracking.
 */
function executeVersionBroadcast(opts) {
  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var version = opts.version;
  var dryRun = opts.dryRun !== false;
  var confirmationGuard = opts.confirmationGuard;
  var expectedGuard = opts.expectedGuard;

  Logger.log("=================================================");
  Logger.log(" CAPTIONGRIT VERSION BROADCAST " + (dryRun ? "(DRY RUN)" : "(LIVE SEND)"));
  Logger.log(" Target Version: " + version);
  Logger.log(" Source: " + opts.source);
  Logger.log(" Recipient Mode: " + opts.recipientMode);
  Logger.log("=================================================");

  // 1. Accidental-send Safeguard
  if (!dryRun && confirmationGuard !== expectedGuard) {
    var errMsg = "BROADCAST CANCELLED: Safety guard failed! 'confirmationGuard' must equal '" + expectedGuard + "' when dryRun is false.";
    Logger.log("❌ " + errMsg);
    return { success: false, reason: "guard_failed", message: errMsg };
  }

  // 2. EmailLog sheet for deduplication & persistent send history
  var emailLogSheet = ensureTabExists(ss, "EmailLog", ["timestamp", "version", "email", "status", "details"]);
  var logData = emailLogSheet.getDataRange().getValues();
  var alreadySentSet = {};
  if (logData.length > 1) {
    var logCol = getColMap(emailLogSheet);
    for (var l = 1; l < logData.length; l++) {
      var logVer = (logData[l][logCol["version"]] || "").toString().trim();
      var logEmail = (logData[l][logCol["email"]] || "").toString().trim().toLowerCase();
      var logStat = (logData[l][logCol["status"]] || "").toString().trim().toLowerCase();
      if (logVer === version && logEmail && logStat === "sent") {
        alreadySentSet[logEmail] = true;
      }
    }
  }

  // 3. Scan Plan Tabs for Eligible Recipients
  var targetTabs = ["Basic", "Pro", "Extreme", "Beta"];
  if (opts.recipientMode === "paid_only") {
    targetTabs = ["Basic", "Pro", "Extreme"];
  }

  var today = new Date();
  var uniqueRecipients = {};
  var categoryCounts = { paid_active: 0, beta_active: 0, excluded_expired: 0, excluded_inactive: 0, already_sent: 0 };

  for (var t = 0; t < targetTabs.length; t++) {
    var sheet = ss.getSheetByName(targetTabs[t]);
    if (!sheet) continue;

    var rows = sheet.getDataRange().getValues();
    if (rows.length < 2) continue;

    var COL = getColMap(sheet);
    if (COL["email"] === undefined) continue;

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var email = (row[COL["email"]] || "").toString().trim().toLowerCase();
      var name = (row[COL["name"]] || "Creator").toString().trim();
      var status = (row[COL["status"]] || "").toString().trim().toLowerCase();
      var plan = (row[COL["plan"]] || targetTabs[t]).toString().trim().toLowerCase();
      var expiry = COL["expiry"] !== undefined ? row[COL["expiry"]] : null;

      if (!email || email.indexOf("@") === -1) continue;

      // Status check (active users only unless all_users mode specified)
      if (opts.recipientMode === "active_users" || opts.recipientMode === "paid_only") {
        if (status !== "active") {
          categoryCounts.excluded_inactive++;
          continue;
        }
      }

      // Expiry check for Beta users
      if (plan === "beta" || targetTabs[t] === "Beta") {
        if (expiry) {
          var expDate = new Date(expiry);
          if (!isNaN(expDate.getTime()) && expDate <= today) {
            categoryCounts.excluded_expired++;
            continue; // Exclude expired beta
          }
        }
      }

      // Already sent version check
      if (alreadySentSet[email]) {
        categoryCounts.already_sent++;
        continue;
      }

      if (!uniqueRecipients[email]) {
        uniqueRecipients[email] = { name: name || "there", plan: plan };
        if (plan === "beta" || targetTabs[t] === "Beta") {
          categoryCounts.beta_active++;
        } else {
          categoryCounts.paid_active++;
        }
      }
    }
  }

  var recipientEmails = Object.keys(uniqueRecipients);
  var eligibleCount = recipientEmails.length;
  var remainingQuota = MailApp.getRemainingDailyQuota();

  Logger.log("--- RECIPIENT AUDIT SUMMARY ---");
  Logger.log("Paid Active Users: " + categoryCounts.paid_active);
  Logger.log("Beta Active Users (Future Expiry): " + categoryCounts.beta_active);
  Logger.log("Excluded (Expired Beta): " + categoryCounts.excluded_expired);
  Logger.log("Excluded (Non-Active Status): " + categoryCounts.excluded_inactive);
  Logger.log("Skipped (Already Sent Version " + version + "): " + categoryCounts.already_sent);
  Logger.log("Total Eligible Unique Recipients: " + eligibleCount);
  Logger.log("Daily MailApp Quota Remaining: " + remainingQuota);

  if (dryRun) {
    Logger.log("ℹ️ DRY RUN COMPLETE — No emails were sent.");
    return {
      dryRun: true,
      eligibleCount: eligibleCount,
      remainingQuota: remainingQuota,
      categoryCounts: categoryCounts,
      recipients: recipientEmails
    };
  }

  // 4. Quota Check
  if (remainingQuota < eligibleCount) {
    var quotaErr = "ABORTING BROADCAST: Insufficient daily email quota! Required: " + eligibleCount + ", Remaining: " + remainingQuota + ".";
    Logger.log("❌ " + quotaErr);
    return { success: false, reason: "insufficient_quota", eligibleCount: eligibleCount, remainingQuota: remainingQuota, message: quotaErr };
  }

  // 5. Live Broadcast Execution
  var sentCount = 0;
  var errorCount = 0;

  for (var i = 0; i < recipientEmails.length; i++) {
    var targetEmail = recipientEmails[i];
    var recipient = uniqueRecipients[targetEmail];
    var safeName = escapeHtml(recipient.name);

    var htmlBody = buildUpdateEmailHtml(safeName, version, opts.downloadUrl);
    var textBody = "Hi " + safeName + ",\n\nCaptiongrit Version " + version + " is here!\nDownload the update: " + opts.downloadUrl + "\n\nHappy Editing,\nThe Flogrit Team";

    try {
      MailApp.sendEmail({
        to: targetEmail,
        subject: opts.subject,
        name: "The Flogrit Team",
        body: textBody,
        htmlBody: htmlBody
      });

      // Log success to EmailLog sheet
      emailLogSheet.appendRow([new Date().toISOString(), version, targetEmail, "sent", "Success"]);
      sentCount++;
      Logger.log("✅ [" + (i + 1) + "/" + eligibleCount + "] Sent to " + targetEmail);

    } catch (sendErr) {
      errorCount++;
      emailLogSheet.appendRow([new Date().toISOString(), version, targetEmail, "error", sendErr.message]);
      Logger.log("❌ [" + (i + 1) + "/" + eligibleCount + "] Error sending to " + targetEmail + ": " + sendErr.message);
    }
  }

  Logger.log("=================================================");
  Logger.log(" BROADCAST COMPLETED");
  Logger.log(" Sent: " + sentCount);
  Logger.log(" Errors: " + errorCount);
  Logger.log(" Already Sent Previously: " + categoryCounts.already_sent);
  Logger.log("=================================================");

  return {
    dryRun: false,
    sentCount: sentCount,
    alreadySentCount: categoryCounts.already_sent,
    errorCount: errorCount,
    eligibleCount: eligibleCount
  };
}

/**
 * Responsive Captiongrit HTML Email Template Generator
 */
function buildUpdateEmailHtml(name, version, downloadUrl) {
  return '<!DOCTYPE html>\n' +
    '<html>\n<head><meta charset="UTF-8"></head>\n' +
    '<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f9f9f9; padding: 20px;">\n' +
    '  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">\n' +
    '    <div style="background-color: #0F172A; color: #ffffff; padding: 30px 20px; text-align: center;">\n' +
    '      <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Captiongrit ' + version + ' is Here!</h1>\n' +
    '    </div>\n' +
    '    <div style="padding: 30px;">\n' +
    '      <h2 style="color: #0F172A; font-size: 20px; margin-top: 0;">Important Update & Stability Improvements ✨</h2>\n' +
    '      <p style="margin-bottom: 16px;">Hi ' + name + ',</p>\n' +
    '      <p style="margin-bottom: 16px;">We are excited to announce Captiongrit Version ' + version + '! This update includes critical stability fixes and performance improvements.</p>\n' +
    '      <center>\n' +
    '        <a href="' + downloadUrl + '" style="display: inline-block; background-color: #10b981; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 20px 0; text-align: center;">Download Version ' + version + '</a>\n' +
    '      </center>\n' +
    '      <p style="margin-bottom: 16px;"><strong>⚙️ How to Update:</strong></p>\n' +
    '      <p style="margin-bottom: 16px;">1. Make sure Adobe Premiere Pro is completely <strong>closed</strong>.<br>\n' +
    '      2. Download the ZIP file from the link above and extract it.<br>\n' +
    '      3. Inside the folder, double-click on <code>install.bat</code> (Windows) or <code>install.command</code> (Mac).<br>\n' +
    '      4. The script will automatically overwrite your old version. Open Premiere Pro, and you\'re good to go!</p>\n' +
    '      <p style="margin-bottom: 16px;">Happy Editing,<br><strong>The Flogrit Team</strong></p>\n' +
    '    </div>\n' +
    '    <div style="background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b;">\n' +
    '      <p style="margin-bottom: 16px;">© 2024 Flogrit. All rights reserved.</p>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '</body>\n</html>';
}

// ──────────────────────────────────────────
// RAZORPAY PAYMENT RECOVERY SYSTEM
// ──────────────────────────────────────────

/**
 * Fetch credentials from Script Properties
 */
function getRazorpayCredentials() {
  var props = PropertiesService.getScriptProperties();
  var keyId = props.getProperty("RAZORPAY_KEY_ID");
  var keySecret = props.getProperty("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) {
    Logger.log("⚠️ RAZORPAY CREDENTIALS MISSING! Please set 'RAZORPAY_KEY_ID' and 'RAZORPAY_KEY_SECRET' in Script Properties.");
    return null;
  }
  return { keyId: keyId, keySecret: keySecret };
}

/**
 * Query payments from Razorpay REST API for a date range
 */
function fetchRazorpayPaymentsFromApi(fromTimestamp, toTimestamp, count, skip) {
  var creds = getRazorpayCredentials();
  if (!creds) return null;

  var url = "https://api.razorpay.com/v1/payments?from=" + (fromTimestamp || 0) + "&to=" + (toTimestamp || Math.floor(new Date().getTime() / 1000)) + "&count=" + (count || 100) + "&skip=" + (skip || 0);
  var authHeader = "Basic " + Utilities.base64Encode(creds.keyId + ":" + creds.keySecret);

  try {
    var response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { "Authorization": authHeader },
      muteHttpExceptions: true
    });

    var responseCode = response.getResponseCode();
    var body = response.getContentText();
    if (responseCode !== 200) {
      Logger.log("Razorpay API fetch failed (HTTP " + responseCode + "): " + body);
      return null;
    }

    var data = JSON.parse(body);
    return data.items || [];
  } catch (err) {
    Logger.log("Error querying Razorpay API: " + err);
    return null;
  }
}

/**
 * Fetch a single payment directly from Razorpay REST API
 */
function fetchSingleRazorpayPayment(paymentId) {
  var creds = getRazorpayCredentials();
  if (!creds || !paymentId) return null;

  var url = "https://api.razorpay.com/v1/payments/" + paymentId.trim();
  var authHeader = "Basic " + Utilities.base64Encode(creds.keyId + ":" + creds.keySecret);

  try {
    var response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { "Authorization": authHeader },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) return null;
    return JSON.parse(response.getContentText());
  } catch (err) {
    Logger.log("Error fetching payment " + paymentId + ": " + err);
    return null;
  }
}

/**
 * Fetch order details from Razorpay REST API
 */
function fetchRazorpayOrderFromApi(orderId) {
  var creds = getRazorpayCredentials();
  if (!creds || !orderId) return null;

  var url = "https://api.razorpay.com/v1/orders/" + orderId.trim();
  var authHeader = "Basic " + Utilities.base64Encode(creds.keyId + ":" + creds.keySecret);

  try {
    var response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { "Authorization": authHeader },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) return null;
    return JSON.parse(response.getContentText());
  } catch (err) {
    return null;
  }
}

/**
 * Derive trusted plan from Razorpay payment and order metadata
 */
function determinePlanFromRazorpayMetadata(payment, order) {
  if (!payment) return null;

  // 1. Payment notes
  if (payment.notes) {
    var pNotePlan = (payment.notes.plan || payment.notes.planId || "").toString().trim().toLowerCase();
    if (PLAN_CONFIG[pNotePlan]) return pNotePlan;
  }

  // 2. Order notes
  if (order && order.notes) {
    var oNotePlan = (order.notes.plan || order.notes.planId || "").toString().trim().toLowerCase();
    if (PLAN_CONFIG[oNotePlan]) return oNotePlan;
  }

  // 3. Description search
  var desc = (payment.description || "").toLowerCase();
  if (desc.indexOf("extreme") >= 0) return "extreme";
  if (desc.indexOf("pro") >= 0) return "pro";
  if (desc.indexOf("basic") >= 0) return "basic";

  // 4. Amount matching (in paise)
  var amountPaise = Number(payment.amount) || 0;
  if (amountPaise === 99900 || amountPaise === 999 || amountPaise === 199900 || amountPaise === 1999) return "extreme";
  if (amountPaise === 59900 || amountPaise === 599) return "pro";
  if (amountPaise === 39900 || amountPaise === 399 || amountPaise === 49900 || amountPaise === 499) return "basic";

  return null;
}

/**
 * PREVIEW RAZORPAY RECOVERIES (DRY RUN ONLY)
 * 
 * Scans captured Razorpay payments within date range and classifies state against Google Sheets.
 * MUST NOT mutate Sheets, MUST NOT create licenses, MUST NOT send emails.
 * 
 * Usage from Apps Script Editor:
 * previewRazorpayRecoveries("2026-08-01", "2026-09-06");
 */
function previewRazorpayRecoveries(fromDateStr, toDateStr) {
  Logger.log("=================================================");
  Logger.log(" RAZORPAY PAYMENT RECOVERY PREVIEW (DRY RUN)");
  Logger.log(" Date Range: " + (fromDateStr || "Default (30 days)") + " to " + (toDateStr || "Now"));
  Logger.log("=================================================");

  var creds = getRazorpayCredentials();
  if (!creds) {
    return { status: "error", code: "CREDENTIALS_MISSING", message: "Razorpay credentials not set in Script Properties." };
  }

  var now = new Date();
  var fromDate = fromDateStr ? new Date(fromDateStr) : new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  var toDate = toDateStr ? new Date(toDateStr) : now;

  var fromTs = Math.floor(fromDate.getTime() / 1000);
  var toTs = Math.floor(toDate.getTime() / 1000);

  var rawPayments = fetchRazorpayPaymentsFromApi(fromTs, toTs, 100, 0);
  if (!rawPayments) {
    Logger.log("❌ Could not retrieve payments from Razorpay API.");
    return { status: "error", code: "API_ERROR", message: "Failed to query Razorpay API." };
  }

  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var transSheet = ss.getSheetByName(TRANSACTIONS_TAB_NAME);

  var summary = {
    totalScanned: rawPayments.length,
    captured: 0,
    notCaptured: 0,
    alreadyFulfilled: 0,
    paidUpgradeRecovery: 0,
    transactionOnlyMissingLicense: 0,
    licenseOnlyMissingTransaction: 0,
    unfulfilledPayment: 0,
    fulfilledEmailPending: 0,
    unknownPlan: 0,
    actionable: []
  };

  for (var i = 0; i < rawPayments.length; i++) {
    var p = rawPayments[i];
    var pId = p.id;
    var pStatus = (p.status || "").toLowerCase();
    var email = (p.email || (p.notes ? p.notes.email : "") || "").trim().toLowerCase();
    var orderId = p.order_id || "";
    var amount = p.amount ? (p.amount / 100) : 0;
    var currency = p.currency || "INR";

    if (pStatus !== "captured") {
      summary.notCaptured++;
      Logger.log("⏭️ [" + pId + "] Status: " + pStatus + " (Skipped non-captured)");
      continue;
    }

    summary.captured++;

    // Fetch order metadata if available
    var orderObj = orderId ? fetchRazorpayOrderFromApi(orderId) : null;
    var derivedPlan = determinePlanFromRazorpayMetadata(p, orderObj);

    var transMatch = findTransactionByPaymentId(transSheet, pId);
    var userMatch = email ? findUserAcrossTabs(ss, email) : null;
    var currentPlan = userMatch ? (userMatch.rowData[userMatch.colMap["plan"]] || userMatch.sheet.getName()).toString().trim().toLowerCase() : null;

    var stateCategory = "";
    var requiresAction = false;

    // Classification Rules:
    if (userMatch && derivedPlan && currentPlan !== derivedPlan) {
      // Customer exists in Beta (or different plan) and purchased a paid plan upgrade
      stateCategory = "PAID_UPGRADE_RECOVERY";
      summary.paidUpgradeRecovery++;
      requiresAction = true;
    } else if (transMatch && userMatch && currentPlan === derivedPlan && (transMatch.email_status === "sent" || (userMatch.colMap["email_status"] !== undefined && userMatch.rowData[userMatch.colMap["email_status"]] === "sent"))) {
      stateCategory = "ALREADY_FULFILLED";
      summary.alreadyFulfilled++;
    } else if (transMatch && !userMatch) {
      stateCategory = "TRANSACTION_ONLY_MISSING_LICENSE";
      summary.transactionOnlyMissingLicense++;
      requiresAction = true;
    } else if (!transMatch && userMatch && currentPlan === derivedPlan) {
      stateCategory = "LICENSE_ONLY_MISSING_TRANSACTION";
      summary.licenseOnlyMissingTransaction++;
      requiresAction = true;
    } else if (!transMatch && !userMatch) {
      stateCategory = "UNFULFILLED_PAYMENT";
      summary.unfulfilledPayment++;
      requiresAction = true;
    } else if (transMatch && userMatch && (transMatch.email_status !== "sent" || (userMatch.colMap["email_status"] !== undefined && userMatch.rowData[userMatch.colMap["email_status"]] !== "sent"))) {
      stateCategory = "FULFILLED_EMAIL_PENDING";
      summary.fulfilledEmailPending++;
      requiresAction = true;
    }

    if (!derivedPlan && requiresAction) {
      summary.unknownPlan++;
    }

    var item = {
      paymentId: pId,
      orderId: orderId,
      email: email,
      amount: amount,
      currency: currency,
      currentPlan: currentPlan || "NONE",
      derivedPlan: derivedPlan || "UNKNOWN",
      state: stateCategory,
      requiresAction: requiresAction,
      hasTransaction: !!transMatch,
      hasLicense: !!userMatch,
      existingKey: userMatch ? userMatch.key : (transMatch ? transMatch.licenseKey : null)
    };

    if (requiresAction) {
      summary.actionable.push(item);
      Logger.log("⚠️ ACTION REQUIRED [" + pId + "] Email: " + email + " | Current Plan: " + item.currentPlan + " | Paid Plan: " + item.derivedPlan + " | State: " + stateCategory);
    } else {
      Logger.log("✅ OK [" + pId + "] Email: " + email + " | State: " + stateCategory);
    }
  }

  Logger.log("=================================================");
  Logger.log(" PREVIEW SUMMARY");
  Logger.log(" Total Scanned Payments: " + summary.totalScanned);
  Logger.log(" Captured Payments: " + summary.captured);
  Logger.log(" Non-Captured Payments: " + summary.notCaptured);
  Logger.log(" Already Fully Provisioned: " + summary.alreadyFulfilled);
  Logger.log(" Actionable (Missing Trans/Sub/Email/Upgrade): " + summary.actionable.length);
  Logger.log("   • Beta → Paid Upgrade: " + summary.paidUpgradeRecovery);
  Logger.log("   • Missing License Row: " + summary.transactionOnlyMissingLicense);
  Logger.log("   • Missing Transaction Log: " + summary.licenseOnlyMissingTransaction);
  Logger.log("   • Fully Missing (New Recoveries): " + summary.unfulfilledPayment);
  Logger.log("   • Email Pending Retry: " + summary.fulfilledEmailPending);
  if (summary.unknownPlan > 0) {
    Logger.log(" ⚠️ WARNING: " + summary.unknownPlan + " actionable payments could not be assigned a plan automatically!");
  }
  Logger.log("=================================================");
  Logger.log("ℹ️ DRY RUN COMPLETE — No changes were made to Sheets or emails.");

  return summary;
}

/**
 * RECOVER RAZORPAY PAYMENTS (LIVE EXECUTION)
 * 
 * Safely provisions missing licenses and transaction logs for captured Razorpay payments.
 * Requires explicit safety guard: confirmGuard === "CONFIRM_RECOVERY".
 * 
 * Usage from Apps Script Editor:
 * recoverRazorpayPayments("CONFIRM_RECOVERY", ["pay_Pxxxxx1", "pay_Pxxxxx2"]);
 * Or recover all actionable in date range:
 * recoverRazorpayPayments("CONFIRM_RECOVERY", null, "2026-08-01", "2026-09-06");
 */
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
  printReport("2. Two simultaneous paid_signup (different paymentIds)", "pay_2a, pay_2b", start2, res2a, b2, sheetsDb, errs2);

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
  printReport("3. Two simultaneous paid_signup (SAME paymentId)", "pay_3 (x2)", start3, res3a, b3, sheetsDb, errs3);

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
  let res5 = handlePaidSignup({ secret: "secret", data: { paymentId: "pay_4", email: "test4@test.com", plan: "basic", licenseKey: "CG-4" } }, null);
  printReport("5. Retry after email failure", "pay_4 retry", start5, res5, b5, sheetsDb, []);

  // TEST 6
  resetDb();
  global.fetchSingleRazorpayPayment = function(pId) {
    return { id: pId, status: "captured", email: pId.replace("pay_", "recov_") + "@test.com", amount: 59900, currency: "INR" };
  };
  global.fetchRazorpayOrderFromApi = function(oId) { return null; };
  global.determinePlanFromRazorpayMetadata = function(p, o) { return "basic"; };
  
  let start6 = Date.now();
  let b6 = JSON.parse(JSON.stringify(sheetsDb));
  let errs6 = [];
  let res6a;
  try {
      global.concurrentPayload = { secret: "secret", data: { paymentId: "pay_6", email: "recov_6@test.com", plan: "basic", licenseKey: "CG-6" } };
      res6a = executeRazorpayRecoveries(["pay_6"], null, null);
      if (global.concurrentError) errs6.push(global.concurrentError);
  } catch(e) { errs6.push(e); }
  printReport("6. Recovery running concurrently with paid_signup", "pay_6", start6, res6a, b6, sheetsDb, errs6);

  // TEST 7
  resetDb();
  let start7 = Date.now();
  let b7 = JSON.parse(JSON.stringify(sheetsDb));
  let res7 = executeRazorpayRecoveries(["pay_7a", "pay_7b", "pay_7c"], null, null);
  printReport("7. Multiple recovery payments", "pay_7a, pay_7b, pay_7c", start7, res7, b7, sheetsDb, []);

}

runTests();
