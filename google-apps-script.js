/**
* Captiongrit — Google Apps Script (License Validation)
* 
* Deploy this as a Web App in Google Apps Script.
* It reads from a Google Sheet (first tab)
* 
* REQUIRED HEADERS (Row 1):
* REQUIRED HEADERS (Row 1):
* email | license_key | status | expiry | device_id | activated_devices | max_devices | plan
*/

// Secure secret for generating new licenses remotely.
// CHANGE THIS TO A SECURE RANDOM STRING BEFORE DEPLOYING!
var ADMIN_SECRET = "anand@2802";

// IMPORTANT: Paste your full Google Sheet URL here (the one with the licenses)
// Example: "https://docs.google.com/spreadsheets/d/1XyZ.../edit"
var SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1p8sHgGEuG11aFqKG3X-vA8Q4SfPCg5MoKCCb8RjMhWQ/edit?gid=0#gid=0";

// IMPORTANT: Paste your direct ZIP file download link ID here
// Upload your Captiongrit-Universal.zip to your Google Drive,
// right-click -> "Get Link", and copy just the ID part of the URL.
// Example: if link is https://drive.google.com/file/d/1abcXYZ/view, the ID is "1abcXYZ"
var UNIVERSAL_ZIP_ID = "PASTE_UNIVERSAL_ZIP_FILE_ID_HERE";

var PLAN_CAPABILITIES = {
  basic: { maxDuration: 30, maxDevices: 1, maxClips: 1, hasDoubleCheck: false, hasEditor: false, hasCustomDict: false, hasWordByWord: false, hasFullSentence: true, hasEnglishOutput: false, hasPresets: false, hasMogrt: false, hasBatch: false },
  pro: { maxDuration: 150, maxDevices: 1, maxClips: 1, hasDoubleCheck: true, hasEditor: true, hasCustomDict: true, hasWordByWord: true, hasFullSentence: true, hasEnglishOutput: true, hasPresets: false, hasMogrt: false, hasBatch: false },
  extreme: { maxDuration: 0, maxDevices: 3, maxClips: 99, hasDoubleCheck: true, hasEditor: true, hasCustomDict: true, hasWordByWord: true, hasFullSentence: true, hasEnglishOutput: true, hasPresets: false, hasMogrt: false, hasBatch: true },
  beta: { maxDuration: 0, maxDevices: 3, maxClips: 99, hasDoubleCheck: true, hasEditor: true, hasCustomDict: true, hasWordByWord: true, hasFullSentence: true, hasEnglishOutput: true, hasPresets: false, hasMogrt: false, hasBatch: true }
};

function extractFileId(input) {
  if (!input) return "";
  // Check if it's a full Drive URL
  var match = input.match(/[-\w]{25,}/);
  if (match) {
    return match[0];
  }
  return input;
}

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

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      // Fallback for form-urlencoded
      data = e.parameter;
    }
    
    var action = (data.action || "verify").trim().toLowerCase();

    // Open the spreadsheet using the URL provided above
    var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    var sheet = ss.getSheets()[0];
    if (!sheet) {
      return jsonResponse({ valid: false, reason: "server_error" });
    }

    var COL = getColMap(sheet);

    // ──────────────────────────────────────────
    // ACTION: CHECK UPDATE
    // ──────────────────────────────────────────
    if (action === "check_update") {
      // In the future, you can read these values from a 'Settings' sheet
      // For now, it returns a static response that you can edit here.
      return jsonResponse({
        latest_version: "1.0.0", // Change this when a new version is released
        download_url: "https://drive.google.com/your-zxp-link",
        message: "A new version of Captiongrit is available!"
      });
    }

    // ──────────────────────────────────────────
    // ACTION: BULK GENERATE LICENSES
    // ──────────────────────────────────────────
    if (action === "bulk_generate") {
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

        if (!newEmail || !plan) {
          errors.push({ email: newEmail, reason: "missing_fields" });
          continue;
        }

        var rows = sheet.getDataRange().getValues();
        var emailExists = false;
        for (var r = 1; r < rows.length; r++) {
          if ((rows[r][COL["email"]] || "").toString().trim().toLowerCase() === newEmail) {
            emailExists = true;
            break;
          }
        }
        if (emailExists) {
          errors.push({ email: newEmail, reason: "already_registered" });
          continue;
        }

        var key = generateLicenseKey();
        var maxDevices = plan === "extreme" ? 3 : 1;

        var newRow = new Array(Object.keys(COL).length).fill("");
        if (COL["name"] !== undefined) newRow[COL["name"]] = name;
        if (COL["email"] !== undefined) newRow[COL["email"]] = newEmail;
        if (COL["license_key"] !== undefined) newRow[COL["license_key"]] = key;
        if (COL["plan"] !== undefined) newRow[COL["plan"]] = plan;
        if (COL["status"] !== undefined) newRow[COL["status"]] = "active";
        if (COL["activated_devices"] !== undefined) newRow[COL["activated_devices"]] = "[]";
        if (COL["max_devices"] !== undefined) newRow[COL["max_devices"]] = maxDevices;
        if (COL["expiry"] !== undefined) newRow[COL["expiry"]] = "";

        sheet.appendRow(newRow);

        var subject = "Your Captiongrit " + (plan.charAt(0).toUpperCase() + plan.slice(1)) + " License Key";
        
        var fileId = UNIVERSAL_ZIP_ID;
        var downloadHtml = "";
        var downloadText = "";
        
        if (fileId && !fileId.startsWith("PASTE_")) {
          var extractedId = extractFileId(fileId);
          var downloadUrl = "https://drive.google.com/file/d/" + extractedId + "/view?usp=sharing";
          downloadHtml = "<div style='text-align: center; margin: 30px 0;'><a href='" + downloadUrl + "' style='background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;'>Download Installer</a></div>";
          downloadText = "Download Installer: " + downloadUrl + "\n\n";
        }

        var htmlBody =
          "<div style='font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;'>" +
          "<h2 style='color: #4CAF50;'>Welcome to Captiongrit, " + name + "!</h2>" +
          "<p>Thank you for purchasing Captiongrit " + plan.toUpperCase() + ".</p>" +
          "<p>Your official license key is:</p>" +
          "<div style='background-color: #f4f4f4; padding: 15px; border-radius: 5px; font-size: 20px; font-weight: bold; letter-spacing: 2px; text-align: center; margin: 20px 0;'>" +
          key +
          "</div>" +
          downloadHtml +
          "<p><strong>How to activate:</strong></p>" +
          "<ol>" +
          "<li>Install the Captiongrit plugin using the downloaded installer.</li>" +
          "<li>Open Premiere Pro or After Effects.</li>" +
          "<li>Go to <em>Window &gt; Extensions &gt; Captiongrit</em>.</li>" +
          "<li>Enter your email (<strong>" + newEmail + "</strong>) and your license key.</li>" +
          "</ol>" +
          "<p>If you have any questions, feel free to reply to this email.</p>" +
          "<p>Happy editing!<br><strong>The Flogrit Team</strong></p>" +
          "<p><a href='https://www.instagram.com/integrit.in?igsh=d3cwMjFxaDBoNG5w' style='color: #E1306C; font-weight: bold; text-decoration: none;'>📸 Follow us on Instagram</a></p>" +
          "</div>";

        try {
          var textBody = "Welcome to Captiongrit, " + name + "!\n\n" +
                         "Thank you for purchasing Captiongrit " + plan.toUpperCase() + ".\n" +
                         "Your official license key is: " + key + "\n\n" +
                         downloadText +
                         "Please check the HTML version of this email for full instructions.\n" +
                         "The Flogrit Team";

          var emailOptions = {
            to: newEmail,
            subject: subject,
            name: "The Flogrit Team",
            body: textBody,
            htmlBody: htmlBody
          };

          MailApp.sendEmail(emailOptions);
          generatedCount++;
        } catch (e) {
          errors.push({ email: newEmail, reason: e.toString() });
        }
      }

      return jsonResponse({ success: true, generated: generatedCount, errors: errors });
    }

    // ──────────────────────────────────────────
    // ACTION: BETA SIGNUP (From Website Form)
    // ──────────────────────────────────────────
    if (action === "beta_signup") {
      var newEmail = (data.email || "").trim().toLowerCase();
      var name = (data.name || "Beta User").trim();

      if (!newEmail) {
        return jsonResponse({ success: false, reason: "missing_email" });
      }

      // Check if email already exists to prevent duplicate beta signups
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var rowEmail = (rows[i][COL["email"]] || "").toString().trim().toLowerCase();
        if (rowEmail === newEmail) {
           return jsonResponse({ success: false, reason: "already_registered" });
        }
      }

      // 1. Generate Key
      var key = generateLicenseKey();
      
      // 2. Write to Sheet as Beta
      var newRow = new Array(Object.keys(COL).length).fill("");
      if (COL["name"] !== undefined) newRow[COL["name"]] = name;
      if (COL["email"] !== undefined) newRow[COL["email"]] = newEmail;
      if (COL["license_key"] !== undefined) newRow[COL["license_key"]] = key;
      if (COL["plan"] !== undefined) newRow[COL["plan"]] = "beta";
      if (COL["status"] !== undefined) newRow[COL["status"]] = "active";
      if (COL["activated_devices"] !== undefined) newRow[COL["activated_devices"]] = "[]";
      if (COL["max_devices"] !== undefined) newRow[COL["max_devices"]] = 1;
      if (COL["expiry"] !== undefined) newRow[COL["expiry"]] = ""; // Will be set on first login

      sheet.appendRow(newRow);

      // 3. Send Email
      var subject = "Your Captiongrit Beta License Key!";
      
      var fileId = UNIVERSAL_ZIP_ID;
      var downloadHtml = "";
      var downloadText = "";
      
      if (fileId && !fileId.startsWith("PASTE_")) {
        var extractedId = extractFileId(fileId);
        var downloadUrl = "https://drive.google.com/file/d/" + extractedId + "/view?usp=sharing";
        downloadHtml = "<div style='text-align: center; margin: 30px 0;'><a href='" + downloadUrl + "' style='background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;'>Download Beta Installer</a></div>";
        downloadText = "Download Beta Installer: " + downloadUrl + "\n\n";
      }

      var htmlBody =
        "<div style='font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;'>" +
        "<h2 style='color: #4CAF50;'>Welcome to the Captiongrit Beta, " + name + "!</h2>" +
        "<p>Thank you for signing up to test Captiongrit.</p>" +
        "<p>Your 7-day Beta license key is:</p>" +
        "<div style='background-color: #f4f4f4; padding: 15px; border-radius: 5px; font-size: 20px; font-weight: bold; letter-spacing: 2px; text-align: center; margin: 20px 0;'>" +
        key +
        "</div>" +
        downloadHtml +
        "<p><strong>How to activate:</strong></p>" +
        "<ol>" +
        "<li>Install the Captiongrit plugin using the downloaded installer.</li>" +
        "<li>Open Premiere Pro or After Effects.</li>" +
        "<li>Go to <em>Window &gt; Extensions &gt; Captiongrit</em>.</li>" +
        "<li>Enter your email (<strong>" + newEmail + "</strong>) and your license key.</li>" +
        "</ol>" +
        "<p>Happy editing!<br><strong>The Flogrit Team</strong></p>" +
        "</div>";

      try {
        var textBody = "Welcome to the Captiongrit Beta, " + name + "!\n\n" +
                       "Thank you for signing up to test Captiongrit.\n" +
                       "Your 7-day Beta license key is: " + key + "\n\n" +
                       downloadText +
                       "Please check the HTML version of this email for full instructions.\n" +
                       "The Flogrit Team";

        var emailOptions = {
          to: newEmail,
          subject: subject,
          name: "The Flogrit Team",
          body: textBody,
          htmlBody: htmlBody
        };

        MailApp.sendEmail(emailOptions);
        return jsonResponse({ success: true, email: newEmail });
      } catch (e) {
        return jsonResponse({ success: false, reason: "email_failed", message: e.toString() });
      }
    }

    // ──────────────────────────────────────────
    // ACTION: GENERATE LICENSE (Single)
    // ──────────────────────────────────────────
    if (action === "generate") {
      if (data.adminSecret !== ADMIN_SECRET) {
        return jsonResponse({ success: false, reason: "unauthorized" });
      }

      var newEmail = (data.email || "").trim().toLowerCase();
      var plan = (data.plan || "basic").trim().toLowerCase();
      var name = (data.name || "User").trim();

      if (!newEmail || !plan) {
        return jsonResponse({ success: false, reason: "missing_fields" });
      }

      // Check if email already exists
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var rowEmail = (rows[i][COL["email"]] || "").toString().trim().toLowerCase();
        if (rowEmail === newEmail) {
           return jsonResponse({ success: false, reason: "already_registered" });
        }
      }

      // 1. Generate Key
      var key = generateLicenseKey();
      var maxDevices = plan === "extreme" ? 3 : 1;

      // 2. Write to Sheet
      var newRow = new Array(Object.keys(COL).length).fill("");
      if (COL["name"] !== undefined) newRow[COL["name"]] = name;
      if (COL["email"] !== undefined) newRow[COL["email"]] = newEmail;
      if (COL["license_key"] !== undefined) newRow[COL["license_key"]] = key;
      if (COL["plan"] !== undefined) newRow[COL["plan"]] = plan;
      if (COL["status"] !== undefined) newRow[COL["status"]] = "active";
      if (COL["activated_devices"] !== undefined) newRow[COL["activated_devices"]] = "[]";
      if (COL["max_devices"] !== undefined) newRow[COL["max_devices"]] = maxDevices;
      if (COL["expiry"] !== undefined) newRow[COL["expiry"]] = "";

      sheet.appendRow(newRow);

      // 3. Send Email
      var subject = "Your Captiongrit " + (plan.charAt(0).toUpperCase() + plan.slice(1)) + " License Key";
      
      var fileId = ATTACHMENT_IDS[plan] || ATTACHMENT_IDS["basic"];
      var downloadHtml = "";
      var downloadText = "";
      
      if (fileId && !fileId.startsWith("PASTE_")) {
        var extractedId = extractFileId(fileId);
        var downloadUrl = "https://drive.google.com/file/d/" + extractedId + "/view?usp=sharing";
        downloadHtml = "<div style='text-align: center; margin: 30px 0;'><a href='" + downloadUrl + "' style='background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;'>Download Installer</a></div>";
        downloadText = "Download Installer: " + downloadUrl + "\n\n";
      }

      var htmlBody =
        "<div style='font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;'>" +
        "<h2 style='color: #4CAF50;'>Welcome to Captiongrit, " + name + "!</h2>" +
        "<p>Thank you for purchasing Captiongrit " + plan.toUpperCase() + ".</p>" +
        "<p>Your official license key is:</p>" +
        "<div style='background-color: #f4f4f4; padding: 15px; border-radius: 5px; font-size: 20px; font-weight: bold; letter-spacing: 2px; text-align: center; margin: 20px 0;'>" +
        key +
        "</div>" +
        downloadHtml +
        "<p><strong>How to activate:</strong></p>" +
        "<ol>" +
        "<li>Install the Captiongrit plugin using the downloaded installer.</li>" +
        "<li>Open Premiere Pro or After Effects.</li>" +
        "<li>Go to <em>Window &gt; Extensions &gt; Captiongrit</em>.</li>" +
        "<li>Enter your email (<strong>" + newEmail + "</strong>) and your license key.</li>" +
        "</ol>" +
        "<p>If you have any questions, feel free to reply to this email.</p>" +
        "<p>Happy editing!<br><strong>The Flogrit Team</strong></p>" +
        "<p><a href='https://www.instagram.com/integrit.in?igsh=d3cwMjFxaDBoNG5w' style='color: #E1306C; font-weight: bold; text-decoration: none;'>📸 Follow us on Instagram</a></p>" +
        "</div>";

      try {
        var textBody = "Welcome to Captiongrit, " + name + "!\n\n" +
                       "Thank you for purchasing Captiongrit " + plan.toUpperCase() + ".\n" +
                       "Your official license key is: " + key + "\n\n" +
                       downloadText +
                       "Please check the HTML version of this email for full instructions.\n" +
                       "The Flogrit Team";

        var emailOptions = {
          to: newEmail,
          subject: subject,
          name: "The Flogrit Team",
          body: textBody,
          htmlBody: htmlBody
        };

        MailApp.sendEmail(emailOptions);

        return jsonResponse({ success: true, email: newEmail, key: key, plan: plan });
      } catch (e) {
        return jsonResponse({ valid: false, reason: "server_error", message: e.toString() });
      }
    }

    // ──────────────────────────────────────────
    // ACTION: VERIFY LICENSE
    // ──────────────────────────────────────────
    var email = (data.email || "").trim().toLowerCase();
    var licenseKey = (data.licenseKey || "").trim();
    var deviceId = (data.deviceId || "").trim();

    if (!email || !licenseKey) {
      return jsonResponse({ valid: false, reason: "missing_fields" });
    }

    var rows = sheet.getDataRange().getValues();
    if (rows.length < 2) {
      return jsonResponse({ valid: false, reason: "invalid_license" });
    }

    // Search for matching license
    for (var i = 1; i < rows.length; i++) {
      var rowEmail = (rows[i][COL["email"]] || "").toString().trim().toLowerCase();
      var rowKey = (rows[i][COL["license_key"]] || "").toString().trim();

      if (rowEmail === email && rowKey === licenseKey) {
        // Found matching license

        var rowPlan = (rows[i][COL["plan"]] || "basic").toString().trim().toLowerCase();
        var rowActive = (rows[i][COL["status"]] || "").toString().trim().toLowerCase();
        var rowDevicesStr = (rows[i][COL["activated_devices"]] || "[]").toString();
        var rowMaxDevices = parseInt(rows[i][COL["max_devices"]]) || 1;
        var rowExpiry = COL["expiry"] !== undefined ? rows[i][COL["expiry"]] : null;

        // Check if active
        if (rowActive !== "active") {
          return jsonResponse({ valid: false, reason: "license_deactivated" });
        }

        // Beta Expiry Logic
        if (rowPlan === "beta") {
          var today = new Date();
          if (!rowExpiry) {
            var expiryDate = new Date();
            expiryDate.setDate(today.getDate() + 7);
            if (COL["expiry"] !== undefined) {
              sheet.getRange(i + 1, COL["expiry"] + 1).setValue(expiryDate.toISOString());
            }
            rowExpiry = expiryDate;
          }
          var exp = new Date(rowExpiry);
          if (exp < today) {
            return jsonResponse({ valid: false, reason: "beta_expired" });
          }
          var daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          // We will inject betaDaysLeft below
        } else if (rowExpiry) {
          // Check normal expiry (if an expiry date is set)
          var today = new Date();
          var expiryDate = new Date(rowExpiry);
          if (expiryDate < today) {
            return jsonResponse({ valid: false, reason: "license_expired" });
          }
        }

        // Parse devices array
        var devices = [];
        try {
          devices = JSON.parse(rowDevicesStr);
          if (!Array.isArray(devices)) devices = [];
        } catch (pe) {
          devices = [];
        }

        // Check if this device is already registered
        var deviceIndex = devices.indexOf(deviceId);

        if (deviceIndex >= 0) {
          // Device already registered — valid
          return jsonResponse({
            authenticated: true,
            user: {
              email: email,
              plan: rowPlan,
              license: licenseKey,
              expires: rowExpiry ? rowExpiry : "never",
              lastValidated: new Date().toISOString()
            },
            capabilities: PLAN_CAPABILITIES[rowPlan] || PLAN_CAPABILITIES["basic"],
            maxDevices: rowMaxDevices,
            deviceCount: devices.length,
            betaDaysLeft: (typeof daysLeft !== 'undefined') ? Math.max(0, daysLeft) : undefined
          });
        }

        // New device — check limit
        if (devices.length >= rowMaxDevices) {
          return jsonResponse({
            valid: false,
            reason: "device_limit_reached",
            plan: rowPlan,
            maxDevices: rowMaxDevices,
            currentDevices: devices.length
          });
        }

        // Register new device
        devices.push(deviceId);

        // Write the JSON array back to activated_devices column
        sheet.getRange(i + 1, COL["activated_devices"] + 1).setValue(JSON.stringify(devices));

        // Optionally, update the `device_id` column with the comma-separated string for easier reading
        if (COL["device_id"] !== undefined) {
          sheet.getRange(i + 1, COL["device_id"] + 1).setValue(devices.join(","));
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
          capabilities: PLAN_CAPABILITIES[rowPlan] || PLAN_CAPABILITIES["basic"],
          maxDevices: rowMaxDevices,
          deviceCount: devices.length,
          betaDaysLeft: (typeof daysLeft !== 'undefined') ? Math.max(0, daysLeft) : undefined
        });
      }
    }

    // No matching license found
    return jsonResponse({ valid: false, reason: "invalid_license" });

  } catch (err) {
    return jsonResponse({ valid: false, reason: "server_error", message: err.message });
  }
}

function doGet(e) {
  // Simple health check
  return jsonResponse({ status: "ok", service: "Captiongrit License Server" });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ──────────────────────────────────────────
// ADMIN UTILITY FUNCTIONS (run manually from Apps Script editor)
// ──────────────────────────────────────────

/**
 * Generate a random license key in format CG-XXXX-XXXX-XXXX
 */
function generateLicenseKey() {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No ambiguous chars (0,O,1,I)
  var key = "CG-";
  for (var g = 0; g < 3; g++) {
    for (var c = 0; c < 4; c++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (g < 2) key += "-";
  }
  Logger.log("Generated key: " + key);
  return key;
}

/**
 * Add a new license to the sheet.
 * Run this from the Apps Script editor with the desired values.
 */
function addLicense(email, plan) {
  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var sheet = ss.getSheets()[0];
  var COL = getColMap(sheet);

  var key = generateLicenseKey();
  var maxDevices = plan === "extreme" ? 3 : 1;

  var newRow = new Array(Object.keys(COL).length).fill("");
  if (COL["email"] !== undefined) newRow[COL["email"]] = email.toLowerCase().trim();
  if (COL["license_key"] !== undefined) newRow[COL["license_key"]] = key;
  if (COL["plan"] !== undefined) newRow[COL["plan"]] = plan;
  if (COL["status"] !== undefined) newRow[COL["status"]] = "active";
  if (COL["activated_devices"] !== undefined) newRow[COL["activated_devices"]] = "[]";
  if (COL["max_devices"] !== undefined) newRow[COL["max_devices"]] = maxDevices;
  if (COL["expiry"] !== undefined) newRow[COL["expiry"]] = "";

  sheet.appendRow(newRow);

  Logger.log("Added license: " + email + " | " + key + " | " + plan);
  return key;
}

/**
 * Upgrade a user's plan (e.g., basic → pro).
 * Also updates maxDevices if upgrading to extreme.
 */
function upgradePlan(email, newPlan) {
  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var sheet = ss.getSheets()[0];
  var COL = getColMap(sheet);
  var rows = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][COL["email"]].toString().trim().toLowerCase() === email.toLowerCase().trim()) {
      // Update plan
      sheet.getRange(i + 1, COL["plan"] + 1).setValue(newPlan);
      // Update maxDevices
      var maxDevices = newPlan === "extreme" ? 3 : 1;
      sheet.getRange(i + 1, COL["max_devices"] + 1).setValue(maxDevices);

      Logger.log("Upgraded " + email + " to " + newPlan);
      return;
    }
  }
  Logger.log("User not found: " + email);
}

/**
 * Remove a specific device from a user's license.
 * Useful for support requests.
 */
function removeDevice(email, deviceIdToRemove) {
  var ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var sheet = ss.getSheets()[0];
  var COL = getColMap(sheet);
  var rows = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][COL["email"]].toString().trim().toLowerCase() === email.toLowerCase().trim()) {
      var devices = JSON.parse(rows[i][COL["activated_devices"]] || "[]");
      var idx = devices.indexOf(deviceIdToRemove);

      if (idx >= 0) {
        devices.splice(idx, 1);

        // Update the JSON array
        sheet.getRange(i + 1, COL["activated_devices"] + 1).setValue(JSON.stringify(devices));

        // Update the string list if it exists
        if (COL["device_id"] !== undefined) {
          sheet.getRange(i + 1, COL["device_id"] + 1).setValue(devices.join(","));
        }

        Logger.log("Removed device " + deviceIdToRemove + " from " + email);
      } else {
        Logger.log("Device not found for " + email);
      }
      return;
    }
  }
  Logger.log("User not found: " + email);
}
