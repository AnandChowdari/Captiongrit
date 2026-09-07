/**
 * main.js \u2014 Captiongrit CEP Panel Logic
 * Handles UI interactions, STT API calls, AI conversion, and AE integration.
 */

(function () {
    "use strict";

    // ------------------------------------------
    // Plan Tier System Descriptions
    // ------------------------------------------
    // Basic:   maxDuration: 60s, maxDevices: 1, maxClips: 1, Full Sentence only
    // Pro:     maxDuration: 180s, maxDevices: 1, maxClips: 1, Word By Word, Editor, Double Check, Custom Dict, English Output
    // Extreme: maxDuration: unlimited, maxDevices: 3, maxClips: 99, all Pro features + Batch Processing
    // Beta:    maxDuration: 30s, maxDevices: 1, maxClips: 1, Restricted trial tier
    // ------------------------------------------

    // ------------------------------------------
    // Session State (Server Authoritative)
    // ------------------------------------------
    window.CaptiongritSession = {
        authenticated: false,
        user: { email: null, license: null, plan: "basic", expires: null, lastValidated: null },
        capabilities: { maxDuration: 30, maxDevices: 1, maxClips: 1, hasDoubleCheck: false, hasEditor: false, hasCustomDict: false, hasWordByWord: false, hasFullSentence: true, hasEnglishOutput: false, hasPresets: false, hasMogrt: false, hasBatch: false }
    };
    var PLAN_TIERS_ORDER = ["basic", "pro", "extreme", "beta"];
    var PLAN_LABELS = { basic: "Basic", pro: "Pro", extreme: "Extreme", beta: "Beta" };
    var TIER = window.CaptiongritSession.capabilities;
    function getPlanId() { return window.CaptiongritSession.user ? window.CaptiongritSession.user.plan : "basic"; }


    // ------------------------------------------
    // Globals
    // ------------------------------------------
    var csInterface = null;
    var currentClips = [];
    var cancelled = false;
    var editorSegments = [];
    var editorOutputOptions = [];

    // Fetch with timeout helper — prevents hanging forever on slow/blocked networks
    function fetchWithTimeout(url, options, timeoutMs) {
        timeoutMs = timeoutMs || 10000;
        return new Promise(function (resolve, reject) {
            var isDone = false;
            var timer = setTimeout(function () {
                if (!isDone) {
                    isDone = true;
                    reject(new Error("Request timed out after " + timeoutMs + "ms"));
                }
            }, timeoutMs);

            try {
                if (typeof window !== "undefined" && window.require) {
                    var https = window.require("https");
                    var URL = window.require("url");

                    function doReq(currentUrl, method, postData) {
                        var parsedUrl = URL.parse(currentUrl);
                        var reqOptions = {
                            hostname: parsedUrl.hostname,
                            port: parsedUrl.port || 443,
                            path: parsedUrl.path,
                            method: method,
                            headers: {}
                        };

                        if (method === "POST" && postData) {
                            reqOptions.headers["Content-Type"] = "text/plain";
                            reqOptions.headers["Content-Length"] = Buffer.byteLength(postData);
                        }

                        var req = https.request(reqOptions, function (res) {
                            if (isDone) return;
                            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                                doReq(res.headers.location, "GET", null);
                                return;
                            }
                            var data = '';
                            res.on('data', function (chunk) { data += chunk; });
                            res.on('end', function () {
                                if (isDone) return;
                                isDone = true;
                                clearTimeout(timer);
                                resolve({
                                    ok: res.statusCode >= 200 && res.statusCode < 300,
                                    status: res.statusCode,
                                    text: function () { return Promise.resolve(data); },
                                    json: function () { return Promise.resolve(JSON.parse(data)); }
                                });
                            });
                        });

                        req.on('error', function (e) {
                            if (isDone) return;
                            isDone = true;
                            clearTimeout(timer);
                            reject(e);
                        });

                        if (method === "POST" && postData) req.write(postData);
                        req.end();
                    }
                    doReq(url, options.method || "GET", options.body);
                } else {
                    fetch(url, options).then(function (response) {
                        if (isDone) return;
                        isDone = true;
                        clearTimeout(timer);
                        resolve(response);
                    }).catch(function (err) {
                        if (isDone) return;
                        isDone = true;
                        clearTimeout(timer);
                        reject(err);
                    });
                }
            } catch (err) {
                if (!isDone) {
                    isDone = true;
                    clearTimeout(timer);
                    reject(err);
                }
            }
        });
    }

    var cp = null;
    var fs = null;
    try {
        if (typeof window !== "undefined" && window.require) {
            cp = window.require("child_process");
            fs = window.require("fs");
        } else if (typeof require !== "undefined") {
            cp = require("child_process");
            fs = require("fs");
        }
    } catch (e) {
        console.warn("Node.js child_process/fs not available:", e);
    }

    const STORAGE_PREFIX = "captiongrit_";
    const KEY_NAMES = ["elevenlabs", "deepgram", "gemini", "xai", "groq", "openrouter"];
    const LICENSE_URL = "https://script.google.com/macros/s/AKfycbzcduRbPRxFLYLMOB5oOXPZqazf4_xlqwWz3zBjKG-R6h3QSSdhI7aZvv2a7ALHvLxn/exec";

    // ------------------------------------------
    // Comprehensive Language Map
    // ------------------------------------------
    var LANG_NAMES = {
        "te": "Telugu", "hi": "Hindi", "ta": "Tamil", "kn": "Kannada",
        "ml": "Malayalam", "bn": "Bengali", "mr": "Marathi", "gu": "Gujarati",
        "pa": "Punjabi", "ur": "Urdu", "en": "English", "es": "Spanish",
        "fr": "French", "de": "German", "pt": "Portuguese", "ja": "Japanese",
        "ko": "Korean", "ar": "Arabic", "id": "Indonesian", "th": "Thai",
        "zh": "Chinese", "ru": "Russian", "tr": "Turkish", "vi": "Vietnamese"
    };

    var LANG_EXAMPLES = {
        "te": { native: "నమస్కారం", phonetic: "Namaskaram" },
        "hi": { native: "नमस्ते", phonetic: "Namaste" },
        "ta": { native: "வணக்கம்", phonetic: "Vanakkam" },
        "kn": { native: "ನಮಸ್ಕಾರ", phonetic: "Namaskara" },
        "ml": { native: "നമസ്കാരം", phonetic: "Namaskaram" },
        "bn": { native: "নমস্কার", phonetic: "Nômoskar" },
        "mr": { native: "नमस्कार", phonetic: "Namaskar" },
        "gu": { native: "નમસ્તે", phonetic: "Namaste" },
        "pa": { native: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ", phonetic: "Sat Sri Akal" },
        "ur": { native: "سلام", phonetic: "Salam" },
        "en": { native: "Hello", phonetic: "Hello" },
        "es": { native: "Hola", phonetic: "Hola" },
        "fr": { native: "Bonjour", phonetic: "Bonjour" },
        "de": { native: "Hallo", phonetic: "Hallo" },
        "pt": { native: "Olá", phonetic: "Olá" },
        "ja": { native: "こんにちは", phonetic: "Konnichiwa" },
        "ko": { native: "안녕하세요", phonetic: "Annyeonghaseyo" },
        "ar": { native: "مرحبا", phonetic: "Marhaba" },
        "id": { native: "Halo", phonetic: "Halo" },
        "th": { native: "สวัสดี", phonetic: "Sawatdee" },
        "zh": { native: "你好", phonetic: "Nǐ hǎo" },
        "ru": { native: "Привет", phonetic: "Privet" },
        "tr": { native: "Merhaba", phonetic: "Merhaba" },
        "vi": { native: "Xin chào", phonetic: "Xin chao" }
    };

    // ------------------------------------------
    // Init
    // ------------------------------------------
    document.addEventListener("DOMContentLoaded", function () {
        // Try to initialize CSInterface (will fail outside AE/Premiere)
        try {
            csInterface = new CSInterface();
            // Detect host application
            var hostEnv = csInterface.getHostEnvironment();
            if (hostEnv && hostEnv.appId) {
                var appId = hostEnv.appId;
                if (appId === "PPRO") {
                    console.log("Captiongrit loaded in Adobe Premiere Pro mode.");
                    var textLayerPill = document.querySelector('.pill[data-output="text_layers"]');
                    if (textLayerPill) textLayerPill.textContent = "Import to Project Bin";
                } else if (appId === "AEFT") {
                    console.log("Captiongrit loaded in Adobe After Effects mode.");
                }
            }
        } catch (e) {
            console.warn("CSInterface not available — running outside Adobe host application.");
            csInterface = null;
        }

        initializeFFmpeg(false);

        // One-time migration from old PingWin storage keys to Captiongrit
        checkForUpdates();

        var buyBtn = document.getElementById("buyBtn");
        if (buyBtn) {
            buyBtn.addEventListener("click", function () {
                var auth = typeof getStoredAuth === "function" ? getStoredAuth() : null;
                var e = (auth && auth.email) || localStorage.getItem("captiongrit_email") || "";
                var k = (auth && auth.key) || localStorage.getItem("captiongrit_key") || "";
                var url = "https://www.flogrit.com/captiongrit" + (e && k ? "?email=" + encodeURIComponent(e) + "&key=" + encodeURIComponent(k) : "") + "#pricing";
                window.cep.util.openURLInDefaultBrowser(url);
            });
        }

        migrateOldStorageKeys();

        initTabs();
        initPills();
        initToggle();
        initTheme();
        loadApiKeys();
        loadAdvancedSettings();
        loadGenerationSettings(); // NEW: Load smart defaults
        bindButtons();
        updateDynamicHint(); // NEW: Initial hint render

        var storedAuth = getStoredAuth();
        var storedEmail = storedAuth.email;
        var storedKey = storedAuth.key;
        var storedDeviceId = storedAuth.deviceId;

        // Clear HTML failsafe since main.js loaded successfully
        if (typeof window.__clearLoadingFailsafe === "function") {
            window.__clearLoadingFailsafe();
        }

        // Failsafe: if loading screen is still visible after 12 seconds, force-dismiss it
        var _loadingFailsafe = setTimeout(function () {
            var ls = document.getElementById("loading-screen");
            if (ls && ls.style.display !== "none") {
                console.warn("Captiongrit: Loading failsafe triggered — hiding loading screen.");
                ls.style.display = "none";
                showLicensePanel();
            }
        }, 12000);

        if (storedEmail && storedKey && storedDeviceId) {
            validateLicense(storedEmail, storedKey, storedDeviceId).then(function (response) {
                clearTimeout(_loadingFailsafe);
                var loadingScreen = document.getElementById("loading-screen");
                if (loadingScreen) loadingScreen.style.display = "none";

                if (response.authenticated) {
                    window.CaptiongritSession = response;
                    TIER = window.CaptiongritSession.capabilities;
                    saveStoredAuth(storedEmail, storedKey, storedDeviceId);
                    localStorage.setItem(STORAGE_PREFIX + "capabilities", JSON.stringify(TIER));
                    showMainPanel(response.betaDaysLeft);

                    applyFeatureGating();
                    if (TIER.hasPresets) initPresets();
                } else if (response.reason === "network_error" || response.reason === "invalid_response") {
                    console.warn("Captiongrit: Network error validating license. Using saved capabilities for offline bypass.");
                    var savedCapabilities = localStorage.getItem(STORAGE_PREFIX + "capabilities");
                    if (savedCapabilities) {
                        try {
                            TIER = JSON.parse(savedCapabilities);
                            window.CaptiongritSession = { authenticated: true, capabilities: TIER };
                            showMainPanel();
                            applyFeatureGating();
                            if (TIER.hasPresets) initPresets();
                            return;
                        } catch (e) {
                            console.error("Failed to parse saved capabilities", e);
                        }
                    }
                    showLicensePanel();
                    showError("Could not reach license server. Check your internet connection.");
                } else {
                    var strictRejections = ["device_limit_reached", "beta_expired", "license_expired", "invalid_license", "license_deactivated", "missing_fields"];
                    if (strictRejections.includes(response.reason)) {
                        showLicensePanel();
                        if (response.reason === "device_limit_reached") {
                            showError("Device limit reached for your plan. Contact support to transfer your license.");
                        } else if (response.reason === "beta_expired") {
                            showError("Your Beta trial has expired.");
                            if (document.getElementById("buyBtn")) document.getElementById("buyBtn").style.display = "block";
                            if (document.getElementById("activateBtn")) document.getElementById("activateBtn").style.display = "none";
                        } else {
                            showError("License invalid or expired.");
                        }
                    } else {
                        console.warn("Captiongrit: Unknown server response (" + response.reason + "). Treating as temporary technical failure. Using saved capabilities for offline bypass.");
                        var savedCapabilities = localStorage.getItem(STORAGE_PREFIX + "capabilities");
                        if (savedCapabilities) {
                            try {
                                TIER = JSON.parse(savedCapabilities);
                                window.CaptiongritSession = { authenticated: true, capabilities: TIER };
                                showMainPanel();
                                applyFeatureGating();
                                if (TIER.hasPresets) initPresets();
                                return;
                            } catch (e) {
                                console.error("Failed to parse saved capabilities", e);
                            }
                        }
                        showLicensePanel();
                        showError("Could not reach license server. Check your internet connection.");
                    }
                }
            }).catch(function (err) {
                clearTimeout(_loadingFailsafe);
                console.error("License validation promise rejected:", err);
                var loadingScreen = document.getElementById("loading-screen");
                if (loadingScreen) loadingScreen.style.display = "none";

                console.warn("Captiongrit: Network error validating license. Using saved capabilities for offline bypass.");
                var savedCapabilities = localStorage.getItem(STORAGE_PREFIX + "capabilities");
                if (savedCapabilities) {
                    try {
                        TIER = JSON.parse(savedCapabilities);
                        window.CaptiongritSession = { authenticated: true, capabilities: TIER };
                        showMainPanel();
                        applyFeatureGating();
                        if (TIER.hasPresets) initPresets();
                        return;
                    } catch (e) {
                        console.error("Failed to parse saved capabilities", e);
                    }
                }

                showLicensePanel();
                showError("Could not validate license (network error). Please check your internet connection.");
            });
        } else {
            clearTimeout(_loadingFailsafe);
            var loadingScreen = document.getElementById("loading-screen");
            if (loadingScreen) loadingScreen.style.display = "none";
            showLicensePanel();
        }
    });

    // ------------------------------------------
    // Tab Switching
    // ------------------------------------------
    function initTabs() {
        var tabBtns = document.querySelectorAll(".tab-btn");
        tabBtns.forEach(function (btn) {
            btn.addEventListener("click", function () {
                var targetTab = btn.getAttribute("data-tab");

                tabBtns.forEach(function (b) { b.classList.remove("active"); });
                btn.classList.add("active");

                document.querySelectorAll(".tab-content").forEach(function (tc) {
                    tc.classList.remove("active");
                });
                document.getElementById("tab-" + targetTab).classList.add("active");
            });
        });
    }

    // ------------------------------------------
    // Pill Selection (Single vs Multi)
    // ------------------------------------------
    function initPills() {
        document.querySelectorAll(".pills").forEach(function (container) {
            var mode = container.getAttribute("data-mode") || "multi";
            var pills = container.querySelectorAll(".pill");

            pills.forEach(function (pill) {
                pill.addEventListener("click", function () {
                    // Block interaction on locked pills — show upgrade modal
                    if (pill.classList.contains("locked")) {
                        var requiredPlan = pill.getAttribute("data-requires") || "pro";
                        var featureDesc = pill.getAttribute("data-feature-desc") || "This feature requires an upgrade.";
                        showUpgradeModal(requiredPlan, featureDesc);
                        return;
                    }
                    if (mode === "single") {
                        // Deactivate all siblings first, then activate clicked
                        pills.forEach(function (p) { p.classList.remove("active"); });
                        pill.classList.add("active");
                    } else {
                        pill.classList.toggle("active");
                    }
                    saveGenerationSettings();
                    updateDynamicHint();
                });
            });
        });
    }

    // ------------------------------------------
    // Smart Defaults & Dynamic Hints
    // ------------------------------------------
    function loadGenerationSettings() {
        var stt = localStorage.getItem(STORAGE_PREFIX + "stt-provider");
        if (stt) document.getElementById("stt-provider").value = stt;

        var ai = localStorage.getItem(STORAGE_PREFIX + "ai-provider");
        if (ai) document.getElementById("ai-provider").value = ai;

        var src = localStorage.getItem(STORAGE_PREFIX + "source-lang");
        if (src) document.getElementById("source-lang").value = src;

        var verify = localStorage.getItem(STORAGE_PREFIX + "verification-toggle");
        if (verify !== null) document.getElementById("verification-toggle").checked = (verify === "true");

        var captionOutput = localStorage.getItem(STORAGE_PREFIX + "caption-output");
        if (captionOutput) {
            document.querySelectorAll('#caption-langs .pill').forEach(function (pill) {
                pill.classList.remove('active');
                if (pill.getAttribute('data-lang') === captionOutput) pill.classList.add('active');
            });
        }

        var captionStyle = localStorage.getItem(STORAGE_PREFIX + "caption-style");
        if (captionStyle) {
            document.querySelectorAll('#caption-style .pill').forEach(function (pill) {
                pill.classList.remove('active');
                if (pill.getAttribute('data-style') === captionStyle) pill.classList.add('active');
            });
        }
    }

    function saveGenerationSettings() {
        localStorage.setItem(STORAGE_PREFIX + "stt-provider", document.getElementById("stt-provider").value);
        localStorage.setItem(STORAGE_PREFIX + "ai-provider", document.getElementById("ai-provider").value);
        localStorage.setItem(STORAGE_PREFIX + "source-lang", document.getElementById("source-lang").value);
        localStorage.setItem(STORAGE_PREFIX + "verification-toggle", document.getElementById("verification-toggle").checked);

        var captionOutputPill = getSelectedPills("caption-langs")[0];
        if (captionOutputPill) localStorage.setItem(STORAGE_PREFIX + "caption-output", captionOutputPill);

        var captionStylePill = getSelectedPills("caption-style")[0];
        if (captionStylePill) localStorage.setItem(STORAGE_PREFIX + "caption-style", captionStylePill);
    }

    function updateDynamicHint() {
        var hintEl = document.getElementById("caption-output-hint");
        var exampleWidget = document.getElementById("translation-example-widget");

        var srcLang = document.getElementById("source-lang").value;
        var outputMode = getSelectedPills("caption-langs")[0] || "native_script";
        var langName = LANG_NAMES[srcLang] || "Auto/Source";

        var isTranslate = document.getElementById("translate-toggle").checked;
        var targetLangId = document.getElementById("translate-lang").value;
        var targetLangName = LANG_NAMES[targetLangId] || "Target";

        // 1. Update the Dynamic Example Widget
        if (exampleWidget) {
            if (isTranslate) {
                exampleWidget.style.display = "block";

                var sourceWord = "Hello";
                if (srcLang !== "auto" && LANG_EXAMPLES[srcLang]) {
                    sourceWord = LANG_EXAMPLES[srcLang].native;
                } else if (srcLang === "auto") {
                    sourceWord = "[Auto-Detected]";
                }

                var targetWord = "Target";
                if (LANG_EXAMPLES[targetLangId]) {
                    targetWord = outputMode === "phonetic"
                        ? LANG_EXAMPLES[targetLangId].phonetic
                        : LANG_EXAMPLES[targetLangId].native;
                }

                exampleWidget.innerHTML = "<span style='opacity:0.8;font-size:10px'>" + sourceWord + "</span> <span style='opacity:0.5; margin:0 6px;'>➔</span> <strong style='color:var(--text-primary); font-size:12px; letter-spacing:0.5px;'>" + targetWord + "</strong>";
            } else {
                exampleWidget.style.display = "none";
            }
        }

        // 2. Update the Text Hint
        if (!hintEl) return;

        if (outputMode === "phonetic") {
            // English Letters selected
            var phoneticName = "English Letters";
            var baseLangId = isTranslate ? targetLangId : srcLang;

            if (baseLangId === "te") phoneticName = "Tanglish (Telugu in English)";
            else if (baseLangId === "hi") phoneticName = "Hinglish (Hindi in English)";
            else if (baseLangId === "ta") phoneticName = "Tanglish (Tamil in English)";
            else if (baseLangId === "kn") phoneticName = "Kanglish (Kannada in English)";
            else if (baseLangId === "ml") phoneticName = "Manglish (Malayalam in English)";
            else if (baseLangId === "bn") phoneticName = "Benglish (Bengali in English)";

            if (isTranslate) {
                hintEl.textContent = langName + " to " + targetLangName + " (" + phoneticName + ")";
            } else {
                hintEl.textContent = "Output: " + phoneticName;
            }
        } else {
            // Native script selected
            if (isTranslate) {
                hintEl.textContent = langName + " to " + targetLangName + " (in native script)";
            } else {
                hintEl.textContent = "Output: " + langName + " Script";
            }
        }
    }

    // ------------------------------------------
    // Translate Toggle
    // ------------------------------------------
    function initToggle() {
        var toggle = document.getElementById("translate-toggle");
        var target = document.getElementById("translate-target");

        toggle.addEventListener("change", function () {
            if (toggle.checked) {
                target.classList.add("visible");
            } else {
                target.classList.remove("visible");
            }
            saveGenerationSettings();
            updateDynamicHint();
        });
    }

    // ------------------------------------------
    // Theme & Dynamic Color
    // ------------------------------------------
    function initTheme() {
        var defaultColor = "#C6FF34";
        var savedColor = localStorage.getItem(STORAGE_PREFIX + "primary_color");
        var colorToApply = savedColor || defaultColor;

        var picker = document.getElementById("primary-color-picker");
        if (picker) {
            picker.value = colorToApply;
            picker.addEventListener("input", function (e) {
                applyColor(e.target.value);
            });
            picker.addEventListener("change", function (e) {
                applyColor(e.target.value);
                localStorage.setItem(STORAGE_PREFIX + "primary_color", e.target.value);
            });
        }

        var btnReset = document.getElementById("btn-reset-color");
        if (btnReset) {
            btnReset.addEventListener("click", function () {
                if (picker) picker.value = defaultColor;
                applyColor(defaultColor);
                localStorage.removeItem(STORAGE_PREFIX + "primary_color");
            });
        }

        applyColor(colorToApply);
    }

    function applyColor(hexColor) {
        document.documentElement.style.setProperty("--accent", hexColor);
        // Also update the gradient slightly to make it feel more solid or adapt it
        // In Neo-brutalism we might just want solid colors, but we'll set it anyway
        document.documentElement.style.setProperty("--accent-gradient", hexColor);
        document.documentElement.style.setProperty("--accent-gradient-h", hexColor);
    }

    // ------------------------------------------
    // Feature Gating — Tier-Based Lock/Unlock
    // ------------------------------------------
    function applyFeatureGating() {
        // Set plan badge in header
        var badge = document.getElementById("plan-badge");
        if (badge) {
            badge.style.display = "inline-block";
            if (getPlanId()) {
                badge.textContent = PLAN_LABELS[getPlanId()] || "Basic";
                badge.className = "plan-badge plan-" + getPlanId();
            }
        }

        // -- Caption Style pills --
        if (!TIER.hasWordByWord) {
            lockElement('[data-style="word_by_word"]', "pro", "Word-by-Word captions, 98% accuracy with Double-Check, and more.");
        }
        // Full Sentence is available in Basic, so no lock needed

        // -- Caption Output pills --
        if (!TIER.hasEnglishOutput) {
            lockElement('[data-lang="english"]', "pro", "English translation output, Custom Dictionary, and Caption Editor.");
        }

        // -- Double-Check Accuracy toggle --
        var verifyToggle = document.getElementById("verification-toggle");
        var verifySection = verifyToggle ? verifyToggle.closest('.section') : null;
        if (!TIER.hasDoubleCheck && verifySection) {
            // Hide for basic as it is not available in this tier
            verifySection.style.display = 'none';
        }

        // -- Custom Dictionary (Advanced tab) --
        if (!TIER.hasCustomDict) {
            var vocabEl = document.getElementById("custom-vocab");
            if (vocabEl) {
                vocabEl.disabled = true;
                vocabEl.placeholder = "\uD83D\uDD12 Custom Dictionary is a Pro feature. Upgrade to unlock.";
                var vocabSection = vocabEl.closest('.api-section');
                if (vocabSection) {
                    vocabSection.classList.add('feature-locked');
                    vocabSection.addEventListener("click", function () {
                        showUpgradeModal("pro", "Custom Dictionary ensures brand names and industry terms are spelled perfectly.");
                    });
                }
            }
        }

        // -- Presets section --
        var presetsSection = document.getElementById("presets-section");
        if (presetsSection && !TIER.hasPresets) {
            presetsSection.classList.add('feature-locked');
            presetsSection.addEventListener("click", function () {
                showUpgradeModal("extreme", "Save up to 10 custom presets for your favorite caption configurations.");
            });
            var presetsLabel = presetsSection.querySelector('.lock-badge');
            if (presetsLabel) presetsLabel.style.display = 'inline';
        }

        // -- MOGRT export --
        if (!TIER.hasMogrt) {
            lockElement('[data-output="mogrt_export"]', "extreme", "MOGRT Export \u2014 Advanced text animations for After Effects.");
        }
    }

    function lockElement(selector, requiredPlan, featureDescription) {
        var el = document.querySelector(selector);
        if (!el) return;

        el.classList.add('locked');
        el.setAttribute('data-requires', requiredPlan);
        el.setAttribute('data-feature-desc', featureDescription);

        // Remove active state if locked pill was default-active
        el.classList.remove('active');

        // Add lock badge for pills
        if (el.classList.contains('pill')) {
            var badge = document.createElement('span');
            badge.className = 'lock-badge';
            badge.textContent = '\uD83D\uDD12 ' + (requiredPlan === "extreme" ? "EXTREME" : "PRO");
            el.appendChild(badge);
        }
    }

    // ------------------------------------------
    // Upgrade Modal
    // ------------------------------------------
    function showUpgradeModal(requiredPlan, featureDesc) {
        var modal = document.getElementById("upgrade-modal");
        if (!modal) return;

        var planName = document.getElementById("upgrade-plan-name");
        var desc = document.getElementById("upgrade-feature-desc");
        var prefixEl = document.getElementById("upgrade-price-prefix");
        var priceEl = document.getElementById("upgrade-price");

        if (planName) planName.textContent = PLAN_LABELS[requiredPlan] || requiredPlan;
        if (desc) desc.textContent = featureDesc || "Unlock more powerful features with an upgrade.";

        // Calculate upgrade price
        var pricing = {
            "basic-pro": { prefix: "Upgrade for just", price: "₹200" },
            "basic-extreme": { prefix: "Status", price: "Coming Soon" },
            "pro-extreme": { prefix: "Status", price: "Coming Soon" },
            "beta-basic": { prefix: "Starts at", price: "₹399" },
            "beta-pro": { prefix: "Starts at", price: "₹599" },
            "beta-extreme": { prefix: "Status", price: "Coming Soon" },
            "beta-Premium": { prefix: "Starts at", price: "₹399" }
        };
        var priceKey = getPlanId() + "-" + requiredPlan;
        var pData = pricing[priceKey] || { prefix: "Upgrade for just", price: "" };
        
        if (prefixEl) prefixEl.textContent = pData.prefix;
        if (priceEl) priceEl.textContent = pData.price;

        // Update checkout URL with identity and fix CEP navigation
        var upgradeBtn = modal.querySelector(".upgrade-btn");
        if (upgradeBtn) {
            upgradeBtn.onclick = function(e) {
                e.preventDefault();
                var auth = typeof getStoredAuth === "function" ? getStoredAuth() : null;
                var email = (auth && auth.email) || localStorage.getItem("captiongrit_email") || "";
                var key = (auth && auth.key) || localStorage.getItem("captiongrit_key") || "";
                var url = "https://www.flogrit.com/captiongrit" + (email && key ? "?email=" + encodeURIComponent(email) + "&key=" + encodeURIComponent(key) : "") + "#pricing";
                if (window.cep && window.cep.util) {
                    window.cep.util.openURLInDefaultBrowser(url);
                } else {
                    window.open(url, "_blank");
                }
            };
        }

        modal.style.display = "flex";
    }

    function hideUpgradeModal() {
        var modal = document.getElementById("upgrade-modal");
        if (modal) modal.style.display = "none";
    }

    // ------------------------------------------
    // Presets System (Extreme only)
    // ------------------------------------------
    function initPresets() {
        renderPresetsDropdown();

        var btnSave = document.getElementById("btn-save-preset");
        if (btnSave) {
            btnSave.addEventListener("click", function () {
                var name = prompt("Enter preset name:");
                if (name && name.trim()) savePreset(name.trim());
            });
        }
    }

    function getPresets() {
        try {
            var stored = localStorage.getItem(STORAGE_PREFIX + "presets");
            return stored ? JSON.parse(stored) : [];
        } catch (e) { return []; }
    }

    function savePreset(name) {
        var presets = getPresets();
        if (presets.length >= 10) {
            showStatus("warning", "Maximum 10 presets reached. Delete one first.");
            return;
        }
        presets.push({
            name: name,
            sourceLang: document.getElementById("source-lang").value,
            captionOutput: getSelectedPills("caption-langs")[0] || "native_script",
            captionStyle: getSelectedPills("caption-style")[0] || "single_line",
            aiProvider: document.getElementById("ai-provider").value,
            sttProvider: document.getElementById("stt-provider").value,
            doubleCheck: document.getElementById("verification-toggle") ? document.getElementById("verification-toggle").checked : false,
            translateEnabled: document.getElementById("translate-toggle").checked,
            translateLang: document.getElementById("translate-lang").value
        });
        localStorage.setItem(STORAGE_PREFIX + "presets", JSON.stringify(presets));
        renderPresetsDropdown();
        showStatus("success", "Preset \"" + name + "\" saved!");
        setTimeout(hideStatus, 2000);
    }

    function applyPreset(index) {
        var presets = getPresets();
        var p = presets[index];
        if (!p) return;

        document.getElementById("source-lang").value = p.sourceLang;
        document.getElementById("ai-provider").value = p.aiProvider;
        document.getElementById("stt-provider").value = p.sttProvider;
        document.getElementById("translate-lang").value = p.translateLang;

        // Set caption output pill
        document.querySelectorAll('#caption-langs .pill').forEach(function (pill) {
            pill.classList.remove('active');
            if (pill.getAttribute('data-lang') === p.captionOutput && !pill.classList.contains('locked')) {
                pill.classList.add('active');
            }
        });
        // Set caption style pill
        document.querySelectorAll('#caption-style .pill').forEach(function (pill) {
            pill.classList.remove('active');
            if (pill.getAttribute('data-style') === p.captionStyle && !pill.classList.contains('locked')) {
                pill.classList.add('active');
            }
        });

        var verifyToggle = document.getElementById("verification-toggle");
        if (verifyToggle && !verifyToggle.disabled) verifyToggle.checked = p.doubleCheck;

        var translateToggle = document.getElementById("translate-toggle");
        if (translateToggle) {
            translateToggle.checked = p.translateEnabled;
            var target = document.getElementById("translate-target");
            if (target) {
                if (p.translateEnabled) target.classList.add("visible");
                else target.classList.remove("visible");
            }
        }

        showStatus("success", "Preset \"" + p.name + "\" applied!");
        setTimeout(hideStatus, 2000);
    }

    function deletePreset(index) {
        var presets = getPresets();
        presets.splice(index, 1);
        localStorage.setItem(STORAGE_PREFIX + "presets", JSON.stringify(presets));
        renderPresetsDropdown();
    }

    function renderPresetsDropdown() {
        var container = document.getElementById("presets-list");
        if (!container) return;
        var presets = getPresets();
        container.innerHTML = "";

        if (presets.length === 0) {
            container.innerHTML = '<div class="preset-empty">No presets saved yet. Configure your settings and click \u201cSave Preset\u201d.</div>';
            return;
        }

        presets.forEach(function (p, i) {
            var item = document.createElement("div");
            item.className = "preset-item";
            var langLabel = LANG_NAMES[p.sourceLang] || p.sourceLang;
            var outputLabel = p.captionOutput === "native_script" ? "Native" : p.captionOutput === "phonetic" ? "Roman" : "English";
            item.innerHTML =
                '<div class="preset-info">' +
                '<span class="preset-name">' + escapeHTML(p.name) + '</span>' +
                '<span class="preset-meta">' + langLabel + ' \u2022 ' + outputLabel + '</span>' +
                '</div>' +
                '<div class="preset-actions">' +
                '<button class="preset-apply" data-index="' + i + '">Apply</button>' +
                '<button class="preset-delete" data-index="' + i + '">\u2715</button>' +
                '</div>';
            container.appendChild(item);
        });

        container.querySelectorAll('.preset-apply').forEach(function (btn) {
            btn.addEventListener('click', function () {
                applyPreset(parseInt(btn.getAttribute('data-index')));
            });
        });
        container.querySelectorAll('.preset-delete').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (confirm("Delete this preset?")) deletePreset(parseInt(btn.getAttribute('data-index')));
            });
        });
    }

    // ------------------------------------------
    // API Keys \u2014 Load / Save
    // ------------------------------------------
    function loadApiKeys() {
        KEY_NAMES.forEach(function (key) {
            var stored = localStorage.getItem(STORAGE_PREFIX + key);
            if (stored) {
                var el = document.getElementById("key-" + key);
                if (el) el.value = stored;
            }
        });
    }

    function saveApiKeys() {
        KEY_NAMES.forEach(function (key) {
            var el = document.getElementById("key-" + key);
            if (!el) return;
            var value = el.value.trim();
            if (value) {
                localStorage.setItem(STORAGE_PREFIX + key, value);
            } else {
                localStorage.removeItem(STORAGE_PREFIX + key);
            }
        });
    }

    function getApiKey(name) {
        var el = document.getElementById("key-" + name);
        var val = (el ? el.value : "").trim() ||
            (localStorage.getItem(STORAGE_PREFIX + name) || "").trim();
        return val.replace(/^Bearer\s+/i, "");
    }

    // ------------------------------------------
    // Advanced Settings \u2014 Load / Save
    // ------------------------------------------
    function loadAdvancedSettings() {
        var vocab = localStorage.getItem(STORAGE_PREFIX + "custom-vocab");
        if (vocab) {
            var el = document.getElementById("custom-vocab");
            if (el) el.value = vocab;
        }
    }

    function saveAdvancedSettings() {
        var el = document.getElementById("custom-vocab");
        if (!el) return;
        var value = el.value.trim();
        if (value) {
            localStorage.setItem(STORAGE_PREFIX + "custom-vocab", value);
        } else {
            localStorage.removeItem(STORAGE_PREFIX + "custom-vocab");
        }
    }

    // ------------------------------------------
    // Button Bindings
    // ------------------------------------------
    function bindButtons() {
        console.log("Binding Read Selected Clip button");
        var btnReadClip = document.getElementById("btn-read-clip");
        if (btnReadClip) {
            console.log("btn-read-clip exists in DOM");
            btnReadClip.addEventListener("click", readSelectedClip);
        } else {
            console.log("ERROR: btn-read-clip not found in DOM!");
        }

        // Bind change events for smart defaults
        ['source-lang', 'translate-lang', 'stt-provider', 'ai-provider', 'verification-toggle'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', function () {
                    saveGenerationSettings();
                    updateDynamicHint();
                });
            }
        });

        // Help Video Link
        var linkHelpApi = document.getElementById("link-help-api");
        if (linkHelpApi) {
            linkHelpApi.addEventListener("click", function (e) {
                e.preventDefault();
                if (window.cep && window.cep.util) {
                    window.cep.util.openURLInDefaultBrowser("https://youtu.be/bnJ-pPlMwEg");
                }
            });
        }

        document.getElementById("btn-generate").addEventListener("click", generateCaptions);
        document.getElementById("btn-save-keys").addEventListener("click", function () {
            saveApiKeys();
            var fb = document.getElementById("save-feedback");
            fb.classList.add("visible");
            setTimeout(function () { fb.classList.remove("visible"); }, 2500);
        });

        var btnSaveAdvanced = document.getElementById("btn-save-advanced");
        if (btnSaveAdvanced) {
            btnSaveAdvanced.addEventListener("click", function () {
                saveAdvancedSettings();
                var fb = document.getElementById("save-advanced-feedback");
                fb.classList.add("visible");
                setTimeout(function () { fb.classList.remove("visible"); }, 2500);
            });
        }
        document.getElementById("btn-cancel").addEventListener("click", function () {
            cancelled = true;
        });
        document.getElementById("btn-new-generation").addEventListener("click", resetGeneration);

        var btnActivate = document.getElementById("activateBtn");
        if (btnActivate) btnActivate.addEventListener("click", handleActivateClick);

        var btnDeactivate = document.getElementById("btn-deactivate-license");
        if (btnDeactivate) btnDeactivate.addEventListener("click", deactivateLicense);

        var btnEditorBack = document.getElementById("btn-editor-back");
        if (btnEditorBack) btnEditorBack.addEventListener("click", hideEditorPanel);

        var btnBrowseFFmpeg = document.getElementById("btn-browse-ffmpeg");
        if (btnBrowseFFmpeg) {
            btnBrowseFFmpeg.addEventListener("click", function () {
                if (window.cep && window.cep.fs) {
                    var result = window.cep.fs.showOpenDialog(false, false, "Select FFmpeg executable", null, null);
                    if (result.err === 0 && result.data && result.data.length > 0) {
                        var selPath = result.data[0];
                        localStorage.setItem("custom_ffmpeg_path", selPath);
                        initializeFFmpeg(true);
                    }
                }
            });
        }

        var btnCopyDiag = document.getElementById("btn-copy-diagnostics");
        if (btnCopyDiag) {
            btnCopyDiag.addEventListener("click", function () {
                var diagStr = _ffmpegDiagnostics.join("\n");
                var temp = document.createElement("textarea");
                temp.value = diagStr;
                document.body.appendChild(temp);
                temp.select();
                document.execCommand("copy");
                document.body.removeChild(temp);
                btnCopyDiag.textContent = "Copied!";
                setTimeout(function () { btnCopyDiag.textContent = "Copy Diagnostics to Clipboard"; }, 2000);
            });
        }

        var btnEditorReplace = document.getElementById("btn-editor-replace");
        if (btnEditorReplace) btnEditorReplace.addEventListener("click", handleEditorReplace);

        var btnEditorDeleteWord = document.getElementById("btn-editor-delete-word");
        if (btnEditorDeleteWord) btnEditorDeleteWord.addEventListener("click", handleEditorDeleteWord);

        var btnEditorImport = document.getElementById("btn-editor-import");
        if (btnEditorImport) btnEditorImport.addEventListener("click", handleEditorImport);

        var btnEditorExport = document.getElementById("btn-editor-export");
        if (btnEditorExport) btnEditorExport.addEventListener("click", handleEditorExport);

        // Upgrade modal close
        var btnCloseUpgrade = document.getElementById("btn-close-upgrade");
        if (btnCloseUpgrade) btnCloseUpgrade.addEventListener("click", hideUpgradeModal);

        // Beta CTA Click Listener
        var betaUpgradeBtn = document.getElementById("beta-upgrade-btn");
        if (betaUpgradeBtn) {
            betaUpgradeBtn.addEventListener("click", function () {
                if (getPlanId() === "beta") {
                    showUpgradeModal("basic", "Choose between the Basic, Pro, or Extreme plans to remove Beta limits.");
                }
            });
        }


    }

    // ------------------------------------------
    // Read Selected Clip
    // ------------------------------------------
    function readSelectedClip() {
        try {
            console.log("readSelectedClip() entered");
            hideStatus();

            if (!csInterface) {
                console.log("csInterface is undefined");
                showStatus("error", "Not running inside a supported host application. CSInterface unavailable.");
                return;
            }

            console.log("Calling getActiveClipInfo()");
            csInterface.evalScript("getActiveClipInfo()", function (result) {
                try {
                    console.log("The callback executed");
                    console.log("Raw result:", result);

                    if (result === "EvalScript error.") {
                        hideProgress();
                        showStatus("error", "Internal error: Host script failed to evaluate. Please restart Premiere Pro or After Effects.");
                        return;
                    }
                    if (result === "null" || !result) {
                        hideProgress();
                        showStatus("error", "No valid clip data returned. Please select a footage layer or item.");
                        return;
                    }

                    if (typeof result !== "string") {
                        hideProgress();
                        showStatus("error", "Unexpected response type: " + typeof result + " | RAW: " + String(result).substring(0, 500));
                        return;
                    }
                    if (result.indexOf("Error") === 0 || result.indexOf("Exception") === 0 || result.indexOf("ReferenceError") === 0) {
                        hideProgress();
                        showStatus("error", "Host Error: " + result.substring(0, 500));
                        return;
                    }

                    var data = JSON.parse(result);
                    console.log("Parsed object:", data);

                    if (data.error) {
                        console.log("Error from host:", data.error);
                        if (data.log) console.log("Host Debug Log:", data.log);
                        if (data.debugLog) console.log("Host Debug Log:", data.debugLog);
                        showStatus("warning", data.error);
                        return;
                    }

                    // host.jsx now returns an array of clips
                    if (Array.isArray(data) && data.length > 0) {
                        currentClips = data;
                        displayClipInfo(currentClips);
                        hideProgress();
                        showStatus("success", "Selected " + currentClips.length + " clip(s).");
                    }
                } catch (e) {
                    console.log("Exception in evalScript callback:", e.stack || e);
                    console.log("Raw result was:", result);
                    hideProgress();
                    var rawStr = String(result);
                    showStatus("error", "Read Error: " + e.message + " | Type: " + typeof result + " | Len: " + rawStr.length + " | RAW: " + rawStr.substring(0, 500));
                }
            });
        } catch (e) {
            console.log("Exception in readSelectedClip:", e.stack || e);
            showStatus("error", "Exception in readSelectedClip: " + e.message);
        }
    }

    function displayClipInfo(clips) {
        var clipBox = document.getElementById("clip-box");
        var clipEmpty = document.getElementById("clip-empty");
        var clipInfo = document.getElementById("clip-info");
        var clipName = document.getElementById("clip-name");
        var clipDuration = document.getElementById("clip-duration");
        var clipFps = document.getElementById("clip-fps");

        clipBox.classList.add("has-clip");
        clipEmpty.style.display = "none";
        clipInfo.style.display = "block";

        if (clips.length === 1) {
            var data = clips[0];
            clipName.textContent = data.name;
            clipDuration.textContent = "\u23F1 " + formatDuration(data.duration);
            clipFps.textContent = data.frameRate ? (data.frameRate + " fps") : "";
        } else {
            clipName.textContent = clips.length + " clips selected";

            var totalDuration = 0;
            for (var i = 0; i < clips.length; i++) {
                totalDuration += clips[i].duration;
            }
            clipDuration.textContent = "\u23F1 " + formatDuration(totalDuration) + " total";
            clipFps.textContent = "(Batch Processing)";
        }
    }

    function formatDuration(seconds) {
        if (!seconds) return "\u2014";
        var mins = Math.floor(seconds / 60);
        var secs = Math.floor(seconds % 60);
        return mins + ":" + (secs < 10 ? "0" : "") + secs;
    }

    // ------------------------------------------
    // Status Messages
    // ------------------------------------------
    function showStatus(type, msg) {
        var el = document.getElementById("status-msg");
        el.className = "status-msg visible " + type;
        el.textContent = msg;
    }

    function hideStatus() {
        var el = document.getElementById("status-msg");
        el.className = "status-msg";
    }

    // ------------------------------------------
    // Progress UI
    // ------------------------------------------
    function showProgress() {
        document.getElementById("progress-section").classList.add("visible");
        document.getElementById("generate-section").style.display = "none";
        document.getElementById("done-state").classList.remove("visible");
        document.getElementById("caption-preview").innerHTML = "";
    }

    function hideProgress() {
        document.getElementById("progress-section").classList.remove("visible");
    }

    function setProgressStep(text) {
        document.getElementById("progress-step-text").textContent = text;
    }

    function setProgressBar(percent) {
        document.getElementById("progress-bar").style.width = percent + "%";
    }

    function addCaptionPreview(caption) {
        var container = document.getElementById("caption-preview");
        var existingItems = container.querySelectorAll(".caption-preview-item");
        if (existingItems.length >= 3) return; // Only show first 3

        var item = document.createElement("div");
        item.className = "caption-preview-item";
        item.innerHTML =
            '<span class="time">' + formatTimeSRT(caption.start) + '</span>' +
            '<span class="text">' + escapeHTML(caption.display_text || caption.original) + '</span>';
        container.appendChild(item);
    }

    function showDone(count, details) {
        hideProgress();
        var doneState = document.getElementById("done-state");
        doneState.classList.add("visible");
        document.getElementById("done-text").textContent = count + " Captions Generated!";
        document.getElementById("done-detail").textContent = details || "";
    }

    function resetGeneration() {
        document.getElementById("done-state").classList.remove("visible");
        document.getElementById("generate-section").style.display = "block";
        hideProgress();
        hideStatus();
        cancelled = false;
    }

    // ------------------------------------------
    // Generate Captions \u2014 Main Pipeline
    // --------------------------------------    // --- BATCH SESSION STATE ---
    var BatchSession = null;
    var MAX_STT_WORKERS = 3;
    var MAX_AI_WORKERS = 1;

    // ------------------------------------------
    // Generate Captions — Main Pipeline (Phase 4 Refactor)
    // ------------------------------------------
    async function generateCaptions() {
        hideStatus();
        cancelled = false;

        // Validate inputs
        var sttProvider = document.getElementById("stt-provider").value;
        var sourceLang = document.getElementById("source-lang").value;
        var captionLangs = getSelectedPills("caption-langs");
        var outputOptions = getSelectedPills("output-options");
        var aiProvider = document.getElementById("ai-provider").value;
        var captionStyle = getSelectedPills("caption-style")[0] || "single_line";
        var translateEnabled = document.getElementById("translate-toggle").checked;
        var translateLang = document.getElementById("translate-lang").value;

        // Validation
        if (sourceLang === "auto" && (captionLangs.includes("phonetic") || captionLangs.includes("native_script"))) {
            showStatus("error", "Please select a specific Source Language for Native Script or Roman captions. Auto Detect is not supported for these modes.");
            return;
        }

        if (!currentClips || currentClips.length === 0) {
            showStatus("error", "Select a clip first. Click 'Read Selected Clip' to load clip info.");
            return;
        }

        if (captionLangs.length === 0) {
            showStatus("error", "Select at least one caption output.");
            return;
        }

        if (outputOptions.length === 0) {
            showStatus("error", "Select at least one output option.");
            return;
        }

        // Check STT API key
        var sttKey = sttProvider === "elevenlabs" ? getApiKey("elevenlabs") : getApiKey("deepgram");
        if (!sttKey) {
            showStatus("error",
                "No API key for " + (sttProvider === "elevenlabs" ? "ElevenLabs" : "Deepgram") +
                ". Go to Settings tab to add your key.");
            return;
        }

        // Check AI API key availability
        if (!hasAnyAIKey(aiProvider)) {
            showStatus("error", "No AI provider API key available. Go to Settings to add at least one key (Gemini, Groq, or OpenRouter).");
            return;
        }

        // -- License re-validation (security: prevents console bypass) --
        var _auth = typeof getStoredAuth === "function" ? getStoredAuth() : null;
        var _email = (_auth && _auth.email) || localStorage.getItem("captiongrit_email");
        var _key = (_auth && _auth.key) || localStorage.getItem("captiongrit_key");
        var _deviceId = (_auth && _auth.deviceId) || getPersistentDeviceId();
        if (!_email || !_key || !_deviceId) {
            showLicensePanel();
            showStatus("error", "License not found. Please activate your license.");
            return;
        }

        // -- Tier enforcement: clip duration --
        for (var _c = 0; _c < currentClips.length; _c++) {
            if (TIER.maxDuration > 0 && currentClips[_c].duration > TIER.maxDuration) {
                var clipDur = currentClips[_c].duration;
                var targetPlan = clipDur <= 60 ? "basic" : (clipDur <= 180 ? "pro" : "extreme");
                var currentPlanLabel = PLAN_LABELS[getPlanId()] || "Current";
                var targetPlanLabel = PLAN_LABELS[targetPlan] || "Target";
                var durationMsg = TIER.maxDuration > 0 ? (TIER.maxDuration + "s") : "limited duration";
                showStatus("error", currentPlanLabel + " plan supports up to " + durationMsg + " per clip. Upgrade to " + targetPlanLabel + " for longer clips.");

                var modalDesc = "";
                if (targetPlan === "basic") {
                    modalDesc = "Process clips up to 60 seconds with the Basic plan (₹399).";
                } else if (targetPlan === "pro") {
                    modalDesc = "Process clips up to 3 minutes (180 seconds) with the Pro plan (₹599).";
                } else {
                    modalDesc = "Process unlimited clip durations with the Extreme plan (Coming Soon).";
                }
                showUpgradeModal(targetPlan, modalDesc);
                return;
            }
        }

        // -- Tier enforcement: clip count (batch) --
        if (currentClips.length > TIER.maxClips) {
            showStatus("error", "You selected " + currentClips.length + " clips — " + PLAN_LABELS[getPlanId()] + " plan supports " + TIER.maxClips + " clip at a time. Upgrade to Extreme for batch processing.");
            showUpgradeModal("extreme", "Process up to 99 clips at once with Extreme.");
            return;
        }

        if (captionStyle === "word_by_word" && !TIER.hasWordByWord) {
            showStatus("error", "Word-by-Word captions require the Pro plan.");
            showUpgradeModal("pro", "Word-by-Word captions, 98% accuracy with Double-Check, and more.");
            return;
        }
        if (captionLangs.includes("english") && !TIER.hasEnglishOutput) {
            showStatus("error", "English output requires the Pro plan.");
            showUpgradeModal("pro", "English translation output, Custom Dictionary, and Caption Editor.");
            return;
        }

        showProgress();

        try {
            // Initialize BatchSession
            BatchSession = {
                sttProvider: sttProvider,
                sourceLang: sourceLang,
                captionLangs: captionLangs,
                outputOptions: outputOptions,
                aiProvider: aiProvider,
                captionStyle: captionStyle,
                translateEnabled: translateEnabled,
                translateLang: translateLang,
                sttKey: sttKey,
                tempDir: await evalScriptAsync("getTempDir()"),
                clips: currentClips.map(function (c) { return Object.assign({}, c); }),
                chunkQueue: [],
                aiQueue: [],
                transcripts: {},
                completedClips: [],
                failedClips: [],
                editorQueue: [],
                chunkingComplete: false,
                isEditorOpen: false
            };

            // Phase 1: Parallel Audio Extraction
            setProgressStep("Extracting audio for all clips...");
            setProgressBar(5);

            var extractionPromises = BatchSession.clips.map(function (clip, idx) {
                return (async function () {
                    try {
                        var audioPath = BatchSession.tempDir.replace(/\\/g, "/") + "/captiongrit_audio_" + idx + ".mp3";
                        clip.audioPath = audioPath;
                        var extractResult = await extractAudioNode(clip.file, audioPath, clip.inPoint, clip.duration);
                        if (!extractResult.success) throw new Error(extractResult.error);
                    } catch (err) {
                        console.error("[Captiongrit] Audio extraction failed for clip " + idx, err);
                        BatchSession.failedClips.push(idx);
                    }
                })();
            });
            await Promise.all(extractionPromises);

            if (cancelled) throw new Error("Cancelled");

            // Phase 2: Global Chunk Queue & Audio Reading
            setProgressStep("Preparing global chunk queue...");
            setProgressBar(15);
            var CHUNK_SECONDS = 25;

            for (var i = 0; i < BatchSession.clips.length; i++) {
                if (BatchSession.failedClips.includes(i)) continue;
                var clip = BatchSession.clips[i];

                if (clip.duration > CHUNK_SECONDS) {
                    var numChunks = Math.ceil(clip.duration / CHUNK_SECONDS);
                    for (var c = 0; c < numChunks; c++) {
                        var chunkStart = c * CHUNK_SECONDS;
                        var chunkLen = Math.min(CHUNK_SECONDS, clip.duration - chunkStart);
                        var chunkPath = BatchSession.tempDir.replace(/\\/g, "/") + "/captiongrit_chunk_" + i + "_" + c + ".mp3";

                        var chunkArgs = ['-ss', String(chunkStart), '-t', String(chunkLen), '-i', clip.audioPath, '-ar', '16000', '-ac', '1', '-b:a', '64k', '-y', chunkPath];
                        var execOptsChunk = getMacExecOpts({ maxBuffer: 1024 * 1024 * 10 });

                        var result = await new Promise(function (res) {
                            cp.execFile(getFFmpegPath(), chunkArgs, execOptsChunk, function (err, stdout, stderr) {
                                if (err) {
                                    console.error("[Captiongrit] FFmpeg chunking error:", err.message || stderr);
                                    res({ success: false, error: err.message || stderr });
                                } else {
                                    res({ success: true });
                                }
                            });
                        });

                        if (!result.success) {
                            throw new Error("FFmpeg failed to extract audio chunk " + c + ". This may happen if the file is locked or corrupt. Details: " + result.error);
                        }

                        var chunkBase64;
                        if (fs) {
                            chunkBase64 = fs.readFileSync(chunkPath, { encoding: "base64" });
                        } else {
                            chunkBase64 = await evalScriptAsync('readFileAsBase64("' + escapeJSX(chunkPath) + '")');
                        }
                        var chunkBinary = atob(chunkBase64);
                        var chunkBytes = new Uint8Array(chunkBinary.length);
                        for (var b = 0; b < chunkBinary.length; b++) chunkBytes[b] = chunkBinary.charCodeAt(b);
                        var blob = new Blob([chunkBytes], { type: "audio/mpeg" });

                        BatchSession.chunkQueue.push({
                            clipIdx: i,
                            chunkIndex: c,
                            startOffset: chunkStart,
                            blob: blob,
                            path: chunkPath
                        });
                    }
                    clip.totalChunks = numChunks;
                    clip.completedChunks = 0;
                    clip.sttResults = new Array(numChunks);
                } else {
                    var audioBase64;
                    if (fs) {
                        audioBase64 = fs.readFileSync(clip.audioPath, { encoding: "base64" });
                    } else {
                        audioBase64 = await evalScriptAsync('readFileAsBase64("' + escapeJSX(clip.audioPath) + '")');
                    }
                    var chunkBinary = atob(audioBase64);
                    var chunkBytes = new Uint8Array(chunkBinary.length);
                    for (var b = 0; b < chunkBinary.length; b++) chunkBytes[b] = chunkBinary.charCodeAt(b);
                    var blob = new Blob([chunkBytes], { type: "audio/mpeg" });

                    BatchSession.chunkQueue.push({
                        clipIdx: i,
                        chunkIndex: 0,
                        startOffset: 0,
                        blob: blob,
                        path: clip.audioPath
                    });
                    clip.totalChunks = 1;
                    clip.completedChunks = 0;
                    clip.sttResults = new Array(1);
                }
            }
            BatchSession.chunkingComplete = true;

            if (cancelled) throw new Error("Cancelled");

            // Phase 3, 4 & 5: Streaming Pipeline
            updateProgressText();

            // Start STT Workers
            var workers = [];
            for (var w = 0; w < MAX_STT_WORKERS; w++) {
                workers.push(sttWorkerLoop(w));
            }
            var sttPromise = Promise.all(workers);

            // Start AI Workers
            var aiWorkers = [];
            for (var a = 0; a < MAX_AI_WORKERS; a++) {
                aiWorkers.push(aiWorkerLoop(a));
            }
            var aiPromise = Promise.all(aiWorkers);

            // Wait for both pipelines to finish
            await Promise.all([sttPromise, aiPromise]);

            if (cancelled) throw new Error("Cancelled");

            // If background workers finished without opening editor (all failed, or fast), finish.
            if (BatchSession && !BatchSession.isEditorOpen && BatchSession.editorQueue.length === 0) {
                if (BatchSession.completedClips.length > 0 || BatchSession.failedClips.length > 0) {
                    finishBatch();
                } else {
                    throw new Error("All clips failed processing.");
                }
            }

        } catch (err) {
            hideProgress();
            document.getElementById("generate-section").style.display = "block";
            if (err.message === "Cancelled") {
                showStatus("warning", "Generation cancelled.");
            } else {
                showStatus("error", err.message);
            }
            cancelled = true; // Signal workers to stop before cleanup
            cleanupBatchSession();
        }
    }

    async function sttWorkerLoop(workerId) {
        while (true) {
            if (!BatchSession || cancelled) break;
            if (BatchSession.chunkQueue.length === 0 && BatchSession.chunkingComplete) break;
            if (BatchSession.chunkQueue.length === 0) {
                await new Promise(function (r) { setTimeout(r, 100); });
                continue;
            }
            if (!BatchSession) break;
            var chunk = BatchSession.chunkQueue.shift();
            if (!BatchSession) break;
            if (BatchSession.failedClips.includes(chunk.clipIdx)) continue;

            try {
                var sttFn = BatchSession.sttProvider === "elevenlabs" ? sttElevenLabs : sttDeepgram;
                var result = await sttFn(chunk.blob, BatchSession.sttKey, BatchSession.sourceLang);
                if (!BatchSession || cancelled) break;

                var clip = BatchSession.clips[chunk.clipIdx];
                clip.sttResults[chunk.chunkIndex] = result;
                clip.completedChunks++;

                updateProgressText();

                if (clip.completedChunks === clip.totalChunks) {
                    assembleTranscript(chunk.clipIdx);
                }
            } catch (err) {
                console.error("[Captiongrit] STT Worker Error:", err);
                if (!BatchSession || cancelled) break;
                chunk.retries = (chunk.retries || 0) + 1;
                if (chunk.retries < 3) {
                    await new Promise(function (r) { setTimeout(r, 500); });
                    if (BatchSession) BatchSession.chunkQueue.unshift(chunk);
                } else {
                    if (BatchSession && !BatchSession.failedClips.includes(chunk.clipIdx)) {
                        BatchSession.failedClips.push(chunk.clipIdx);
                        checkCompletion();
                    }
                }
            }
        }
    }

    function assembleTranscript(clipIdx) {
        var clip = BatchSession.clips[clipIdx];
        var allWords = [];
        for (var c = 0; c < clip.totalChunks; c++) {
            var chunkWords = clip.sttResults[c] || [];
            var chunkOffset = c * 25; // using identical CHUNK_SECONDS logic
            for (var w = 0; w < chunkWords.length; w++) {
                chunkWords[w].start += chunkOffset;
                chunkWords[w].end += chunkOffset;
            }
            allWords = allWords.concat(chunkWords);
        }

        allWords = allWords.filter(function (w) { return w.word && w.word.trim().length > 0; });
        allWords = cleanRawSTTSegments(allWords);
        allWords = applyPhoneticCorrections(allWords);

        var segments = groupWordsIntoSegments(allWords, BatchSession.captionStyle);
        BatchSession.aiQueue.push({ clipIdx: clipIdx, segments: segments });
    }

    async function aiWorkerLoop(workerId) {
        var totalValidClips = BatchSession ? BatchSession.clips.length : 0;

        while (true) {
            if (!BatchSession || cancelled) break;

            var totalProcessed = BatchSession.completedClips.length + BatchSession.failedClips.length;
            if (totalProcessed >= totalValidClips && BatchSession.aiQueue.length === 0) break;

            if (BatchSession.aiQueue.length === 0) {
                await new Promise(function (r) { setTimeout(r, 200); });
                continue;
            }

            if (!BatchSession) break;
            var task = BatchSession.aiQueue.shift();
            if (!BatchSession) break;
            if (BatchSession.failedClips.includes(task.clipIdx)) continue;

            try {
                var segments = task.segments;

                if (BatchSession.completedClips.length > 0) {
                    await new Promise(function (r) { setTimeout(r, 2000); });
                }

                if (!BatchSession || cancelled) break;

                segments = await convertScript(segments, BatchSession.captionLangs, BatchSession.aiProvider, BatchSession.sourceLang, BatchSession.captionStyle);

                if (!BatchSession || cancelled) break;

                if (BatchSession.translateEnabled) {
                    await new Promise(function (r) { setTimeout(r, 1500); });
                    if (!BatchSession || cancelled) break;
                    segments = await translateCaptions(segments, BatchSession.translateLang, BatchSession.aiProvider, BatchSession.sourceLang, BatchSession.captionLangs[0], BatchSession.captionStyle);
                    if (!BatchSession || cancelled) break;
                }

                var primaryLang = BatchSession.captionLangs[0];
                var primaryKey = langToKey(primaryLang, BatchSession.sourceLang);
                var timelineOffset = BatchSession.clips[task.clipIdx].timelineStart || 0;

                var finalSegments = [];
                segments.forEach(function (seg) {
                    if (BatchSession.translateEnabled && seg.translated) {
                        seg.display_text = seg.translated;
                    } else {
                        seg.display_text = seg[primaryKey] || seg.original;
                    }
                    var adjustedSeg = Object.assign({}, seg);
                    adjustedSeg.start += timelineOffset;
                    adjustedSeg.end += timelineOffset;
                    finalSegments.push(adjustedSeg);
                });

                BatchSession.transcripts[task.clipIdx] = finalSegments;
                BatchSession.completedClips.push(task.clipIdx);
                BatchSession.editorQueue.push(task.clipIdx);

                updateProgressText();
                tryOpenEditor();
            } catch (err) {
                console.error("[Captiongrit] AI Error:", err);
                task.retries = (task.retries || 0) + 1;
                if (task.retries < 3) {
                    await new Promise(function (r) { setTimeout(r, 1000); });
                    if (BatchSession) BatchSession.aiQueue.unshift(task);
                } else {
                    if (BatchSession && !BatchSession.failedClips.includes(task.clipIdx)) {
                        BatchSession.failedClips.push(task.clipIdx);
                        checkCompletion();
                    }
                }
            }
        }
    }

    function updateProgressText() {
        if (!BatchSession) return;

        var sttCompleted = 0;
        var sttTotal = 0;
        BatchSession.clips.forEach(function (c, idx) {
            if (!BatchSession.failedClips.includes(idx)) {
                sttCompleted += (c.completedChunks || 0);
                sttTotal += (c.totalChunks || 0);
            }
        });

        var aiCompleted = BatchSession.completedClips.length;
        var validClips = BatchSession.clips.length - BatchSession.failedClips.length;

        if (sttCompleted < sttTotal) {
            setProgressStep("Transcribing (" + sttCompleted + " / " + sttTotal + " Chunks)");
            setProgressBar(20 + (sttCompleted / Math.max(1, sttTotal)) * 40);
        } else if (aiCompleted < validClips) {
            setProgressStep("AI Conversion (" + aiCompleted + " / " + validClips + " Videos)");
            setProgressBar(60 + (aiCompleted / Math.max(1, validClips)) * 35);
        } else if (!BatchSession.isEditorOpen) {
            setProgressStep("Preparing Editor...");
            setProgressBar(100);
        }
    }

    function checkCompletion() {
        if (!BatchSession) return;
        var totalProcessed = BatchSession.completedClips.length + BatchSession.failedClips.length;
        if (totalProcessed >= BatchSession.clips.length && !BatchSession.isEditorOpen && BatchSession.editorQueue.length === 0) {
            finishBatch();
        }
    }


    // ------------------------------------------
    // Caption Editor
    // ------------------------------------------
    function showEditorPanel(segments, outputOptions) {
        editorSegments = segments;
        editorOutputOptions = outputOptions;

        hideProgress();
        document.getElementById("generate-section").style.display = "block";
        document.getElementById("editor-panel").style.display = "flex";

        // Apply editor gating for Basic tier (read-only mode)
        if (!TIER.hasEditor) {
            var editorPanel = document.getElementById("editor-panel");
            if (editorPanel) editorPanel.classList.add("editor-readonly");
            // Show upgrade banner
            var existingBanner = document.getElementById("editor-upgrade-banner");
            if (!existingBanner) {
                var banner = document.createElement("div");
                banner.id = "editor-upgrade-banner";
                banner.className = "editor-upgrade-banner";
                banner.innerHTML = '\uD83D\uDD12 <strong>Editing is a Pro feature.</strong> Your captions are shown below in read-only mode. <a href="#" id="editor-upgrade-link">Upgrade to Pro</a> to edit captions before import.';
                var editorHeader = editorPanel.querySelector('.editor-header');
                if (editorHeader) editorHeader.after(banner);
                var upgradeLink = document.getElementById("editor-upgrade-link");
                if (upgradeLink) {
                    upgradeLink.addEventListener("click", function (e) {
                        e.preventDefault();
                        showUpgradeModal("pro", "Edit captions, find & replace words, merge/split segments, and more.");
                    });
                }
            }
            // Disable editing controls
            var editorControls = editorPanel.querySelector('.editor-controls');
            if (editorControls) editorControls.style.display = "none";
        } else {
            var editorPanel2 = document.getElementById("editor-panel");
            if (editorPanel2) editorPanel2.classList.remove("editor-readonly");
        }

        // Apply tier gating for AI Improve button
        var btnAIImprove = document.getElementById("btn-editor-ai-improve");
        if (btnAIImprove) {
            if (!TIER.hasDoubleCheck) {
                btnAIImprove.classList.add("locked");
                btnAIImprove.onclick = function (e) {
                    e.preventDefault();
                    showUpgradeModal("pro", "AI Improve uses advanced language models to fix spelling, punctuation, and native script automatically.");
                };
            } else {
                btnAIImprove.classList.remove("locked");
                btnAIImprove.onclick = handleEditorAIVerify;
            }
        }

        renderEditorTable();
    }

    async function handleEditorAIVerify() {
        if (!editorSegments || editorSegments.length === 0) return;
        var btn = document.getElementById("btn-editor-ai-improve");
        if (btn.disabled) return;

        var aiProvider = document.getElementById("ai-provider").value;
        var captionLangs = getSelectedPills("caption-langs");
        var sourceLang = document.getElementById("source-lang").value;
        var primaryLang = captionLangs[0];

        var originalText = btn.innerHTML;
        btn.innerHTML = "<div class='spinner' style='width:12px;height:12px;display:inline-block;margin-right:6px;'></div> Improving...";
        btn.disabled = true;

        try {
            // Standard verification pipeline expects passes = 4 for full pipeline
            var passes = 4;
            editorSegments = await runVerificationPipeline(editorSegments, aiProvider, primaryLang, sourceLang, passes);

            // Re-render table with new tokens
            renderEditorTable();

            // Show inline success
            var headerSpan = document.querySelector("#editor-panel .editor-header span");
            if (headerSpan) {
                var oldSpanText = headerSpan.textContent;
                headerSpan.innerHTML = "<span style='color:var(--success)'>✓ Captions Improved</span>";
                setTimeout(function () { headerSpan.textContent = oldSpanText; }, 3000);
            }
        } catch (err) {
            console.error("[Captiongrit] AI Improve Error:", err);
            alert("AI Improve failed: " + err.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    function hideEditorPanel() {
        document.getElementById("editor-panel").style.display = "none";
    }

    function renderEditorTable() {
        var tbody = document.getElementById("editor-tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        for (var i = 0; i < editorSegments.length; i++) {
            var seg = editorSegments[i];
            var tr = document.createElement("tr");
            tr.setAttribute("data-index", i);

            var tdIndex = document.createElement("td");
            tdIndex.className = "col-index";
            tdIndex.textContent = i + 1;

            var tdStart = document.createElement("td");
            var divStart = document.createElement("div");
            divStart.className = "editable-cell col-time";
            divStart.contentEditable = "true";
            divStart.textContent = formatTimeSRT(seg.start);
            divStart.addEventListener("blur", (function (idx) {
                return function (e) {
                    var parsed = parseSRTTime(e.target.textContent);
                    if (parsed !== null) editorSegments[idx].start = parsed;
                    else e.target.textContent = formatTimeSRT(editorSegments[idx].start);
                };
            })(i));
            tdStart.appendChild(divStart);

            var tdEnd = document.createElement("td");
            var divEnd = document.createElement("div");
            divEnd.className = "editable-cell col-time";
            divEnd.contentEditable = "true";
            divEnd.textContent = formatTimeSRT(seg.end);
            divEnd.addEventListener("blur", (function (idx) {
                return function (e) {
                    var parsed = parseSRTTime(e.target.textContent);
                    if (parsed !== null) editorSegments[idx].end = parsed;
                    else e.target.textContent = formatTimeSRT(editorSegments[idx].end);
                };
            })(i));
            tdEnd.appendChild(divEnd);

            var tdText = document.createElement("td");
            var divText = document.createElement("div");
            divText.className = "editable-cell";
            divText.contentEditable = "true";
            divText.textContent = seg.display_text || seg.original;
            divText.addEventListener("blur", (function (idx) {
                return function (e) {
                    editorSegments[idx].display_text = e.target.textContent;
                };
            })(i));
            tdText.appendChild(divText);

            var tdActions = document.createElement("td");
            tdActions.className = "col-actions";

            var btnMerge = document.createElement("button");
            btnMerge.className = "action-btn";
            btnMerge.textContent = "Merge";
            btnMerge.title = "Merge with next row";
            if (i === editorSegments.length - 1) btnMerge.style.display = "none";
            btnMerge.onclick = (function (idx) {
                return function () {
                    if (idx < editorSegments.length - 1) {
                        editorSegments[idx].display_text = (editorSegments[idx].display_text || "") + " " + (editorSegments[idx + 1].display_text || "");
                        editorSegments[idx].end = editorSegments[idx + 1].end;
                        editorSegments.splice(idx + 1, 1);
                        renderEditorTable();
                    }
                };
            })(i);

            var btnSplit = document.createElement("button");
            btnSplit.className = "action-btn";
            btnSplit.textContent = "Split";
            btnSplit.title = "Split at cursor";
            btnSplit.onclick = (function (idx, el) {
                return function () {
                    var sel = window.getSelection();
                    if (sel.rangeCount > 0 && sel.focusNode && el.contains(sel.focusNode)) {
                        var text = el.textContent;
                        var offset = 0;

                        function getOffset(node, targetNode, targetOffset) {
                            if (node === targetNode) return targetOffset;
                            var off = 0;
                            for (var j = 0; j < node.childNodes.length; j++) {
                                var child = node.childNodes[j];
                                if (child === targetNode || child.contains(targetNode)) {
                                    return off + getOffset(child, targetNode, targetOffset);
                                }
                                off += child.textContent.length;
                            }
                            return off;
                        }

                        offset = getOffset(el, sel.focusNode, sel.focusOffset);

                        if (offset > 0 && offset < text.length) {
                            var part1 = text.substring(0, offset).trim();
                            var part2 = text.substring(offset).trim();

                            var seg = editorSegments[idx];
                            var dur = seg.end - seg.start;
                            var ratio = part1.length / text.length;
                            var midTime = seg.start + dur * ratio;

                            seg.display_text = part1;
                            var oldEnd = seg.end;
                            seg.end = midTime;

                            var newSeg = JSON.parse(JSON.stringify(seg));
                            newSeg.start = midTime;
                            newSeg.end = oldEnd;
                            newSeg.display_text = part2;

                            editorSegments.splice(idx + 1, 0, newSeg);
                            renderEditorTable();
                        }
                    } else {
                        showStatus("warning", "Click inside the text to place the cursor before splitting.");
                    }
                };
            })(i, divText);

            var btnDelete = document.createElement("button");
            btnDelete.className = "action-btn";
            btnDelete.textContent = "Del";
            btnDelete.onclick = (function (idx) {
                return function () {
                    editorSegments.splice(idx, 1);
                    renderEditorTable();
                };
            })(i);

            tdActions.appendChild(btnMerge);
            tdActions.appendChild(btnSplit);
            tdActions.appendChild(btnDelete);

            tr.appendChild(tdIndex);
            tr.appendChild(tdStart);
            tr.appendChild(tdEnd);
            tr.appendChild(tdText);
            tr.appendChild(tdActions);

            tbody.appendChild(tr);
        }

        // Arrow key navigation between editable cells
        // Only jump rows when cursor is at the very start (ArrowUp) or end (ArrowDown)
        var allEditables = tbody.querySelectorAll(".editable-cell");
        allEditables.forEach(function (cell) {
            cell.addEventListener("keydown", function (e) {
                if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

                var sel = window.getSelection();
                var text = cell.textContent || "";
                var cursorOffset = 0;

                if (sel.rangeCount > 0 && cell.contains(sel.focusNode)) {
                    // Calculate absolute cursor offset within the cell
                    var range = sel.getRangeAt(0);
                    var preRange = document.createRange();
                    preRange.selectNodeContents(cell);
                    preRange.setEnd(range.startContainer, range.startOffset);
                    cursorOffset = preRange.toString().length;
                }

                // ArrowDown: only jump if cursor is at or near the end
                // ArrowUp: only jump if cursor is at or near the start
                var atEnd = cursorOffset >= text.length;
                var atStart = cursorOffset === 0;

                if ((e.key === "ArrowDown" && !atEnd) || (e.key === "ArrowUp" && !atStart)) {
                    return; // Let normal cursor movement happen
                }

                var td = cell.parentElement;
                var tr = td.parentElement;
                var colIndex = Array.prototype.indexOf.call(tr.children, td);
                var targetRow = e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling;

                if (targetRow) {
                    var targetTd = targetRow.children[colIndex];
                    if (targetTd) {
                        var targetCell = targetTd.querySelector(".editable-cell");
                        if (targetCell) {
                            e.preventDefault();
                            targetCell.focus();
                        }
                    }
                }
            });
        });
    }

    function parseSRTTime(timeStr) {
        var match = timeStr.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
        if (match) {
            return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
        }
        return null;
    }

    var currentEditorClipIdx = null;

    function tryOpenEditor() {
        if (!BatchSession || BatchSession.isEditorOpen) return;
        if (BatchSession.editorQueue.length > 0) {
            BatchSession.isEditorOpen = true;
            currentEditorClipIdx = BatchSession.editorQueue.shift();
            var segments = BatchSession.transcripts[currentEditorClipIdx];
            var clipName = BatchSession.clips[currentEditorClipIdx].name;

            var headerSpan = document.querySelector("#editor-panel .editor-header span");
            if (headerSpan) {
                var currentNum = BatchSession.completedClips.indexOf(currentEditorClipIdx) + 1;
                headerSpan.innerHTML = "Reviewing: <strong>" + clipName + "</strong> (" + currentNum + " of " + BatchSession.clips.length + ")";
            }

            showEditorPanel(segments, BatchSession.outputOptions);
        } else {
            checkCompletion();
        }
    }

    function cleanupClipMemory(clipIdx) {
        if (!BatchSession) return;

        // Remove text references
        delete BatchSession.transcripts[clipIdx];
        BatchSession.clips[clipIdx].sttResults = null;

        // Unlink extracted audio
        var c = BatchSession.clips[clipIdx];
        if (c.audioPath && fs) {
            try { fs.unlinkSync(c.audioPath); } catch (e) { }
        }

        // We let cleanupBatchSession clean up chunk paths, since they were already popped from queue
        // but it's safe to unlink them here too if we tracked them, but chunkQueue shifted them out.
    }

    function finishBatch() {
        hideProgress();
        document.getElementById("generate-section").style.display = "block";
        document.getElementById("editor-panel").style.display = "none";

        var successCount = BatchSession.completedClips.length;
        var failCount = BatchSession.failedClips.length;
        var msg = "Batch processing complete.";
        if (failCount > 0) msg += " " + failCount + " clip(s) failed.";

        showDone(successCount, msg);
        cleanupBatchSession();
    }

    function cleanupBatchSession() {
        if (BatchSession) {
            if (BatchSession.clips) {
                BatchSession.clips.forEach(function (c) {
                    if (c.audioPath && fs) {
                        try { fs.unlinkSync(c.audioPath); } catch (e) { }
                    }
                });
            }
            if (BatchSession.chunkQueue) {
                BatchSession.chunkQueue.forEach(function (c) {
                    if (c.path && fs) {
                        try { fs.unlinkSync(c.path); } catch (e) { }
                    }
                });
            }
        }
        BatchSession = null;
        currentEditorClipIdx = null;
    }

    async function handleEditorImport() {
        hideEditorPanel();
        showProgress();
        setProgressStep("Applying edits and finalizing output...");
        setProgressBar(90);
        setTimeout(function () {
            finalizeOutput(editorSegments, editorOutputOptions, currentEditorClipIdx);
        }, 100);
    }

    async function handleEditorExport() {
        var uniqueFilename = "captions_" + new Date().getTime();
        var srtResult = await evalScriptAsync("exportSRTWithDialog('" + escapeJSXString(JSON.stringify(editorSegments)) + "', '" + uniqueFilename + "')");
        var srtData = JSON.parse(srtResult);
        if (srtData.error) {
            showStatus("warning", "SRT export error: " + srtData.error);
        } else if (!srtData.cancelled) {
            showStatus("success", "SRT saved: " + srtData.path);
        }
    }

    function handleEditorReplace() {
        var findStr = document.getElementById("editor-find").value;
        var replaceStr = document.getElementById("editor-replace").value;
        if (!findStr) return;

        var wholeWord = document.getElementById("editor-whole-word").checked;
        var escaped = findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var pattern = wholeWord ? '\\b' + escaped + '\\b' : escaped;
        var re = new RegExp(pattern, 'gi');

        var count = 0;
        for (var i = 0; i < editorSegments.length; i++) {
            var text = editorSegments[i].display_text || editorSegments[i].original;
            if (re.test(text)) {
                re.lastIndex = 0; // reset after .test()
                editorSegments[i].display_text = text.replace(re, replaceStr);
                count++;
            }
            re.lastIndex = 0;
        }

        if (count > 0) {
            renderEditorTable();
            showStatus("success", "Replaced in " + count + " segment(s).");
        } else {
            showStatus("warning", "No matches found.");
        }
    }

    function handleEditorDeleteWord() {
        var findStr = document.getElementById("editor-find").value;
        if (!findStr) return;

        var wholeWord = document.getElementById("editor-whole-word").checked;
        var escaped = findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var pattern = wholeWord ? '\\b' + escaped + '\\b' : escaped;
        var re = new RegExp(pattern, 'gi');

        var count = 0;
        for (var i = 0; i < editorSegments.length; i++) {
            var text = editorSegments[i].display_text || editorSegments[i].original;
            if (re.test(text)) {
                re.lastIndex = 0;
                editorSegments[i].display_text = text.replace(re, '').replace(/\s+/g, ' ').trim();
                count++;
            }
            re.lastIndex = 0;
        }

        if (count > 0) {
            renderEditorTable();
            showStatus("success", "Deleted from " + count + " segment(s).");
        } else {
            showStatus("warning", "No matches found.");
        }
    }

    async function finalizeOutput(segments, outputOptions, clipIdx) {
        try {
            var srtPath = "";
            var clip = BatchSession.clips[clipIdx];
            var timestamp = new Date().getTime();
            var safeName = clip.name ? clip.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "clip";
            var uniqueFilename = safeName + "_captions_" + timestamp;

            if (outputOptions.includes("text_layers") && !cancelled) {
                setProgressStep("Creating text layers for " + clip.name + "...");
                var isPPro = csInterface && csInterface.getHostEnvironment().appId === "PPRO";
                if (isPPro) {
                    var projectFolder = await evalScriptAsync("getProjectFolder()");
                    var srtResult = await evalScriptAsync(
                        "exportSRT('" + escapeJSXString(JSON.stringify(segments)) + "', '" + escapeJSX(projectFolder) + "', '" + uniqueFilename + ".srt')"
                    );
                    var srtData = JSON.parse(srtResult);
                    if (srtData.error) {
                        showStatus("warning", srtData.error);
                    } else {
                        srtPath = srtData.path;
                        var importResult = await evalScriptAsync("importFileToProject('" + escapeJSX(srtPath) + "')");
                        var importData = JSON.parse(importResult);
                        if (importData.error) {
                            showStatus("warning", "Failed to import SRT to Project Bin: " + importData.error);
                        }
                    }
                } else {
                    var textType = "point";
                    var layerResult = await evalScriptAsync(
                        "createTextLayers('" + escapeJSXString(JSON.stringify(segments)) + "', '" + textType + "')"
                    );
                    var layerData = JSON.parse(layerResult);
                    if (layerData.error) {
                        showStatus("warning", layerData.error);
                    }
                }
                setProgressBar(90);
            }

            if (outputOptions.includes("srt_export") && !cancelled) {
                setProgressStep("Exporting SRT for " + clip.name + "...");
                var srtResult = await evalScriptAsync(
                    "exportSRTWithDialog('" + escapeJSXString(JSON.stringify(segments)) + "', '" + uniqueFilename + "')"
                );
                var srtData = JSON.parse(srtResult);
                if (srtData.error) {
                    showStatus("warning", "SRT export error: " + srtData.error);
                } else if (!srtData.cancelled) {
                    if (!srtPath) srtPath = srtData.path;
                }
                setProgressBar(95);
            }

            BatchSession.isEditorOpen = false;
            cleanupClipMemory(clipIdx);
            tryOpenEditor();

        } catch (err) {
            showStatus("error", "Error exporting clip: " + err.message);
            BatchSession.isEditorOpen = false;
            cleanupClipMemory(clipIdx);
            tryOpenEditor();
        }
    }

    // ------------------------------------------
    // STT \u2014 Speech to Text
    // ------------------------------------------
    async function runSTT(audioBase64, provider, sourceLang, apiKey, captionStyle) {
        // Decode base64 to binary
        var audioBlob;
        if (typeof Buffer !== 'undefined') {
            var buffer = Buffer.from(audioBase64, 'base64');
            audioBlob = new Blob([new Uint8Array(buffer)], { type: "audio/mpeg" });
        } else {
            var res = await fetch("data:audio/mpeg;base64," + audioBase64);
            audioBlob = await res.blob();
        }

        console.log("[Captiongrit] Audio blob size: " + (audioBlob.size / 1024).toFixed(1) + " KB (" + (audioBlob.size / 1024 / 1024).toFixed(2) + " MB)");

        var words = [];

        if (provider === "elevenlabs") {
            words = await sttElevenLabs(audioBlob, apiKey, sourceLang);
        } else if (provider === "deepgram") {
            words = await sttDeepgram(audioBlob, apiKey, sourceLang);
        }

        console.log("[Captiongrit] STT returned " + words.length + " words");
        if (words.length > 0) {
            var lastWord = words[words.length - 1];
            console.log("[Captiongrit] Last word: '" + lastWord.word + "' ends at " + lastWord.end + "s");
        }

        // Filter out empty/whitespace words that STT sometimes returns as pause tokens
        words = words.filter(function (w) {
            return w.word && w.word.trim().length > 0;
        });

        // Clean raw STT segments (merges split words, removes punctuation/zero-duration)
        words = cleanRawSTTSegments(words);

        // Apply phonetic corrections
        words = applyPhoneticCorrections(words);

        console.log("[Captiongrit] After filtering empty words: " + words.length + " words remain");

        // Group words into segments according to selected style
        return groupWordsIntoSegments(words, captionStyle);
    }

    async function sttElevenLabs(audioBlob, apiKey, sourceLang) {
        var formData = new FormData();
        formData.append("file", audioBlob, "audio.mp3");
        formData.append("model_id", "scribe_v1");
        if (sourceLang && sourceLang !== "auto") {
            formData.append("language_code", sourceLang);
        }

        var resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
            method: "POST",
            headers: { "xi-api-key": apiKey },
            body: formData
        });

        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error("ElevenLabs STT error (" + resp.status + "): " + errText);
        }

        var data = await resp.json();
        // data.words: [{text, start, end, ...}]
        if (data.words && data.words.length > 0) {
            return data.words.map(function (w) {
                return { word: w.text, start: w.start, end: w.end };
            });
        }
        // Fallback: split text by words with estimated timing
        if (data.text) {
            return estimateWordTimings(data.text, 0, data.duration || 60);
        }
        return [];
    }

    async function sttDeepgram(audioBlob, apiKey, sourceLang) {
        var isAuto = (!sourceLang || sourceLang === "auto");
        var model = "nova-2";
        // Nova-2 natively supports these. For other regional languages, fallback to whisper.
        var nova2Langs = ["en", "es", "fr", "de", "pt", "ja", "ko", "nl", "it", "sv", "ru", "tr", "uk", "pl", "id", "zh", "da", "hi", "ta", "th", "vi", "ar"];
        if (!isAuto && !nova2Langs.includes(sourceLang)) {
            model = "whisper-large";
        }

        var url = "https://api.deepgram.com/v1/listen?model=" + model + "&timestamps=true&utterances=true";
        if (!isAuto) {
            url += "&language=" + sourceLang;
        } else {
            url += "&detect_language=true";
        }

        var resp = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": "Token " + apiKey,
                "Content-Type": "audio/mpeg"
            },
            body: audioBlob
        });

        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error("Deepgram STT error (" + resp.status + "): " + errText);
        }

        var data = await resp.json();
        var words = [];
        try {
            var dgWords = data.results.channels[0].alternatives[0].words;
            words = dgWords.map(function (w) {
                return { word: w.word, start: w.start, end: w.end };
            });
        } catch (e) {
            throw new Error("Deepgram returned unexpected format.");
        }
        return words;
    }

    // ------------------------------------------
    // Close Gaps Between Captions
    // ------------------------------------------
    function closeGaps(segments) {
        if (!segments || segments.length < 2) return segments;
        for (var i = 0; i < segments.length - 1; i++) {
            segments[i].end = segments[i + 1].start;
        }
        return segments;
    }

    // ------------------------------------------
    // Clean Raw STT Segments
    // ------------------------------------------
    function cleanRawSTTSegments(segments) {
        var COMMON_WORDS = new Set([
            "plugin", "download", "downloading", "downloaded", "website", "websites", "external",
            "instagram", "youtube", "premiere", "automatic", "automatically", "subtitle", "subtitles",
            "caption", "captions", "format", "template", "timeline", "workflow", "software", "hardware",
            "keyboard", "screenshot", "background", "foreground", "overlay", "because", "problem",
            "solution", "comment", "subscribe", "notification", "channel", "facebook", "google",
            "mobile", "online", "offline", "account", "password", "install", "installing", "installed",
            "delete", "deleting", "import", "importing", "export", "exporting", "update", "updating",
            "updated", "create", "creating", "settings", "anywhere", "something", "everything",
            "nothing", "everyone", "someone", "anyone", "somewhere", "otherwise",
            "whatever", "whenever", "wherever", "whoever", "however", "therefore", "together",
            "another", "already", "always", "around", "before", "behind", "between", "without",
            "within", "through", "throughout", "although", "become", "becoming",
            "beginning", "believe", "beneath", "beside", "beyond", "certain", "complete",
            "completely", "connect", "continue", "control", "convert", "correct", "couple",
            "current", "default", "define", "depend", "describe", "design", "develop",
            "difference", "different", "direct", "directly", "disable", "display", "divide"
        ]);

        var punctRegex = /^[\.,!\?\-\u2013\s]+$/;
        var validSegments = [];

        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (seg.start === seg.end) continue;

            var text = seg.original !== undefined ? seg.original : (seg.word !== undefined ? seg.word : "");
            if (punctRegex.test(text.trim())) continue;

            validSegments.push(seg);
        }

        var cleaned = [];
        var idx = 0;

        while (idx < validSegments.length) {
            var seg1 = validSegments[idx];
            var text1 = (seg1.original !== undefined ? seg1.original : seg1.word).trim();

            var gapThreshold = seg1.end > 1000 ? 80 : 0.080;
            var merged = false;

            if (idx < validSegments.length - 2) {
                var seg2 = validSegments[idx + 1];
                var seg3 = validSegments[idx + 2];
                var text2 = (seg2.original !== undefined ? seg2.original : seg2.word).trim();
                var text3 = (seg3.original !== undefined ? seg3.original : seg3.word).trim();

                var gap12 = seg2.start - seg1.end;
                var gap23 = seg3.start - seg2.end;

                if (gap12 >= 0 && gap12 < gapThreshold && gap23 >= 0 && gap23 < gapThreshold) {
                    var combined = (text1 + text2 + text3).toLowerCase();
                    if (COMMON_WORDS.has(combined)) {
                        var newSeg = Object.assign({}, seg1);
                        if (newSeg.original !== undefined) newSeg.original = text1 + text2 + text3;
                        if (newSeg.word !== undefined) newSeg.word = text1 + text2 + text3;
                        newSeg.end = seg3.end;
                        cleaned.push(newSeg);
                        idx += 3;
                        merged = true;
                        continue;
                    }
                }
            }

            if (!merged && idx < validSegments.length - 1) {
                var seg2 = validSegments[idx + 1];
                var text2 = (seg2.original !== undefined ? seg2.original : seg2.word).trim();

                var gap12 = seg2.start - seg1.end;

                if (gap12 >= 0 && gap12 < gapThreshold) {
                    var combined = (text1 + text2).toLowerCase();
                    if (COMMON_WORDS.has(combined)) {
                        var newSeg = Object.assign({}, seg1);
                        if (newSeg.original !== undefined) newSeg.original = text1 + text2;
                        if (newSeg.word !== undefined) newSeg.word = text1 + text2;
                        newSeg.end = seg2.end;
                        cleaned.push(newSeg);
                        idx += 2;
                        merged = true;
                        continue;
                    }
                }
            }

            if (!merged) {
                cleaned.push(seg1);
                idx++;
            }
        }

        return cleaned;
    }

    // ------------------------------------------
    // Phonetic Correction Dictionary
    // ------------------------------------------
    var PHONETIC_CORRECTIONS = {
        // -- Articles, Pronouns, Prepositions (th\u2192d, w\u2192v, vowel shifts) --
        "di": "the", "de": "the", "da": "the", "duh": "the", "dhe": "the",
        "dat": "that", "dhat": "that", "det": "that",
        "dis": "this", "diz": "this", "dhis": "this",
        "der": "there", "dere": "there", "dher": "there",
        "dey": "they", "dhey": "they",
        "dem": "them", "dhem": "them",
        "den": "then", "dhen": "then",
        "dese": "these", "dhese": "these",
        "doze": "those", "dhoze": "those",
        "yu": "you", "yoo": "you", "u": "you",
        "tu": "to", "tuu": "too",
        "iz": "is", "iss": "is",
        "aar": "are", "ar": "are",
        "vas": "was", "vaz": "was",
        "vere": "were", "ver": "were",
        "hav": "have", "hev": "have", "haav": "have",
        "hez": "has", "haz": "has",
        "aaf": "of", "af": "of", "oph": "of",
        "phar": "for", "phor": "for", "far": "for",
        "vit": "with", "vid": "with", "wid": "with", "wth": "with",
        "vitout": "without", "vidout": "without",
        "eet": "it", "eet's": "it's",

        // -- Common verbs --
        "ken": "can", "kan": "can", "kaan": "can",
        "kud": "could", "cud": "could", "coud": "could",
        "shud": "should", "shoud": "should",
        "vud": "would", "wud": "would", "woud": "would",
        "vil": "will", "veel": "will", "weel": "will",
        "du": "do", "doo": "do",
        "naat": "not", "nat": "not",
        "dont": "don't", "donot": "do not",
        "didnt": "didn't",
        "doesnt": "doesn't",
        "kam": "come", "kum": "come",
        "kaming": "coming", "kuming": "coming",
        "giv": "give", "geev": "give",
        "mek": "make", "maek": "make",
        "tek": "take", "taek": "take",
        "tink": "think", "thingk": "think",
        "ting": "thing", "thng": "thing",
        "tings": "things",
        "noo": "know", "noe": "know",
        "tru": "through", "throo": "through",
        "gat": "got", "gaat": "got",
        "vant": "want", "vaant": "want",
        "nid": "need", "nead": "need",
        "yuz": "use", "yooz": "use",
        "yoojing": "using", "yuzing": "using",
        "vork": "work", "werk": "work",
        "vorking": "working",
        "luk": "look", "luke": "look",
        "lukking": "looking",
        "sho": "show", "shov": "show",
        "lisin": "listen", "lisan": "listen",
        "opan": "open", "opn": "open",
        "kloz": "close", "cloze": "close",
        "stap": "stop", "staap": "stop",
        "staart": "start",
        "laarn": "learn", "larn": "learn",
        "larning": "learning",

        // -- 'be-' prefix words (bi-/bhi-) --
        "bikaaj": "because", "bikaz": "because", "bikoz": "because",
        "bekaz": "because", "becuz": "because", "bekoz": "because", "becoz": "because",
        "bikos": "because", "bikaus": "because", "bikaus": "because",
        "bikam": "become", "bÐ¸ÐºÐ°Ð¼": "become", "bikum": "become",
        "bikaming": "becoming",
        "bifor": "before", "biphor": "before", "bifore": "before",
        "biliv": "believe", "bilieve": "believe", "bileev": "believe",
        "bitvin": "between", "bitween": "between", "bitveen": "between",
        "bigin": "begin", "bighin": "begin",
        "bihynd": "behind", "bihaind": "behind",
        "bilo": "below", "bilow": "below",

        // -- Common nouns/adjectives --
        "peepul": "people", "pepol": "people", "peeple": "people", "peepol": "people",
        "prablam": "problem", "prablm": "problem", "prablmz": "problems", "problam": "problem",
        "egjaampil": "example", "igjaampil": "example", "eksampul": "example", "exampal": "example",
        "hyuuman": "human", "huuman": "human",
        "beengs": "beings", "beengz": "beings",
        "risoaurces": "resources", "risorsez": "resources", "risorces": "resources",
        "risors": "resource", "risorce": "resource",
        "maindsed": "mindset", "maindset": "mindset",
        "skilz": "skills", "skil": "skill",
        "dubul": "double", "dubal": "double",
        "mobail": "mobile", "mobaile": "mobile",
        "phansy": "fancy", "phensy": "fancy",
        "dakktars": "doctors", "daktars": "doctors", "daktar": "doctor",
        "mani": "money", "moni": "money", "munny": "money",
        "bisnis": "business", "biznez": "business", "biznes": "business",
        "kumpani": "company", "compny": "company",
        "teknoloji": "technology", "teknolagy": "technology",
        "edyukeshun": "education", "educashun": "education",
        "informeshun": "information", "informashun": "information",
        "govermant": "government", "goverment": "government",
        "laif": "life", "lyf": "life",
        "taim": "time", "tym": "time",
        "vorld": "world", "warld": "world",
        "paysa": "money", "paisa": "money",

        // -- Adverbs/Adjectives --
        "veri": "very", "vairy": "very",
        "mach": "much", "moch": "much",
        "jast": "just", "jost": "just",
        "moor": "more", "mor": "more",
        "onlee": "only", "onli": "only",
        "rilli": "really", "realy": "really", "relly": "really", "reely": "really",
        "aktullee": "actually", "actully": "actually", "akchually": "actually", "actualy": "actually",
        "basikly": "basically", "basicly": "basically",
        "defnitly": "definitely", "definately": "definitely", "definatly": "definitely",
        "difrent": "different", "diffrent": "different",
        "intresting": "interesting",
        "importent": "important", "importnt": "important",
        "probly": "probably", "prolly": "probably", "probaly": "probably",
        "sam": "some", "som": "some",
        "bat": "but",
        "dan": "done",
        "van": "one", "wun": "one",
        "tvo": "two", "tuu": "two",
        "thrii": "three", "tri": "three",
        "faiv": "five", "fayv": "five",
        "nyu": "new", "nyoo": "new",
        "gud": "good", "guud": "good",
        "greit": "great", "graet": "great",
        "ferst": "first", "farst": "first",
        "evree": "every", "evri": "every",

        // -- Question words (w\u2192v) --
        "vat": "what", "wat": "what", "wut": "what",
        "ven": "when", "wen": "when",
        "vere": "where", "wer": "where", "wher": "where",
        "vy": "why", "vai": "why",
        "wich": "which", "vich": "which",
        "hu": "who", "hoo": "who",
        "hau": "how", "hov": "how",

        // -- Tech/digital vocabulary --
        "pase": "paste", "pased": "pasted", "pasing": "pasting",
        "kaapi": "copy", "kapi": "copy", "copi": "copy",
        "daunload": "download", "dawnload": "download", "dounlod": "download",
        "uplod": "upload", "uplode": "upload",
        "klick": "click", "clik": "click",
        "selekt": "select", "slect": "select",
        "buton": "button", "buttn": "button",
        "screne": "screen", "skreen": "screen",
        "opshun": "option", "opshon": "option",
        "feture": "feature", "feeture": "feature",
        "tipe": "type",
        "vebsite": "website", "websait": "website",
        "vedeo": "video", "vidio": "video",
        "laink": "link", "lnk": "link",
        "seting": "setting", "setings": "settings",
        "aps": "apps", "aap": "app",
        "saftver": "software", "softver": "software",
        "onlain": "online", "onlyn": "online",
        "soshal": "social", "soshul": "social",
        "midia": "media", "meedya": "media",
        "konten": "content", "kantent": "content",

        // -- Common phrases/misc --
        "helo": "hello", "hellow": "hello",
        "okey": "okay", "okei": "okay",
        "plees": "please", "pleez": "please", "plez": "please",
        "thenks": "thanks", "thenk": "thank",
        "sory": "sorry", "soree": "sorry",
        "somthing": "something", "sumthing": "something",
        "evrithing": "everything", "evrything": "everything",
        "nuthing": "nothing", "nothin": "nothing",
        "enitihing": "anything", "enithing": "anything",
        "abot": "about", "abowt": "about", "abaut": "about",
        "heving": "having", "havving": "having",
        "geting": "getting", "gitting": "getting",
        "teling": "telling", "tolding": "told",
        "ripering": "repairing", "riparing": "repairing",
        "devolop": "develop", "develap": "develop",
        "devolopment": "development", "developmant": "development",
        "minimam": "minimum", "minimm": "minimum",
        "maksimam": "maximum",
        "speshul": "special", "speshal": "special",
        "generul": "general", "jeneral": "general",
        "sukses": "success", "suksesful": "successful",
        "ekspiriens": "experience", "eksperiance": "experience",

        // -- Because (extended variants) --
        "bikaj": "because", "bikayu": "because", "bikas": "because",
        "bikuz": "because", "bikus": "because", "bikos": "because",
        "bicoz": "because", "bicuz": "because", "becaj": "because",
        "bcoz": "because", "bcuz": "because", "bcaz": "because",

        // -- Business (extended) --
        "bijines": "business", "bijnes": "business", "bijiness": "business",
        "bijnes": "business", "bijinis": "business", "bijnez": "business",

        // -- Capability / Capacity --
        "kepaabiliti": "capability", "kepaabiliiti": "capability",
        "kepabiliti": "capability", "kepaabilit": "capability",
        "kapabiliti": "capability", "kepaabilty": "capability",
        "kapasiti": "capacity", "kepaasiti": "capacity",

        // -- Taking / Talking / Making (accent -ing verbs) --
        "teking": "taking", "taeking": "taking", "taiking": "taking",
        "taakin": "talking", "taakinng": "talking", "toking": "talking",
        "meking": "making", "maeking": "making",

        // -- Western / Eastern / Northern / Southern --
        "vestern": "western", "vestn": "western",
        "eestern": "eastern", "eestn": "eastern",
        "naardern": "northern", "sadern": "southern",

        // -- Language --
        "laangvej": "language", "langvej": "language",
        "laanguej": "language", "languej": "language",
        "langvij": "language", "laangvij": "language",

        // -- Bootstrap --
        "boosttrap": "bootstrap", "boostrap": "bootstrap",
        "bootstarap": "bootstrap", "bootsttrap": "bootstrap",

        // -- Companies / Company --
        "kampanees": "companies", "kampanies": "companies",
        "kompanees": "companies", "kampani": "company",
        "kompani": "company", "kumpanees": "companies",

        // -- Nobody / Somebody / Everybody / Anybody --
        "nobadi": "nobody", "nobady": "nobody", "nobaadi": "nobody",
        "sumbadi": "somebody", "sumbady": "somebody",
        "evribadi": "everybody", "evribady": "everybody",
        "enibadi": "anybody", "enibady": "anybody",

        // -- Calculate / Calculator / Calculation --
        "kaalkuleit": "calculate", "kalkuleit": "calculate",
        "kalkuletar": "calculator", "kaalkulater": "calculator",
        "kaalkulatar": "calculator", "kalkulator": "calculator",
        "kaalkuleshan": "calculation", "kalkuleshan": "calculation",
        "kalkuleshun": "calculation",

        // -- Infrastructure / Structure --
        "infrastakraachar": "infrastructure", "infrastkrachar": "infrastructure",
        "infrastrukchar": "infrastructure", "infrastrakchar": "infrastructure",
        "infrastakchar": "infrastructure", "infrastrachur": "infrastructure",
        "strakchar": "structure", "strukchar": "structure",

        // -- Fast / First / Last / Past --
        "phast": "fast", "phaast": "fast", "faast": "fast",
        "phastu": "first", "phirst": "first", "furst": "first",
        "laast": "last", "laasht": "last",
        "paast": "past",

        // -- Year / Near / Hear / Clear --
        "eeyar": "year", "yiyaar": "year", "iyar": "year",
        "yiar": "year", "yeer": "year", "yeear": "year",
        "neer": "near", "niar": "near",
        "heer": "hear", "hiar": "hear",
        "kleer": "clear", "kliar": "clear",

        // -- Second / Third --
        "sekand": "second", "sekond": "second", "seknd": "second",
        "thard": "third", "thrd": "third",

        // -- Half / Behalf --
        "haaf": "half", "haalf": "half",
        "bihaaf": "behalf",

        // -- Nearly / Really / Finally / Mostly --
        "nirlie": "nearly", "nirllee": "nearly", "nirly": "nearly", "neerli": "nearly",
        "phainali": "finally", "phainally": "finally", "fainalee": "finally",
        "moastli": "mostly", "moastlee": "mostly",

        // -- Made / Paid / Said / Trade --
        "meid": "made", "maed": "made",
        "peid": "paid", "paed": "paid",
        "sed": "said", "saed": "said",
        "treid": "trade", "traed": "trade",

        // -- Hard / Card / Guard / Regard --
        "haard": "hard", "haad": "hard",
        "kaard": "card", "gaard": "guard",
        "rigaard": "regard",

        // -- Style / While / File / Trial --
        "stail": "style", "stile": "style",
        "phail": "file", "fiale": "file",
        "traiyal": "trial", "traial": "trial",

        // -- Hustle / Muscle / Struggle --
        "hastal": "hustle", "hastle": "hustle",
        "masal": "muscle", "masle": "muscle",
        "stragal": "struggle", "stragle": "struggle",

        // -- Care / Share / Prepare / Compare --
        "keir": "care", "kair": "care",
        "sheir": "share", "shair": "share",
        "pripaer": "prepare", "pripar": "prepare", "priper": "prepare",
        "kampaer": "compare", "kampar": "compare",

        // -- Deal / Real / Feel / Meal --
        "deel": "deal", "diel": "deal",
        "reel": "real", "riel": "real",
        "pheel": "feel", "fiel": "feel",
        "meel": "meal", "miel": "meal",

        // -- All / Call / Fall / Small --
        "aal": "all",
        "kaal": "call", "kol": "call",
        "phaal": "fall", "faal": "fall",
        "smaal": "small", "smol": "small",

        // -- Mark / Market / Marketer / Marketing --
        "maark": "mark", "maarket": "market",
        "maarketer": "marketer", "maarkitar": "marketer",
        "maarketing": "marketing", "maarkiting": "marketing",

        // -- Rotation / Station / Nation / Situation --
        "roteshan": "rotation", "roteshun": "rotation",
        "steshan": "station", "steshun": "station",
        "neshan": "nation", "neshun": "nation",
        "sichuveshan": "situation", "situeshan": "situation",
        "situeshun": "situation",

        // -- Easy / Busy / Lazy / Crazy --
        "eejee": "easy", "ijee": "easy", "eezee": "easy",
        "bijee": "busy", "buzee": "busy",
        "lejee": "lazy", "layzee": "lazy",
        "kreejee": "crazy", "krayzee": "crazy",

        // -- Was (extended) --
        "vaas": "was", "waas": "was",

        // -- Knowledge / Acknowledge --
        "naaledj": "knowledge", "naalej": "knowledge",
        "nolej": "knowledge", "noledj": "knowledge",
        "naaledjj": "knowledge",

        // -- Discipline / Principle --
        "disiplin": "discipline", "disipline": "discipline",
        "dissiplin": "discipline",
        "prinsipul": "principle", "prinsiple": "principle",

        // -- Reinvest / Invest / Investment --
        "reeinvesht": "reinvest", "reeinvest": "reinvest",
        "reinvesht": "reinvest",
        "invesht": "invest", "inveshment": "investment",
        "inveshmant": "investment", "investmant": "investment",

        // -- Complicate / Complicated --
        "komplikeit": "complicate", "komplikait": "complicate",
        "kompliketed": "complicated", "komplikaited": "complicated",

        // -- Increase / Decrease --
        "inkreez": "increase", "inkreese": "increase",
        "inkrease": "increase", "inkriis": "increase",
        "dikreez": "decrease", "dikreese": "decrease",

        // -- Standard / Understand --
        "standerd": "standard", "standrd": "standard", "staandard": "standard",
        "anderstend": "understand", "andastand": "understand",
        "andarsttend": "understand",

        // -- Age / Stage / Page / Manage --
        "eej": "age",
        "steej": "stage", "staej": "stage",
        "peej": "page", "paej": "page",
        "maenej": "manage", "manij": "manage",

        // -- Crore / Lakh (Indian English number terms) --
        "kroram": "crore", "krod": "crore", "kror": "crore",
        "krore": "crore", "koror": "crore",

        // -- Earn / Learn / Return --
        "arn": "earn", "arj": "earn", "ern": "earn",
        "ritarn": "return", "reetarn": "return",

        // -- Change / Chance / Challenge --
        "cheinj": "change", "chaenj": "change",
        "chaans": "chance", "chans": "chance",
        "chalenj": "challenge", "chaalenj": "challenge",

        // -- Possible / Impossible / Available --
        "paasibul": "possible", "posibul": "possible",
        "impaasibul": "impossible", "imposibul": "impossible",
        "aveelebul": "available", "availabul": "available",

        // -- Percent / Perfect / Performance --
        "parsent": "percent", "parsant": "percent",
        "parpekt": "perfect", "parphekt": "perfect",
        "parphormanss": "performance", "parfarmance": "performance",

        // -- Plan / Brand / Grand / Demand --
        "plaan": "plan", "plaan": "plan",
        "braand": "brand", "graand": "grand",
        "dimaand": "demand", "dimand": "demand",

        // -- Process / Progress / Product / Project --
        "praases": "process", "proses": "process",
        "prograss": "progress", "pragres": "progress",
        "praadakt": "product", "produkt": "product",
        "praajekt": "project", "projakt": "project",

        // -- Quality / Quantity --
        "kaaliti": "quality", "kwaaliti": "quality",
        "kwaantiti": "quantity", "kwontiti": "quantity",

        // -- Profit / Benefit / Result --
        "praphit": "profit", "praphiT": "profit",
        "benifit": "benefit", "benipfit": "benefit",
        "rijalt": "result", "risalt": "result",

        // -- Focus / Service / Office --
        "phokas": "focus", "fokas": "focus",
        "sarvis": "service", "sarves": "service",
        "aafis": "office", "aaphiss": "office",

        // -- Strategy / Industry / History / Category --
        "straetuji": "strategy", "straatiji": "strategy",
        "indastri": "industry", "industree": "industry",
        "histree": "history", "histaree": "history",
        "kaetgori": "category", "kaatagori": "category",

        // -- Opportunity / Community / Ability --
        "aportooniti": "opportunity", "aportunitee": "opportunity",
        "kamyoonitee": "community", "kamunitee": "community",
        "abiliti": "ability", "aabiliti": "ability",

        // -- Customer / Consumer --
        "kastamar": "customer", "kustamar": "customer",
        "kansoomar": "consumer", "konsumer": "consumer",

        // -- Revenue / Value / Issue --
        "revenyoo": "revenue", "revnoo": "revenue",
        "vaalyoo": "value", "valyoo": "value",
        "ishyoo": "issue", "isshoo": "issue"
    };

    function applyPhoneticCorrections(words) {
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            var text = (w.word || w.original || "").trim();
            // Strip trailing punctuation for lookup, preserve it for output
            var punctMatch = text.match(/^(.*?)([.,!?;:]+)$/);
            var bareWord = punctMatch ? punctMatch[1] : text;
            var trailingPunct = punctMatch ? punctMatch[2] : "";

            var lower = bareWord.toLowerCase();

            // Layer 1: Static dictionary (fast, exact match)
            if (PHONETIC_CORRECTIONS[lower]) {
                var corrected = PHONETIC_CORRECTIONS[lower] + trailingPunct;
                if (w.word !== undefined) w.word = corrected;
                if (w.original !== undefined) w.original = corrected;
                continue;
            }

            // Layer 2+3: Dynamic phonetic matching (rule-based + fuzzy)
            var dynamicMatch = dynamicPhoneticMatch(lower);
            if (dynamicMatch) {
                var corrected = dynamicMatch + trailingPunct;
                if (w.word !== undefined) w.word = corrected;
                if (w.original !== undefined) w.original = corrected;
            }
        }
        return words;
    }

    // ------------------------------------------
    // Dynamic Phonetic Correction Engine
    // ------------------------------------------
    // Algorithmically reverses Indian accent patterns to recover English words.
    // Works by: (1) applying phonetic transformation rules to generate candidates,
    //           (2) validating candidates against a known English word set,
    //           (3) falling back to consonant-skeleton fuzzy matching.

    // -- Common English words for validation --
    // Includes top conversational vocabulary + business/tech/education terms
    var COMMON_ENGLISH_WORDS = new Set((
        // Core function words
        "the be to of and a in that have i it for not on with he as you do at " +
        "this but his by from they we say her she or an will my one all would there " +
        "their what so up out if about who get which go me when make can like time no " +
        "just him know take people into year your good some could them see other than " +
        "then now look only come its over think also back after use two how our work " +
        "first well way even new want because any these give day most us been many " +
        "before between both each find long much more number way such here those own " +
        // Common verbs
        "ask become begin believe bring build buy call carry change check choose " +
        "close come continue create cut decide describe develop die discover do draw " +
        "drive drop eat enjoy establish expect explain fail fall feel fight fill find " +
        "finish fly follow forget forgive get give go grow happen hate have hear help " +
        "hide hit hold hope hurt imagine include increase indicate involve join jump " +
        "keep kill know laugh lead learn leave let lie listen live lose love make " +
        "manage mean meet mention move need notice offer open order pay perform pick " +
        "place plan play point prepare present prevent produce promise protect prove " +
        "provide pull push put raise reach read realize receive recognize recommend " +
        "reduce reflect relate remain remember remove repeat replace report represent " +
        "require research respond result return reveal rise run save say search seek " +
        "seem sell send serve set share shoot should show sing sit sleep solve speak " +
        "spend stand start stay stop study succeed suggest support suppose survive " +
        "take talk teach tell tend test think throw touch train travel treat try turn " +
        "understand use visit wait walk want watch wear win wish wonder work worry write " +
        // Common nouns
        "account action activity age agreement air amount analysis answer application " +
        "approach area argument article attention authority baby bank base behavior " +
        "belief benefit billion bit blood board body book box boy brother budget " +
        "building bus business camera campaign capital car card care career case cause " +
        "cell center century chair challenge chance change chapter character charge " +
        "check child choice church citizen city claim class close coach cold collection " +
        "college color community company computer condition conference control cost " +
        "country couple course court cover crime cultural cup customer damage data " +
        "daughter day deal death debate decision degree demand department design " +
        "development difference direction director discussion disease doctor dog door " +
        "dream drive drug during edge education effect effort election employee end " +
        "energy environment especially establish evidence example executive exercise " +
        "experience expert eye face fact factor family fan father fear field fight " +
        "figure film final finger firm fish floor fly focus food foot force form friend " +
        "front fund future game garden generation girl glass goal government growth " +
        "guess gun guy hair half hand head health heart heat help herself history hit " +
        "hope hospital hotel hour house husband idea image impact important improve " +
        "include increase indicate individual industry information inside institution " +
        "interest international interview investment island issue item job join key " +
        "kid kind kitchen knowledge land language large late law lawyer leader level " +
        "lie life light line list loss lot love machine magazine main maintain majority " +
        "management manager mark market marriage material matter maybe measure media " +
        "medical meeting member memory message method middle military million mind " +
        "minute mission model modern moment money month morning mother mouth movement " +
        "movie music name nation nature near necessary network news newspaper night none " +
        "north note nothing notice number occur office officer oil operation opportunity " +
        "option order organization outside owner page pain pair paper parent part " +
        "participant particular partner party patient pattern pay peace people percent " +
        "performance period person phone physical picture piece place plan plant player " +
        "pm point police policy political population position positive possible power " +
        "practice prepare present president pressure price private problem process " +
        "produce product production professional professor program project property " +
        "protect prove provide public purpose push quality question quickly quite race " +
        "radio range rate reach read ready real reality realize reason receive recent " +
        "record reduce reflect region relate relationship religious remain remember " +
        "remove report represent require research resource respond response rest " +
        "result return reveal revenue right risk rock role room rule run safe sale same " +
        "save scene school science score season seat second section security seek sell " +
        "senior sense series serious serve service shake share she shoot short shot " +
        "shoulder show side sign significant similar simple simply single sister site " +
        "situation size skill skin small smile society soldier someone son song sort " +
        "sound source south southern space speak special specific speech sport spring " +
        "staff stage standard star start state statement station status stay step stock " +
        "stop store story strategy street strong structure student study stuff style " +
        "subject success suggest summer support sure surface system table task tax " +
        "teacher team technology television tell tend term test thank theory thing " +
        "third threat through throughout throw thus time today together tonight top " +
        "total tough toward town trade traditional training travel treat treatment " +
        "trial trip trouble truth turn tv type under understand unit until upon usually " +
        "value various very victim view violence visit voice vote wait walk wall want " +
        "war watch water way weapon wear week weight west western white whole whose " +
        "wide wife win window wish within without woman wonder word worker world worry " +
        "worth write wrong yard yeah yesterday young yourself youth zero zone " +
        // Business / Finance / Marketing
        "profit revenue salary income expense budget invest investor investment " +
        "reinvest startup hustle bootstrap brand marketing marketer advertise " +
        "advertisement customer consumer client target audience engagement growth " +
        "strategy scale scalable funding venture capital founder entrepreneur " +
        "freelancer freelance portfolio asset liability equity dividend stock share " +
        "inflation recession supply demand wholesale retail margin turnover " +
        "ecommerce commerce transaction payment subscription plan premium discount " +
        "coupon offer loan mortgage interest rate credit debit savings wealth crore " +
        "lakh rupee dollar currency exchange valuation acquisition merger partnership " +
        "negotiation contract agreement deal proposal pitch presentation stakeholder " +
        "shareholder board director ceo manager employee team hire recruit talent " +
        "resign promotion appraisal bonus incentive commission passive " +
        // Technology / Digital
        "software hardware computer laptop mobile phone smartphone tablet internet " +
        "website webpage browser download upload install update upgrade version " +
        "application app platform server database cloud storage backup recovery " +
        "security password encryption firewall virus malware bug fix patch deploy " +
        "deployment infrastructure network bandwidth server domain hosting email " +
        "notification algorithm automation machine learning artificial intelligence " +
        "blockchain cryptocurrency digital online offline virtual reality augmented " +
        "plugin extension framework library code coding programming developer " +
        "frontend backend fullstack api integration feature function module " +
        "component interface dashboard analytics metric tracking pixel conversion " +
        "optimization search engine rank page traffic organic content creator " +
        "influencer subscriber follower thumbnail channel playlist stream streaming " +
        "podcast blog vlog post caption subtitle transcription audio video render " +
        "resolution format compress export import template preset filter effect " +
        "transition animation timeline preview composition layer mask keyframe " +
        // Education / Skills
        "education student teacher professor university college school degree " +
        "diploma certificate course curriculum syllabus lecture seminar workshop " +
        "training tutorial lesson assignment homework exam test grade score " +
        "scholarship research thesis dissertation publication journal conference " +
        "knowledge skill talent ability capability capacity competence discipline " +
        "focus concentration mindset motivation inspiration determination patience " +
        "practice experience expertise qualification career profession occupation " +
        // Adjectives / Descriptors
        "able absolute actual additional advanced afraid aggressive amazing annual " +
        "appropriate automatic available average aware basic beautiful best better " +
        "big bright brilliant broad busy capable careful certain cheap clean clear " +
        "clever comfortable commercial common competitive complete complex concerned " +
        "confident consistent constant cool correct crazy creative critical crucial " +
        "current dangerous dark dead deep democratic dependent desperate different " +
        "difficult digital direct dirty double dramatic due early eastern easy " +
        "economic effective efficient electronic emotional empty enormous entire " +
        "environmental equal essential excellent exciting existing expensive external " +
        "extra extreme fair familiar famous fantastic fast favorite federal female " +
        "few final financial foreign formal former forward free frequent fresh front " +
        "full fundamental funny future general genuine global golden grand great " +
        "green growing guilty half happy hard healthy heavy helpful hidden high " +
        "historical honest horrible hot huge human hungry ideal illegal immediate " +
        "important impossible impressive independent individual industrial " +
        "inevitable initial inner innocent intelligent interested interesting " +
        "internal international joint junior key large last late leading left legal " +
        "legitimate liberal likely limited living local logical lonely long lost low " +
        "lucky mad main major male massive maximum medical mental middle military " +
        "minimum minor modern moral multiple narrow national natural nearby necessary " +
        "negative nervous next nice normal northern obvious official old only open " +
        "original other outside overall own particular past patient perfect permanent " +
        "personal physical plain pleasant political poor popular positive possible " +
        "potential powerful practical pregnant present previous primary prime prior " +
        "private professional proper psychological public pure quick quiet racial " +
        "radical random rapid rare raw ready real realistic reasonable recent regular " +
        "relevant religious remote responsible rich right rough round rural sad safe " +
        "secure senior separate serious severe sharp short sick significant silent " +
        "silly similar simple single slight slow small smart smooth soft solid sorry " +
        "southern special specific spiritual stable standard steady strange strict " +
        "strong stupid subsequent substantial successful sudden sufficient suitable " +
        "super sure surprised suspicious sweet terrible thick thin tiny top total " +
        "tough traditional tremendous typical ugly unable unique united unlikely " +
        "unusual upper upset urban useful usual valid valuable vast very violent " +
        "visible visual vital warm weak wealthy weekly weird welcome western white " +
        "whole wide wild willing wise wonderful wooden worth wrong young " +
        // Adverbs / Connectors
        "absolutely actually additionally again ago ahead almost already also " +
        "always anyway apparently approximately basically briefly carefully " +
        "certainly clearly closely commonly completely constantly continuously " +
        "currently daily definitely deliberately directly effectively efficiently " +
        "elsewhere entirely equally especially essentially eventually exactly " +
        "exclusively extremely fairly finally frequently fully generally genuinely " +
        "gradually greatly hardly heavily honestly hopefully however immediately " +
        "increasingly independently initially instead largely literally mainly " +
        "merely moreover mostly naturally necessarily normally obviously occasionally " +
        "often originally otherwise overall particularly perfectly personally " +
        "physically potentially precisely previously primarily probably properly " +
        "purely quickly quietly rapidly rarely rather readily really recently " +
        "regularly relatively remarkably repeatedly seriously significantly " +
        "similarly simply slightly slowly somewhat soon specifically strongly " +
        "subsequently successfully suddenly sufficiently surely surprisingly " +
        "technically temporarily therefore thoroughly totally traditionally truly " +
        "typically ultimately unfortunately unfortunately unlikely usually virtually " +
        "widely"
    ).split(/\s+/).filter(Boolean));

    // -- Native language words blocklist (never correct these to English) --
    // Common Telugu, Hindi, and other Indian language words in romanized form
    var NATIVE_WORD_BLOCKLIST = new Set((
        // Telugu common words
        "mee nenu adi idi eppudu ela enduku ekkada maaku naaku vaadu aame " +
        "chesaaru chesaam chesaamo untadi vastundi vastunnaayi kaabatti mallee " +
        "kooda undi konchem baaga manchi pettukoni paisalu ammesi dabbulu " +
        "pedataanu kharchulaki gurtundi teliyadu chesaaranuko vachchindanuko " +
        "pothaayo pothaayi loki lokee eduku veelu yaabhai laksha lakshaa " +
        "roopayilato ruupaayalato ippudee kootlu aindo ayindo rendu moodu " +
        "aidu antoo antuu pettukooni vealainiti veilainito naa kaadiwi kaadivi " +
        "memu meem antedi anteedi vastadi maja loonu lonu kada chesinappudu " +
        "chesinapudu petteshtunnaam aipoiyindo chesaanu cheyadam chesi " +
        "undi ledhu ledu emiti enti meeru vaaru vaallu manamu manam " +
        "cheppandi cheppanu cheyandi cheyyandi raandi vellandi undandi " +
        "baagundi baagunnadi baagaundi chaalaa chaala manchidi " +
        // Hindi common words
        "kya hai kaise kab kaha kyo kaun yeh woh mein hum tum aap tera mera " +
        "uska iska ko se par magar lekin phir abhi sirf isliye kyunki " +
        "acha theek bahut bohot zyada kaam paisa paise log ladka ladki " +
        "ghar dost bhai behen baap maa beta beti dekho suno bolo chalo " +
        "achha sachchi wala waala bilkul zaroor pakka sahi galat nahi haan " +
        // Tamil common words
        "naan enna eppo eppadi yaar inge ange avar aval ivan ival sollunga " +
        "theriyum theriyaadhu vaanga ponga irukku illai romba nalla konjam " +
        // Kannada common words
        "naanu enu yavaga hegey yaaru illi alli avaru avalu ivanu ivalu " +
        "helu gotthu gottilla baari olleya"
    ).split(/\s+/).filter(Boolean));

    // -- Native Script Detection Utility --
    // Detects non-Latin characters (Telugu, Hindi, Tamil, Kannada, Malayalam, Bengali, etc.)

    // -- Phonetic accent reversal rules --
    // Each [regex, replacement] pair reverses a common Indian accent distortion.
    // Multiple rules may map to different English spellings (e.g., ee\u2192ea, ee\u2192e, ee\u2192i).
    var ACCENT_REVERSAL_RULES = [
        // Consonant shifts
        [/^ph/, 'f'],           // phast \u2192 fast
        [/ph/g, 'f'],           // aaphiss \u2192 afiss
        [/^v(?=[aeiou])/, 'w'], // vestern \u2192 western
        [/^dh/, 'th'],          // dhere \u2192 there
        [/^d(?=[aeiou])/, 'th'],// dis \u2192 this
        [/sht/g, 'st'],         // invesht \u2192 invest
        // Long vowel reduction
        [/aa/g, 'a'],           // haard \u2192 hard
        [/ee/g, 'ea'],          // deel \u2192 deal
        [/ee/g, 'e'],           // eejee \u2192 eje
        [/ee/g, 'i'],           // alternate
        [/oo/g, 'u'],           // alternate
        [/oo/g, 'o'],           // alternate
        [/ii/g, 'i'],           // kepaabiliiti
        [/uu/g, 'u'],           // alternate
        // Suffix transformations
        [/shan$/, 'tion'],      // roteshan \u2192 rotation
        [/shun$/, 'tion'],      // informashun \u2192 information
        [/iiti$/, 'ity'],       // kepaabiliiti \u2192 capability
        [/iti$/, 'ity'],        // kepabiliti \u2192 capability
        [/char$/, 'ture'],      // infrastakraachar \u2192 infrastructure
        [/cher$/, 'ture'],      // alternate
        [/eit$/, 'ate'],        // komplikeit \u2192 complicate
        [/ait$/, 'ate'],        // alternate
        [/eej$/, 'age'],        // steej \u2192 stage
        [/eez$/, 'ease'],       // inkreez \u2192 increase
        [/eez$/, 'eze'],        // alternate
        [/lee$/, 'ly'],         // basiklee \u2192 basikly
        [/li$/, 'ly'],          // alternate
        [/erd$/, 'ard'],        // standerd \u2192 standard
        [/mant$/, 'ment'],      // investmant \u2192 investment
        // Consonant normalizations
        [/k/g, 'c'],            // kaalkuleit \u2192 calculate
        [/j/g, 'g'],            // laangvej \u2192 language
        [/j/g, 'dg'],           // naaledj \u2192 knowledge
        [/j/g, 'z'],            // alternate
        [/j/g, 's'],            // bijines \u2192 bisines
        // Vowel shifts
        [/ai/g, 'y'],           // stail \u2192 style
        [/ei/g, 'a'],           // meid \u2192 made
    ];

    // -- Phonetic skeleton for fuzzy matching --
    function buildPhoneticSkeleton(word) {
        var w = word.toLowerCase();
        w = w.replace(/ph/g, 'f');
        w = w.replace(/k/g, 'c');
        w = w.replace(/z/g, 's');
        w = w.replace(/j/g, 's');
        w = w.replace(/x/g, 'cs');
        w = w.replace(/([bcdfghlmnpqrstvw])\1+/g, '$1');
        w = w.replace(/[aeiou]/g, '');
        return w;
    }

    // Precomputed skeleton \u2192 English words map (lazy init)
    var _skeletonToEnglish = null;
    function getSkeletonMap() {
        if (_skeletonToEnglish) return _skeletonToEnglish;
        _skeletonToEnglish = {};
        COMMON_ENGLISH_WORDS.forEach(function (word) {
            var sk = buildPhoneticSkeleton(word);
            if (!_skeletonToEnglish[sk]) _skeletonToEnglish[sk] = [];
            _skeletonToEnglish[sk].push(word);
        });
        return _skeletonToEnglish;
    }

    // -- Levenshtein distance --
    function levenshteinDistance(a, b) {
        var m = a.length, n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        var prev = new Array(n + 1);
        var curr = new Array(n + 1);
        for (var j = 0; j <= n; j++) prev[j] = j;
        for (var i = 1; i <= m; i++) {
            curr[0] = i;
            for (var j = 1; j <= n; j++) {
                curr[j] = Math.min(
                    prev[j] + 1,
                    curr[j - 1] + 1,
                    prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
            }
            var tmp = prev; prev = curr; curr = tmp;
        }
        return prev[n];
    }

    // -- Main dynamic matching function --
    function dynamicPhoneticMatch(word) {
        var lower = word.toLowerCase();

        // Skip short words (too ambiguous for dynamic matching)
        if (lower.length < 5) return null;

        // Skip if already a known English word
        if (COMMON_ENGLISH_WORDS.has(lower)) return null;

        // Skip if it's a native language word
        if (NATIVE_WORD_BLOCKLIST.has(lower)) return null;

        // === Layer 2: Rule-based candidate generation ===
        var candidates = new Set();
        var level1 = [];

        // Apply individual rules
        for (var r = 0; r < ACCENT_REVERSAL_RULES.length; r++) {
            var rule = ACCENT_REVERSAL_RULES[r];
            var result = lower.replace(rule[0], rule[1]);
            if (result !== lower) {
                candidates.add(result);
                level1.push(result);
            }
        }

        // Apply pairs of rules
        for (var i = 0; i < level1.length; i++) {
            for (var r = 0; r < ACCENT_REVERSAL_RULES.length; r++) {
                var rule = ACCENT_REVERSAL_RULES[r];
                var result = level1[i].replace(rule[0], rule[1]);
                if (result !== level1[i]) {
                    candidates.add(result);
                }
            }
        }

        // Apply triples (capped to prevent explosion)
        var level2 = Array.from(candidates);
        var limit = Math.min(level2.length, 80);
        for (var i = 0; i < limit; i++) {
            for (var r = 0; r < ACCENT_REVERSAL_RULES.length; r++) {
                var rule = ACCENT_REVERSAL_RULES[r];
                var result = level2[i].replace(rule[0], rule[1]);
                if (result !== level2[i]) {
                    candidates.add(result);
                }
            }
        }

        // Check candidates against English word set
        var exactMatches = [];
        candidates.forEach(function (c) {
            if (COMMON_ENGLISH_WORDS.has(c)) {
                exactMatches.push(c);
            }
        });

        if (exactMatches.length === 1) return exactMatches[0];
        if (exactMatches.length > 1) {
            // Multiple matches \u2014 pick the closest by edit distance
            var best = null, bestDist = Infinity;
            for (var i = 0; i < exactMatches.length; i++) {
                var d = levenshteinDistance(lower, exactMatches[i]);
                if (d < bestDist) { bestDist = d; best = exactMatches[i]; }
            }
            return best;
        }

        // === Layer 3: Skeleton-based fuzzy matching ===
        var skeleton = buildPhoneticSkeleton(lower);
        var skMap = getSkeletonMap();
        var skeletonCandidates = skMap[skeleton];

        if (skeletonCandidates && skeletonCandidates.length > 0) {
            var best = null, bestDist = Infinity;
            for (var i = 0; i < skeletonCandidates.length; i++) {
                var eng = skeletonCandidates[i];
                // Strict length filter to prevent false positives
                var lengthDiff = Math.abs(eng.length - lower.length);
                if (lengthDiff > Math.max(1, Math.floor(lower.length * 0.25))) continue;
                var d = levenshteinDistance(lower, eng);
                if (d < bestDist) { bestDist = d; best = eng; }
            }
            // Accept only if distance is small relative to word length
            var maxDist = Math.max(2, Math.floor(lower.length * 0.4));
            if (best && bestDist <= maxDist) return best;
        }

        return null;
    }


    // ------------------------------------------
    // Word \u2192 Segment Grouping
    // ------------------------------------------
    function groupWordsIntoSegments(words, style) {
        if (!words || words.length === 0) return [];

        var segments = [];

        if (style === "word_by_word") {
            // -- WORD BY WORD --
            // Each STT word token = one segment, no merging
            for (var i = 0; i < words.length; i++) {
                var w = words[i];
                if (!w.word || !w.word.trim()) continue;

                segments.push({
                    start: w.start,
                    end: w.end,
                    original: w.word.trim()
                });
            }

        } else if (style === "single_line") {
            // -- SINGLE LINE / NATURAL PHRASES --
            // Group words into short phrases, max 5 words per segment
            var MAX_WORDS = 5;
            var currentWords = [];
            var currentWordObjs = [];
            var segStart = words[0].start;

            for (var i = 0; i < words.length; i++) {
                var w = words[i];
                if (!w.word || !w.word.trim()) continue;

                currentWords.push(w.word.trim());
                currentWordObjs.push(w);

                var isLast = (i === words.length - 1);
                var gap = !isLast ? (words[i + 1].start - w.end) : 0;
                var hasPunctuation = /[.,!?;:]$/.test(w.word.trim());

                var breakSegment = false;
                if (isLast) breakSegment = true;
                else if (currentWords.length >= MAX_WORDS) breakSegment = true;
                else if (hasPunctuation) breakSegment = true;
                else if (gap >= 1.5) breakSegment = true;

                if (breakSegment) {
                    var joinedText = currentWords.join(" ");
                    joinedText = joinedText.replace(/\s+([.,!?])/g, '$1');
                    joinedText = joinedText.replace(/\s+/g, ' ').trim();

                    if (joinedText.length > 0) {
                        segments.push({
                            start: segStart,
                            end: currentWordObjs[currentWordObjs.length - 1].end,
                            original: joinedText
                        });
                    }

                    currentWords = [];
                    currentWordObjs = [];
                    if (!isLast) {
                        segStart = words[i + 1].start;
                    }
                }
            }

        } else {
            // -- DOUBLE LINE / NATURAL SENTENCES --
            // Group words into natural sentence segments, max 12 words
            var MAX_WORDS = 12;
            var currentWords = [];
            var currentWordObjs = [];
            var segStart = words[0].start;

            for (var i = 0; i < words.length; i++) {
                var w = words[i];
                if (!w.word || !w.word.trim()) continue;

                currentWords.push(w.word.trim());
                currentWordObjs.push(w);

                var isLast = (i === words.length - 1);
                var gap = !isLast ? (words[i + 1].start - w.end) : 0;
                var hasSentenceEnd = /[.!?]$/.test(w.word.trim());

                var breakSegment = false;
                if (isLast) breakSegment = true;
                else if (currentWords.length >= MAX_WORDS) breakSegment = true;
                else if (hasSentenceEnd) breakSegment = true;
                else if (gap >= 1.5) breakSegment = true;

                if (breakSegment) {
                    var joinedText = currentWords.join(" ");
                    joinedText = joinedText.replace(/\s+([.,!?])/g, '$1');
                    joinedText = joinedText.replace(/\s+/g, ' ').trim();

                    if (joinedText.length > 0) {
                        segments.push({
                            start: segStart,
                            end: currentWordObjs[currentWordObjs.length - 1].end,
                            original: joinedText
                        });
                    }

                    currentWords = [];
                    currentWordObjs = [];
                    if (!isLast) {
                        segStart = words[i + 1].start;
                    }
                }
            }
        }

        return segments;
    }

    function estimateWordTimings(text, startTime, totalDuration) {
        var words = text.split(/\s+/).filter(function (w) { return w.length > 0; });
        var avgDuration = totalDuration / words.length;
        return words.map(function (w, i) {
            return {
                word: w,
                start: startTime + i * avgDuration,
                end: startTime + (i + 1) * avgDuration
            };
        });
    }

    // ------------------------------------------
    // English Word Protection
    // ------------------------------------------
    function protectEnglishWords(text) {
        if (!text) return text;
        return text.replace(/(^|[^a-zA-Z0-9])([a-zA-Z0-9]+)(?=[^a-zA-Z0-9]|$)/g, "$1<E>$2</E>");
    }

    function stripProtectionTags(text) {
        if (!text) return text;
        return text.replace(/<E>/g, "").replace(/<\/E>/g, "");
    }

    // ------------------------------------------
    // AI Script Conversion
    // ------------------------------------------
    async function convertScript(segments, captionLanguages, aiProvider, sourceLang, captionStyle) {
        var results = [];
        var aiFailed = false;
        var lastAIError = "";

        if (cancelled) throw new Error("Cancelled");

        var primaryLang = captionLanguages[0];
        var primaryKey = langToKey(primaryLang, sourceLang);

        // For word-by-word: each segment is a single word — skip <E> tag protection.
        // For phrase modes: protect English words inside longer phrases so LLM doesn't transliterate them.
        var isWordByWord = (captionStyle === "word_by_word");
        var promptSegments;
        if (isWordByWord) {
            promptSegments = segments;
        } else {
            promptSegments = segments.map(function (s) {
                var newSeg = Object.assign({}, s);
                if (newSeg.original) newSeg.original = protectEnglishWords(newSeg.original);
                return newSeg;
            });
        }

        var prompt = buildConversionPrompt(promptSegments, primaryLang, sourceLang, captionStyle);
        var convertedMap = {};

        try {
            var aiResult = await callAI(prompt, aiProvider);

            var cleaned = aiResult
                .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
                .replace(/\uFFFD/g, "")
                .replace(/\u0000/g, "")
                .replace(/\*\*/g, "")
                .trim();

            var lines = cleaned.split('\n');
            var regex = /^(?:[\*\-\#\>\s]+)?\[?(\d+)\]?[\.\:\)]?\s*(.*)$/;

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) continue;
                var match = line.match(regex);
                if (match) {
                    var idx = parseInt(match[1], 10) - 1;
                    var txt = isWordByWord ? match[2].trim() : stripProtectionTags(match[2].trim());
                    convertedMap[idx] = txt;
                }
            }
        } catch (e) {
            console.error("AI conversion failed", e);
            aiFailed = true;
            lastAIError = e.message;
        }

        // Detect Indic script (Telugu \u0C00-\u0C7F, Hindi \u0900-\u097F, Tamil \u0B80-\u0BFF, etc.)
        function isNativeScript(text) {
            return /[\u0900-\u0D7F]/.test(text);
        }

        var nativeLeakCount = 0;

        for (var j = 0; j < segments.length; j++) {
            var seg = Object.assign({}, segments[j]);

            if (convertedMap[j] !== undefined) {
                var cleanedText = convertedMap[j];
                if (cleanedText === "-" || cleanedText === "\u2014") cleanedText = "";
                seg[primaryKey] = cleanedText;
                seg.display_text = cleanedText;
                // Flag if LLM returned native script despite being asked to romanize
                if (primaryLang === "phonetic" && isNativeScript(cleanedText)) {
                    seg._nativeLeak = true;
                    nativeLeakCount++;
                } else {
                    seg._nativeLeak = false;
                }
            } else {
                // LLM dropped this segment (truncation). Keep original but flag it.
                seg.display_text = seg.original;
                if (primaryLang === "phonetic") {
                    seg._nativeLeak = true;
                    nativeLeakCount++;
                }
            }
            results.push(seg);
        }

        if (nativeLeakCount > 0) {
            console.warn("[Captiongrit] Pass 1: " + nativeLeakCount + "/" + segments.length + " segments still have native script. Verification will fix these.");
        }

        if (aiFailed) {
            showStatus("warning", "AI Error: " + lastAIError + ". Falling back to native script.");
        }

        return results;
    }


    // ── Word-by-Word Pass Executor (Pass 2: phonetic spelling, Pass 3: native leak catch) ────────────────────

    function validateReplacement(oldToken, newToken, customVocab, passNumber) {
        if (!oldToken || !newToken) return { accepted: true, reason: "" };

        var oldTrim = oldToken.trim();
        var newTrim = newToken.trim();

        if (!newTrim) return { accepted: false, reason: "Empty token" };
        if (oldTrim === newTrim) return { accepted: true, reason: "Unchanged" };

        // 1. Whitespace
        if (newTrim.indexOf(" ") !== -1) {
            return { accepted: false, reason: "Whitespace injected (word-by-word must be single token)" };
        }

        // 2. Native script leak
        var isNative = function (t) { return /[\u0900-\u0D7F]/.test(t); };
        if (!isNative(oldTrim) && isNative(newTrim)) {
            return { accepted: false, reason: "Native script injected into Latin token" };
        }

        // 3. Punctuation stripping
        var oldPunct = oldTrim.match(/[.,!?]+$/);
        var newPunct = newTrim.match(/[.,!?]+$/);
        if (oldPunct && !newPunct) {
            return { accepted: false, reason: "Punctuation stripped" };
        }

        // 4. Multiple punctuation added
        if (newTrim.match(/[.,!?]{2,}/) && !oldTrim.match(/[.,!?]{2,}/)) {
            return { accepted: false, reason: "Multiple punctuations added" };
        }

        // 5. Number tampering
        var oldClean = oldTrim.replace(/[.,!?]+$/g, "");
        var newClean = newTrim.replace(/[.,!?]+$/g, "");
        if (/^\d+$/.test(oldClean) && oldClean !== newClean) {
            return { accepted: false, reason: "Number tampered" };
        }

        // 6. Proper Noun / Custom Vocab Degradation
        var oldLower = oldClean.toLowerCase();
        var newLower = newClean.toLowerCase();

        var customVocabArr = (customVocab || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        var isCustom = false;
        for (var i = 0; i < customVocabArr.length; i++) {
            if (customVocabArr[i] === oldClean) isCustom = true;
        }

        var isCamel = /^[A-Z][a-z]+[A-Z][a-z]+$/.test(oldClean);
        if ((isCustom || isCamel) && oldClean !== newClean && oldLower === newLower) {
            return { accepted: false, reason: "Proper noun or Custom Vocab case altered" };
        }

        var getLevenshteinDistance = function (a, b) {
            if (a.length === 0) return b.length;
            if (b.length === 0) return a.length;
            var matrix = [];
            for (var i = 0; i <= b.length; i++) matrix[i] = [i];
            for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (var i = 1; i <= b.length; i++) {
                for (var j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) == a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                    }
                }
            }
            return matrix[b.length][a.length];
        };

        // 7. Pronunciation Regression
        if (typeof COMMON_ENGLISH_WORDS !== 'undefined' && COMMON_ENGLISH_WORDS.has(oldLower) && !COMMON_ENGLISH_WORDS.has(newLower)) {
            var dist = getLevenshteinDistance(oldLower, newLower);
            if (dist <= 4 || oldLower.charAt(0) === newLower.charAt(0)) {
                return { accepted: false, reason: "Pronunciation Regression (Valid dictionary word corrupted)" };
            }
        }

        // Warning (Levenshtein distance too large)
        var dist2 = getLevenshteinDistance(oldLower, newLower);
        if (dist2 > newClean.length && newClean.length > 3) {
            console.warn("[Captiongrit] Pass " + passNumber + " Validator Warning: Large token modification: " + oldTrim + " -> " + newTrim);
        }

        return { accepted: true, reason: "" };
    }

    async function runWBWPass(segments, passNumber, aiProvider, primaryLang, sourceLang, originalSegments) {
        if (cancelled) throw new Error("Cancelled");

        var primaryKey = langToKey(primaryLang, sourceLang);
        var sourceLangName = LANG_NAMES[sourceLang] || (sourceLang === "auto" ? "an Indian language" : sourceLang);
        var vocabEl = document.getElementById("custom-vocab");
        var customVocab = vocabEl ? vocabEl.value.trim() : "";

        var prompt = "";

        if (passNumber === 2) {
            // Pass 2: Fix phonetic spelling errors in romanized output
            var shortWordMap = [
                ["yu", "you"], ["ar", "are"], ["iz", "is"], ["naat", "not"], ["gud", "good"],
                ["vat", "what"], ["vas", "was"], ["vit", "with"], ["vid", "with"], ["vil", "will"],
                ["vud", "would"], ["dat", "that"], ["dis", "this"], ["dey", "they"], ["tink", "think"],
                ["ting", "thing"], ["tru", "through"], ["bat", "but"], ["sam", "some"], ["jast", "just"],
                ["mach", "much"], ["kan", "can"], ["ken", "can"], ["kud", "could"], ["shud", "should"]
            ];
            var batchText = segments.map(function (s) { return (s.display_text || "").toLowerCase(); }).join(" ");
            var detectedFixes = [];
            for (var d = 0; d < shortWordMap.length; d++) {
                var re = new RegExp("\b" + shortWordMap[d][0] + "\b");
                if (re.test(batchText)) detectedFixes.push("  " + shortWordMap[d][0] + " \u2192 " + shortWordMap[d][1]);
            }

            prompt =
                "You are a phonetic spelling corrector for subtitle words.\n\n" +
                "SOURCE LANGUAGE: " + sourceLangName + "\n\n" +
                "INPUT: Each numbered line is ONE romanized word from a " + sourceLangName + " speaker.\n" +
                "OUTPUT: Return the SAME number of lines, one corrected word per line.\n\n" +
                "RULES:\n" +
                "1. Fix phonetic spelling errors (bijines\u2192business, dat\u2192that, yu\u2192you, vat\u2192what).\n" +
                "2. Fix multi-syllable distortions (egzisting\u2192existing, efishiyant\u2192efficient, informeshan\u2192information).\n" +
                "3. Keep correct English words UNCHANGED (watch, guru, ok, bye, My).\n" +
                "4. Keep correct romanized native words UNCHANGED (pettukovadam, gaani, unnaru).\n" +
                "5. If a word is in native script (non-Latin characters) \u2014 romanize it NOW.\n" +
                "6. Do NOT translate. Do NOT merge lines. Do NOT add commentary.\n" +
                (customVocab ? "7. CUSTOM VOCABULARY (preserve exact spelling): " + customVocab + "\n" : "") +
                (detectedFixes.length > 0 ? "\nFIXES NEEDED IN THIS BATCH:\n" + detectedFixes.join("\n") + "\n" : "") +
                "\nCRITICAL: Output EXACTLY " + segments.length + " numbered lines. DO NOT stop early.\n\n" +
                "Input (" + segments.length + " words):\n";

        } else if (passNumber === 2.5) {
            // Pass 2.5: Deep Accuracy + Punctuation + Casing
            var fullContext = segments.map(function (s) { return (s.display_text || s.original || "").trim(); }).filter(Boolean).join(" ");
            prompt =
                "You are a deep phonetic accuracy and punctuation pass for subtitle words.\n\n" +
                "SOURCE LANGUAGE: " + sourceLangName + "\n\n" +
                "INPUT: Each numbered line is ONE romanized/English word from a " + sourceLangName + " speaker, in original\n" +
                "spoken order. Treat the numbered list as ONE continuous sentence broken into single-word tokens \u2014\n" +
                "not unrelated words.\n\n" +
                "YOUR TWO JOBS THIS PASS:\n\n" +
                "JOB 1 \u2014 DEEP PHONETIC CORRECTION\n" +
                "Fix complex, multi-syllable English word distortions that simpler passes miss. These are words\n" +
                "where the speaker said a real English word but the accent changed multiple syllables at once.\n\n" +
                "Pattern families to apply (not an exhaustive list \u2014 apply the underlying logic to any word that fits):\n" +
                "- -shiyant/-shant/-shent \u2192 -cient: efishiyant\u2192efficient, soffishiyant\u2192sufficient\n" +
                "- -shiyaal-/-shial- \u2192 -tial-: potenshiyaaliti\u2192potentiality, speshiyaal\u2192special\n" +
                "- -aaliti/-aliti \u2192 -ality/-ity: riyaaliti\u2192reality, kwaality\u2192quality, kapabiliti\u2192capability\n" +
                "- -shan/-shun \u2192 -tion: informeshan\u2192information, situeshun\u2192situation, edyukeshan\u2192education\n" +
                "- aa \u2192 a (long vowel flattening): staarating\u2192starting, haard\u2192hard, maarket\u2192market\n" +
                "- egz-/egj- \u2192 ex-/exi-: egzisting\u2192existing, egzample\u2192example, egzakt\u2192exact\n" +
                "- k \u2192 c in English words: karekt\u2192correct, kompani\u2192company, konten\u2192content, konnect\u2192connect\n" +
                "- j \u2192 g/dg/z: bijines\u2192business, naaledj\u2192knowledge, laangvej\u2192language, steej\u2192stage\n" +
                "- -eit \u2192 -ate: apdeit\u2192update, kaalkuleit\u2192calculate, kreeit\u2192create\n" +
                "- enhaans/enhans \u2192 enhance/enhances\n" +
                "- -mant \u2192 -ment: investmant\u2192investment, developmant\u2192development\n" +
                "- ph \u2192 f: phast\u2192fast, pheel\u2192feel, phirst\u2192first\n" +
                "- sht \u2192 st: invesht\u2192invest, inveshment\u2192investment\n" +
                "- bi-/bhi- \u2192 be-: bikaaj\u2192because, bikam\u2192become, bifor\u2192before, biliv\u2192believe\n\n" +
                "EXAMPLES FOR " + sourceLangName.toUpperCase() + ":\n" +
                "bijines\u2192business | efishiyant\u2192efficient | egzisting\u2192existing | riyaaliti\u2192reality |\n" +
                "karekt\u2192correct | staarating\u2192starting | apdeit\u2192update | enhaans\u2192enhances |\n" +
                "potenshiyaaliti\u2192potentiality | kompani\u2192company\n\n" +
                "JOB 2 \u2014 PUNCTUATION AND CASING\n" +
                "Read the FULL RECONSTRUCTED SENTENCE below to understand sentence boundaries, questions, and\n" +
                "emphasis. Then attach punctuation to the correct individual word tokens and fix casing:\n\n" +
                "PUNCTUATION RULES:\n" +
                "1. If the full sentence is a question (who/what/when/where/why/how/is it/can you, or rising\n" +
                "   intonation implied by word order) \u2014 attach \"?\" to the LAST word of that question.\n" +
                "2. If a statement ends normally \u2014 attach \".\" to the last word of that sentence (only at sentence\n" +
                "   boundaries you can clearly infer from the context, not after every single word).\n" +
                "3. If there's a clear pause/list/aside inferred from natural speech rhythm \u2014 a comma may attach to\n" +
                "   the word before the pause. Do this sparingly; only when obvious.\n" +
                "4. Exclamations (clear excitement/emphasis, e.g. \"wow\", \"amazing\", \"no way\") get \"!\" attached to\n" +
                "   that word.\n" +
                "5. NEVER attach punctuation to a word in the middle of a phrase just because it's a content word.\n" +
                "   Most words get ZERO punctuation attached.\n\n" +
                "CASING RULES (CRITICAL \u2014 this is commonly done wrong):\n" +
                "1. DO NOT capitalize the first letter of every word. These are mid-sentence tokens in word-by-word\n" +
                "   caption mode, not standalone sentences.\n" +
                "2. Only capitalize: (a) the very first word of the ENTIRE transcript, (b) proper nouns (YouTube,\n" +
                "   Instagram, India, names of people/places/brands), (c) the standalone word \"I\".\n" +
                "3. Everything else stays lowercase, INCLUDING words right after a \".\" or \"?\" you just added \u2014 caption\n" +
                "   word-by-word style does not re-capitalize mid-transcript sentence starts.\n\n" +
                "WRONG (do not do this):\n" +
                "1. Business\n" +
                "2. Is\n" +
                "3. Growing\n" +
                "4. Fast\n\n" +
                "CORRECT:\n" +
                "1. business\n" +
                "2. is\n" +
                "3. growing\n" +
                "4. fast.\n\n" +
                "WRONG (do not do this):\n" +
                "1. What\n" +
                "2. Is\n" +
                "3. Your\n" +
                "4. Name\n\n" +
                "CORRECT:\n" +
                "1. what\n" +
                "2. is\n" +
                "3. your\n" +
                "4. name?\n\n" +
                "FULL RECONSTRUCTED SENTENCE (read this first to understand meaning, questions, and boundaries):\n" +
                "\"" + fullContext + "\"\n\n" +
                "RULES:\n" +
                "- Fix phonetic spelling using Job 1 rules above.\n" +
                "- Apply punctuation and casing using Job 2 rules above.\n" +
                "- Keep correct English words UNCHANGED except for case/punctuation per the rules above.\n" +
                "- Keep correct romanized native words UNCHANGED (pettukovadam, gaani, unnaru) except case/punctuation.\n" +
                "- Do NOT translate. Do NOT merge lines. Do NOT split lines. Do NOT add commentary.\n" +
                (customVocab ? "- CUSTOM VOCABULARY (preserve exact spelling, including case, for these terms): " + customVocab + "\n" : "") +
                "\nCRITICAL: Output EXACTLY " + segments.length + " numbered lines. DO NOT stop early. DO NOT skip numbers.\n\n" +
                "Input (" + segments.length + " words):\n";

        } else if (passNumber === 3) {
            prompt =
                "You are a subtitle verification editor for romanized " + sourceLangName + ".\n\n" +
                "INPUT: Each numbered line is ONE romanized word from a " + sourceLangName + " speaker.\n" +
                "Format: Original STT: [word]\nCurrent token: [word]\n\n" +
                "OUTPUT: Return the SAME number of lines, ONE word per line.\n\n" +
                "RULES:\n" +
                "1. The previous AI has already spent significant computation correcting these tokens.\n" +
                "2. Assume its corrections are more likely to be correct than your intuition.\n" +
                "3. Your job is to find rare remaining mistakes (phonetic errors, native script), not to produce a better sounding output.\n" +
                "4. If the current correction is acceptable, return EXACTLY the current word. Do NOT attempt to improve it.\n" +
                "5. Only replace it if you are extremely confident (>95%) the previous AI made a mistake.\n" +
                "6. Standardize proper nouns consistently (YouTube not Youtube).\n" +
                "7. Punctuation and casing have already been applied. Do NOT remove punctuation. Do NOT re-capitalize lowercase words.\n" +
                "8. Do NOT merge or split lines. Do NOT add commentary.\n" +
                (customVocab ? "9. CUSTOM VOCABULARY (enforce exact spelling): " + customVocab + "\n" : "") +
                "\nCRITICAL: Output EXACTLY " + segments.length + " numbered lines. DO NOT stop early.\n\n" +
                "Input (" + segments.length + " words):\n";
        } else if (passNumber === 4) {
            prompt =
                "You are a Strict QA pass for subtitle verification.\n\n" +
                "INPUT: Each numbered line is ONE romanized word.\n" +
                "Format: Original STT: [word]\nCurrent token: [word]\n\n" +
                "OUTPUT: Return the SAME number of lines, ONE word per line.\n\n" +
                "RULES:\n" +
                "1. The previous AI has already spent significant computation correcting these tokens.\n" +
                "2. Assume its corrections are more likely to be correct than your intuition.\n" +
                "3. Your job is ONLY to find remaining native script leaks, formatting errors, or proper noun errors. Do NOT attempt to produce a better sounding output.\n" +
                "4. If the current correction is acceptable, return EXACTLY the current word.\n" +
                "5. Only replace it if you are extremely confident (>95%) the previous AI made a mistake.\n" +
                "6. Do NOT remove punctuation. Do NOT re-capitalize lowercase words.\n" +
                "7. Do NOT merge or split lines. Do NOT add commentary.\n" +
                (customVocab ? "8. CUSTOM VOCABULARY (enforce exact spelling): " + customVocab + "\n" : "") +
                "\nCRITICAL: Output EXACTLY " + segments.length + " numbered lines. DO NOT stop early.\n\n" +
                "Input (" + segments.length + " words):\n";
        }

        for (var i = 0; i < segments.length; i++) {
            var text = (segments[i].display_text || segments[i].original || "-").trim();
            if (passNumber === 3 || passNumber === 4) {
                var origSTT = originalSegments && originalSegments[i] ? (originalSegments[i].original || "-").trim() : "-";
                prompt += (i + 1) + ". Original STT: " + origSTT + "\nCurrent token: " + text + "\n\n";
            } else {
                prompt += (i + 1) + ". " + (text || "-") + "\n";
            }
        }

        var aiResult;
        try {
            aiResult = await callAI(prompt, aiProvider);
        } catch (e) {
            console.warn("[Captiongrit] WBW Pass " + passNumber + " failed: " + e.message);
            return segments;
        }

        var results = [];
        var convertedMap = {};
        if (aiResult) {
            var lines = aiResult.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "").trim().split('\n');
            var regex = /^(?:[\*\-\#\>\s]+)?\[?(\d+)\]?[\.\:\)]?\s*(.*)$/;
            for (var j = 0; j < lines.length; j++) {
                var line = lines[j].trim();
                if (!line) continue;
                var match = line.match(regex);
                if (match) {
                    var idx = parseInt(match[1], 10) - 1;
                    var corrected = match[2].trim();
                    if (corrected.indexOf("Current token:") !== -1) {
                        corrected = corrected.split("Current token:")[1].trim();
                    }
                    convertedMap[idx] = corrected;
                }
            }
        }

        for (var k = 0; k < segments.length; k++) {
            var seg = Object.assign({}, segments[k]);
            if (convertedMap[k] !== undefined) {
                var cText = convertedMap[k];
                if (cText === "-" || cText === "\u2013") cText = "";
                var valResult = validateReplacement(seg.display_text, cText, customVocab, passNumber);
                if (valResult.accepted) {
                    seg[primaryKey] = cText;
                    seg.display_text = cText;
                } else {
                    console.warn("[Captiongrit] Pass " + passNumber + " rejected change: " + valResult.reason + " ('" + seg.display_text + "' -> '" + cText + "')");
                }
            }
            results.push(seg);
        }

        console.log("[Captiongrit] WBW Pass " + passNumber + " complete \u2713");
        return results;
    }

    // ======================================================================
    // MAIN ENTRY \u2014 replaces the old verifyAndCorrectScript call
    // ======================================================================

    async function runVerificationPipeline(segments, aiProvider, primaryLang, sourceLang, passCount) {
        if (cancelled) throw new Error("Cancelled");

        var primaryKey = langToKey(primaryLang, sourceLang);

        // -- Check if this is word-by-word mode --
        var captionStyle = (document.querySelector('#caption-style .pill.active') || {});
        var isWordByWord = captionStyle.getAttribute && captionStyle.getAttribute('data-style') === 'word_by_word';

        // ── Word-by-word mode: Multi-Pass Verification ──
        if (isWordByWord) {
            var currentSegs = segments;
            var originalSegs = JSON.parse(JSON.stringify(segments));

            currentSegs = await runWBWPass(currentSegs, 2, aiProvider, primaryLang, sourceLang, originalSegs);
            currentSegs = await runWBWPass(currentSegs, 2.5, aiProvider, primaryLang, sourceLang, originalSegs);

            if (TIER.hasWordByWord) {
                currentSegs = await runWBWPass(currentSegs, 3, aiProvider, primaryLang, sourceLang, originalSegs);
            }
            if (TIER.hasWordByWord) {
                currentSegs = await runWBWPass(currentSegs, 4, aiProvider, primaryLang, sourceLang, originalSegs);
            }

            for (var i = 0; i < currentSegs.length; i++) {
                currentSegs[i]._verified = true;
                currentSegs[i]._mergeSource = "wbw_multi_pass";
            }
            return currentSegs;
        }

        // -- Phrase modes (single_line, double_line): Keep existing 3-pass system --
        function buildContext(segs) {
            return segs.map(function (s) {
                return (s.display_text || s[primaryKey] || "").trim();
            }).filter(Boolean).join(" ");
        }

        if (passCount >= 4) {
            // PRO/EXTREME: 3 Passes (Phonetics -> Grammar -> Consistency)
            var afterP1 = await runSinglePass(segments, 1, aiProvider, primaryLang, sourceLang, buildContext(segments));
            var afterP2 = await runSinglePass(afterP1, 2, aiProvider, primaryLang, sourceLang, buildContext(afterP1));
            var afterP3 = await runSinglePass(afterP2, 3, aiProvider, primaryLang, sourceLang, buildContext(afterP2));

            for (var i = 0; i < afterP3.length; i++) {
                afterP3[i]._verified = true;
                afterP3[i]._mergeSource = "p3";
            }
            return afterP3;

        } else if (passCount === 1) {
            // BASIC: 2 Passes (Phonetics -> Grammar)
            var afterP1 = await runSinglePass(segments, 1, aiProvider, primaryLang, sourceLang, buildContext(segments));
            var afterP2 = await runSinglePass(afterP1, 2, aiProvider, primaryLang, sourceLang, buildContext(afterP1));

            for (var i = 0; i < afterP2.length; i++) {
                afterP2[i]._verified = true;
                afterP2[i]._mergeSource = "p2";
            }
            return afterP2;
        }

        return segments;
    }

    // ------------------------------------------
    // Single pass executor
    // ------------------------------------------

    async function runSinglePass(segments, passNumber, aiProvider, primaryLang, sourceLang, fullContext) {
        if (cancelled) throw new Error("Cancelled");

        var primaryKey = langToKey(primaryLang, sourceLang);
        var prompt = buildPassPrompt(segments, passNumber, primaryLang, sourceLang, fullContext);

        var aiResult;
        try {
            aiResult = await callAI(prompt, aiProvider);
        } catch (e) {
            console.warn("[Captiongrit] Pass " + passNumber + " failed: " + e.message + ". Continuing with previous output.");
            return segments;
        }

        var cleaned = aiResult
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
            .replace(/\uFFFD/g, "")
            .replace(/\u0000/g, "")
            .replace(/\*\*/g, "")
            .trim();

        var lines = cleaned.split('\n');
        var regex = /^(?:[\*\-\#\>\s]+)?\[?(\d+)\]?[\.\:\)]?\s*(.*)$/;
        var convertedMap = {};

        for (var l = 0; l < lines.length; l++) {
            var line = lines[l].trim();
            if (!line) continue;
            var match = line.match(regex);
            if (match) {
                var idx = parseInt(match[1], 10) - 1;
                convertedMap[idx] = match[2].trim();
            }
        }

        var results = [];
        var wordsChangedCount = 0;
        var wordsRejectedCount = 0;

        for (var j = 0; j < segments.length; j++) {
            var seg = Object.assign({}, segments[j]);

            if (convertedMap[j] !== undefined && convertedMap[j] !== null) {
                var cText = convertedMap[j];
                if (cText === "-" || cText === "\u2014" || cText === "\u2013") cText = "";

                var oldText = (seg.display_text || "").trim();
                if (!seg._history) {
                    seg._history = [{ pass: 0, text: (seg.original || "").trim() }];
                }

                var changed = (cText !== oldText);
                var accepted = true;
                var rejectReason = "";

                if (changed) {
                    var validation = validateReplacement(oldText, cText, customVocab, passNumber);
                    accepted = validation.accepted;
                    rejectReason = validation.reason;
                }

                if (changed && accepted) {
                    wordsChangedCount++;
                    seg._history.push({ pass: passNumber, text: cText });
                    seg[primaryKey] = cText;
                    seg.display_text = cText;
                    seg._changedBy = "pass" + passNumber;
                } else if (changed && !accepted) {
                    wordsRejectedCount++;
                    if (!seg._validationTrace) seg._validationTrace = [];
                    seg._validationTrace.push({ pass: passNumber, attempted: cText, reason: rejectReason });
                    console.warn("[Captiongrit] Pass " + passNumber + " Rejected: '" + oldText + "' -> '" + cText + "'. Reason: " + rejectReason);
                }

                seg["_wbwPass" + passNumber] = seg.display_text;

                // Ensure isNativeScript exists
                var isNativeFn = function (t) { return /[\u0900-\u0D7F]/.test(t); };
                seg._nativeLeak = (primaryLang === "phonetic" && isNativeFn(seg.display_text));
            }
            results.push(seg);
        }

        console.log("-------------------");
        console.log("PASS " + passNumber);
        console.log("Words Changed : " + wordsChangedCount);
        console.log("Words Rejected: " + wordsRejectedCount);
        console.log("-------------------");
        console.log("PASS " + passNumber);
        console.log("Words Changed : " + wordsChangedCount);
        console.log("Words Rejected: " + wordsRejectedCount);
        console.log("-------------------");

        return results;
    }

    // ======================================================================
    // PASS PROMPTS
    // ======================================================================

    function buildPassPrompt(segments, passNumber, primaryLang, sourceLang, fullContext) {
        switch (passNumber) {
            case 1: return buildPass1Prompt(segments, primaryLang, sourceLang, fullContext);
            case 2: return buildPass2Prompt(segments, primaryLang, sourceLang, fullContext);
            case 3: return buildPass3Prompt(segments, primaryLang, sourceLang, fullContext);
            default: return buildPass1Prompt(segments, primaryLang, sourceLang, fullContext);
        }
    }

    function buildPass1Prompt(segments, primaryLang, sourceLang, fullContext) {
        var sourceLangName = LANG_NAMES[sourceLang] || (sourceLang === "auto" ? "an Indian language" : sourceLang);
        var batchText = segments.map(function (s) { return (s.display_text || "").toLowerCase(); }).join(" ");
        var detectedPatterns = detectAccentPatterns(batchText);
        var truncContext = fullContext.length > 500 ? fullContext.slice(0, 500) + "..." : fullContext;
        var vocabEl = document.getElementById("custom-vocab");
        var customVocab = vocabEl ? vocabEl.value.trim() : "";

        var shortWordMap = [
            [/\byu\b/, "yu \u2192 you"], [/\btur\b|\byur\b|\byuur\b/, "yur/tur \u2192 your"], [/\bar\b/, "ar \u2192 are"],
            [/\biz\b/, "iz \u2192 is"], [/\bnaat\b/, "naat \u2192 not"], [/\bgud\b/, "gud \u2192 good"],
            [/\benaf\b/, "enaf \u2192 enough"], [/\bhaav\b/, "haav \u2192 have"], [/\bgaat\b/, "gaat \u2192 got"],
            [/\bmach\b/, "mach \u2192 much"], [/\bjast\b/, "jast \u2192 just"], [/\bbat\b/, "bat \u2192 but"],
            [/\bsam\b/, "sam \u2192 some"], [/\bdan\b/, "dan \u2192 done"], [/\beks\b/, "eks \u2192 ex"],
            [/\bvat\b/, "vat \u2192 what"], [/\bvas\b/, "vas \u2192 was"], [/\bvit\b|\bvid\b/, "vit/vid \u2192 with"],
            [/\bvil\b/, "vil \u2192 will"], [/\bvud\b/, "vud \u2192 would"], [/\bvork\b/, "vork \u2192 work"],
            [/\bdat\b/, "dat \u2192 that"], [/\bdis\b/, "dis \u2192 this"], [/\bdey\b/, "dey \u2192 they"],
            [/\bder\b|\bdere\b/, "der/dere \u2192 there"], [/\btink\b/, "tink \u2192 think"], [/\bting\b/, "ting \u2192 thing"],
            [/\btru\b/, "tru \u2192 through"], [/\bken\b|\bkan\b/, "ken/kan \u2192 can"], [/\bkud\b/, "kud \u2192 could"],
            [/\bshud\b/, "shud \u2192 should"], [/\bnoo\b/, "noo \u2192 know"], [/\bveri\b/, "veri \u2192 very"],
            [/\bonlee\b|\bonli\b/, "onlee/onli \u2192 only"], [/\brilli\b|\brealy\b/, "rilli/realy \u2192 really"]
        ];

        var relevantFixes = [];
        for (var i = 0; i < shortWordMap.length; i++) {
            if (shortWordMap[i][0].test(batchText)) relevantFixes.push("* " + shortWordMap[i][1]);
        }

        var prompt =
            "You are a phonetic accuracy editor for romanized " + sourceLangName + " captions.\n\n" +
            "IMPORTANT CONTEXT: The input is phonetically romanized from " + sourceLangName + " native script.\n\n" +
            "ONLY JOB THIS PASS: Fix phonetic spelling mistakes in both complex multi-syllable words and short function words.\n\n" +
            "DO NOT touch correct English words and correctly romanized native words. Do NOT translate. Do NOT add or remove words.\n" +
            (primaryLang !== "native_script" ? "CRITICAL EXCEPTION: If you see ANY words still written in native script (non-Latin characters) due to a previous processing failure, you MUST fully convert/romanize them to English/Latin characters now. Do not leave any native script characters in your output.\n\n" : "\n") +
            (customVocab ? "CUSTOM VOCABULARY (DO NOT alter the spelling of these words): " + customVocab + "\n\n" : "") +
            "ALSO FIX if present:\n" +
            "* Words STT merged into one: 'havetogo' \u2192 'have to go'\n" +
            "* Words STT split incorrectly: 'be cause' \u2192 'because'\n" +
            "* Music/sound tags like (sangita), (myoojik) \u2192 replace entire segment with: -\n\n" +
            (detectedPatterns.length > 0 ? "MULTI-SYLLABLE PATTERNS IN THIS BATCH:\n" + detectedPatterns.join("\n") + "\n\n" : "") +
            "KEY MULTI-SYLLABLE FIXES:\n" +
            "* -shiyant/-shant \u2192 -cient: efishiyant\u2192efficient, soffishiyant\u2192sufficient\n" +
            "* -shiyaal-/-shial- \u2192 -tial-: potenshiyaaliti\u2192potentiality, speshiyaal\u2192special\n" +
            "* -aaliti/-aliti \u2192 -ality: riyaaliti\u2192reality, kwaality\u2192quality\n" +
            "* -shan/-shun \u2192 -tion: informeshan\u2192information, situeshun\u2192situation\n" +
            "* aa \u2192 a: staarating\u2192starting, haard\u2192hard, maarket\u2192market\n" +
            "* egz-/egj- \u2192 ex-/exi-: egzisting\u2192existing, egzample\u2192example\n" +
            "* k \u2192 c: karekt\u2192correct, kompani\u2192company\n" +
            "* j \u2192 g/dg/z: bijines\u2192business, naaledj\u2192knowledge, laangvej\u2192language\n" +
            "* -eit \u2192 -ate: apdeit\u2192update, kaalkuleit\u2192calculate\n" +
            "* enhaans/enhans \u2192 enhances/enhance\n" +
            "* -mant \u2192 -ment: investmant\u2192investment, developmant\u2192development\n" +
            "* ph \u2192 f: phast\u2192fast, pheel\u2192feel, phirst\u2192first\n" +
            "* sht \u2192 st: invesht\u2192invest, inveshment\u2192investment\n\n" +
            (relevantFixes.length > 0 ? "SHORT WORD FIXES NEEDED IN THIS BATCH:\n" + relevantFixes.join("\n") + "\n\n" : "") +
            getLangExamplesCompact(sourceLang) +
            "CONTEXT (what is being said):\n\"" + truncContext + "\"\n\n" +
            buildOutputRules(segments.length) + buildInputBlock(segments);
        return prompt;
    }

    function buildPass2Prompt(segments, primaryLang, sourceLang, fullContext) {
        var sourceLangName = LANG_NAMES[sourceLang] || (sourceLang === "auto" ? "an Indian language" : sourceLang);
        var truncContext = fullContext.length > 700 ? fullContext.slice(0, 700) + "..." : fullContext;
        var vocabEl = document.getElementById("custom-vocab");
        var customVocab = vocabEl ? vocabEl.value.trim() : "";

        var prompt =
            "You are a subtitle coherence editor \u2014 Pass 2 (grammar and sentence flow).\n\n" +
            "CONTEXT: These are captions from a " + sourceLangName + " speaker mixing native language with English. " +
            "Pass 1 fixed phonetic distortions. Your job is everything still wrong at the sentence level.\n\n" +
            "YOUR JOB:\n" +
            "1. Read the full transcript context below to understand what the speaker is saying.\n" +
            "2. Identify any English word that still looks phonetically distorted but wasn't caught by Pass 1.\n" +
            "3. Fix subject-verb agreement errors caused by STT mishearing (e.g. 'he are' \u2192 'he is').\n" +
            "4. Fix English words that are real words but wrong in context (e.g. heard 'whether' but said 'weather').\n" +
            "5. If a segment is a pure native language segment IN LATIN SCRIPT and has no English errors \u2014 leave it exactly as-is.\n\n" +
            "DO NOT: translate, add words, remove words, restructure sentences, or change native language text THAT IS ALREADY IN LATIN SCRIPT.\n" +
            (primaryLang !== "native_script" ? "CRITICAL EXCEPTION: If you see ANY words still written in native script (non-Latin characters), you MUST fully convert/romanize them to English/Latin characters now. Do not leave any native script characters in your output.\n\n" : "\n") +
            (customVocab ? "CUSTOM VOCABULARY (DO NOT alter the spelling of these words): " + customVocab + "\n\n" : "") +
            "FULL TRANSCRIPT (use this to understand meaning):\n\"" + truncContext + "\"\n\n" +
            buildOutputRules(segments.length) + buildInputBlock(segments);
        return prompt;
    }

    function buildPass3Prompt(segments, primaryLang, sourceLang, fullContext) {
        var sourceLangName = LANG_NAMES[sourceLang] || (sourceLang === "auto" ? "an Indian language" : sourceLang);
        var vocabEl = document.getElementById("custom-vocab");
        var customVocab = vocabEl ? vocabEl.value.trim() : "";
        var truncContext = fullContext.length > 700 ? fullContext.slice(0, 700) + "..." : fullContext;

        var prompt =
            "You are a subtitle consistency checker \u2014 Pass 3 (final pass).\n\n" +
            "CONTEXT: These captions are nearly correct after 2 passes of fixing. This is the last cleanup pass.\n\n" +
            "YOUR JOB:\n" +
            "1. Ensure the same proper noun, brand name, or product name is spelled identically across ALL segments. If 'YouTube' appears as 'Youtube', standardize it everywhere.\n" +
            "2. Ensure numbers are consistent: '10 lakhs' vs '10 lakh' \u2014 pick one and apply everywhere.\n" +
            "3. Remove any double spaces, stray punctuation, or formatting artifacts.\n" +
            "4. If a word appears distorted that previous passes missed \u2014 fix it now.\n" +
            "5. If everything in a segment is already correct \u2014 output it unchanged.\n\n" +
            (customVocab ? "CUSTOM VOCABULARY (enforce exact spelling for these terms everywhere):\n" + customVocab + "\n\n" : "") +
            "DO NOT: translate, add words, change native language words THAT ARE ALREADY IN LATIN SCRIPT, restructure sentences.\n" +
            (primaryLang !== "native_script" ? "CRITICAL EXCEPTION: If you see ANY words still written in native script, you MUST fully convert/romanize them to Latin characters now. Do not leave any native script characters in your output.\n\n" : "\n") +
            "FULL TRANSCRIPT:\n\"" + truncContext + "\"\n\n" +
            buildOutputRules(segments.length) + buildInputBlock(segments);
        return prompt;
    }



    function buildOutputRules(segmentCount) {
        return (
            "OUTPUT RULES:\n" +
            "- Return EXACTLY " + segmentCount + " numbered lines, one per input.\n" +
            "- Format: [number]. [corrected text]\n" +
            "- Do NOT merge segments. Do NOT split segments. No blank lines between outputs.\n" +
            "- Unchanged segments: output them as-is.\n" +
            "- Empty/untranslatable segments: [number]. -\n\n"
        );
    }

    function buildInputBlock(segments) {
        var block = "Input (" + segments.length + " segments):\n";
        for (var i = 0; i < segments.length; i++) {
            var text = (segments[i].display_text || "").trim() || "-";
            block += (i + 1) + ". " + text + "\n";
        }
        return block;
    }
    function getLangExamplesCompact(sourceLang) {
        var examples = {
            "te": "TELUGU EXAMPLES: bijines\u2192business | efishiyant\u2192efficient | egzisting\u2192existing | riyaaliti\u2192reality | karekt\u2192correct | staarating\u2192starting | apdeit\u2192update | enhaans\u2192enhances | potenshiyaaliti\u2192potentiality\n\n",
            "ta": "TAMIL EXAMPLES: bijines\u2192business | efisiyant\u2192efficient | egsisting\u2192existing | riyaaliti\u2192reality | apdate\u2192update | enhance-panrom\u2192enhance\n\n",
            "kn": "KANNADA EXAMPLES: bijines\u2192business | efishiyant\u2192efficient | egzisting\u2192existing | riyaaliti\u2192reality | karekt\u2192correct | staarating\u2192starting | kompani\u2192company\n\n",
            "ml": "MALAYALAM EXAMPLES: bijines\u2192business | eficiyent\u2192efficient | egzisting\u2192existing | riyality\u2192reality | updeit\u2192update | enhaans\u2192enhances | teknoloji\u2192technology\n\n",
            "hi": "HINDI EXAMPLES: bijines\u2192business | efishiyant\u2192efficient | egzisting\u2192existing | riyaaliti\u2192reality | apdeit\u2192update | kompani\u2192company | vork\u2192work | vat\u2192what\n\n",
            "bn": "BENGALI EXAMPLES: bijines\u2192business | efishent\u2192efficient | egzisting\u2192existing | riyaaliti\u2192reality | apdeit\u2192update | kompani\u2192company\n\n",
            "auto": "EXAMPLES (all South Indian accents): bijines\u2192business | efishiyant/efishent\u2192efficient | egzisting\u2192existing | riyaaliti\u2192reality | karekt\u2192correct | staarating\u2192starting | apdeit\u2192update | enhaans\u2192enhances | potenshiyaaliti\u2192potentiality\n\n"
        };
        return examples[sourceLang] || examples["auto"];
    }

    var PATTERN_DETECTORS = [
        { test: /\b(di|de|dat|dis|dey|dem|den|dese|doze|dere|der|dher|tink|ting|tru)\b/, desc: "* th\u2192d/dh: di\u2192the, dat\u2192that, dis\u2192this, dey\u2192they, tink\u2192think, ting\u2192thing, tru\u2192through" },
        { test: /\b(vat|ven|vere|vy|vit|vid|vil|vud|vork|vorld|vant|vas|vaz)\b/, desc: "* w\u2192v: vat\u2192what, ven\u2192when, vit/vid\u2192with, vil\u2192will, vud\u2192would, vork\u2192work" },
        { test: /\b(yu|tu|du|hu|ar|iz|aar|aaf|far|mach|jast|bat|sam|dan|naat|gud|enaf)\b/, desc: "* Vowel shifts: yu\u2192you, ar\u2192are, iz\u2192is, naat\u2192not, gud\u2192good, enaf\u2192enough, mach\u2192much, jast\u2192just" },
        { test: /shiy?(a|u|e)nt/, desc: "* -shiyant/-shant \u2192 -cient: efishiyant\u2192efficient, soffishiyant\u2192sufficient" },
        { test: /[aeiou]{2}liti|[a-z]iti\b/, desc: "* -aaliti/-iti \u2192 -ality/-ity: riyaaliti\u2192reality, kapabiliti\u2192capability" },
        { test: /[a-z]shan\b|[a-z]shun\b/, desc: "* -shan/-shun \u2192 -tion: informeshan\u2192information, situeshun\u2192situation" },
        { test: /[a-z]eit\b|apdeit|komplikeit/, desc: "* -eit \u2192 -ate: apdeit\u2192update, kaalkuleit\u2192calculate" },
        { test: /\begz|egj/, desc: "* egz-/egj- \u2192 ex-: egzisting\u2192existing, egzample\u2192example" },
        { test: /\bkarekt|kompani|konten|konnect/, desc: "* k\u2192c: karekt\u2192correct, kompani\u2192company, konten\u2192content" },
        { test: /\bstaar/, desc: "* staar- \u2192 star-: staarating\u2192starting" },
        { test: /enhaa?ns/, desc: "* enhaans/enhans \u2192 enhance/enhances" },
        { test: /[a-z]aa[a-z]/, desc: "* aa\u2192a: haard\u2192hard, maarket\u2192market, staarating\u2192starting" },
        { test: /\b(bika[jz]|bikoz|bikam|bifor|biliv|bitvin)\b/, desc: "* bi- \u2192 be-: bikaaj\u2192because, bikam\u2192become, bifor\u2192before, biliv\u2192believe" },
        { test: /shiyaal|potenshiy/, desc: "* -shiyaal- \u2192 -tial-: potenshiyaaliti\u2192potentiality, speshiyaal\u2192special" },
        { test: /\byur\b|\byuur\b/, desc: "* yur\u2192your" }
    ];

    function detectAccentPatterns(batchText) {
        var found = [];
        for (var i = 0; i < PATTERN_DETECTORS.length; i++) {
            if (PATTERN_DETECTORS[i].test.test(batchText)) {
                found.push(PATTERN_DETECTORS[i].desc);
            }
        }
        return found;
    }

    function langToKey(lang, sourceLang) {
        if (lang === "native_script") {
            var nativeMap = {
                "te": "telugu", "hi": "hindi", "ta": "tamil", "kn": "kannada",
                "ml": "malayalam", "bn": "bengali", "mr": "marathi", "gu": "gujarati",
                "pa": "punjabi", "ur": "urdu", "en": "english", "es": "spanish",
                "fr": "french", "de": "german", "pt": "portuguese", "ja": "japanese",
                "ko": "korean", "ar": "arabic", "id": "indonesian", "th": "thai",
                "zh": "chinese", "ru": "russian", "tr": "turkish", "vi": "vietnamese",
                "auto": "original"
            };
            return nativeMap[sourceLang] || "original";
        }

        if (lang === "phonetic") {
            var phoneticMap = {
                "te": "tenglish", "hi": "hinglish", "ta": "tanglish", "kn": "kanglish",
                "ml": "manglish", "bn": "benglish", "mr": "marathiphone", "gu": "gujphone",
                "pa": "punglish", "ur": "urduphone", "ja": "romaji", "ko": "romanized",
                "ar": "arabizi", "zh": "pinyin", "ru": "transliterated", "th": "romanized",
                "vi": "romanized", "tr": "romanized", "id": "romanized", "pt": "romanized",
                "fr": "romanized", "de": "romanized", "es": "romanized",
                "en": "english", "auto": "phonetic"
            };
            return phoneticMap[sourceLang] || "phonetic";
        }

        return lang;
    }

    function buildConversionPrompt(segments, primaryLang, sourceLang, captionStyle) {
        var isAuto = (sourceLang === "auto");
        var sourceLangName = isAuto ? "the auto-detected language" : (LANG_NAMES[sourceLang] || sourceLang);

        var styleContext = "";
        if (captionStyle === "word_by_word") {
            styleContext = "Each input is a SINGLE WORD. Return exactly one word per entry. Never combine two words into one output line.";
        } else if (captionStyle === "double_line") {
            styleContext = "Each input is a subtitle line. Maximum 2 lines, maximum 42 characters per line. Never exceed this.";

        } else {
            styleContext = "Each input is a SHORT subtitle phrase. Strictly maximum 4-5 words per line. Keep it concise.";
        }

        var phoneticExamples = {
            "te": '"à°¨à±‡à°¨à± à°¬à°¾à°—à±à°¨à±à°¨à°¾à°¨à±" \u2192 "nenu baagunnanu" | "bye à°šà±†à°ªà±à°ªà°¾à°¨à±" \u2192 "bye cheppanu" | "ok à°šà±‡à°¸à±à°¤à°¾" \u2192 "ok chesta" | "à°Žà°•à±à°•à°¡" \u2192 "ekkada"',
            "hi": '"à¤®à¥ˆà¤‚ à¤ à¥€à¤• à¤¹à¥‚à¤" \u2192 "main theek hoon" | "okay à¤¬à¥‹à¤²à¥‹" \u2192 "okay bolo" | "bye à¤•à¤¹à¤¾" \u2192 "bye kaha"',
            "ta": '"à®¨à®¾à®©à¯ à®¨à®²à®®à®¾à®• à®‡à®°à¯à®•à¯à®•à®¿à®±à¯‡à®©à¯" \u2192 "naan nalamaa irukkiren" | "ok à®šà¯Šà®²à¯à®²à¯" \u2192 "ok sollu"',
            "kn": '"à²¨à²¾à²¨à³ à²šà³†à²¨à³à²¨à²¾à²—à²¿à²¦à³à²¦à³€à²¨à²¿" \u2192 "naanu chennaagiddini" | "bye à²¹à³‡à²³à³" \u2192 "bye helu"',
            "ml": '"à´žà´¾àµ» à´¸àµà´–à´®à´¾à´£àµ" \u2192 "njaan sukhamaanu" | "ok à´ªà´±" \u2192 "ok para"',
            "bn": '"à¦†à¦®à¦¿ à¦­à¦¾à¦²à§‹ à¦†à¦›à¦¿" \u2192 "ami bhalo achhi" | "bye à¦¬à¦²à§‹" \u2192 "bye bolo"',
            "mr": '"à¤®à¥€ à¤ à¥€à¤• à¤†à¤¹à¥‡" \u2192 "mi theek aahe" | "ok à¤¸à¤¾à¤‚à¤—" \u2192 "ok saang"',
            "gu": '"àª¹à«àª‚ àª¸àª¾àª°à«‹ àª›à«àª‚" \u2192 "hun saaro chhu" | "bye àª•àª¹à«‹" \u2192 "bye kaho"',
            "pa": '"à¨®à©ˆà¨‚ à¨ à©€à¨• à¨¹à¨¾à¨‚" \u2192 "main theek haan" | "ok à¨¦à©±à¨¸" \u2192 "ok dass"',
            "ur": '"Ù…ÛŒÚº Ù¹Ú¾ÛŒÚ© ÛÙˆÚº" \u2192 "main theek hoon" | "bye Ú©ÛÙˆ" \u2192 "bye kaho"'
        };

        var examples = (!isAuto && phoneticExamples[sourceLang])
            ? phoneticExamples[sourceLang] : "";

        var vocabEl = document.getElementById("custom-vocab");
        var customVocab = vocabEl ? vocabEl.value.trim() : "";
        var vocabInstruction = customVocab ?
            "CUSTOM VOCABULARY (CRITICAL): Ensure the following brand names or terms are spelled exactly as provided if spoken: " + customVocab + "\n\n" : "";

        var promptRules = "";

        if (primaryLang === "phonetic") {
            promptRules =
                "You are a professional subtitle phonetic romanization engine.\n\n" +
                vocabInstruction +

                "TASK: Convert " + (isAuto ? "each segment's detected language" : sourceLangName) +
                " text into English phonetic romanization \u2014 write exactly how it SOUNDS when spoken aloud. Do NOT translate.\n\n" +

                "CAPTION STYLE CONTEXT: " + styleContext + "\n\n" +

                "PHONETIC RULES:\n" +
                "1. Write how words SOUND, not what they mean.\n" +
                "2. Use natural romanization that an English reader would pronounce correctly.\n" +
                "3. No diacritics, no special characters \u2014 plain English letters only.\n" +
                "4. Never output box characters, question marks in squares, or any unreadable glyph.\n\n" +

                "CODE-SWITCHING RULES (CRITICAL):\n" +
                "- Speakers mix native script with English words mid-sentence.\n" +
                "- Any word already in Latin/English script must be left COMPLETELY UNCHANGED.\n" +
                "- 'bye' stays 'bye'. 'ok' stays 'ok'. 'cool' stays 'cool'. 'follow' stays 'follow'.\n" +
                "- NEVER convert English words to fake phonetics like 'bai', 'okei', 'kool'.\n" +
                "- Only apply phonetic conversion to native script words.\n\n" +

                (isAuto ?
                    "LANGUAGE DETECTION (CRITICAL):\n" +
                    "- Detect the actual language of EACH segment independently.\n" +
                    "- Apply phonetic rules specific to THAT detected language.\n" +
                    "- Telugu segments use Telugu phonetics. Hindi uses Hindi phonetics. Tamil uses Tamil phonetics.\n" +
                    "- NEVER default to Hindi for unrecognized or mixed segments.\n" +
                    "- If truly undetectable romanize as-is based on the script characters.\n\n"
                    : "") +

                (examples ?
                    "EXAMPLES FOR " + sourceLangName.toUpperCase() + ":\n" + examples + "\n\n"
                    : "");

        } else if (primaryLang === "english") {
            promptRules =
                "You are a professional subtitle translator.\n\n" +
                vocabInstruction +
                "TASK: Translate the given " + sourceLangName + " text into natural English suitable for subtitles.\n\n" +
                "CAPTION STYLE CONTEXT: " + styleContext + "\n\n" +
                "RULES:\n" +
                "- Keep translations concise and natural for subtitle display.\n" +
                "- Preserve proper nouns, brand names, and numbers as-is.\n" +
                "- If input contains mixed languages (native script + English words), translate only the non-English parts and keep English words unchanged.\n" +
                "- Do not add explanations or notes.\n\n";

        } else {
            promptRules =
                "You are a professional subtitle editor.\n\n" +
                "TASK: Correct and clean the given " + sourceLangName + " text in its native script.\n\n" +
                "CAPTION STYLE CONTEXT: " + styleContext + "\n\n" +
                "RULES:\n" +
                "- Fix spacing and speech-to-text errors only.\n" +
                "- Keep it in native script. Do not transliterate or translate.\n\n";
        }

        var formatExample = "";
        if (primaryLang === "phonetic") {
            formatExample =
                "  1. Meeru ela unnaru\n" +
                "  2. Naaku bagundi bye\n" +
                "  3. ok cheppanu\n";
        } else if (primaryLang === "english") {
            formatExample =
                "  1. How are you\n" +
                "  2. I am fine bye\n" +
                "  3. ok I will tell\n";
        } else {
            formatExample =
                "  1. [corrected text in native script]\n" +
                "  2. [corrected text in native script]\n" +
                "  3. [corrected text in native script]\n";
        }

        var universalFormatRules =
            "OUTPUT FORMAT:\n" +
            "- Return ONLY numbered lines, one per input segment.\n" +
            "- Format: [number]. [output text]\n" +
            "- Example:\n" +
            formatExample + "\n" +
            "STRICT RULES:\n" +
            "- DO NOT TRANSLATE OR ALTER ANY WORDS. KEEP THE EXACT SOURCE WORDS EVEN IF THEY SEEM INCORRECT.\n" +
            "- Output must have EXACTLY " + segments.length + " lines \u2014 one per input, no more, no less.\n" +
            "- Do NOT merge two segments into one line.\n" +
            "- Do NOT split one segment into multiple lines.\n" +
            "- Do NOT add blank lines between output lines.\n" +
            "- Do NOT add commentary, headers, or markdown.\n" +
            "- Any word wrapped in <E></E> tags must be copied to output EXACTLY as-is including the tags. Do not modify, transliterate, or translate the content inside <E></E> tags under any circumstance.\n" +
            "- If a segment is empty output: [number]. -\n" +
            "CRITICAL: You MUST process all " + segments.length + " segments. DO NOT stop early. After the final segment, output '[DONE]' on a new line.\n";

        var userPrompt = "Input segments (" + segments.length + " total):\n";
        for (var i = 0; i < segments.length; i++) {
            var text = segments[i].original ? segments[i].original.trim() : "";
            userPrompt += (i + 1) + ". " + (text || "-") + "\n";
        }

        return promptRules + universalFormatRules + "\n" + userPrompt;
    }

    // ------------------------------------------
    // Word-by-Word JSON Array Conversion Prompt
    // ------------------------------------------

    // ------------------------------------------
    // Parse Pipe-Separated String from AI Response
    // ------------------------------------------
    function parsePipeSeparatedResponse(aiResult, expectedCount) {
        if (!aiResult) return [];

        // Clean the response
        var cleaned = aiResult
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
            .replace(/\uFFFD/g, "")
            .replace(/\u0000/g, "")
            .trim();

        // Split by pipe
        var parts = cleaned.split('|');
        var parsed = parts.map(function (p) {
            var val = p.trim();
            // Remove lingering quotes if LLM added them
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.substring(1, val.length - 1);
            }
            return val;
        });

        console.log("[Captiongrit] Pipe-separated string parsed: " + parsed.length + " items (expected " + expectedCount + ")");

        var result = [];
        for (var i = 0; i < expectedCount; i++) {
            result.push(parsed[i] !== undefined ? parsed[i] : null);
        }
        return result;
    }

    // ------------------------------------------
    // Word-by-Word Combined Verification Pass
    // ------------------------------------------
    async function runWordByWordVerification(segments, aiProvider, primaryLang, sourceLang) {
        if (cancelled) throw new Error("Cancelled");

        var primaryKey = langToKey(primaryLang, sourceLang);
        var sourceLangName = LANG_NAMES[sourceLang] || (sourceLang === "auto" ? "an Indian language" : sourceLang);

        // Collect current display texts
        var wordTexts = segments.map(function (s) {
            return (s.display_text || s[primaryKey] || s.original || "").trim() || "-";
        });

        // Detect how many words still have native script
        var nativeScriptIndices = [];
        for (var i = 0; i < wordTexts.length; i++) {
            if (hasNativeScript(wordTexts[i])) {
                nativeScriptIndices.push(i);
            }
        }

        var vocabEl = document.getElementById("custom-vocab");
        var customVocab = vocabEl ? vocabEl.value.trim() : "";

        var prompt = "";

        if (primaryLang === "phonetic") {
            prompt =
                "You are a subtitle accuracy editor for romanized " + sourceLangName + " captions.\n\n";

            // If there are native script leaks, make this the TOP priority
            if (nativeScriptIndices.length > 0) {
                prompt +=
                    "HIGHEST PRIORITY: " + nativeScriptIndices.length + " words still have native script characters.\n" +
                    "You MUST romanize ALL native script to Latin characters. No native script in output.\n\n";
            }

            prompt +=
                "TASK: Fix any remaining issues in these romanized words:\n" +
                "1. Romanize any native script words to Latin letters (how they SOUND).\n" +
                "2. Fix phonetic distortions in English words (e.g., 'bikaaj'\u2192'because', 'vat'\u2192'what').\n" +
                "3. Keep correctly romanized native words unchanged (e.g., 'pettukovadam', 'gaani').\n" +
                "4. Keep English words unchanged (e.g., 'watch', 'My', 'guru').\n" +
                "5. Do NOT translate. Do NOT merge or split words.\n\n" +

                (customVocab ? "CUSTOM VOCABULARY (preserve exact spelling): " + customVocab + "\n\n" : "") +

                "INPUT: Single line of " + wordTexts.length + " words separated by '|'.\n" +
                "OUTPUT: Single line of exactly " + wordTexts.length + " corrected words separated by '|'.\n" +
                "CRITICAL: Output MUST be exactly ONE line. There must be exactly " + (wordTexts.length - 1) + " pipe '|' characters.\n" +
                "CRITICAL: Do NOT use JSON. Do NOT add commentary.\n\n" +
                "Input:\n" + wordTexts.join(" | ") + "\n\n" +
                "Output:\n";

        } else {
            // For non-phonetic word-by-word (English translation, native script)
            prompt =
                "You are a subtitle editor. Fix any errors in these " + sourceLangName + " words.\n" +
                "INPUT: Single line of " + wordTexts.length + " words separated by '|'.\n" +
                "OUTPUT: Single line of exactly " + wordTexts.length + " corrected words separated by '|'.\n" +
                "CRITICAL: Output MUST be exactly ONE line. There must be exactly " + (wordTexts.length - 1) + " pipe '|' characters.\n" +
                "CRITICAL: Do NOT use JSON. Do NOT add commentary.\n\n" +
                (customVocab ? "CUSTOM VOCABULARY: " + customVocab + "\n\n" : "") +
                "Input:\n" + wordTexts.join(" | ") + "\n\n" +
                "Output:\n";
        }

        var aiResult;
        try {
            aiResult = await callAI(prompt, aiProvider);
        } catch (e) {
            console.warn("[Captiongrit] Word-by-word verification failed: " + e.message + ". Continuing with conversion output.");
            return segments;
        }

        var correctedWords = parsePipeSeparatedResponse(aiResult, segments.length);

        var results = [];
        for (var j = 0; j < segments.length; j++) {
            var seg = Object.assign({}, segments[j]);
            if (correctedWords[j] !== undefined && correctedWords[j] !== null) {
                var cText = correctedWords[j];
                if (cText === "-" || cText === "\u2013") cText = "";
                seg[primaryKey] = cText;
                seg.display_text = cText;
            }
            results.push(seg);
        }

        // Log improvement
        var remainingNative = 0;
        for (var k = 0; k < results.length; k++) {
            if (hasNativeScript(results[k].display_text)) remainingNative++;
        }
        console.log("[Captiongrit] After verification: " + remainingNative + " native script words remaining (was " + nativeScriptIndices.length + ")");

        return results;
    }

    // ------------------------------------------
    // AI Provider Calls
    // ------------------------------------------
    async function callAI(prompt, provider) {
        if (provider === "auto") {
            return await callAIAuto(prompt);
        }

        switch (provider) {
            case "gemini": return await callGemini(prompt);
            case "xai": return await callXAI(prompt);
            case "groq": return await callGroq(prompt);
            case "openrouter": return await callOpenRouter(prompt);
            default: throw new Error("Unknown AI provider: " + provider);
        }
    }

    async function callAIAuto(prompt) {
        var errors = [];

        async function tryProvider(name, fn) {
            try {
                return await fn();
            } catch (e) {
                // If rate limit, wait 2s and retry once
                if (e.message && e.message.indexOf("429") !== -1) {
                    await new Promise(function (r) { setTimeout(r, 2000); });
                    try { return await fn(); } catch (e2) { errors.push(name + ": " + e2.message); }
                } else {
                    errors.push(name + ": " + e.message);
                }
            }
            return null;
        }

        var result;

        if (getApiKey("gemini")) {
            result = await tryProvider("Gemini", function () { return callGemini(prompt); });
            if (result) return result;
        }
        if (getApiKey("groq")) {
            result = await tryProvider("Groq", function () { return callGroq(prompt); });
            if (result) return result;
        }
        if (getApiKey("xai")) {
            result = await tryProvider("xAI Grok", function () { return callXAI(prompt); });
            if (result) return result;
        }
        if (getApiKey("openrouter")) {
            result = await tryProvider("OpenRouter", function () { return callOpenRouter(prompt); });
            if (result) return result;
        }

        throw new Error("All AI providers failed:\n" + errors.join("\n"));
    }

    async function callGemini(prompt) {
        var key = getApiKey("gemini");
        if (!key) throw new Error("Gemini API key not set.");

        // Try models in order: 3.5-flash -> 3.1-flash-lite
        var models = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
        var errors = [];

        for (var m = 0; m < models.length; m++) {
            var model = models[m];
            var resp = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 8192
                        }
                    })
                }
            );

            if (resp.ok) {
                var data = await resp.json();
                return data.candidates[0].content.parts[0].text;
            } else {
                var bodyText = await resp.text();
                errors.push({
                    model: model,
                    status: resp.status,
                    body: bodyText
                });

                // If it's a model not found (404), quota (429), or server error (500, 503), try next model
                if (resp.status === 404 || resp.status === 429 || resp.status === 500 || resp.status === 503) {
                    console.warn("Gemini " + model + " unavailable or quota hit (" + resp.status + "), trying next model...");
                    continue;
                }

                // For other errors (e.g. 400, 401, 403), fail immediately to avoid hiding config problems
                throw new Error(JSON.stringify(errors, null, 2));
            }
        }
        throw new Error(JSON.stringify(errors, null, 2));
    }

    async function callXAI(prompt) {
        var key = getApiKey("xai");
        if (!key) throw new Error("xAI API key not set.");

        var model = "grok-3-mini-fast";

        var resp = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                max_tokens: 8192
            })
        });

        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error("xAI Grok API error (" + resp.status + "): " + errText);
        }

        var data = await resp.json();
        return data.choices[0].message.content;
    }

    async function callGroq(prompt) {
        var key = getApiKey("groq");
        if (!key) throw new Error("Groq API key not set.");

        var model = "llama-3.1-8b-instant"; // 500k TPD free \u2014 separate bucket from 70b

        var resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                max_tokens: 8192
            })
        });

        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error("Groq API error (" + resp.status + "): " + errText);
        }

        var data = await resp.json();
        return data.choices[0].message.content;
    }

    async function callOpenRouter(prompt) {
        var key = getApiKey("openrouter");
        if (!key) throw new Error("OpenRouter API key not set.");

        var model = "google/gemini-2.0-flash-exp:free";

        var resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost",
                "X-Title": "Captiongrit"
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                max_tokens: 8192
            })
        });

        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error("OpenRouter API error (" + resp.status + "): " + errText);
        }

        var data = await resp.json();
        return data.choices[0].message.content;
    }

    function hasAnyAIKey(provider) {
        if (provider === "auto") {
            return getApiKey("gemini") || getApiKey("xai") || getApiKey("groq") || getApiKey("openrouter");
        }
        switch (provider) {
            case "gemini": return !!getApiKey("gemini");
            case "xai": return !!getApiKey("xai");
            case "groq": return !!getApiKey("groq");
            case "openrouter": return !!getApiKey("openrouter");
        }
        return false;
    }

    // ------------------------------------------
    // AI Response Parsing
    // ------------------------------------------
    function parseAIResponse(text) {
        if (!text) return null;

        // Strip markdown code fences if present
        text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

        try {
            var parsed = JSON.parse(text);
            // If it's a single object, wrap in array
            if (!Array.isArray(parsed)) {
                parsed = [parsed];
            }
            return parsed;
        } catch (e) {
            // Try to extract JSON from the text
            var match = text.match(/\[[\s\S]*\]/);
            if (match) {
                try {
                    return JSON.parse(match[0]);
                } catch (e2) { /* fall through */ }
            }
            // Try single object
            var objMatch = text.match(/\{[\s\S]*\}/);
            if (objMatch) {
                try {
                    return [JSON.parse(objMatch[0])];
                } catch (e3) { /* fall through */ }
            }
            console.warn("Failed to parse AI response:", text);
            return null;
        }
    }

    // ------------------------------------------
    // Translation
    // ------------------------------------------
    async function translateCaptions(segments, targetLang, aiProvider, sourceLang, primaryLang, captionStyle) {
        var targetLangName = LANG_NAMES[targetLang] || targetLang;
        var srcLangName = (sourceLang && sourceLang !== "auto" && LANG_NAMES[sourceLang]) ? LANG_NAMES[sourceLang] : "";
        var results = [];

        if (cancelled) throw new Error("Cancelled");

        var phoneticInstruction = primaryLang === "phonetic" ?
            "CRITICAL: Write the translated " + targetLangName + " entirely in English Phonetic Romanization (how it sounds in English letters). Do NOT use native " + targetLangName + " script.\n\n" : "";

        var wordByWordInstruction = captionStyle === "word_by_word" ?
            "CRITICAL: Each input is a SINGLE WORD. The output must also be a SINGLE translated word per line. Do NOT combine words.\n\n" : "";

        var prompt =
            "You are a professional subtitle translator.\n\n" +
            "TASK: Translate the following " + (srcLangName ? srcLangName + " " : "") + "subtitles to " + targetLangName + ".\n\n" +
            phoneticInstruction +
            wordByWordInstruction +
            "RULES:\n" +
            "- Keep translations concise and natural for subtitle display.\n" +
            "- Preserve proper nouns, brand names, and numbers as-is.\n" +
            "- Return EXACTLY " + segments.length + " numbered lines \u2014 one per input, no more, no less.\n" +
            "- Format: [number]. [translated text]\n" +
            "- Do NOT add blank lines between output lines.\n" +
            "- Do NOT add commentary, notes, or markdown.\n" +
            "- If a segment is empty or just a hyphen output: [number]. -\n\n" +
            "Input segments (" + segments.length + " total):\n";

        for (var i = 0; i < segments.length; i++) {
            var text = (segments[i].original || "").trim();
            prompt += (i + 1) + ". " + (text || "-") + "\n";
        }

        try {
            var aiResult = await callAI(prompt, aiProvider);

            var cleaned = aiResult
                .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
                .replace(/\uFFFD/g, "")
                .replace(/\u0000/g, "")
                .replace(/\*\*/g, "")
                .trim();

            var convertedMap = {};
            var lines = cleaned.split('\n');
            var regex = /^(?:[\*\-\#\>\s]+)?\[?(\d+)\]?[\.\:\)]?\s*(.*)$/;

            for (var j = 0; j < lines.length; j++) {
                var line = lines[j].trim();
                if (!line) continue;
                var match = line.match(regex);
                if (match) {
                    var idx = parseInt(match[1], 10) - 1;
                    convertedMap[idx] = match[2].trim();
                }
            }

            for (var k = 0; k < segments.length; k++) {
                var seg = Object.assign({}, segments[k]);
                if (convertedMap[k] !== undefined) {
                    var translated = convertedMap[k];
                    if (translated === "-" || translated === "\u2013") translated = "";
                    seg.display_text = translated;
                    seg.translated = translated;
                }
                results.push(seg);
            }

        } catch (e) {
            console.error("Translation failed", e);
            // Fallback \u2014 return original segments untouched
            return segments.map(function (s) { return Object.assign({}, s); });
        }

        return results;
    }

    // ------------------------------------------
    // Helpers
    // ------------------------------------------
    function getSelectedPills(containerId) {
        var pills = document.querySelectorAll("#" + containerId + " .pill.active");
        var values = [];
        pills.forEach(function (p) {
            values.push(p.getAttribute("data-lang") || p.getAttribute("data-output") || p.getAttribute("data-style"));
        });
        return values;
    }

    function evalScriptAsync(script) {
        return new Promise(function (resolve, reject) {
            if (!csInterface) {
                reject(new Error("Not running inside a supported host application."));
                return;
            }
            csInterface.evalScript(script, function (result) {
                if (result === EvalScript_ErrMessage || result === "EvalScript error.") {
                    reject(new Error("ExtendScript error: " + script));
                } else {
                    resolve(result);
                }
            });
        });
    }

    function escapeJSX(str) {
        return str.replace(/\\/g, "/").replace(/"/g, '\\"');
    }

    function escapeJSXString(str) {
        return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
    }

    function escapeHTML(str) {
        var div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function formatTimeSRT(seconds) {
        var mins = Math.floor(seconds / 60);
        var secs = Math.floor(seconds % 60);
        return mins + ":" + (secs < 10 ? "0" : "") + secs;
    }

    // ── FFmpeg PATH resolution ──
    var _ffmpegPathCache = null;
    var _ffmpegDiagnostics = [];

    function addFfmpegDiagnostic(msg) {
        var time = new Date().toISOString().split('T')[1].split('.')[0];
        _ffmpegDiagnostics.push("[" + time + "] " + msg);
        console.log("[Captiongrit FFmpeg] " + msg);
    }

    function validateFFmpeg(testPath) {
        return new Promise(function (resolve) {
            if (!fs || !cp) {
                addFfmpegDiagnostic("Node.js 'fs' or 'cp' not available.");
                return resolve(false);
            }
            if (!testPath) return resolve(false);

            addFfmpegDiagnostic("Validating path: " + testPath);
            if (!fs.existsSync(testPath)) {
                addFfmpegDiagnostic("File does not exist.");
                return resolve(false);
            }

            try {
                fs.chmodSync(testPath, 0o755);
                fs.accessSync(testPath, fs.constants.X_OK);
            } catch (e) {
                addFfmpegDiagnostic("Executable permission error: " + e.message);
                return resolve(false);
            }

            var execOpts = { timeout: 3000 };
            if (process.platform === 'darwin') {
                execOpts = getMacExecOpts({ timeout: 3000 });
            }

            cp.execFile(testPath, ['-version'], execOpts, function (err, stdout, stderr) {
                if (err) {
                    addFfmpegDiagnostic("Execution error: " + err.message);
                    return resolve(false);
                }
                var out = (stdout || '') + (stderr || '');
                if (out.toLowerCase().indexOf('ffmpeg version') !== -1) {
                    addFfmpegDiagnostic("Validated successfully.");
                    return resolve(true);
                }
                addFfmpegDiagnostic("Output did not contain 'ffmpeg version'.");
                resolve(false);
            });
        });
    }

    async function initializeFFmpeg(forceRecalculate) {
        if (_ffmpegPathCache && !forceRecalculate) return _ffmpegPathCache;

        _ffmpegDiagnostics = [];
        var osStr = process ? process.platform : navigator.platform.toLowerCase();
        var arch = process ? process.arch : 'unknown';
        addFfmpegDiagnostic("OS: " + osStr + " | Arch: " + arch);

        if (process && process.env && process.env.PATH) {
            addFfmpegDiagnostic("PATH: " + process.env.PATH);
        }

        var extPath = csInterface ? csInterface.getSystemPath(SystemPath.EXTENSION) : "";
        var customPath = localStorage.getItem('custom_ffmpeg_path');

        var searchPaths = [];
        if (customPath) searchPaths.push(customPath);

        if (osStr === 'darwin' || osStr.indexOf('mac') > -1) {
            searchPaths.push(extPath + "/bin/mac/ffmpeg");
            searchPaths.push("/opt/homebrew/bin/ffmpeg");
            searchPaths.push("/usr/local/bin/ffmpeg");
            searchPaths.push("/opt/local/bin/ffmpeg");
        } else if (osStr === 'win32' || osStr.indexOf('win') > -1) {
            searchPaths.push(extPath + "/bin/win/ffmpeg.exe");
            searchPaths.push("C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe");
            searchPaths.push("C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe");
        } else {
            searchPaths.push("/usr/bin/ffmpeg");
            searchPaths.push("/usr/local/bin/ffmpeg");
        }

        var foundPath = null;
        for (var i = 0; i < searchPaths.length; i++) {
            var isValid = await validateFFmpeg(searchPaths[i]);
            if (isValid) {
                foundPath = searchPaths[i];
                break;
            }
        }

        _ffmpegPathCache = foundPath;
        updateFFmpegUI();
        return foundPath;
    }

    function getFFmpegPath() {
        if (!_ffmpegPathCache) {
            throw new Error("FFmpeg not found or invalid. Please check Settings -> FFmpeg Configuration.");
        }
        return _ffmpegPathCache;
    }

    function updateFFmpegUI() {
        var input = document.getElementById("ffmpeg-path-input");
        var badge = document.getElementById("ffmpeg-status-badge");
        if (!input || !badge) return;

        if (_ffmpegPathCache) {
            input.value = _ffmpegPathCache;
            badge.textContent = "✅ Validated";
            badge.style.background = "var(--success)";
            badge.style.color = "#000";
        } else {
            input.value = "";
            input.placeholder = "FFmpeg not found... Click Browse.";
            badge.textContent = "❌ Not Found";
            badge.style.background = "var(--danger, #f87171)";
            badge.style.color = "#fff";
        }
    }

    function getMacExecOpts(baseOpts) {
        var opts = Object.assign({}, baseOpts || {});
        if (process.platform === 'darwin') {
            opts.env = Object.assign({}, process.env);
            opts.env.PATH = [
                '/opt/homebrew/bin', '/opt/homebrew/sbin',
                '/usr/local/bin', '/usr/bin', '/bin',
                '/usr/sbin', '/sbin',
                opts.env.PATH || ''
            ].join(':');
        }
        return opts;
    }

    // ── Verification error classifier ──
    function classifyVerificationError(err) {
        var msg = (err.message || '').toLowerCase();
        if (msg.indexOf('failed to fetch') !== -1 || msg.indexOf('network') !== -1 || msg.indexOf('timeout') !== -1 || msg.indexOf('econnrefused') !== -1)
            return 'network';
        if (msg.indexOf('429') !== -1 || msg.indexOf('rate limit') !== -1 || msg.indexOf('quota') !== -1 || msg.indexOf('resource exhausted') !== -1)
            return 'rate_limit';
        if (msg.indexOf('500') !== -1 || msg.indexOf('502') !== -1 || msg.indexOf('503') !== -1 || msg.indexOf('504') !== -1 || msg.indexOf('server error') !== -1 || msg.indexOf('internal error') !== -1)
            return 'server_error';
        if (msg.indexOf('json') !== -1 || msg.indexOf('parse') !== -1 || msg.indexOf('unexpected token') !== -1 || msg.indexOf('syntaxerror') !== -1)
            return 'parse_error';
        return 'unknown';
    }

    // Returns retry delay in ms based on error type. Non-retryable errors return -1.
    function getRetryDelay(errorType) {
        switch (errorType) {
            case 'network': return 0;     // Retry immediately
            case 'rate_limit': return 5000;  // Wait 5s for quota reset
            case 'server_error': return 2000;  // Wait 2s for server recovery
            default: return -1;    // Don't retry
        }
    }

    function extractAudioNode(inputPath, outputPath, startOffset, duration) {
        return new Promise(function (resolve) {
            if (!cp) {
                resolve({ success: false, error: "Node.js context not available for audio extraction." });
                return;
            }

            var ffmpegBin = getFFmpegPath();
            var ffmpegArgs = [];
            if (startOffset !== undefined && duration !== undefined && duration > 0) {
                ffmpegArgs.push("-ss", String(startOffset), "-t", String(duration));
            }
            ffmpegArgs.push("-i", inputPath, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k", "-y", outputPath);

            console.log("[Captiongrit] FFmpeg cmd: " + ffmpegBin + " " + ffmpegArgs.join(" "));
            var execOpts = getMacExecOpts({ maxBuffer: 1024 * 1024 * 50 });
            cp.execFile(ffmpegBin, ffmpegArgs, execOpts, function (error, stdout, stderr) {
                if (error) {
                    console.error("[Captiongrit] FFmpeg error:", error.message);
                    resolve({ success: false, error: error.message || stderr });
                } else {
                    // Log extracted file size for debugging
                    try {
                        var stats = fs.statSync(outputPath);
                        console.log("[Captiongrit] Extracted audio file size: " + (stats.size / 1024).toFixed(1) + " KB");
                    } catch (e) { /* ignore */ }
                    resolve({ success: true, path: outputPath });
                }
            });
        });
    }

    function setupPremiereProUI() {
        // Change text of output pill for Premiere Pro
        var textLayersPill = document.querySelector('[data-output="text_layers"]');
        if (textLayersPill) {
            textLayersPill.textContent = "Import SRT to Project";
            textLayersPill.setAttribute("title", "Automatically imports generated SRT file into your Premiere Pro project bin.");
        }

        // Update section label to indicate Premiere Mode
        var sectionLabel = document.querySelector('#output-options').previousElementSibling;
        if (sectionLabel) {
            sectionLabel.innerHTML = '<span class="dot"></span>Output <span style="font-size:10px;opacity:0.6;margin-left:4px;">(Premiere Mode)</span>';
        }
    }

    function showMainPanel(betaDaysLeft) {
        var authScreen = document.getElementById("auth-screen");
        if (authScreen) authScreen.style.display = "none";

        var email = localStorage.getItem(STORAGE_PREFIX + "auth_email") || "Licensed User";
        var activeEmailEl = document.getElementById("license-active-email");
        if (activeEmailEl) activeEmailEl.textContent = email;

        var betaIndicator = document.getElementById("beta-indicator");
        var betaUpgradeBtn = document.getElementById("beta-upgrade-btn");
        if (betaIndicator) {
            if (getPlanId() === "beta" && betaDaysLeft !== undefined) {
                betaIndicator.textContent = betaDaysLeft + " Days Left";
                betaIndicator.style.display = "inline-block";
                betaIndicator.style.cursor = "pointer";
                betaIndicator.onclick = function() {
                    if (getPlanId() === "beta") {
                        showUpgradeModal("basic", "Choose between the Basic, Pro, or Extreme plans to remove Beta limits.");
                    }
                };
                if (betaUpgradeBtn) betaUpgradeBtn.style.display = "inline-block";
            } else {
                betaIndicator.style.display = "none";
                if (betaUpgradeBtn) betaUpgradeBtn.style.display = "none";
            }
        }
    }

    function showLicensePanel() {
        var authScreen = document.getElementById("auth-screen");
        if (authScreen) {
            authScreen.style.display = "flex";
            var errorMsg = document.getElementById("errorMsg");
            if (errorMsg) errorMsg.className = "status-msg";
        }
        window.scrollTo(0, 0);
    }

    function showError(message) {
        var errorMsg = document.getElementById("errorMsg");
        if (errorMsg) {
            errorMsg.className = "status-msg visible error";
            errorMsg.textContent = message;
        }
    }

    function getStaticMachineId() {
        var id = null;
        try {
            var cp = window.require ? window.require("child_process") : require("child_process");
            var os = window.require ? window.require("os") : require("os");
            var platform = os.platform();

            if (platform === "win32") {
                // Windows Registry MachineGuid: generated at OS installation, 100% stable across reboots/VPNs/Wi-Fi
                var out = cp.execSync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
                    encoding: "utf8",
                    timeout: 3000,
                    windowsHide: true
                });
                var match = out.match(/REG_SZ\s+([a-fA-F0-9-]+)/i);
                if (match && match[1]) {
                    id = "WIN-" + match[1].trim().toUpperCase();
                }
            } else if (platform === "darwin") {
                // macOS IOPlatformUUID: hardware UUID burned into logic board/NVRAM
                var out = cp.execSync("ioreg -rd1 -c IOPlatformExpertDevice", {
                    encoding: "utf8",
                    timeout: 3000
                });
                var match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/i);
                if (match && match[1]) {
                    id = "MAC-" + match[1].trim().toUpperCase();
                }
            }
        } catch (e) {
            console.warn("Captiongrit: Could not query OS hardware GUID:", e);
        }
        return id;
    }

    function getDeviceFingerprint() {
        var hardwareId = getStaticMachineId();
        if (hardwareId) {
            try {
                var crypto = window.require ? window.require("crypto") : require("crypto");
                var hash = crypto.createHash("sha256").update("CAPTIONGRIT_" + hardwareId).digest("hex");
                return "DEVICE_" + hash.substring(0, 16).toUpperCase();
            } catch (e) {
                // Fallback deterministic string hash if crypto module is unavailable
                var str = "CAPTIONGRIT_" + hardwareId;
                var h = 0;
                for (var i = 0; i < str.length; i++) {
                    h = ((h << 5) - h) + str.charCodeAt(i);
                    h = h & h;
                }
                return "DEVICE_" + Math.abs(h).toString(16).toUpperCase();
            }
        }

        // Stable fallback if OS hardware query is unsupported or fails
        return "DEVICE_FB_" + Date.now().toString(16) + Math.random().toString(16).substring(2, 10).toUpperCase();
    }

    function getPersistentDeviceId() {
        // Step 1: Check localStorage (preserve and reuse existing ID from v1.0.1)
        var deviceId = localStorage.getItem("captiongrit_device_id");
        if (deviceId && deviceId.trim()) {
            deviceId = deviceId.trim();
            try {
                var fs = window.require ? window.require("fs") : require("fs");
                var os = window.require ? window.require("os") : require("os");
                var path = window.require ? window.require("path") : require("path");
                var idFilePath = path.join(os.homedir(), ".captiongrit_device_id");
                if (!fs.existsSync(idFilePath)) {
                    fs.writeFileSync(idFilePath, deviceId, "utf8");
                }
            } catch(e) {}
            return deviceId;
        }

        // Step 2: Check persistent filesystem storage (preserve and reuse existing ID from v1.0.1)
        try {
            var fs = window.require ? window.require("fs") : require("fs");
            var os = window.require ? window.require("os") : require("os");
            var path = window.require ? window.require("path") : require("path");
            
            // Check .captiongrit_device_id
            var idFilePath = path.join(os.homedir(), ".captiongrit_device_id");
            if (fs.existsSync(idFilePath)) {
                deviceId = fs.readFileSync(idFilePath, "utf8").trim();
                if (deviceId) {
                    localStorage.setItem("captiongrit_device_id", deviceId);
                    return deviceId;
                }
            }

            // Check .captiongrit_auth.json
            var authFilePath = path.join(os.homedir(), ".captiongrit_auth.json");
            if (fs.existsSync(authFilePath)) {
                var authObj = JSON.parse(fs.readFileSync(authFilePath, "utf8"));
                if (authObj && authObj.deviceId) {
                    deviceId = authObj.deviceId.trim();
                    if (deviceId) {
                        localStorage.setItem("captiongrit_device_id", deviceId);
                        fs.writeFileSync(idFilePath, deviceId, "utf8");
                        return deviceId;
                    }
                }
            }
        } catch(e) {}
        
        // Step 3: Brand new installation or clean machine with no previous device ID:
        // Generate deterministic OS-level machine fingerprint (MachineGuid / IOPlatformUUID)
        deviceId = getDeviceFingerprint();
        localStorage.setItem("captiongrit_device_id", deviceId);
        
        try {
            var fs = window.require ? window.require("fs") : require("fs");
            var os = window.require ? window.require("os") : require("os");
            var path = window.require ? window.require("path") : require("path");
            var idFilePath = path.join(os.homedir(), ".captiongrit_device_id");
            fs.writeFileSync(idFilePath, deviceId, "utf8");
        } catch(e) {}
        
        return deviceId;
    }

    function getStoredAuth() {
        var email = localStorage.getItem("captiongrit_email") || "";
        var key = localStorage.getItem("captiongrit_key") || "";
        var deviceId = getPersistentDeviceId();

        // If credentials are missing in localStorage, restore from persistent backup file
        if (!email || !key) {
            try {
                var fs = window.require ? window.require("fs") : require("fs");
                var os = window.require ? window.require("os") : require("os");
                var path = window.require ? window.require("path") : require("path");
                var authFilePath = path.join(os.homedir(), ".captiongrit_auth.json");
                if (fs.existsSync(authFilePath)) {
                    var authData = JSON.parse(fs.readFileSync(authFilePath, "utf8"));
                    if (authData && authData.email && authData.licenseKey) {
                        email = authData.email.trim();
                        key = authData.licenseKey.trim();
                        if (authData.deviceId && !deviceId) {
                            deviceId = authData.deviceId.trim();
                        }
                        // Restore into localStorage
                        localStorage.setItem("captiongrit_email", email);
                        localStorage.setItem("captiongrit_key", key);
                        localStorage.setItem(STORAGE_PREFIX + "auth_email", email);
                        if (deviceId) {
                            localStorage.setItem("captiongrit_device_id", deviceId);
                        }
                    }
                }
            } catch (e) {}
        }

        return { email: email, key: key, deviceId: deviceId };
    }

    function saveStoredAuth(email, key, deviceId) {
        if (email) localStorage.setItem("captiongrit_email", email);
        if (key) localStorage.setItem("captiongrit_key", key);
        if (deviceId) localStorage.setItem("captiongrit_device_id", deviceId);
        if (email) localStorage.setItem(STORAGE_PREFIX + "auth_email", email);

        try {
            var fs = window.require ? window.require("fs") : require("fs");
            var os = window.require ? window.require("os") : require("os");
            var path = window.require ? window.require("path") : require("path");
            
            // Backup auth JSON
            var authFilePath = path.join(os.homedir(), ".captiongrit_auth.json");
            var authObj = {
                email: email,
                licenseKey: key,
                deviceId: deviceId,
                updatedAt: new Date().toISOString()
            };
            fs.writeFileSync(authFilePath, JSON.stringify(authObj, null, 2), "utf8");

            // Ensure .captiongrit_device_id has deviceId
            var idFilePath = path.join(os.homedir(), ".captiongrit_device_id");
            if (deviceId) {
                fs.writeFileSync(idFilePath, deviceId, "utf8");
            }
        } catch (e) {}
    }

    function clearStoredAuth() {
        localStorage.removeItem("captiongrit_email");
        localStorage.removeItem("captiongrit_key");
        localStorage.removeItem("captiongrit_device_id");
        localStorage.removeItem(STORAGE_PREFIX + "auth_email");
        localStorage.removeItem(STORAGE_PREFIX + "capabilities");
        localStorage.removeItem("captiongrit_licensed");

        try {
            var fs = window.require ? window.require("fs") : require("fs");
            var os = window.require ? window.require("os") : require("os");
            var path = window.require ? window.require("path") : require("path");
            var authFilePath = path.join(os.homedir(), ".captiongrit_auth.json");
            if (fs.existsSync(authFilePath)) {
                fs.unlinkSync(authFilePath);
            }
            var idFilePath = path.join(os.homedir(), ".captiongrit_device_id");
            if (fs.existsSync(idFilePath)) {
                fs.unlinkSync(idFilePath);
            }
        } catch (e) {}
    }

    async function validateLicense(email, licenseKey, deviceId, isRefresh) {
        try {
            console.log("validateLicense: Starting request...");
            var reqObj = { email: email, licenseKey: licenseKey, deviceId: deviceId };
            if (isRefresh) reqObj.isRefresh = true;
            var resp = await fetchWithTimeout(LICENSE_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify(reqObj),
                redirect: "follow"
            }, 15000);
            console.log("validateLicense: Response status = " + resp.status);
            if (resp.ok) {
                var text = await resp.text();
                console.log("validateLicense: Response = " + text.substring(0, 500));
                try {
                    var data = JSON.parse(text);
                    return data;
                } catch (parseErr) {
                    console.error("validateLicense: JSON parse error:", parseErr);
                    return { valid: false, authenticated: false, reason: "invalid_response" };
                }
            }
            console.error("validateLicense: Non-OK status:", resp.status);
            return { valid: false, authenticated: false, reason: "network_error" };
        } catch (e) {
            console.error("License validation error:", e);
            return { valid: false, authenticated: false, reason: "network_error", message: e.message };
        }
    }

    async function switchDevice(email, licenseKey, deviceId) {
        try {
            console.log("switchDevice: Sending switch_device request...");
            var resp = await fetchWithTimeout(LICENSE_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({ action: "switch_device", email: email, licenseKey: licenseKey, deviceId: deviceId }),
                redirect: "follow"
            }, 20000);
            if (resp.ok) {
                var text = await resp.text();
                return JSON.parse(text);
            }
            return { valid: false, authenticated: false, reason: "network_error" };
        } catch (e) {
            return { valid: false, authenticated: false, reason: "network_error", message: e.message };
        }
    }

    // Refresh license silently when user switches back to Premiere (e.g., after upgrading in browser)
    async function refreshLicenseState() {
        var auth = getStoredAuth();
        var storedEmail = auth.email;
        var storedKey = auth.key;
        var storedDeviceId = auth.deviceId;

        if (storedEmail && storedKey && storedDeviceId) {
            try {
                var response = await validateLicense(storedEmail, storedKey, storedDeviceId, true);
                if (response.authenticated) {
                    window.CaptiongritSession = response;
                    TIER = window.CaptiongritSession.capabilities;
                    saveStoredAuth(storedEmail, storedKey, storedDeviceId);
                    localStorage.setItem(STORAGE_PREFIX + "capabilities", JSON.stringify(TIER));
                    
                    var badge = document.getElementById("plan-badge");
                    if (badge) {
                        badge.textContent = PLAN_LABELS[getPlanId()] || "Basic";
                        badge.className = "plan-badge plan-" + getPlanId();
                    }
                    
                    // Explicitly synchronize beta indicator
                    var betaIndicator = document.getElementById("beta-indicator");
                    var betaUpgradeBtn = document.getElementById("beta-upgrade-btn");
                    if (betaIndicator) {
                        if (getPlanId() === "beta" && response.betaDaysLeft !== undefined) {
                            betaIndicator.textContent = response.betaDaysLeft + " Days Left";
                            betaIndicator.style.display = "inline-block";
                            betaIndicator.style.cursor = "default";
                            if (betaUpgradeBtn) betaUpgradeBtn.style.display = "inline-block";
                        } else {
                            betaIndicator.style.display = "none";
                            if (betaUpgradeBtn) betaUpgradeBtn.style.display = "none";
                        }
                    }

                    showMainPanel(response.betaDaysLeft);
                    applyFeatureGating();

                    // Re-initialize presets if newly unlocked, avoiding duplicate listeners
                    if (TIER.hasPresets && !window._presetsInitialized) {
                        initPresets();
                        window._presetsInitialized = true;
                    }

                    // Attempt to close upgrade modal if it was open
                    hideUpgradeModal();
                } else if (response.reason === "device_not_authorized" || response.reason === "license_deactivated" || response.reason === "license_expired") {
                    console.warn("Session revoked by server:", response.reason);
                    clearStoredAuth();
                    showLicensePanel();
                    showError("Your license was activated on another device. Please log in again.");
                }
            } catch (err) {
                // Ignore silent network errors during background refresh
            }
        }
    }

    // Trigger refresh on focus
    window.addEventListener("focus", function() {
        refreshLicenseState();
    });

    async function checkForUpdates() {
        try {
            var CURRENT_VERSION = "1.0.3";
            var statusEl = document.getElementById("settings-update-status");
            var settingsBtn = document.getElementById("btn-settings-download-update");

            var resp = await fetchWithTimeout(LICENSE_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({ action: "check_update" }),
                redirect: "follow"
            }, 10000);

            if (resp.ok) {
                var data = await resp.json();
                if (data.latest_version && data.latest_version !== CURRENT_VERSION) {
                    // Update Modal UI
                    var modal = document.getElementById("update-modal");
                    var numSpan = document.getElementById("update-version-num");
                    var msgSpan = document.getElementById("update-modal-msg");
                    var linkBtn = document.getElementById("update-modal-btn");
                    var closeBtn = document.getElementById("btn-close-update");

                    if (modal && numSpan && linkBtn) {
                        numSpan.textContent = data.latest_version;
                        if (data.message) msgSpan.textContent = data.message;
                        linkBtn.href = data.download_url;
                        linkBtn.onclick = function () {
                            window.cep.util.openURLInDefaultBrowser(data.download_url);
                            return false;
                        };
                        modal.style.display = "flex";

                        if (closeBtn) {
                            closeBtn.onclick = function () {
                                modal.style.display = "none";
                            };
                        }
                    }

                    // Update Settings Tab UI
                    if (statusEl) statusEl.textContent = "Update Available: " + data.latest_version;
                    if (settingsBtn) {
                        settingsBtn.style.display = "block";
                        settingsBtn.onclick = function () {
                            window.cep.util.openURLInDefaultBrowser(data.download_url);
                        };
                    }
                } else {
                    if (statusEl) statusEl.textContent = "You are completely up to date (v" + CURRENT_VERSION + ").";
                    if (settingsBtn) settingsBtn.style.display = "none";
                }
            } else {
                if (statusEl) statusEl.textContent = "Could not check for updates.";
            }
        } catch (e) {
            var statusEl = document.getElementById("settings-update-status");
            if (statusEl) statusEl.textContent = "Could not check for updates.";
            console.error("Update check error:", e);
        }
    }

    // ------------------------------------------
    // Storage Migration (PingWin \u2192 Captiongrit)
    // ------------------------------------------
    function migrateOldStorageKeys() {
        // One-time migration: copy old pingwin_ keys to captiongrit_ if they exist
        if (localStorage.getItem("captiongrit_migrated")) return;

        var oldKeys = [
            ["pingwin_email", "captiongrit_email"],
            ["pingwin_key", "captiongrit_key"],
            ["pingwin_device_id", "captiongrit_device_id"],
            ["pingwin_licensed", "captiongrit_licensed"]
        ];

        // Also migrate API keys stored under old prefix
        var apiNames = ["elevenlabs", "deepgram", "gemini", "xai", "groq", "openrouter",
            "primary_color", "custom-vocab", "auth_email"];
        apiNames.forEach(function (name) {
            oldKeys.push(["pingwin_" + name, "captiongrit_" + name]);
        });

        var migrated = false;
        oldKeys.forEach(function (pair) {
            var oldVal = localStorage.getItem(pair[0]);
            if (oldVal && !localStorage.getItem(pair[1])) {
                localStorage.setItem(pair[1], oldVal);
                migrated = true;
            }
        });

        if (migrated) {
            console.log("[Captiongrit] Migrated old PingWin storage keys to Captiongrit.");
        }
        localStorage.setItem("captiongrit_migrated", "1");
    }

    var _pendingDeviceSwitch = null;

    function showDeviceSwitchCard(email, key, deviceId, maxDevices) {
        _pendingDeviceSwitch = { email: email, key: key, deviceId: deviceId };
        var card = document.getElementById("device-switch-card");
        var title = document.getElementById("device-switch-title");
        var desc = document.getElementById("device-switch-desc");
        var btnConfirm = document.getElementById("btn-confirm-device-switch");

        if (maxDevices > 1) {
            if (title) title.textContent = "All device slots are in use";
            if (desc) desc.textContent = "Your subscription has reached its device limit. Continuing will remove the oldest active device and activate this device.";
            if (btnConfirm) btnConfirm.textContent = "Switch to this device";
        } else {
            if (title) title.textContent = "License active on another device";
            if (desc) desc.textContent = "Your license is currently active on another device. You can log out from that device and continue here.";
            if (btnConfirm) btnConfirm.textContent = "Log out from other device & continue";
        }

        if (card) card.style.display = "block";
        var err = document.getElementById("errorMsg");
        if (err) err.className = "status-msg";
    }

    function hideDeviceSwitchCard() {
        _pendingDeviceSwitch = null;
        var card = document.getElementById("device-switch-card");
        if (card) card.style.display = "none";
    }

    async function handleActivateClick() {
        var emailInput = document.getElementById("emailInput");
        var licenseInput = document.getElementById("licenseInput");
        var email = emailInput ? emailInput.value.trim() : "";
        var key = licenseInput ? licenseInput.value.trim() : "";

        if (!email || !key) {
            showError("Please enter both Email and License Key.");
            return;
        }

        var errorMsg = document.getElementById("errorMsg");
        if (errorMsg) {
            errorMsg.className = "status-msg visible warning";
            errorMsg.textContent = "Activating license...";
        }

        try {
            var deviceId = getPersistentDeviceId();
            var response = await validateLicense(email, key, deviceId);
            console.log("Activation response:", JSON.stringify(response));
            if (response.authenticated) {
                hideDeviceSwitchCard();
                window.CaptiongritSession = response;
                TIER = window.CaptiongritSession.capabilities;

                saveStoredAuth(email, key, deviceId);
                localStorage.setItem(STORAGE_PREFIX + "capabilities", JSON.stringify(TIER));
                localStorage.removeItem("captiongrit_licensed");

                // Re-initialize feature gating now that capabilities are loaded
                applyFeatureGating();
                if (TIER.hasPresets) initPresets();

                showMainPanel(response.betaDaysLeft);
            } else {
                if (response.reason === "device_limit_reached") {
                    showDeviceSwitchCard(email, key, deviceId, response.maxDevices || 1);
                } else if (response.reason === "device_not_authorized") {
                    showError("Your license was activated on another device. Please log in again.");
                } else if (response.reason === "beta_expired") {
                    showError("Your Beta trial has expired.");
                    if (document.getElementById("buyBtn")) document.getElementById("buyBtn").style.display = "block";
                    if (document.getElementById("activateBtn")) document.getElementById("activateBtn").style.display = "none";
                } else if (response.reason === "network_error") {
                    showError("Network error: Could not reach the license server. Check your internet connection." + (response.message ? " (" + response.message + ")" : ""));
                } else {
                    showError("Invalid license key or email. (reason: " + (response.reason || "unknown") + ")");
                }
            }
        } catch (err) {
            console.error("handleActivateClick error:", err);
            showError("Activation failed: " + err.message);
        }
    }

    // Bind Device Switch Card Action Buttons
    var btnConfirmSwitch = document.getElementById("btn-confirm-device-switch");
    if (btnConfirmSwitch) {
        btnConfirmSwitch.onclick = async function () {
            if (!_pendingDeviceSwitch) return;
            btnConfirmSwitch.disabled = true;
            btnConfirmSwitch.textContent = "Switching device...";
            try {
                var response = await switchDevice(_pendingDeviceSwitch.email, _pendingDeviceSwitch.key, _pendingDeviceSwitch.deviceId);
                if (response.authenticated) {
                    var email = _pendingDeviceSwitch.email;
                    var key = _pendingDeviceSwitch.key;
                    var deviceId = _pendingDeviceSwitch.deviceId;
                    hideDeviceSwitchCard();

                    window.CaptiongritSession = response;
                    TIER = window.CaptiongritSession.capabilities;

                    saveStoredAuth(email, key, deviceId);
                    localStorage.setItem(STORAGE_PREFIX + "capabilities", JSON.stringify(TIER));
                    localStorage.removeItem("captiongrit_licensed");

                    applyFeatureGating();
                    if (TIER.hasPresets) initPresets();

                    showMainPanel(response.betaDaysLeft);
                } else {
                    showError("Device switch failed: " + (response.reason || "unknown error"));
                }
            } catch (e) {
                showError("Device switch failed: " + e.message);
            } finally {
                btnConfirmSwitch.disabled = false;
            }
        };
    }

    var btnCancelSwitch = document.getElementById("btn-cancel-device-switch");
    if (btnCancelSwitch) {
        btnCancelSwitch.onclick = function () {
            hideDeviceSwitchCard();
            var err = document.getElementById("errorMsg");
            if (err) err.className = "status-msg";
        };
    }


    function deactivateLicense() {
        // Fire-and-forget: tell the backend to free this device seat
        var auth = getStoredAuth();
        var email = auth.email;
        var key = auth.key;
        var deviceId = auth.deviceId;
        if (email && key && deviceId) {
            try {
                fetchWithTimeout(LICENSE_URL, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain" },
                    body: JSON.stringify({
                        action: "deactivate_device",
                        email: email,
                        licenseKey: key,
                        deviceId: deviceId
                    }),
                    redirect: "follow"
                }, 10000).then(function (resp) {
                    console.log("Deactivate device response:", resp.status);
                }).catch(function (err) {
                    console.warn("Deactivate device request failed (non-critical):", err.message);
                });
            } catch (e) {
                console.warn("Deactivate device error (non-critical):", e);
            }
        }

        window.CaptiongritSession = {
            authenticated: false,
            user: { email: null, license: null, plan: "basic", expires: null, lastValidated: null },
            capabilities: { maxDuration: 30, maxDevices: 1, maxClips: 1, hasDoubleCheck: false, hasEditor: false, hasCustomDict: false, hasWordByWord: false, hasFullSentence: true, hasEnglishOutput: false, hasPresets: false, hasMogrt: false, hasBatch: false }
        };
        TIER = window.CaptiongritSession.capabilities;
        clearStoredAuth();
        showLicensePanel();
    }

})();

