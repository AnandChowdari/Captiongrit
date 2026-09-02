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

// Single Source of Truth for Plan Configurations
var PLAN_CONFIG = {
  basic: { sheetName: "Basic", maxDuration: 30, maxDevices: 1, maxClips: 1, hasDoubleCheck: false, hasEditor: false, hasCustomDict: false, hasWordByWord: false, hasFullSentence: true, hasEnglishOutput: false, hasPresets: false, hasMogrt: false, hasBatch: false },
  pro: { sheetName: "Pro", maxDuration: 150, maxDevices: 1, maxClips: 1, hasDoubleCheck: true, hasEditor: true, hasCustomDict: true, hasWordByWord: true, hasFullSentence: true, hasEnglishOutput: true, hasPresets: false, hasMogrt: false, hasBatch: false },
  extreme: { sheetName: "Extreme", maxDuration: 0, maxDevices: 3, maxClips: 99, hasDoubleCheck: true, hasEditor: true, hasCustomDict: true, hasWordByWord: true, hasFullSentence: true, hasEnglishOutput: true, hasPresets: false, hasMogrt: false, hasBatch: true },
  beta: { sheetName: "Beta", maxDuration: 0, maxDevices: 3, maxClips: 99, hasDoubleCheck: true, hasEditor: true, hasCustomDict: true, hasWordByWord: true, hasFullSentence: true, hasEnglishOutput: true, hasPresets: false, hasMogrt: false, hasBatch: true }
};

var TRANSACTIONS_TAB_NAME = "Transactions";
var TRANSACTIONS_HEADERS = ["transactionId", "paymentId", "orderId", "email", "plan", "amount", "currency", "timestamp", "status", "licenseKey", "actionTaken"];
var LEGACY_TAB_NAME = "Sheet1"; // The original sheet name for migration purposes

var DEFAULT_HEADERS = ["email", "license_key", "status", "expiry", "device_id", "activated_devices", "max_devices", "plan", "name"];

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
    latest_version: "1.0.1",
    download_url: "https://drive.google.com/file/d/1rSuR54SJmLKWQbO0jMJVj_U80guOWmly/view?usp=sharing",
    message: "A new version of Captiongrit is available!"
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

    if (!paymentId || !email || !plan || !payloadLicenseKey) {
      return jsonResponse({ status: "error", code: "INVALID_PAYLOAD", message: "Missing required fields." });
    }

    var transSheet = ensureTabExists(ss, TRANSACTIONS_TAB_NAME, TRANSACTIONS_HEADERS);
    var transRows = transSheet.getDataRange().getValues();
    var transCOL = getColMap(transSheet);

    if (transCOL["paymentid"] !== undefined) {
      for (var i = 1; i < transRows.length; i++) {
        if (transRows[i][transCOL["paymentid"]] === paymentId) {
          return jsonResponse({ status: "success", code: "DUPLICATE_TRANSACTION", message: "Transaction already processed.", data: { actionTaken: "duplicate_transaction" } });
        }
      }
    }

    // Phase 2: Enhanced Identity Resolution
    var userMatch = findUserAcrossTabs(ss, email, payloadLicenseKey) || findUserAcrossTabs(ss, email);
    
    var actionTaken = "created_new";
    var finalKey = payloadLicenseKey; // Default to provided key for new users

    if (userMatch) {
      var rowPlan = (userMatch.rowData[userMatch.colMap["plan"]] || "").toString().trim().toLowerCase();
      var oldKey = (userMatch.rowData[userMatch.colMap["license_key"]] || "").toString().trim();
      
      if (rowPlan === plan) {
        actionTaken = "already_owned";
        finalKey = oldKey; // Keep existing key
      } else {
        actionTaken = "upgraded_existing";
        
        // Phase 2: Preserve credentials and device sessions
        finalKey = oldKey || payloadLicenseKey;
        var oldDevices = (userMatch.rowData[userMatch.colMap["activated_devices"]] || "[]").toString().trim();
        
        var maxDevices = PLAN_CONFIG[plan].maxDevices;
        var newRowObj = { name: pd.name || "User", email: email, license_key: finalKey, plan: plan, status: "active", activated_devices: oldDevices, max_devices: maxDevices, expiry: "" };
        
        // Phase 2: Transaction Safety - Append BEFORE delete
        appendToPlanTab(ss, plan, newRowObj);
        userMatch.sheet.deleteRow(userMatch.rowIndex);
        
        sendLicenseEmail(email, pd.name || "User", plan, finalKey);
      }
    } else {
      var maxDevices = PLAN_CONFIG[plan].maxDevices;
      var newRowObj = { name: pd.name || "User", email: email, license_key: finalKey, plan: plan, status: "active", activated_devices: "[]", max_devices: maxDevices, expiry: "" };
      appendToPlanTab(ss, plan, newRowObj);
      sendLicenseEmail(email, pd.name || "User", plan, finalKey);
    }

    var transRow = new Array(TRANSACTIONS_HEADERS.length).fill("");
    for (var k = 0; k < TRANSACTIONS_HEADERS.length; k++) {
      var h = TRANSACTIONS_HEADERS[k];
      if (h === "actionTaken") transRow[k] = actionTaken;
      else if (h === "licenseKey") transRow[k] = finalKey;
      else transRow[k] = pd[h] || "";
    }
    transSheet.appendRow(transRow);

    return jsonResponse({ status: "success", message: "Payment recorded and fulfillment initiated.", data: { email: email, plan: plan, actionTaken: actionTaken } });
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
      expiryDate.setDate(today.getDate() + 7);
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
    return jsonResponse({
      valid: false,
      reason: "device_limit_reached",
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
  // Always search the designated plan tabs
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
      if (rowEmail === email) {
        if (licenseKeyMatch) {
          var rowKey = (rows[i][COL["license_key"]] || "").toString().trim();
          if (rowKey === licenseKeyMatch) {
            return { sheet: sheet, rowIndex: i + 1, rowData: rows[i], colMap: COL };
          }
        } else {
          return { sheet: sheet, rowIndex: i + 1, rowData: rows[i], colMap: COL };
        }
      }
    }
  }
  return null;
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
    "<p>Your 7-day Beta license key is:</p>" +
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
        "<p>Thank you for participating in the Captiongrit Beta! Your 7-day trial access will expire <strong>today</strong>.</p>" +
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
