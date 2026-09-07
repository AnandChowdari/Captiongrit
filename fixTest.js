const fs = require('fs');
let code = fs.readFileSync('f:/Coding/Projects/Caption Integrit/google-apps-script.js', 'utf8');
let idx = code.indexOf('function handlePaidSignup(payload, ss)');
let endIdx = code.indexOf('function handleBetaSignup');
let handlePaidSignupStr = code.substring(idx, endIdx);
handlePaidSignupStr = handlePaidSignupStr.replace(/sendLicenseEmail\(/g, "await sendLicenseEmail(");
handlePaidSignupStr = handlePaidSignupStr.replace(/function handlePaidSignup/, "async function handlePaidSignup");

let testCode = fs.readFileSync('testConcurrency.js', 'utf8');
testCode = testCode.replace(/const handlePaidSignupMatch[\s\S]*?eval\(handlePaidSignupStr\);/, "eval(handlePaidSignupStr);");
testCode = "let handlePaidSignupStr = \`" + handlePaidSignupStr.replace(/`/g, '\\`').replace(/\$/g, '\\$') + "\`;\n" + testCode;
fs.writeFileSync('testConcurrency.js', testCode, 'utf8');
