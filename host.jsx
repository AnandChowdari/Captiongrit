/**
 * host.jsx — ExtendScript for Adobe After Effects & Premiere Pro
 * Captiongrit CEP Plugin
 * 
 * Runs inside the host application scripting engine. All functions are called
 * from main.js via CSInterface.evalScript().
 */

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 0: JSON Polyfill
// ═══════════════════════════════════════════════════════════════════════════
var CG_JSON = {};
(function () {
    var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    var meta = {'\b':'\\b','\t':'\\t','\n':'\\n','\f':'\\f','\r':'\\r','"':'\\"','\\':'\\\\'};
    function quote(string) {
        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }
    function str(key, holder) {
        var i, k, v, length, partial, value = holder[key];
        if (value && typeof value === 'object' && typeof value.toJSON === 'function') { value = value.toJSON(key); }
        switch (typeof value) {
            case 'string': return quote(value);
            case 'number': return isFinite(value) ? String(value) : 'null';
            case 'boolean':
            case 'null': return String(value);
            case 'object':
                if (!value) return 'null';
                partial = [];
                // Handle ExtendScript arrays across engine boundaries
                if (Object.prototype.toString.apply(value) === '[object Array]' || value.constructor === Array || value instanceof Array) {
                    length = value.length;
                    for (i = 0; i < length; i += 1) { partial[i] = str(i, value) || 'null'; }
                    return partial.length === 0 ? '[]' : '[' + partial.join(',') + ']';
                }
                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) partial.push(quote(k) + ':' + v);
                    }
                }
                return partial.length === 0 ? '{}' : '{' + partial.join(',') + '}';
        }
    }
    CG_JSON.stringify = function (value) { return str('', {'': value}); };
    CG_JSON.parse = function (text) { return eval('(' + text + ')'); };
}());

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Core Safety Primitives
//
// The ONLY point of contact with Adobe's DOM. Every other section builds
// on these. All helpers are side-effect-free (read-only, never modify
// objects or project state).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Safely read a property from an object.
 * @param {Object} obj - The object to read from (may be null/undefined)
 * @param {string} prop - The property name
 * @returns {*} The property value, or null on any failure
 */
function _safeGet(obj, prop) {
    if (!obj) return null;
    try {
        var val = obj[prop];
        return (typeof val !== "undefined") ? val : null;
    } catch (e) {
        return null;
    }
}

/**
 * Safely call a method on an object.
 * @param {Object} obj - The object to call the method on
 * @param {string} method - The method name
 * @param {Array} [args] - Optional arguments array
 * @returns {*} The method return value, or null on any failure
 */
function _safeCall(obj, method, args) {
    if (!obj) return null;
    try {
        if (typeof obj[method] !== "function") return null;
        if (!args || args.length === 0) return obj[method]();
        if (args.length === 1) return obj[method](args[0]);
        if (args.length === 2) return obj[method](args[0], args[1]);
        if (args.length === 3) return obj[method](args[0], args[1], args[2]);
        return obj[method].apply(obj, args);
    } catch (e) {
        return null;
    }
}

/**
 * Safely extract seconds from a Premiere Time object or raw number.
 * @param {Object|number} timeObj - A Time object with .seconds, or a raw number
 * @returns {number} The time in seconds, or 0 on failure
 */
function _safeSeconds(timeObj) {
    if (!timeObj && timeObj !== 0) return 0;
    try {
        if (typeof timeObj === "number") return timeObj;
        if (typeof timeObj.seconds !== "undefined") return timeObj.seconds;
        return 0;
    } catch (e) {
        return 0;
    }
}

/**
 * Get the count of items in an Adobe collection.
 * Handles numItems, length, and numTracks across versions.
 * @param {Object} coll - An Adobe collection object
 * @returns {number} The item count, or 0
 */
function _collectionCount(coll) {
    if (!coll) return 0;
    try {
        if (typeof coll.numItems !== "undefined") return coll.numItems;
        if (typeof coll.length !== "undefined") return coll.length;
        if (typeof coll.numTracks !== "undefined") return coll.numTracks;
        return 0;
    } catch (e) {
        return 0;
    }
}

/**
 * Safely get an item from a collection by index.
 * @param {Object} coll - The collection
 * @param {number} index - Zero-based index
 * @returns {*} The item, or null
 */
function _collectionItem(coll, index) {
    if (!coll) return null;
    try {
        var item = coll[index];
        return (typeof item !== "undefined") ? item : null;
    } catch (e) {
        return null;
    }
}

/**
 * Safely iterate an Adobe collection. Exceptions inside the callback are
 * caught per-item — one bad item never stops the iteration.
 * @param {Object} coll - The collection
 * @param {Function} fn - Callback(item, index). Return a value to collect it.
 * @returns {Array} Array of non-null return values from fn
 */
function _forEachInCollection(coll, fn) {
    var results = [];
    var count = _collectionCount(coll);
    for (var i = 0; i < count; i++) {
        try {
            var item = _collectionItem(coll, i);
            if (item === null) continue;
            var result = fn(item, i);
            if (result !== null && typeof result !== "undefined") {
                results.push(result);
            }
        } catch (e) {
            // Per-item failure — continue to next item
        }
    }
    return results;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: Host Info
//
// Cached host detection. Called once, result reused everywhere.
// Side-effect-free.
// ═══════════════════════════════════════════════════════════════════════════

var _cachedHostInfo = null;

/**
 * Detect the host application and version. Result is cached.
 * @returns {{ hostName: string, hostVersion: string, isPremiere: boolean, isAfterEffects: boolean }}
 */
function _hostInfo() {
    if (_cachedHostInfo) return _cachedHostInfo;

    var hostName = "";
    var hostVersion = "";
    var isPR = false;
    var isAE = false;

    try { hostName = app.name || ""; } catch (e) {}
    try { hostVersion = app.version || ""; } catch (e) {}

    // Detect by capability, not by name string
    try {
        var project = _safeGet(app, "project");
        if (project) {
            isPR = (typeof project.activeSequence !== "undefined");
            isAE = (typeof project.activeItem !== "undefined");
        }
    } catch (e) {
        if (hostName.indexOf("Premiere") !== -1) isPR = true;
        if (hostName.indexOf("After Effects") !== -1) isAE = true;
    }

    _cachedHostInfo = {
        hostName: hostName,
        hostVersion: hostVersion,
        isPremiere: isPR,
        isAfterEffects: isAE
    };
    return _cachedHostInfo;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: CAPS — Adobe Capabilities
//
// Centralized capability detection. Business logic uses CAPS.hasX(obj)
// instead of scattered typeof checks. All methods are pure inspection —
// read-only, no side effects.
// ═══════════════════════════════════════════════════════════════════════════

var CAPS = {
    // --- Sequence capabilities ---

    /** Does this sequence support the getSelection() API? */
    hasGetSelection: function (seq) {
        if (!seq) return false;
        try { return typeof seq.getSelection === "function"; } catch (e) { return false; }
    },

    // --- Track / Clip capabilities ---

    /** Does this track expose a clips collection? */
    hasTrackClips: function (track) {
        if (!track) return false;
        try { return typeof track.clips !== "undefined" && track.clips !== null; } catch (e) { return false; }
    },

    /** Does this clip support selection checking? */
    hasIsSelected: function (clip) {
        if (!clip) return false;
        try {
            return typeof clip.isSelected === "function" || typeof clip.isSelected !== "undefined";
        } catch (e) { return false; }
    },

    /** Check if a clip is selected, handling both function and property forms. */
    isClipSelected: function (clip) {
        if (!clip) return false;
        try {
            if (typeof clip.isSelected === "function") return !!clip.isSelected();
            if (typeof clip.isSelected !== "undefined") return !!clip.isSelected;
        } catch (e) {}
        return false;
    },

    // --- ProjectItem capabilities ---

    /** Does this item support getMediaPath()? */
    hasMediaPath: function (item) {
        if (!item) return false;
        try { return typeof item.getMediaPath === "function"; } catch (e) { return false; }
    },

    /** Does this item support getFPS()? */
    hasFPS: function (item) {
        if (!item) return false;
        try { return typeof item.getFPS === "function"; } catch (e) { return false; }
    },

    /** Does this item support getInPoint()? */
    hasInPoint: function (item) {
        if (!item) return false;
        try { return typeof item.getInPoint === "function"; } catch (e) { return false; }
    },

    /** Does this item support getOutPoint()? */
    hasOutPoint: function (item) {
        if (!item) return false;
        try { return typeof item.getOutPoint === "function"; } catch (e) { return false; }
    },

    // --- Project capabilities ---

    /** Does this project have a non-empty selection? */
    hasProjectSelection: function (project) {
        if (!project) return false;
        var sel = _safeGet(project, "selection");
        if (!sel) return false;
        try { return typeof sel.length !== "undefined" && sel.length > 0; } catch (e) { return false; }
    },

    // --- After Effects capabilities ---

    /** Does this comp have selected layers? */
    hasSelectedLayers: function (comp) {
        if (!comp) return false;
        var layers = _safeGet(comp, "selectedLayers");
        if (!layers) return false;
        try { return typeof layers.length !== "undefined" && layers.length > 0; } catch (e) { return false; }
    }
};


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: Startup Self-Test & Capability Fingerprint
//
// Debug-gated. Runs once when host.jsx is loaded. Probes every capability
// and generates a compatibility report + short fingerprint hash.
// Side-effect-free: never modifies the project.
// ═══════════════════════════════════════════════════════════════════════════

var DEBUG_MODE = false;
var _compatReport = "";

(function _selfTest() {
    if (!DEBUG_MODE) return;

    var host = _hostInfo();
    var report = [];
    var featureBits = "";

    report.push("======================================");
    report.push("  Captiongrit Compatibility Report");
    report.push("======================================");
    report.push("Host: " + host.hostName);
    report.push("Version: " + host.hostVersion);
    report.push("Mode: " + (host.isPremiere ? "Premiere Pro" : host.isAfterEffects ? "After Effects" : "Unknown"));
    report.push("");
    report.push("Features:");

    if (host.isPremiere) {
        var project = _safeGet(app, "project");
        var seq = _safeGet(project, "activeSequence");

        var f1 = CAPS.hasGetSelection(seq);
        report.push("  " + (f1 ? "[Y]" : "[N]") + " getSelection()");
        featureBits += f1 ? "1" : "0";

        var f2 = CAPS.hasProjectSelection(project);
        report.push("  " + (f2 ? "[Y]" : "[N]") + " Project Panel Selection");
        featureBits += f2 ? "1" : "0";

        if (seq) {
            var vTracks = _safeGet(seq, "videoTracks");
            var firstTrack = _collectionItem(vTracks, 0);
            var firstClipColl = firstTrack ? _safeGet(firstTrack, "clips") : null;
            var firstClip = firstClipColl ? _collectionItem(firstClipColl, 0) : null;
            var firstPI = firstClip ? _safeGet(firstClip, "projectItem") : null;

            var f3 = CAPS.hasTrackClips(firstTrack);
            report.push("  " + (f3 ? "[Y]" : "[N]") + " Track.clips");
            featureBits += f3 ? "1" : "0";

            var f4 = CAPS.hasIsSelected(firstClip);
            report.push("  " + (f4 ? "[Y]" : "[N]") + " clip.isSelected()");
            featureBits += f4 ? "1" : "0";

            var f5 = CAPS.hasMediaPath(firstPI);
            report.push("  " + (f5 ? "[Y]" : "[N]") + " projectItem.getMediaPath()");
            featureBits += f5 ? "1" : "0";

            var f6 = CAPS.hasFPS(firstPI);
            report.push("  " + (f6 ? "[Y]" : "[N]") + " projectItem.getFPS()");
            featureBits += f6 ? "1" : "0";

            var f7 = CAPS.hasInPoint(firstPI);
            report.push("  " + (f7 ? "[Y]" : "[N]") + " projectItem.getInPoint()");
            featureBits += f7 ? "1" : "0";
        } else {
            report.push("  [!] No active sequence - some checks skipped");
            featureBits += "0000000";
        }
    } else if (host.isAfterEffects) {
        var project = _safeGet(app, "project");
        var comp = _safeGet(project, "activeItem");

        var f1 = CAPS.hasSelectedLayers(comp);
        report.push("  " + (f1 ? "[Y]" : "[N]") + " comp.selectedLayers");
        featureBits += f1 ? "1" : "0";

        var f2 = CAPS.hasProjectSelection(project);
        report.push("  " + (f2 ? "[Y]" : "[N]") + " project.selection");
        featureBits += f2 ? "1" : "0";
    }

    // Compute fingerprint: HOST-VERSION-HASH
    var prefix = host.isPremiere ? "PPRO" : host.isAfterEffects ? "AEFT" : "UNKN";
    var ver = host.hostVersion.split(".").slice(0, 2).join(".");

    // Simple hash from feature bits
    var hash = 0;
    var hashInput = prefix + ver + featureBits;
    for (var h = 0; h < hashInput.length; h++) {
        hash = ((hash << 5) - hash) + hashInput.charCodeAt(h);
        hash = hash & 0xFFFF; // 16-bit
    }
    var fingerprint = prefix + "-" + ver + "-" + hash.toString(16).toUpperCase();

    report.push("");
    report.push("Fingerprint: " + fingerprint);
    report.push("======================================");

    _compatReport = report.join("\n");

    // Output to ExtendScript console
    for (var r = 0; r < report.length; r++) {
        $.writeln("[Captiongrit] " + report[r]);
    }
})();

/** Debug-only: retrieve the compatibility report string. */
function getCompatibilityReport() {
    if (!DEBUG_MODE) return "Debug mode is disabled.";
    return _compatReport || "No report available.";
}


// ═══════════════════════════════════════════════════════════════════════════
// EXISTING CODE BELOW — UNTOUCHED IN PHASE 1
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: Clip Normalization & Extraction Strategies
//
// Each strategy returns an Array of normalized clips, or null.
// None throw. All Adobe access goes through the compatibility layer.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize a raw clip data object into the canonical shape.
 * Missing fields default to safe values.
 * @param {Object} raw - Object with optional name, file, duration, inPoint, frameRate, sequenceName, layerName
 * @returns {Object} Normalized clip object
 */
function _normalizeClip(raw) {
    if (!raw) return null;
    return {
        name:         raw.name || "Unknown Clip",
        file:         raw.file || "",
        duration:     raw.duration || 0,
        inPoint:      raw.inPoint || 0,
        frameRate:    raw.frameRate || 0,
        sequenceName: raw.sequenceName || "",
        layerName:    raw.layerName || ""
    };
}

/**
 * Safely extract clip metadata from a Premiere timeline clip object.
 * Shared by _premiereGetSelection and _premiereTrackScan.
 * @param {Object} clip - A Premiere TrackItem
 * @param {string} seqName - The active sequence name
 * @returns {Object|null} Normalized clip, or null if no valid media path
 */
function _extractPremiereClipData(clip, seqName) {
    if (!clip) return null;
    try {
        var projectItem = _safeGet(clip, "projectItem");
        if (!CAPS.hasMediaPath(projectItem)) return null;

        var mediaPath = _safeCall(projectItem, "getMediaPath");
        if (!mediaPath) return null;

        var clipName = _safeGet(clip, "name") || "Unknown Clip";
        var inPt = _safeSeconds(_safeGet(clip, "inPoint"));
        var startPt = _safeSeconds(_safeGet(clip, "start"));
        var endPt = _safeSeconds(_safeGet(clip, "end"));
        var fps = CAPS.hasFPS(projectItem) ? _safeCall(projectItem, "getFPS") : 0;

        return _normalizeClip({
            name: clipName,
            file: mediaPath,
            duration: endPt - startPt,
            inPoint: inPt,
            frameRate: fps || 0,
            sequenceName: seqName || "",
            layerName: clipName
        });
    } catch (e) {
        return null;
    }
}

/**
 * Check if a clip is a duplicate of one already in the results array.
 */
function _isDuplicateClip(clips, file, inPoint) {
    for (var d = 0; d < clips.length; d++) {
        if (clips[d].file === file && Math.abs(clips[d].inPoint - inPoint) < 0.1) {
            return true;
        }
    }
    return false;
}

// --- Premiere Pro Strategies ---

/**
 * Priority 1: Use seq.getSelection() if available.
 * @param {Object} seq - Active sequence
 * @returns {Array|null} Array of normalized clips, or null
 */
function _premiereGetSelection(seq) {
    if (!CAPS.hasGetSelection(seq)) return null;

    var selection = _safeCall(seq, "getSelection");
    if (!selection) return null;

    var count = _collectionCount(selection);
    if (count === 0) return null;

    var seqName = _safeGet(seq, "name") || "";
    var clips = [];

    for (var i = 0; i < count; i++) {
        var item = _collectionItem(selection, i);
        var clip = _extractPremiereClipData(item, seqName);
        if (clip && !_isDuplicateClip(clips, clip.file, clip.inPoint)) {
            clips.push(clip);
        }
    }

    return clips.length > 0 ? clips : null;
}

/**
 * Priority 2: Scan video and audio tracks for selected clips.
 * @param {Object} seq - Active sequence
 * @returns {Array|null} Array of normalized clips, or null
 */
function _premiereTrackScan(seq) {
    if (!seq) return null;

    var seqName = _safeGet(seq, "name") || "";
    var clips = [];

    // Scan both video and audio tracks
    var trackGroups = [];
    var vTracks = _safeGet(seq, "videoTracks");
    var aTracks = _safeGet(seq, "audioTracks");
    if (vTracks) trackGroups.push(vTracks);
    if (aTracks) trackGroups.push(aTracks);

    for (var g = 0; g < trackGroups.length; g++) {
        var numTracks = _collectionCount(trackGroups[g]);
        for (var t = 0; t < numTracks; t++) {
            var track = _collectionItem(trackGroups[g], t);
            if (!CAPS.hasTrackClips(track)) continue;

            var trackClips = _safeGet(track, "clips");
            var numClips = _collectionCount(trackClips);

            for (var c = 0; c < numClips; c++) {
                var clipItem = _collectionItem(trackClips, c);
                if (!CAPS.isClipSelected(clipItem)) continue;

                var clip = _extractPremiereClipData(clipItem, seqName);
                if (clip && !_isDuplicateClip(clips, clip.file, clip.inPoint)) {
                    clips.push(clip);
                }
            }
        }
    }

    return clips.length > 0 ? clips : null;
}

/**
 * Priority 3: Check the Project Panel selection.
 * @param {Object} project - app.project
 * @returns {Array|null} Array of normalized clips, or null
 */
function _premiereProjectPanel(project) {
    if (!CAPS.hasProjectSelection(project)) return null;

    var selection = _safeGet(project, "selection");
    var count = _collectionCount(selection);
    var clips = [];

    for (var k = 0; k < count; k++) {
        try {
            var selItem = _collectionItem(selection, k);
            if (!selItem) continue;

            var itemType = _safeGet(selItem, "type");
            if (itemType !== 1) continue; // type 1 = footage/media

            var pName = _safeGet(selItem, "name") || "Unknown Clip";
            var pPath = CAPS.hasMediaPath(selItem) ? _safeCall(selItem, "getMediaPath") : "";
            var pIn = 0;
            var pOut = 0;
            var pFps = 0;

            if (CAPS.hasInPoint(selItem)) {
                var inPtObj = _safeCall(selItem, "getInPoint");
                pIn = _safeSeconds(inPtObj);
            }
            if (CAPS.hasOutPoint(selItem)) {
                var outPtObj = _safeCall(selItem, "getOutPoint");
                pOut = _safeSeconds(outPtObj);
            }
            if (CAPS.hasFPS(selItem)) {
                pFps = _safeCall(selItem, "getFPS") || 0;
            }

            var pDur = (pOut > pIn) ? (pOut - pIn) : 0;

            clips.push(_normalizeClip({
                name: pName,
                file: pPath || "",
                duration: pDur,
                inPoint: pIn,
                frameRate: pFps
            }));
        } catch (e) {
            // Per-item failure — continue
        }
    }

    return clips.length > 0 ? clips : null;
}

// --- After Effects Strategies ---

/**
 * Priority 1: Get selected layers from the active composition.
 * @param {Object} comp - The active CompItem
 * @returns {Array|null} Array of normalized clips, or null
 */
function _aeSelectedLayers(comp) {
    if (!comp) return null;

    var isComp = false;
    try { isComp = (comp instanceof CompItem); } catch (e) {}
    if (!isComp) return null;

    if (!CAPS.hasSelectedLayers(comp)) return null;

    var selectedLayers = _safeGet(comp, "selectedLayers");
    var count = _collectionCount(selectedLayers);
    var clips = [];

    for (var i = 0; i < count; i++) {
        try {
            var layer = _collectionItem(selectedLayers, i);
            if (!layer) continue;

            var source = _safeGet(layer, "source");
            var isFootage = false;
            try { isFootage = (source && source instanceof FootageItem); } catch (e) {}

            var fsName = "";
            if (isFootage) {
                var file = _safeGet(source, "file");
                if (file) fsName = _safeGet(file, "fsName") || "";
            }

            var layerIn = _safeGet(layer, "inPoint") || 0;
            var layerOut = _safeGet(layer, "outPoint") || 0;
            var layerStart = _safeGet(layer, "startTime") || 0;
            var frameRate = (isFootage && source) ? (_safeGet(source, "frameRate") || 0) : (_safeGet(comp, "frameRate") || 0);
            var compName = _safeGet(comp, "name") || "";
            var layerName = _safeGet(layer, "name") || "";

            clips.push(_normalizeClip({
                name: (isFootage && source) ? (_safeGet(source, "name") || layerName) : layerName,
                file: fsName,
                duration: layerOut - layerIn,
                inPoint: layerIn - layerStart,
                frameRate: frameRate,
                sequenceName: compName,
                layerName: layerName
            }));
        } catch (e) {
            // Per-layer failure — continue
        }
    }

    return clips.length > 0 ? clips : null;
}

/**
 * Priority 2: Get footage items from the AE project panel selection.
 * @param {Object} project - app.project
 * @returns {Array|null} Array of normalized clips, or null
 */
function _aeProjectSelection(project) {
    if (!CAPS.hasProjectSelection(project)) return null;

    var selection = _safeGet(project, "selection");
    var count = _collectionCount(selection);
    var clips = [];

    for (var j = 0; j < count; j++) {
        try {
            var selItem = _collectionItem(selection, j);
            if (!selItem) continue;

            var isFootage = false;
            try { isFootage = (selItem instanceof FootageItem); } catch (e) {}
            if (!isFootage) continue;

            var file = _safeGet(selItem, "file");
            var fsName = file ? (_safeGet(file, "fsName") || "") : "";

            clips.push(_normalizeClip({
                name: _safeGet(selItem, "name") || "Unknown",
                file: fsName,
                duration: _safeGet(selItem, "duration") || 0,
                frameRate: _safeGet(selItem, "frameRate") || 0
            }));
        } catch (e) {
            // Per-item failure — continue
        }
    }

    return clips.length > 0 ? clips : null;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Legacy app detection helpers — still used by createTextLayers,
 * importFileToProject, jumpToTime. Will be removed in Phase 3/4.
 */
function isAfterEffects() {
    return _hostInfo().isAfterEffects;
}

function isPremiere() {
    return _hostInfo().isPremiere;
}

/**
 * Reads the active sequence or selected project item in AE or Premiere Pro.
 * Returns JSON string with clip metadata.
 *
 * Return format (unchanged — compatible with main.js):
 *   Success: JSON array of clip objects
 *   Failure: JSON object with { error: "...", log: [...] }
 */
function getActiveClipInfo() {
    var log = [];
    var host = _hostInfo();

    try {
        if (host.isPremiere) {
            // --- Premiere Pro path ---
            var project = _safeGet(app, "project");
            if (!project) {
                return CG_JSON.stringify({ error: "No project open.", log: log });
            }

            var seq = _safeGet(project, "activeSequence");
            log.push("activeSequence: " + (seq ? "yes" : "no"));

            var clips = null;

            // Strategy 1: seq.getSelection()
            if (seq) {
                clips = _premiereGetSelection(seq);
                if (clips) log.push("Source: getSelection (" + clips.length + " clips)");
            }

            // Strategy 2: Track scan for selected clips
            if (!clips && seq) {
                clips = _premiereTrackScan(seq);
                if (clips) log.push("Source: trackScan (" + clips.length + " clips)");
            }

            // Strategy 3: Project Panel selection
            if (!clips) {
                clips = _premiereProjectPanel(project);
                if (clips) log.push("Source: projectPanel (" + clips.length + " clips)");
            }

            if (clips && clips.length > 0) {
                return CG_JSON.stringify(clips);
            }

            return CG_JSON.stringify({
                error: "No selected clip found. Select a clip in the timeline or project panel.",
                log: log
            });

        } else if (host.isAfterEffects) {
            // --- After Effects path ---
            var project = _safeGet(app, "project");
            if (!project) {
                return CG_JSON.stringify({ error: "No project open.", log: log });
            }

            var comp = _safeGet(project, "activeItem");
            var clips = null;

            // Strategy 1: Selected layers in active comp
            clips = _aeSelectedLayers(comp);
            if (clips) log.push("Source: selectedLayers (" + clips.length + " clips)");

            // Strategy 2: Project panel selection
            if (!clips) {
                clips = _aeProjectSelection(project);
                if (clips) log.push("Source: projectSelection (" + clips.length + " clips)");
            }

            if (clips && clips.length > 0) {
                return CG_JSON.stringify(clips);
            }

            return CG_JSON.stringify({
                error: "No selected layer or footage found. Select a layer in the comp or footage in the project panel.",
                log: log
            });

        } else {
            return CG_JSON.stringify({
                error: "Unsupported host application: " + host.hostName,
                log: log
            });
        }
    } catch (e) {
        log.push("Exception: " + e.toString());
        return CG_JSON.stringify({ error: e.toString(), log: log });
    }
}




/**
 * Read a file and return its contents as Base64.
 * @param {string} filePath - Full path to the file to read
 * @returns {string} Base64-encoded file contents
 */
function readFileAsBase64(filePath) {
    try {
        var file = new File(filePath);
        if (!file.exists) {
            return CG_JSON.stringify({ error: "File not found: " + filePath });
        }
        file.encoding = "BINARY";
        file.open("r");
        var content = file.read();
        file.close();

        // Manual Base64 encoding for ExtendScript
        var b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var b64 = "";
        var i = 0;
        while (i < content.length) {
            var byte1 = content.charCodeAt(i++) & 0xFF;
            var byte2 = i < content.length ? content.charCodeAt(i++) & 0xFF : 0;
            var byte3 = i < content.length ? content.charCodeAt(i++) & 0xFF : 0;

            var enc1 = byte1 >> 2;
            var enc2 = ((byte1 & 3) << 4) | (byte2 >> 4);
            var enc3 = ((byte2 & 15) << 2) | (byte3 >> 6);
            var enc4 = byte3 & 63;

            if (i - 2 > content.length) { enc3 = 64; enc4 = 64; }
            else if (i - 1 > content.length) { enc4 = 64; }

            b64 += b64chars.charAt(enc1) + b64chars.charAt(enc2);
            b64 += (enc3 === 64 ? "=" : b64chars.charAt(enc3));
            b64 += (enc4 === 64 ? "=" : b64chars.charAt(enc4));
        }
        return b64;
    } catch (e) {
        return CG_JSON.stringify({ error: e.toString() });
    }
}

/**
 * Create text layers in the active composition from caption data. (After Effects only)
 * @param {string} captionsJSON - JSON string of caption objects array
 * @returns {string} Result message
 */
function createTextLayers(captionsJSON, textType) {
    try {
        if (!isAfterEffects()) {
            return CG_JSON.stringify({ error: "Text layer creation is only supported natively in After Effects." });
        }

        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return CG_JSON.stringify({ error: "No composition active. Please activate the composition containing your clip." });
        }

        var captions = CG_JSON.parse(captionsJSON);
        if (!captions || captions.length === 0) {
            return CG_JSON.stringify({ error: "No captions to create." });
        }

        // Close gaps: set each caption's end to the next caption's start
        for (var g = 0; g < captions.length - 1; g++) {
            captions[g].end = captions[g + 1].start;
        }

        app.beginUndoGroup("Captiongrit - Create Text Layers");

        for (var i = 0; i < captions.length; i++) {
            var caption = captions[i];
            var displayText = caption.display_text || caption.original || "";

            if (displayText === "") continue;

            var textLayer = comp.layers.addText(displayText);
            textLayer.inPoint = caption.start;
            textLayer.outPoint = caption.end;

            // Style the text
            var textProp = textLayer.property("Source Text");
            var textDoc = textProp.value;
            textDoc.fontSize = 48;
            textDoc.fillColor = [1, 1, 1]; // white
            textDoc.font = "Arial";
            textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
            textDoc.applyStroke = true;
            textDoc.strokeColor = [0, 0, 0]; // black stroke for readability
            textDoc.strokeWidth = 2;

            textProp.setValue(textDoc);

            // Position at bottom center
            textLayer.property("Position").setValue([comp.width / 2, comp.height * 0.85]);

            // Name the layer for easy identification
            textLayer.name = "Caption " + (i + 1);
        }

        app.endUndoGroup();

        return CG_JSON.stringify({ success: true, count: captions.length });
    } catch (e) {
        if (isAfterEffects()) {
            app.endUndoGroup();
        }
        return CG_JSON.stringify({ error: e.toString() });
    }
}

/**
 * Import a generated file directly into the Premiere Pro project bin. (Premiere Pro only)
 * @param {string} filePath - Absolute path to the file to import
 * @returns {string} Result message
 */
function importFileToProject(filePath) {
    try {
        if (isPremiere()) {
            var files = [filePath];
            app.project.importFiles(files, true, app.project.rootItem, false);
            return CG_JSON.stringify({ success: true, path: filePath });
        }
        return CG_JSON.stringify({ error: "Project file import is only supported in Premiere Pro." });
    } catch (e) {
        return CG_JSON.stringify({ error: e.toString() });
    }
}

/**
 * Export captions as an SRT file.
 * @param {string} captionsJSON - JSON string of caption objects array
 * @param {string} folderPath - Folder path to save the SRT file
 * @returns {string} Result message
 */
function exportSRT(captionsJSON, folderPath, filename) {
    try {
        var captions = CG_JSON.parse(captionsJSON);
        if (!captions || captions.length === 0) {
            return CG_JSON.stringify({ error: "No captions to export." });
        }

        // Close gaps: each caption's end = next caption's start
        for (var g = 0; g < captions.length - 1; g++) {
            captions[g].end = captions[g + 1].start;
        }

        var srtContent = "";
        for (var i = 0; i < captions.length; i++) {
            var caption = captions[i];
            var displayText = caption.display_text || caption.original || "";
            srtContent += (i + 1) + "\r\n";
            srtContent += formatSRTTime(caption.start) + " --> " + formatSRTTime(caption.end) + "\r\n";
            srtContent += displayText + "\r\n\r\n";
        }

        var finalName = filename || "captions.srt";
        var filePath = folderPath + "/" + finalName;
        var file = new File(filePath);
        file.encoding = "UTF-8";
        file.open("w");
        file.write("\uFEFF" + srtContent); // Add UTF-8 BOM
        file.close();

        return CG_JSON.stringify({ success: true, path: file.fsName });
    } catch (e) {
        return CG_JSON.stringify({ error: e.toString() });
    }
}

/**
 * Prompt user for save location and export captions as an SRT file.
 * @param {string} captionsJSON - JSON string of caption objects array
 * @param {string} defaultFilename - Suggested filename
 * @returns {string} Result message
 */
function exportSRTWithDialog(captionsJSON, defaultFilename) {
    try {
        var captions = CG_JSON.parse(captionsJSON);
        if (!captions || captions.length === 0) {
            return CG_JSON.stringify({ error: "No captions to export." });
        }

        var defaultFile = new File(Folder.myDocuments.fsName + "/" + (defaultFilename || "captions.srt"));
        var saveFile = defaultFile.saveDlg("Save SRT File", "SubRip Subtitle files:*.srt");

        if (!saveFile) {
            return CG_JSON.stringify({ cancelled: true });
        }

        // Close gaps: each caption's end = next caption's start
        for (var g = 0; g < captions.length - 1; g++) {
            captions[g].end = captions[g + 1].start;
        }

        var srtContent = "";
        for (var i = 0; i < captions.length; i++) {
            var caption = captions[i];
            var displayText = caption.display_text || caption.original || "";
            srtContent += (i + 1) + "\r\n";
            srtContent += formatSRTTime(caption.start) + " --> " + formatSRTTime(caption.end) + "\r\n";
            srtContent += displayText + "\r\n\r\n";
        }

        saveFile.encoding = "UTF-8";
        saveFile.open("w");
        saveFile.write("\uFEFF" + srtContent); // Add UTF-8 BOM
        saveFile.close();

        return CG_JSON.stringify({ success: true, path: saveFile.fsName });
    } catch (e) {
        return CG_JSON.stringify({ error: e.toString() });
    }
}

/**
 * Convert seconds to SRT timestamp format: HH:MM:SS,mmm
 * @param {number} totalSeconds - Time in seconds
 * @returns {string} Formatted SRT time string
 */
function formatSRTTime(totalSeconds) {
    var totalMillis = Math.round(totalSeconds * 1000);
    var hours = Math.floor(totalMillis / 3600000);
    var minutes = Math.floor((totalMillis % 3600000) / 60000);
    var seconds = Math.floor((totalMillis % 60000) / 1000);
    var millis = totalMillis % 1000;

    function pad(num, size) {
        var s = "000" + num;
        return s.substr(s.length - size);
    }

    return pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + "," + pad(millis, 3);
}

/**
 * Get the system temp directory path.
 * @returns {string} Path to system temp directory
 */
function getTempDir() {
    var tempDir = Folder.temp.fsName;
    return tempDir;
}

/**
 * Get the project folder path (for SRT export).
 * Works for both Premiere Pro and After Effects.
 * @returns {string} Path to the project folder
 */
function getProjectFolder() {
    // 1. Premiere Pro
    if (typeof app.project !== "undefined" && typeof app.project.path !== "undefined" && app.project.path) {
        var pPath = app.project.path;
        var lastSlash = pPath.lastIndexOf("/");
        if (lastSlash === -1) lastSlash = pPath.lastIndexOf("\\");
        if (lastSlash !== -1) {
            return pPath.substring(0, lastSlash);
        }
        return pPath;
    }
    // 2. After Effects
    if (typeof app.project !== "undefined" && app.project.file) {
        return app.project.file.parent.fsName;
    }
    // Fallback to user documents
    return Folder.myDocuments.fsName;
}

/**
 * Jump the playhead to a specific time in seconds.
 * Works for both Premiere Pro and After Effects.
 * @param {number} seconds - The time in seconds
 */
function jumpToTime(seconds) {
    try {
        if (isAfterEffects()) {
            if (app.project.activeItem && app.project.activeItem instanceof CompItem) {
                app.project.activeItem.time = seconds;
            }
        } else if (isPremiere()) {
            var seq = app.project.activeSequence;
            if (seq) {
                // Premiere Pro uses timecode objects
                seq.setPlayerPosition(seconds.toString());
            }
        }
        return CG_JSON.stringify({ success: true });
    } catch (e) {
        return CG_JSON.stringify({ error: e.toString() });
    }
}


