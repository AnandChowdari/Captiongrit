const fs = require('fs');
const path = 'f:/Coding/Projects/Caption Integrit/google-apps-script.js';
let content = fs.readFileSync(path, 'utf8');

// Replace handlePaidSignup
const handlePaidSignupRegex = /function handlePaidSignup\(payload, ss\) \{[\s\S]*?\n\}(?=\n\nfunction handleBetaSignup)/;
const handlePaidSignupNew = `function handlePaidSignup(payload, ss) {
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

  var fulfillmentState = ""; 
  var finalKey = payloadLicenseKey;
  var actionTaken = "";
  var targetSubMatch = null;
  var transMatch = null;

  try {
    transMatch = findTransactionByPaymentId(transSheet, paymentId);
    targetSubMatch = findUserInSpecificTab(ss, plan, email);

    if (targetSubMatch && transMatch && transMatch.email_status === "sent") {
      fulfillmentState = "E";
      finalKey = targetSubMatch.key;
    }
    else if (targetSubMatch && transMatch && (transMatch.email_status === "failed" || transMatch.email_status === "pending" || pd.resendEmail === true)) {
      fulfillmentState = "D";
      finalKey = targetSubMatch.key;
    }
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
    throw criticalErr;
  } finally {
    lock.releaseLock();
  }

  if (fulfillmentState === "E") {
    return jsonResponse({
      status: "success",
      code: "ALREADY_FULFILLED",
      message: "Subscription already fully active.",
      data: { email: email, plan: plan, licenseKey: finalKey, emailSent: true }
    });
  }

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
}`;

content = content.replace(handlePaidSignupRegex, handlePaidSignupNew);

// Replace recoverFailedPayment
const recoverRegex = /function recoverFailedPayment\(targetPaymentId\) \{[\s\S]*?\n\}(?=\n\nfunction validateDatabaseSchemas)/;
const recoverNew = `function recoverFailedPayment(targetPaymentId) {
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
}`;

content = content.replace(recoverRegex, recoverNew);

// Replace executeRazorpayRecoveries loop content
// Actually I'll replace the whole function
const execRecovRegex = /var results = \{\s*totalTargeted: targetPaymentIds\.length,[\s\S]*?(?=\n\nfunction ensureTabExists)/;
const execRecovNew = `var results = {
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
  return results;
}`;

content = content.replace(execRecovRegex, execRecovNew);

fs.writeFileSync(path, content, 'utf8');
console.log('Script updated successfully!');
