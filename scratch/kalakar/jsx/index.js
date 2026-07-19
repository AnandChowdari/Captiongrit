(function (thisObj) {// ----- EXTENDSCRIPT INCLUDES ------ //"object"!=typeof JSON&&(JSON={}),function(){"use strict";var rx_one=/^[\],:{}\s]*$/,rx_two=/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,rx_three=/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,rx_four=/(?:^|:|,)(?:\s*\[)+/g,rx_escapable=/[\\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,rx_dangerous=/[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,gap,indent,meta,rep;function f(t){return t<10?"0"+t:t}function this_value(){return this.valueOf()}function quote(t){return rx_escapable.lastIndex=0,rx_escapable.test(t)?'"'+t.replace(rx_escapable,function(t){var e=meta[t];return"string"==typeof e?e:"\\u"+("0000"+t.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+t+'"'}function str(t,e){var r,n,o,u,f,a=gap,i=e[t];switch(i&&"object"==typeof i&&"function"==typeof i.toJSON&&(i=i.toJSON(t)),"function"==typeof rep&&(i=rep.call(e,t,i)),typeof i){case"string":return quote(i);case"number":return isFinite(i)?String(i):"null";case"boolean":case"null":return String(i);case"object":if(!i)return"null";if(gap+=indent,f=[],"[object Array]"===Object.prototype.toString.apply(i)){for(u=i.length,r=0;r<u;r+=1)f[r]=str(r,i)||"null";return o=0===f.length?"[]":gap?"[\n"+gap+f.join(",\n"+gap)+"\n"+a+"]":"["+f.join(",")+"]",gap=a,o}if(rep&&"object"==typeof rep)for(u=rep.length,r=0;r<u;r+=1)"string"==typeof rep[r]&&(o=str(n=rep[r],i))&&f.push(quote(n)+(gap?": ":":")+o);else for(n in i)Object.prototype.hasOwnProperty.call(i,n)&&(o=str(n,i))&&f.push(quote(n)+(gap?": ":":")+o);return o=0===f.length?"{}":gap?"{\n"+gap+f.join(",\n"+gap)+"\n"+a+"}":"{"+f.join(",")+"}",gap=a,o}}"function"!=typeof Date.prototype.toJSON&&(Date.prototype.toJSON=function(){return isFinite(this.valueOf())?this.getUTCFullYear()+"-"+f(this.getUTCMonth()+1)+"-"+f(this.getUTCDate())+"T"+f(this.getUTCHours())+":"+f(this.getUTCMinutes())+":"+f(this.getUTCSeconds())+"Z":null},Boolean.prototype.toJSON=this_value,Number.prototype.toJSON=this_value,String.prototype.toJSON=this_value),"function"!=typeof JSON.stringify&&(meta={"\b":"\\b","\t":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},JSON.stringify=function(t,e,r){var n;if(gap="",indent="","number"==typeof r)for(n=0;n<r;n+=1)indent+=" ";else"string"==typeof r&&(indent=r);if(rep=e,e&&"function"!=typeof e&&("object"!=typeof e||"number"!=typeof e.length))throw new Error("JSON.stringify");return str("",{"":t})}),"function"!=typeof JSON.parse&&(JSON.parse=function(text,reviver){var j;function walk(t,e){var r,n,o=t[e];if(o&&"object"==typeof o)for(r in o)Object.prototype.hasOwnProperty.call(o,r)&&(void 0!==(n=walk(o,r))?o[r]=n:delete o[r]);return reviver.call(t,e,o)}if(text=String(text),rx_dangerous.lastIndex=0,rx_dangerous.test(text)&&(text=text.replace(rx_dangerous,function(t){return"\\u"+("0000"+t.charCodeAt(0).toString(16)).slice(-4)})),rx_one.test(text.replace(rx_two,"@").replace(rx_three,"]").replace(rx_four,"")))return j=eval("("+text+")"),"function"==typeof reviver?walk({"":j},""):j;throw new SyntaxError("JSON.parse")})}();// ---------------------------------- //// ----- EXTENDSCRIPT PONYFILLS -----function __objectFreeze(obj) { return obj; }// ---------------------------------- //var config = {
  id: "com.kalakar"};

var ns = config.id;

// ProjectItem Helpers

var getChildByName = function getChildByName(item, name) {
  for (var i = 0; i < item.children.numItems; i++) {
    var child = item.children[i];
    if (child.name === name) {
      return child;
    }
  }
};
var secondsToTime = function secondsToTime(seconds) {
  var time = new Time();
  time.seconds = seconds;
  return time;
};
var getTimecode = function getTimecode(t, frameRateTime, videoDisplayFormat) {
  var timecode = t.getFormatted(frameRateTime, videoDisplayFormat);
  return timecode;
};
var getTimecodeFromSequence = function getTimecodeFromSequence(t, sequence) {
  return getTimecode(t, sequence.getSettings().videoFrameRate, sequence.getSettings().videoDisplayFormat);
};

// QE DOM Methods

var qeGetClipAt = function qeGetClipAt(track, index) {
  var curClipIndex = -1;
  for (var i = 0; i < track.numItems; i++) {
    var item = track.getItemAt(i);
    
    var type = item.type;
    if (type === "Clip") {
      curClipIndex++;
      if (curClipIndex === index) {
        return item;
      }
    }
  }
};

var CAPTION_BLOCK_TRANSITION_TOLERANCE_SECONDS = 0.05;
var DEFAULT_CAPTION_STATE_TRANSITION_FRAMES = 4;
var TRACK_CLIP_START_TOLERANCE_SECONDS = 0.05;
var FAST_CLIP_LOOKAHEAD_COUNT = 6;

// Premiere represents sequence.end / sequence.zeroPoint as ticks;
// 254016000000 ticks per second. zeroPoint is the sequence's start-timecode
// offset (non-zero for sequences that begin at e.g. 01:00:00:00), so the
// playable duration is (end - zeroPoint), NOT end alone.
var SEQUENCE_TICKS_PER_SECOND = 254016000000;
var getSequenceDurationMs = function getSequenceDurationMs(sequence) {
  var endTicks = parseFloat(String(sequence.end));
  if (isNaN(endTicks) || endTicks <= 0) {
    return undefined;
  }
  var zeroTicks = parseFloat(String(sequence.zeroPoint));
  if (isNaN(zeroTicks) || zeroTicks < 0) {
    zeroTicks = 0;
  }
  var durationTicks = endTicks - zeroTicks;
  if (durationTicks <= 0) {
    return undefined;
  }
  return Math.round(durationTicks / SEQUENCE_TICKS_PER_SECOND * 1000);
};
var IN_OUT_EPSILON_SECONDS = 0.0005;
var getSequenceInOutInfo = function getSequenceInOutInfo(sequence) {
  var rawInSecs = sequence.getInPointAsTime().seconds;
  var rawOutSecs = sequence.getOutPointAsTime().seconds;
  var durationMs = getSequenceDurationMs(sequence);
  var durationSecs = typeof durationMs === "number" ? durationMs / 1000 : 0;
  var hasDuration = durationSecs > 0;

  // When no in/out point is set, Premiere returns sentinel values that fall
  // OUTSIDE the sequence (observed: large negatives like -400000s for both in
  // and out). getIn/OutPointAsTime are 0-based relative to the sequence start,
  // so a real point must lie within [0, duration]. Anything outside that is
  // "unset" — fall back to the full range (in = 0, out = duration) so we never
  // store garbage like -400000000ms.
  var inInRange = hasDuration && rawInSecs >= -IN_OUT_EPSILON_SECONDS && rawInSecs <= durationSecs + IN_OUT_EPSILON_SECONDS;
  var outInRange = hasDuration && rawOutSecs >= -IN_OUT_EPSILON_SECONDS && rawOutSecs <= durationSecs + IN_OUT_EPSILON_SECONDS;
  var inPointSecs = inInRange ? Math.max(0, Math.min(rawInSecs, durationSecs)) : 0;
  var outPointSecs = outInRange ? Math.min(rawOutSecs, durationSecs) : durationSecs;

  // A real selection = the user moved the in-point off the start or the
  // out-point off the end, with valid in-range values.
  var hasRealIn = inInRange && inPointSecs > IN_OUT_EPSILON_SECONDS;
  var hasRealOut = outInRange && hasDuration && outPointSecs < durationSecs - IN_OUT_EPSILON_SECONDS;
  var hasInOutSelection = hasRealIn || hasRealOut;
  return {
    hasInOutSelection: hasInOutSelection,
    inPointSecs: inPointSecs,
    outPointSecs: outPointSecs,
    inPointMs: Math.round(inPointSecs * 1000),
    outPointMs: Math.round(outPointSecs * 1000)
  };
};
var getProjectDirectory = function getProjectDirectory() {
  var projectPath = app.project.path || "";
  if (projectPath && projectPath.length > 0) {
    // app.project.path may use "/" even on Windows, so split on either
    // separator rather than an $.os-derived one (see exportSequenceToMp3).
    var lastSeparatorIndex = Math.max(projectPath.lastIndexOf("/"), projectPath.lastIndexOf("\\"));
    return {
      projectPath: projectPath,
      projectDirectory: lastSeparatorIndex >= 0 ? projectPath.substring(0, lastSeparatorIndex) : projectPath
    };
  }
  return {
    projectPath: "",
    projectDirectory: Folder.myDocuments.fsName
  };
};
var getSequencePreviewVideoClips = function getSequencePreviewVideoClips(sequence) {
  var clips = [];
  for (var trackIndex = 0; trackIndex < sequence.videoTracks.numTracks; trackIndex++) {
    var track = sequence.videoTracks[trackIndex];
    for (var clipIndex = 0; clipIndex < track.clips.numItems; clipIndex++) {
      var clip = track.clips[clipIndex];
      if (!clip || !clip.projectItem || isManagedKalakarClip(clip)) {
        continue;
      }
      var mediaPath = clip.projectItem.getMediaPath && clip.projectItem.getMediaPath();
      if (!mediaPath) {
        continue;
      }
      clips.push({
        path: mediaPath,
        name: clip.name || clip.projectItem.name || "",
        clipStartMs: Math.round(clip.start.seconds * 1000),
        clipEndMs: Math.round(clip.end.seconds * 1000),
        inPointMs: Math.round(clip.inPoint.seconds * 1000),
        outPointMs: Math.round(clip.outPoint.seconds * 1000),
        trackIndex: trackIndex
      });
    }
  }

  // Sort by trackIndex descending (highest track first) using insertion sort
  // so the React side can resolve priority with a first-match scan.
  for (var i = 1; i < clips.length; i++) {
    var temp = clips[i];
    var j = i - 1;
    while (j >= 0 && clips[j].trackIndex < temp.trackIndex) {
      clips[j + 1] = clips[j];
      j--;
    }
    clips[j + 1] = temp;
  }
  return clips;
};
var ensureBin = function ensureBin(parentBin, binName) {
  var existingBin = getChildByName(parentBin, binName);
  if (existingBin) {
    return existingBin;
  }
  return parentBin.createBin(binName);
};

// Premiere's getMediaPath() returns an OS-native path (backslashes plus a
// drive letter on Windows), while the panel supplies frame/SRT paths built
// with Node's path.join. On Windows those two differ by separator and often
// by drive-letter casing, so a raw string compare misses and the imported
// project items can't be resolved. (It works on macOS because both sides are
// already forward-slash paths with identical casing.) Canonicalize to forward
// slashes, and lowercase on Windows since its file system is case-insensitive;
// macOS keeps its original case because paths there can be case-sensitive.
var IS_WINDOWS_HOST = $.os.indexOf("Windows") !== -1;
var normalizeMediaPathKey = function normalizeMediaPathKey(value) {
  if (!value) {
    return "";
  }
  var normalized = String(value).replace(/\\/g, "/");
  if (IS_WINDOWS_HOST) {
    normalized = normalized.toLowerCase();
  }
  return normalized;
};
var _collectProjectItemsByMediaPath = function collectProjectItemsByMediaPath(item, pathIndex) {
  for (var childIndex = 0; childIndex < item.children.numItems; childIndex++) {
    var child = item.children[childIndex];
    if (child.type === 2 /* BIN */) {
      _collectProjectItemsByMediaPath(child, pathIndex);
      continue;
    }
    var mediaPath = child.getMediaPath && child.getMediaPath();
    if (mediaPath) {
      pathIndex[normalizeMediaPathKey(mediaPath)] = child;
    }
  }
};
var buildProjectItemPathIndex = function buildProjectItemPathIndex(item) {
  var pathIndex = {};
  _collectProjectItemsByMediaPath(item, pathIndex);
  return pathIndex;
};
var findClipOnTrack = function findClipOnTrack(track, projectItem, startSeconds, startIndex) {
  var projectItemNodeId = projectItem && projectItem.nodeId ? projectItem.nodeId : "";
  return findClipOnTrackByNodeId(track, projectItemNodeId, startSeconds, startIndex);
};
var findClipOnTrackByNodeId = function findClipOnTrackByNodeId(track, projectItemNodeId, startSeconds, startIndex) {
  var bestMatch = null;
  var bestMatchIndex = -1;
  var initialIndex = typeof startIndex === "number" && startIndex > 0 ? startIndex : 0;
  for (var clipIndex = initialIndex; clipIndex < track.clips.numItems; clipIndex++) {
    var clip = track.clips[clipIndex];
    var sameProjectItem = clip.projectItem && clip.projectItem.nodeId === projectItemNodeId;
    var sameStart = Math.abs(clip.start.seconds - startSeconds) <= TRACK_CLIP_START_TOLERANCE_SECONDS;
    if (sameProjectItem && sameStart) {
      bestMatch = clip;
      bestMatchIndex = clipIndex;
    }
  }
  return {
    clip: bestMatch,
    index: bestMatchIndex
  };
};
var matchesPlacedClipOnTrack = function matchesPlacedClipOnTrack(clip, projectItemNodeId, startSeconds) {
  if (!clip || !clip.projectItem) {
    return false;
  }
  return clip.projectItem.nodeId === projectItemNodeId && Math.abs(clip.start.seconds - startSeconds) <= TRACK_CLIP_START_TOLERANCE_SECONDS;
};
var resolveInsertedClipOnTrack = function resolveInsertedClipOnTrack(track, projectItemNodeId, startSeconds, startIndex, previousClipCount) {
  var trackClipCount = track.clips.numItems;
  if (trackClipCount < 1) {
    return {
      clip: null,
      index: -1
    };
  }
  var initialIndex = typeof startIndex === "number" && startIndex > 0 ? startIndex : 0;
  var candidateIndexes = {};
  var recordCandidateIndex = function recordCandidateIndex(clipIndex) {
    if (clipIndex >= 0 && clipIndex < trackClipCount) {
      candidateIndexes[clipIndex] = true;
    }
  };
  recordCandidateIndex(initialIndex);
  recordCandidateIndex(initialIndex + 1);
  recordCandidateIndex(initialIndex + 2);
  recordCandidateIndex(trackClipCount - 1);
  recordCandidateIndex(trackClipCount - 2);
  for (var candidateIndexKey in candidateIndexes) {
    if (!candidateIndexes[candidateIndexKey]) {
      continue;
    }
    var candidateIndex = parseInt(candidateIndexKey, 10);
    if (isNaN(candidateIndex)) {
      continue;
    }
    var candidateClip = track.clips[candidateIndex];
    if (matchesPlacedClipOnTrack(candidateClip, projectItemNodeId, startSeconds)) {
      return {
        clip: candidateClip,
        index: candidateIndex
      };
    }
  }
  if (typeof previousClipCount === "number" && previousClipCount >= 0 && previousClipCount < trackClipCount) {
    var growthCandidateClip = track.clips[previousClipCount];
    if (matchesPlacedClipOnTrack(growthCandidateClip, projectItemNodeId, startSeconds)) {
      return {
        clip: growthCandidateClip,
        index: previousClipCount
      };
    }
  }
  var boundedSearchStartIndex = Math.max(0, initialIndex - 1);
  var boundedSearchEndIndex = Math.min(trackClipCount - 1, boundedSearchStartIndex + FAST_CLIP_LOOKAHEAD_COUNT);
  for (var clipIndex = boundedSearchStartIndex; clipIndex <= boundedSearchEndIndex; clipIndex++) {
    var clipInWindow = track.clips[clipIndex];
    if (matchesPlacedClipOnTrack(clipInWindow, projectItemNodeId, startSeconds)) {
      return {
        clip: clipInWindow,
        index: clipIndex
      };
    }
  }
  return findClipOnTrackByNodeId(track, projectItemNodeId, startSeconds, boundedSearchStartIndex);
};
var rangesOverlap = function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
};
var isManagedKalakarClip = function isManagedKalakarClip(clip) {
  var clipName = clip.name || "";
  var projectItemName = clip.projectItem ? clip.projectItem.name || "" : "";
  return clipName.indexOf("kalakar__") === 0 || projectItemName.indexOf("kalakar__") === 0;
};
var buildMergedFrameRanges = function buildMergedFrameRanges(frames) {
  var mergedRanges = [];
  var sortedFrames = sortFramesByTime(frames.slice(0));
  for (var frameIndex = 0; frameIndex < sortedFrames.length; frameIndex++) {
    var frame = sortedFrames[frameIndex];
    var rangeStart = frame.startMs / 1000;
    var rangeEnd = (frame.startMs + frame.durationMs) / 1000;
    if (rangeEnd <= rangeStart) {
      rangeEnd = rangeStart + 0.04;
    }
    if (mergedRanges.length === 0) {
      mergedRanges.push({
        start: rangeStart,
        end: rangeEnd
      });
      continue;
    }
    var lastRange = mergedRanges[mergedRanges.length - 1];
    if (rangeStart <= lastRange.end) {
      if (rangeEnd > lastRange.end) {
        lastRange.end = rangeEnd;
      }
      continue;
    }
    mergedRanges.push({
      start: rangeStart,
      end: rangeEnd
    });
  }
  return mergedRanges;
};
var collectOverlappingClips = function collectOverlappingClips(track, frames) {
  var overlappingClips = [];
  var seen = {};
  var mergedRanges = buildMergedFrameRanges(frames);
  for (var clipIndex = 0; clipIndex < track.clips.numItems; clipIndex++) {
    var clip = track.clips[clipIndex];
    var clipStart = clip.start.seconds;
    var clipEnd = clip.end.seconds;
    for (var rangeIndex = 0; rangeIndex < mergedRanges.length; rangeIndex++) {
      var range = mergedRanges[rangeIndex];
      if (rangesOverlap(clipStart, clipEnd, range.start, range.end)) {
        if (!seen[clip.nodeId]) {
          overlappingClips.push(clip);
          seen[clip.nodeId] = true;
        }
        break;
      }
    }
  }
  return overlappingClips;
};
var sortFramesByTime = function sortFramesByTime(frames) {
  return frames.sort(function (a, b) {
    if (a.startMs === b.startMs) {
      var captionIndexA = typeof a.captionIndex === "number" ? a.captionIndex : 0;
      var captionIndexB = typeof b.captionIndex === "number" ? b.captionIndex : 0;
      var stepIndexA = typeof a.stepIndex === "number" ? a.stepIndex : 0;
      var stepIndexB = typeof b.stepIndex === "number" ? b.stepIndex : 0;
      var frameIndexA = typeof a.frameIndex === "number" ? a.frameIndex : 0;
      var frameIndexB = typeof b.frameIndex === "number" ? b.frameIndex : 0;
      if (captionIndexA === captionIndexB) {
        if (stepIndexA === stepIndexB) {
          return frameIndexA - frameIndexB;
        }
        return stepIndexA - stepIndexB;
      }
      return captionIndexA - captionIndexB;
    }
    return a.startMs - b.startMs;
  });
};
var getQeActiveSequence = function getQeActiveSequence() {
  if (typeof qe === "undefined") {
    app.enableQE();
  }
  if (!qe || !qe.project || !qe.project.getActiveSequence) {
    return null;
  }
  return qe.project.getActiveSequence();
};
var createOverlayVideoTrack = function createOverlayVideoTrack(sequence) {
  var currentVideoTrackCount = sequence.videoTracks.numTracks;
  var qeSequence = getQeActiveSequence();
  if (!qeSequence || !qeSequence.addTracks) {
    return null;
  }
  var created = qeSequence.addTracks(1, currentVideoTrackCount, 0, 1, 0, 0, 1, 0);
  if (!created) {
    return null;
  }
  var refreshedSequence = app.project.activeSequence;
  if (refreshedSequence && refreshedSequence.videoTracks.numTracks > currentVideoTrackCount) {
    return refreshedSequence.videoTracks.numTracks - 1;
  }
  return null;
};
var getCrossDissolveTransition = function getCrossDissolveTransition() {
  if (typeof qe === "undefined") {
    app.enableQE();
  }
  if (!qe || !qe.project || !qe.project.getVideoTransitionByName) {
    return null;
  }
  try {
    var exactMatch = qe.project.getVideoTransitionByName("Cross Dissolve");
    if (exactMatch) {
      return exactMatch;
    }
  } catch (error) {
    // Fall back to scanning the available transition names.
  }
  if (!qe.project.getVideoTransitionList) {
    return null;
  }
  var transitionNames = qe.project.getVideoTransitionList();
  try {
    $.writeln("[Kalakar] QE video transitions: " + JSON.stringify(transitionNames || []));
  } catch (error) {
    // Ignore debug logging failures.
  }
  if (!transitionNames || transitionNames.length === 0) {
    return null;
  }
  var fallbackName = "";
  for (var nameIndex = 0; nameIndex < transitionNames.length; nameIndex++) {
    var transitionName = transitionNames[nameIndex];
    if (transitionName && transitionName.toLowerCase() === "cross dissolve") {
      fallbackName = transitionName;
      break;
    }
  }
  if (!fallbackName) {
    for (var fuzzyNameIndex = 0; fuzzyNameIndex < transitionNames.length; fuzzyNameIndex++) {
      var fuzzyTransitionName = transitionNames[fuzzyNameIndex];
      var normalizedFuzzyName = fuzzyTransitionName ? fuzzyTransitionName.toLowerCase() : "";
      if (normalizedFuzzyName.indexOf("cross") > -1 && normalizedFuzzyName.indexOf("dissolve") > -1) {
        fallbackName = fuzzyTransitionName;
        break;
      }
    }
  }
  if (!fallbackName) {
    for (var dissolveNameIndex = 0; dissolveNameIndex < transitionNames.length; dissolveNameIndex++) {
      var dissolveTransitionName = transitionNames[dissolveNameIndex];
      var normalizedDissolveName = dissolveTransitionName ? dissolveTransitionName.toLowerCase() : "";
      if (normalizedDissolveName.indexOf("dissolve") > -1) {
        fallbackName = dissolveTransitionName;
        break;
      }
    }
  }
  if (!fallbackName) {
    return null;
  }
  try {
    return qe.project.getVideoTransitionByName(fallbackName);
  } catch (error) {
    return null;
  }
};
var getAvailableVideoTransitionNames = function getAvailableVideoTransitionNames() {
  if (typeof qe === "undefined") {
    app.enableQE();
  }
  if (!qe || !qe.project || !qe.project.getVideoTransitionList) {
    return [];
  }
  try {
    var transitionNames = qe.project.getVideoTransitionList();
    return transitionNames || [];
  } catch (error) {
    return [];
  }
};
var getAvailableVideoTransitions = function getAvailableVideoTransitions() {
  var transitions = getAvailableVideoTransitionNames();
  if (transitions.length > 0) {
    return {
      success: true,
      message: "Found " + transitions.length + " Premiere video transition" + (transitions.length === 1 ? "" : "s") + ".",
      transitions: transitions
    };
  }
  return {
    success: false,
    message: "Premiere did not return any video transitions. QE may be unavailable in the current session.",
    transitions: []
  };
};
var createAnimationReport = function createAnimationReport(presetId) {
  return {
    presetId: presetId,
    transitionsApplied: 0,
    effectsApplied: 0,
    fallbacks: [],
    availableVideoTransitions: []
  };
};
var pushAnimationFallback = function pushAnimationFallback(report, message) {
  for (var fallbackIndex = 0; fallbackIndex < report.fallbacks.length; fallbackIndex++) {
    if (report.fallbacks[fallbackIndex] === message) {
      return;
    }
  }
  report.fallbacks.push(message);
};
var trimAnimationName = function trimAnimationName(value) {
  return value.replace(/^\s+/, "").replace(/\s+$/, "");
};
var normalizeAnimationName = function normalizeAnimationName(value) {
  return trimAnimationName((value || "").toLowerCase().replace(/\s+/g, " "));
};
var resolveNamedMatch = function resolveNamedMatch(names, preferredNames) {
  if (!names || names.length === 0) {
    return "";
  }
  for (var preferredIndex = 0; preferredIndex < preferredNames.length; preferredIndex++) {
    var preferredName = preferredNames[preferredIndex];
    var normalizedPreferredName = normalizeAnimationName(preferredName);
    for (var exactIndex = 0; exactIndex < names.length; exactIndex++) {
      var exactCandidate = names[exactIndex];
      if (normalizeAnimationName(exactCandidate) === normalizedPreferredName) {
        return exactCandidate;
      }
    }
  }
  for (var fuzzyPreferredIndex = 0; fuzzyPreferredIndex < preferredNames.length; fuzzyPreferredIndex++) {
    var fuzzyPreferredName = preferredNames[fuzzyPreferredIndex];
    var normalizedFuzzyPreferredName = normalizeAnimationName(fuzzyPreferredName);
    for (var fuzzyIndex = 0; fuzzyIndex < names.length; fuzzyIndex++) {
      var fuzzyCandidate = names[fuzzyIndex];
      var normalizedFuzzyCandidate = normalizeAnimationName(fuzzyCandidate);
      if (normalizedFuzzyCandidate.indexOf(normalizedFuzzyPreferredName) > -1 || normalizedFuzzyPreferredName.indexOf(normalizedFuzzyCandidate) > -1) {
        return fuzzyCandidate;
      }
    }
  }
  return "";
};
var getVideoEffectByNames = function getVideoEffectByNames(preferredNames) {
  if (typeof qe === "undefined") {
    app.enableQE();
  }
  if (!qe || !qe.project || !qe.project.getVideoEffectByName) {
    return null;
  }
  for (var preferredIndex = 0; preferredIndex < preferredNames.length; preferredIndex++) {
    try {
      var exactMatch = qe.project.getVideoEffectByName(preferredNames[preferredIndex]);
      if (exactMatch) {
        return exactMatch;
      }
    } catch (error) {
      // Fall through to the list scan below.
    }
  }
  if (!qe.project.getVideoEffectList) {
    return null;
  }
  var effectNames = qe.project.getVideoEffectList();
  var resolvedName = resolveNamedMatch(effectNames, preferredNames);
  if (!resolvedName) {
    return null;
  }
  try {
    return qe.project.getVideoEffectByName(resolvedName);
  } catch (error) {
    return null;
  }
};
var getAnimationPresetDefinition = function getAnimationPresetDefinition(presetId) {
  switch (presetId) {
    case "ali-abdaal-polished":
      // No scale keyframes — render must match the static preview.  We
      // keep the preset registered (instead of switching the template
      // to `"none"`) so the XML cross-dissolve emitter and the
      // tail-extension code in useProjectPageController still treat
      // Ali Abdaal as the polished variant.  The motion keyframes
      // used to zoom 102→100 over 4 frames, which read as the active
      // line shrinking — user reported it doesn't match the preview
      // (where it's static) and asked to keep the render simple.
      return {
        id: presetId,
        label: "Ali Abdaal Polished",
        transitionFrames: 4,
        revealScale: 100,
        midScale: 100,
        finalScale: 100,
        blurEffectNames: null,
        blurDirection: 0,
        blurLength: 0
      };
    case "mrbeast-polished":
      return {
        id: presetId,
        label: "MrBeast Polished",
        transitionFrames: 2,
        revealScale: 108,
        midScale: 104,
        finalScale: 100,
        blurEffectNames: ["Directional Blur (Legacy)", "Directional Blur"],
        blurDirection: 0,
        blurLength: 12
      };
    case "kalakar":
      return {
        id: presetId,
        label: "Kalakar",
        transitionFrames: 4,
        revealScale: 108,
        midScale: 102,
        finalScale: 100,
        blurEffectNames: null,
        blurDirection: 0,
        blurLength: 0
      };
    case "kalakar-shadow":
      return {
        id: presetId,
        label: "Kalakar Shadow",
        transitionFrames: 5,
        revealScale: 105,
        midScale: 102,
        finalScale: 100,
        blurEffectNames: null,
        blurDirection: 0,
        blurLength: 0
      };
    case "kalakar-glow":
      return {
        id: presetId,
        label: "Kalakar Glow",
        transitionFrames: 6,
        revealScale: 110,
        midScale: 103,
        finalScale: 100,
        blurEffectNames: null,
        blurDirection: 0,
        blurLength: 0
      };
    case "kalakar-word":
      return {
        id: presetId,
        label: "Kalakar Word",
        transitionFrames: 8,
        revealScale: 100,
        midScale: 100,
        finalScale: 100,
        blurEffectNames: null,
        blurDirection: 0,
        blurLength: 0
      };
    default:
      return null;
  }
};
var getCaptionStateTransitionFrameCount = function getCaptionStateTransitionFrameCount(presetId) {
  var preset = getAnimationPresetDefinition(presetId);
  if (preset && preset.transitionFrames > 0) {
    return preset.transitionFrames;
  }
  return DEFAULT_CAPTION_STATE_TRANSITION_FRAMES;
};
var getSequenceFrameDurationSeconds = function getSequenceFrameDurationSeconds(sequence) {
  if (!sequence || !sequence.getSettings) {
    return 0;
  }
  var settings = sequence.getSettings();
  var frameRateTime = settings && settings.videoFrameRate;
  if (!frameRateTime || !frameRateTime.seconds || frameRateTime.seconds <= 0) {
    return 0;
  }
  return frameRateTime.seconds;
};
var snapSecondsUpToFrameGrid = function snapSecondsUpToFrameGrid(seconds, frameDurationSeconds) {
  if (frameDurationSeconds <= 0) {
    return seconds;
  }
  var frameIndex = Math.ceil(seconds / frameDurationSeconds - 0.000001);
  return Math.max(0, frameIndex * frameDurationSeconds);
};
var getTransitionDurationString = function getTransitionDurationString(sequence, frameCount) {
  var frameDurationSeconds = getSequenceFrameDurationSeconds(sequence);
  if (frameDurationSeconds <= 0 || frameCount <= 0) {
    return "";
  }
  try {
    return getTimecodeFromSequence(secondsToTime(frameDurationSeconds * frameCount), sequence);
  } catch (error) {
    return "";
  }
};
var buildStateTransitionPairs = function buildStateTransitionPairs(placedClips, transitionDurationSeconds) {
  var transitionPairs = [];
  for (var placedClipIndex = 0; placedClipIndex < placedClips.length - 1; placedClipIndex++) {
    var currentClip = placedClips[placedClipIndex];
    var nextClip = placedClips[placedClipIndex + 1];
    if (currentClip.frame.captionIndex !== nextClip.frame.captionIndex) {
      continue;
    }
    if (Math.abs(currentClip.endSeconds - nextClip.startSeconds) > CAPTION_BLOCK_TRANSITION_TOLERANCE_SECONDS) {
      continue;
    }
    var currentDuration = currentClip.endSeconds - currentClip.startSeconds;
    var nextDuration = nextClip.endSeconds - nextClip.startSeconds;
    var preferCentered = transitionDurationSeconds > 0 && currentDuration >= transitionDurationSeconds / 2 && nextDuration >= transitionDurationSeconds / 2;
    transitionPairs.push({
      outgoingClipIndex: currentClip.clipIndex,
      incomingClipIndex: nextClip.clipIndex,
      preferCentered: preferCentered
    });
  }
  return transitionPairs;
};
var tryAddTransitionToQeClip = function tryAddTransitionToQeClip(qeClip, transition, addToStart, durationString) {
  if (!qeClip || !qeClip.addTransition) {
    return false;
  }
  try {
    if (durationString) {
      var durationApplied = qeClip.addTransition(transition, addToStart, durationString);
      if (durationApplied) {
        return true;
      }
    }
  } catch (error) {
    // Fall back to Premiere's defaults below.
  }
  try {
    return qeClip.addTransition(transition, addToStart);
  } catch (error) {
    return false;
  }
};
var findComponentByNames = function findComponentByNames(clip, preferredNames) {
  if (!clip || !clip.components || !clip.components.numItems) {
    return null;
  }
  for (var componentIndex = 0; componentIndex < clip.components.numItems; componentIndex++) {
    var component = clip.components[componentIndex];
    var componentName = normalizeAnimationName(component && component.displayName ? component.displayName : "");
    for (var nameIndex = 0; nameIndex < preferredNames.length; nameIndex++) {
      var preferredName = normalizeAnimationName(preferredNames[nameIndex]);
      if (componentName === preferredName || componentName.indexOf(preferredName) > -1 || preferredName.indexOf(componentName) > -1) {
        return component;
      }
    }
  }
  return null;
};
var applyNumericComponentParams = function applyNumericComponentParams(clip, componentNames, paramValues, resolvedComponent, paramCache) {
  var component = typeof resolvedComponent !== "undefined" ? resolvedComponent : findComponentByNames(clip, componentNames);
  if (!component || !component.properties) {
    return {
      success: false,
      message: "Component " + componentNames.join(" / ") + " was not available on the clip."
    };
  }
  var paramCount = 0;
  for (var paramName in paramValues) {
    if (!paramValues.hasOwnProperty(paramName)) {
      continue;
    }
    var param = paramCache && paramCache.hasOwnProperty(paramName) ? paramCache[paramName] : component.properties.getParamForDisplayName(paramName);
    if (paramCache) {
      paramCache[paramName] = param || null;
    }
    if (!param) {
      return {
        success: false,
        message: "Parameter " + paramName + " was not available on " + component.displayName + "."
      };
    }
    try {
      if (!param.setValue(paramValues[paramName], true)) {
        return {
          success: false,
          message: "Premiere did not accept " + paramName + " on " + component.displayName + "."
        };
      }
      paramCount++;
    } catch (error) {
      return {
        success: false,
        message: "Setting " + paramName + " on " + component.displayName + " failed."
      };
    }
  }
  return {
    success: true,
    paramCount: paramCount
  };
};
var ensureVideoEffectOnClip = function ensureVideoEffectOnClip(qeClip, clip, effectNames, existingComponent) {
  var resolvedExistingComponent = typeof existingComponent !== "undefined" ? existingComponent : findComponentByNames(clip, effectNames);
  if (resolvedExistingComponent) {
    return {
      success: true,
      added: false
    };
  }
  if (!qeClip) {
    return {
      success: false,
      message: "QE was unavailable, so " + effectNames[0] + " could not be added."
    };
  }
  var effect = getVideoEffectByNames(effectNames);
  if (!effect) {
    return {
      success: false,
      message: effectNames[0] + " was not available in Premiere."
    };
  }
  try {
    if (!qeClip.addVideoEffect(effect)) {
      return {
        success: false,
        message: "Premiere did not add " + effectNames[0] + " to the clip."
      };
    }
  } catch (error) {
    return {
      success: false,
      message: "Adding " + effectNames[0] + " to the clip failed."
    };
  }
  return {
    success: true,
    added: true
  };
};
var captureAvailableTransitionsForFallback = function captureAvailableTransitionsForFallback(report) {
  if (report.availableVideoTransitions.length === 0) {
    report.availableVideoTransitions = getAvailableVideoTransitionNames();
  }
};
var getCaptionStateScale = function getCaptionStateScale(preset, stepInfo) {
  var localStepIndex = stepInfo.localStepIndex;
  var localStepCount = stepInfo.localStepCount;
  if (localStepCount <= 1 || localStepIndex >= localStepCount - 1) {
    return preset.finalScale;
  }
  var progress = localStepCount <= 2 ? 0 : localStepIndex / (localStepCount - 2);
  var startScale = localStepIndex === 0 ? preset.revealScale : preset.midScale;
  return startScale + (preset.finalScale - startScale) * progress;
};
var buildPlacedClipQeCache = function buildPlacedClipQeCache(qeTrack, placedClips) {
  var clipCache = {};
  if (!qeTrack) {
    return clipCache;
  }
  var neededIndexes = {};
  for (var placedClipIndex = 0; placedClipIndex < placedClips.length; placedClipIndex++) {
    var clipIndex = placedClips[placedClipIndex].clipIndex;
    if (clipIndex > -1) {
      neededIndexes[clipIndex] = true;
    }
  }
  var resolvedClipIndex = -1;
  for (var itemIndex = 0; itemIndex < qeTrack.numItems; itemIndex++) {
    var item = qeTrack.getItemAt(itemIndex);
    
    var itemType = item.type;
    if (itemType !== "Clip") {
      continue;
    }
    resolvedClipIndex++;
    if (neededIndexes.hasOwnProperty(resolvedClipIndex)) {
      clipCache[resolvedClipIndex] = item;
    }
  }
  for (var requiredIndex in neededIndexes) {
    if (!neededIndexes.hasOwnProperty(requiredIndex)) {
      continue;
    }
    var numericIndex = parseInt(requiredIndex, 10);
    if (!clipCache.hasOwnProperty(numericIndex)) {
      clipCache[numericIndex] = qeGetClipAt(qeTrack, numericIndex) || null;
    }
  }
  return clipCache;
};
var buildPlacedClipStepMetadata = function buildPlacedClipStepMetadata(placedClips) {
  var captionStepCounts = {};
  var metadata = {};
  for (var placedClipIndex = 0; placedClipIndex < placedClips.length; placedClipIndex++) {
    var captionIndex = placedClips[placedClipIndex].frame.captionIndex;
    var localStepIndex = captionStepCounts.hasOwnProperty(captionIndex) ? captionStepCounts[captionIndex] : 0;
    metadata[placedClipIndex] = {
      localStepIndex: localStepIndex,
      localStepCount: 0
    };
    captionStepCounts[captionIndex] = localStepIndex + 1;
  }
  for (var metadataIndex = 0; metadataIndex < placedClips.length; metadataIndex++) {
    var metadataCaptionIndex = placedClips[metadataIndex].frame.captionIndex;
    metadata[metadataIndex].localStepCount = captionStepCounts[metadataCaptionIndex];
  }
  return metadata;
};
var applyAnimationPresetToPlacedClips = function applyAnimationPresetToPlacedClips(sequence, trackIndex, placedClips, presetId, timingCollector) {
  var stageStartedAtMs = new Date().getTime();
  var markStage = function markStage(stageName) {
    if (timingCollector) {
      timingCollector[stageName] = new Date().getTime() - stageStartedAtMs;
    }
    stageStartedAtMs = new Date().getTime();
  };
  var report = createAnimationReport(presetId);
  var preset = getAnimationPresetDefinition(presetId);
  if (placedClips.length === 0) {
    return report;
  }

  // `none` (or any unknown preset) → no transitions, no scale, no
  // blur.  Pure static-PNG placement.  Required by Kalakar family
  // templates which render exact pre-computed positions per frame
  // and would be ruined by a dissolve cross-fade between PNGs.
  if (!preset) {
    return report;
  }
  var qeSequence = getQeActiveSequence();
  var qeTrack = qeSequence && qeSequence.getVideoTrackAt ? qeSequence.getVideoTrackAt(trackIndex) : null;
  var crossDissolve = getCrossDissolveTransition();
  var transitionFrameCount = getCaptionStateTransitionFrameCount(presetId);
  var transitionDurationSeconds = getSequenceFrameDurationSeconds(sequence) * transitionFrameCount;
  var transitionDurationString = getTransitionDurationString(sequence, transitionFrameCount);
  var transitionPairs = buildStateTransitionPairs(placedClips, transitionDurationSeconds);
  markStage("applyAnimationPresetBuildTransitionPairsMs");
  var qeClipCache = buildPlacedClipQeCache(qeTrack, placedClips);
  var clipStepMetadata = buildPlacedClipStepMetadata(placedClips);
  var componentCache = {};
  markStage("applyAnimationPresetResolveQeClipCacheMs");
  var transitionLabel = preset ? preset.label : "Animated PNG mode";
  if (!qeTrack) {
    captureAvailableTransitionsForFallback(report);
    pushAnimationFallback(report, "QE was unavailable, so " + transitionLabel + " transitions could not be applied.");
  } else if (!crossDissolve) {
    captureAvailableTransitionsForFallback(report);
    pushAnimationFallback(report, "Cross Dissolve was unavailable in Premiere for " + transitionLabel + ".");
  } else {
    for (var pairIndex = 0; pairIndex < transitionPairs.length; pairIndex++) {
      var pair = transitionPairs[pairIndex];
      var outgoingClip = qeClipCache[pair.outgoingClipIndex] || null;
      var incomingClip = qeClipCache[pair.incomingClipIndex] || null;
      var transitionApplied = false;
      if (incomingClip) {
        transitionApplied = tryAddTransitionToQeClip(incomingClip, crossDissolve, true, transitionDurationString);
      }
      if (!transitionApplied && pair.preferCentered && outgoingClip) {
        transitionApplied = tryAddTransitionToQeClip(outgoingClip, crossDissolve, false, transitionDurationString);
      }
      if (!transitionApplied && outgoingClip) {
        transitionApplied = tryAddTransitionToQeClip(outgoingClip, crossDissolve, false, transitionDurationString);
      }
      if (transitionApplied) {
        report.transitionsApplied++;
      }
    }
    if (transitionPairs.length > 0 && report.transitionsApplied === 0) {
      captureAvailableTransitionsForFallback(report);
      pushAnimationFallback(report, "Premiere did not apply Cross Dissolve transitions for " + transitionLabel + ".");
    }
  }
  markStage("applyAnimationPresetCrossDissolveMs");

  // (preset is guaranteed non-null here — the no-op fast path at the
  // top of this function exits before any cross-dissolve work runs
  // when presetId is "none".  Same convention as the empty-placedClips
  // early-out: no stage timing recorded when no work happens.)

  for (var placedClipIndex = 0; placedClipIndex < placedClips.length; placedClipIndex++) {
    var placedClip = placedClips[placedClipIndex];
    if (!componentCache[placedClipIndex]) {
      componentCache[placedClipIndex] = {};
    }
    var runtimeCache = componentCache[placedClipIndex];
    if (typeof runtimeCache.motionComponent === "undefined") {
      runtimeCache.motionComponent = findComponentByNames(placedClip.clip, ["Motion", "Basic Motion"]) || null;
    }
    if (!runtimeCache.motionParamCache) {
      runtimeCache.motionParamCache = {};
    }
    var scaleResult = applyNumericComponentParams(placedClip.clip, ["Motion", "Basic Motion"], {
      Scale: getCaptionStateScale(preset, clipStepMetadata[placedClipIndex])
    }, runtimeCache.motionComponent || null, runtimeCache.motionParamCache);
    if (scaleResult.success) {
      report.effectsApplied++;
    } else {
      pushAnimationFallback(report, scaleResult.message || "Premiere could not set Scale on the caption clip.");
    }
  }
  markStage("applyAnimationPresetScaleAdjustmentsMs");
  if (preset.blurEffectNames && preset.blurEffectNames.length > 0) {
    for (var blurEnsureIndex = 0; blurEnsureIndex < placedClips.length; blurEnsureIndex++) {
      var blurEnsurePlacedClip = placedClips[blurEnsureIndex];
      if (!componentCache[blurEnsureIndex]) {
        componentCache[blurEnsureIndex] = {};
      }
      var blurEnsureCache = componentCache[blurEnsureIndex];
      if (typeof blurEnsureCache.blurComponent === "undefined") {
        blurEnsureCache.blurComponent = findComponentByNames(blurEnsurePlacedClip.clip, preset.blurEffectNames) || null;
      }
      var qeClip = qeTrack && blurEnsurePlacedClip.clipIndex > -1 ? qeClipCache[blurEnsurePlacedClip.clipIndex] || null : null;
      var ensureEffectResult = ensureVideoEffectOnClip(qeClip || null, blurEnsurePlacedClip.clip, preset.blurEffectNames, blurEnsureCache.blurComponent);
      if (!ensureEffectResult.success) {
        captureAvailableTransitionsForFallback(report);
        pushAnimationFallback(report, ensureEffectResult.message || "Premiere could not add the requested blur effect to the caption clip.");
        continue;
      }
      if (ensureEffectResult.added || !blurEnsureCache.blurComponent) {
        blurEnsureCache.blurComponent = findComponentByNames(blurEnsurePlacedClip.clip, preset.blurEffectNames) || null;
      }
    }
  }
  markStage("applyAnimationPresetEnsureBlurEffectsMs");
  if (preset.blurEffectNames && preset.blurEffectNames.length > 0) {
    for (var blurApplyIndex = 0; blurApplyIndex < placedClips.length; blurApplyIndex++) {
      var blurApplyPlacedClip = placedClips[blurApplyIndex];
      var blurApplyCache = componentCache[blurApplyIndex];
      if (!blurApplyCache || !blurApplyCache.blurComponent) {
        continue;
      }
      if (!blurApplyCache.blurParamCache) {
        blurApplyCache.blurParamCache = {};
      }
      var blurResult = applyNumericComponentParams(blurApplyPlacedClip.clip, preset.blurEffectNames, {
        Direction: preset.blurDirection,
        "Blur Length": preset.blurLength
      }, blurApplyCache.blurComponent, blurApplyCache.blurParamCache);
      if (blurResult.success) {
        report.effectsApplied++;
      } else {
        pushAnimationFallback(report, blurResult.message || "Premiere could not update the caption blur effect.");
      }
    }
  }
  markStage("applyAnimationPresetApplyBlurParamsMs");
  return report;
};
var describeAnimationReport = function describeAnimationReport(report) {
  if (report.presetId === "none") {
    if (report.transitionsApplied === 0 && report.fallbacks.length === 0) {
      return "";
    }
    var defaultMessage = "Animated PNG mode applied " + report.transitionsApplied + " Cross Dissolve transition" + (report.transitionsApplied === 1 ? "" : "s") + ".";
    if (report.fallbacks.length > 0) {
      defaultMessage += " Fallbacks: " + report.fallbacks.join(" ");
    }
    return defaultMessage;
  }
  var preset = getAnimationPresetDefinition(report.presetId);
  var presetLabel = preset ? preset.label : report.presetId;
  var message = presetLabel + " applied " + report.transitionsApplied + " transition" + (report.transitionsApplied === 1 ? "" : "s") + " and " + report.effectsApplied + " effect adjustment" + (report.effectsApplied === 1 ? "" : "s") + ".";
  if (report.fallbacks.length > 0) {
    message += " Fallbacks: " + report.fallbacks.join(" ");
  }
  return message;
};
var getActiveSequenceCaptionInfo = function getActiveSequenceCaptionInfo() {
  var sequence = app.project.activeSequence;
  var projectLocation = getProjectDirectory();
  if (!sequence) {
    return {
      available: false,
      message: "No active sequence found.",
      hasInOutSelection: false,
      width: 1080,
      height: 1920,
      videoTrackCount: 0,
      playerPositionMs: 0,
      projectDirectory: projectLocation.projectDirectory,
      projectPath: projectLocation.projectPath
    };
  }
  var settings = sequence.getSettings();
  var allClips = getSequencePreviewVideoClips(sequence);
  var playerPositionMs = sequence.getPlayerPosition().seconds * 1000;

  // Find the clip at the playhead for backward-compatible single-clip fields.
  // allClips is sorted by trackIndex descending, so last match = lowest track.
  var previewClip = null;
  for (var ci = 0; ci < allClips.length; ci++) {
    if (allClips[ci].clipStartMs <= playerPositionMs && allClips[ci].clipEndMs > playerPositionMs) {
      previewClip = allClips[ci];
    }
  }
  var inOutInfo = getSequenceInOutInfo(sequence);
  return {
    available: true,
    sequenceName: sequence.name,
    hasInOutSelection: inOutInfo.hasInOutSelection,
    width: settings.videoFrameWidth,
    height: settings.videoFrameHeight,
    videoTrackCount: sequence.videoTracks.numTracks,
    playerPositionMs: playerPositionMs,
    projectDirectory: projectLocation.projectDirectory,
    projectPath: projectLocation.projectPath,
    sequenceInPointMs: inOutInfo.inPointMs,
    sequenceOutPointMs: inOutInfo.outPointMs,
    previewVideoPath: previewClip ? previewClip.path : undefined,
    previewVideoName: previewClip ? previewClip.name : undefined,
    previewVideoClipStartMs: previewClip ? previewClip.clipStartMs : undefined,
    previewVideoClipEndMs: previewClip ? previewClip.clipEndMs : undefined,
    previewVideoInPointMs: previewClip ? previewClip.inPointMs : undefined,
    previewVideoOutPointMs: previewClip ? previewClip.outPointMs : undefined,
    sequenceDurationMs: getSequenceDurationMs(sequence),
    previewVideoClips: allClips
  };
};
var qeDomFunction = function qeDomFunction() {
  if (typeof qe === "undefined") {
    app.enableQE();
  }
  if (qe) {
    qe.name;
    qe.project.getVideoEffectByName("test");
  }
};
var resolveNativeCaptionFormat = function resolveNativeCaptionFormat(captionFormat) {
  switch (captionFormat) {
    case "608":
      return Sequence.CAPTION_FORMAT_608;
    case "708":
      return Sequence.CAPTION_FORMAT_708;
    case "teletext":
      return Sequence.CAPTION_FORMAT_TELETEXT;
    case "open-ebu":
      return Sequence.CAPTION_FORMAT_OPEN_EBU;
    case "op42":
      return Sequence.CAPTION_FORMAT_OP42;
    case "op47":
      return Sequence.CAPTION_FORMAT_OP47;
    case "subtitle":
    default:
      return Sequence.CAPTION_FORMAT_SUBTITLE;
  }
};
var buildContinuousFrameRange = function buildContinuousFrameRange(frames) {
  if (!frames || frames.length === 0) {
    return null;
  }
  var startMs = frames[0].startMs;
  var endMs = frames[0].startMs + Math.max(1, frames[0].durationMs);
  for (var frameIndex = 1; frameIndex < frames.length; frameIndex++) {
    var frame = frames[frameIndex];
    startMs = Math.min(startMs, frame.startMs);
    endMs = Math.max(endMs, frame.startMs + Math.max(1, frame.durationMs));
  }
  return {
    startMs: startMs,
    durationMs: Math.max(1, endMs - startMs)
  };
};
var buildCaptionOverlaySequenceName = function buildCaptionOverlaySequenceName() {
  var randomPart = Math.floor(Math.random() * 1000000000);
  return "caption_" + randomPart;
};
var createNativeCaptionTrackFromSrt = function createNativeCaptionTrackFromSrt(request) {
  var sequence = app.project.activeSequence;
  if (!sequence) {
    return {
      success: false,
      message: "No active sequence found."
    };
  }
  if (!request || !request.srtPath) {
    return {
      success: false,
      message: "No SRT path was provided."
    };
  }
  var srtFile = new File(request.srtPath);
  if (!srtFile.exists) {
    return {
      success: false,
      message: "SRT file is missing: " + request.srtPath
    };
  }
  var rootItem = app.project.rootItem;
  var targetBin = ensureBin(rootItem, request.binName || "Kalakar Caption Sources");
  var importPaths = [request.srtPath];
  app.project.importFiles(importPaths, true, targetBin, false);
  var pathIndex = buildProjectItemPathIndex(targetBin);
  var srtPathKey = normalizeMediaPathKey(request.srtPath);
  var projectItem = pathIndex[srtPathKey];
  if (!projectItem) {
    pathIndex = buildProjectItemPathIndex(rootItem);
    projectItem = pathIndex[srtPathKey];
  }
  if (!projectItem) {
    return {
      success: false,
      message: "Could not find the imported caption source for " + request.srtPath,
      binName: targetBin.name
    };
  }
  var captionFormat = resolveNativeCaptionFormat(request.captionFormat);
  var startAtTime = typeof request.startAtTime === "number" && isFinite(request.startAtTime) ? Math.max(0, request.startAtTime) : 0;
  var created = sequence.createCaptionTrack(projectItem, startAtTime, captionFormat);
  if (!created) {
    return {
      success: false,
      message: "Premiere failed to create a native caption track from the imported SRT.",
      binName: targetBin.name,
      sourceProjectItemName: projectItem.name
    };
  }
  return {
    success: true,
    message: "Created a native subtitle track from " + projectItem.name + ". You can edit the captions in Premiere's Captions panel.",
    binName: targetBin.name,
    sourceProjectItemName: projectItem.name
  };
};
var placeCaptionAnimationFramesAsNestedSequence = function placeCaptionAnimationFramesAsNestedSequence(request) {
  var startedAtMs = new Date().getTime();
  var stageStartedAtMs = startedAtMs;
  var timing = {
    totalMs: 0
  };
  var finishStage = function finishStage(stageName) {
    timing[stageName] = new Date().getTime() - stageStartedAtMs;
    stageStartedAtMs = new Date().getTime();
  };
  var finalizeTiming = function finalizeTiming(failedStage) {
    timing.totalMs = new Date().getTime() - startedAtMs;
    if (failedStage) {
      timing.failedStage = failedStage;
    }
    return timing;
  };
  var animationPresetId = request && request.animationPresetId ? request.animationPresetId : "none";
  var createFailureResult = function createFailureResult(message, placedCount, trackNumber, sequenceName, failedStage) {
    return {
      success: false,
      message: message,
      placedCount: typeof placedCount === "number" ? placedCount : 0,
      animationReport: createAnimationReport(animationPresetId),
      trackNumber: trackNumber,
      sequenceName: sequenceName,
      timing: finalizeTiming(failedStage)
    };
  };
  var originalSequence = app.project.activeSequence;
  if (!originalSequence) {
    return createFailureResult("No active sequence found.", 0, undefined, undefined, "validate-frames");
  }
  if (!request || !request.frames || request.frames.length === 0) {
    return createFailureResult("No caption animation frames were provided.", 0, undefined, undefined, "validate-frames");
  }
  var trackIndex = request.trackIndex;
  if (trackIndex < 0 || trackIndex >= originalSequence.videoTracks.numTracks) {
    return createFailureResult("Target track V" + (trackIndex + 1) + " does not exist. Sequence has " + originalSequence.videoTracks.numTracks + " video tracks.", 0, undefined, undefined, "validate-frames");
  }
  var rootItem = app.project.rootItem;
  var targetBin = ensureBin(rootItem, request.binName || "Kalakar Caption PNGs");
  var sortedFrames = sortFramesByTime(request.frames.slice(0));
  var importPaths = [];
  for (var framePathIndex = 0; framePathIndex < sortedFrames.length; framePathIndex++) {
    var framePath = sortedFrames[framePathIndex].path;
    if (framePath) {
      if (!new File(framePath).exists) {
        return createFailureResult("Animation frame file is missing: " + framePath, 0, undefined, undefined, "validate-frames");
      }
      importPaths.push(framePath);
    }
  }
  if (importPaths.length === 0) {
    return createFailureResult("No valid animation frame paths were supplied.", 0, undefined, undefined, "validate-frames");
  }
  var continuousRange = buildContinuousFrameRange(sortedFrames);
  if (!continuousRange) {
    return createFailureResult("No valid caption animation range was resolved.", 0, undefined, undefined, "validate-frames");
  }
  finishStage("validateFramesMs");
  var actualTrackIndex = trackIndex;
  var targetTrack = originalSequence.videoTracks[actualTrackIndex];
  var overlappingClips = collectOverlappingClips(targetTrack, [continuousRange]);
  var movedToAutoTrack = false;
  if (overlappingClips.length > 0 && !request.clearExisting) {
    if (request.autoCreateTrack) {
      var autoTrackIndex = createOverlayVideoTrack(originalSequence);
      if (autoTrackIndex !== null) {
        var refreshedSequenceForAutoTrack = app.project.activeSequence;
        if (refreshedSequenceForAutoTrack && autoTrackIndex < refreshedSequenceForAutoTrack.videoTracks.numTracks) {
          actualTrackIndex = autoTrackIndex;
          targetTrack = refreshedSequenceForAutoTrack.videoTracks[actualTrackIndex];
          overlappingClips = collectOverlappingClips(targetTrack, [continuousRange]);
          movedToAutoTrack = true;
        }
      }
    }
    if (overlappingClips.length > 0) {
      return createFailureResult("Target track V" + (trackIndex + 1) + " overlaps the nested caption overlay range. Enable Replace Track or choose another track.", 0, actualTrackIndex + 1, undefined, "prepare-track");
    }
  }
  if (overlappingClips.length > 0 && request.clearExisting) {
    var hasUnmanagedOverlap = false;
    for (var overlapIndex = 0; overlapIndex < overlappingClips.length; overlapIndex++) {
      if (!isManagedKalakarClip(overlappingClips[overlapIndex])) {
        hasUnmanagedOverlap = true;
        break;
      }
    }
    if (hasUnmanagedOverlap && request.autoCreateTrack) {
      var fallbackTrackIndex = createOverlayVideoTrack(originalSequence);
      if (fallbackTrackIndex !== null) {
        var refreshedSequenceForFallback = app.project.activeSequence;
        if (refreshedSequenceForFallback && fallbackTrackIndex < refreshedSequenceForFallback.videoTracks.numTracks) {
          actualTrackIndex = fallbackTrackIndex;
          targetTrack = refreshedSequenceForFallback.videoTracks[actualTrackIndex];
          overlappingClips = collectOverlappingClips(targetTrack, [continuousRange]);
          movedToAutoTrack = true;
          hasUnmanagedOverlap = false;
          for (var fallbackOverlapIndex = 0; fallbackOverlapIndex < overlappingClips.length; fallbackOverlapIndex++) {
            if (!isManagedKalakarClip(overlappingClips[fallbackOverlapIndex])) {
              hasUnmanagedOverlap = true;
              break;
            }
          }
        }
      }
    }
    if (hasUnmanagedOverlap && overlappingClips.length > 0) {
      return createFailureResult("Target track V" + (trackIndex + 1) + " contains non-Kalakar clips inside the nested caption overlay range. Move them or choose a different track.", 0, actualTrackIndex + 1, undefined, "prepare-track");
    }
    if (overlappingClips.length > 0) {
      for (var removalIndex = overlappingClips.length - 1; removalIndex >= 0; removalIndex--) {
        overlappingClips[removalIndex].remove(false, false);
      }
    }
  }
  finishStage("prepareTrackMs");

  // Index what's ALREADY in the managed bin before importing, so we can
  // reuse project items from previous exports instead of re-importing the
  // same PNGs every run.  Re-importing made the bin — and this resolve
  // step — grow unboundedly across repeated exports (~6s → 15s → 43s as
  // duplicates piled up).  Frame filenames are deterministic per project,
  // so after the first export almost nothing new imports and the bin stops
  // growing.
  var pathIndex = buildProjectItemPathIndex(targetBin);
  var childCountBeforeImport = targetBin.children.numItems;
  var pathsToImport = [];
  var pathsToImportSeen = {};
  for (var importCandidateIndex = 0; importCandidateIndex < importPaths.length; importCandidateIndex++) {
    var candidateImportPath = importPaths[importCandidateIndex];
    var candidateImportKey = normalizeMediaPathKey(candidateImportPath);
    if (!pathIndex[candidateImportKey] && !pathsToImportSeen[candidateImportKey]) {
      pathsToImport.push(candidateImportPath);
      pathsToImportSeen[candidateImportKey] = true;
    }
  }
  if (pathsToImport.length > 0) {
    app.project.importFiles(pathsToImport, true, targetBin, false);
  }
  finishStage("importFilesMs");

  // Index ONLY the newly-appended children (importFiles appends to the end
  // of the flat bin) instead of re-walking the whole accumulated bin.  Any
  // path still unresolved afterward triggers the last-resort full rebuild
  // below, so correctness is preserved if this assumption ever breaks.
  var childCountAfterImport = targetBin.children.numItems;
  for (var newChildIndex = childCountBeforeImport; newChildIndex < childCountAfterImport; newChildIndex++) {
    var newChild = targetBin.children[newChildIndex];
    if (newChild.type === 2 /* BIN */) {
      continue;
    }
    var newChildMediaPath = newChild.getMediaPath && newChild.getMediaPath();
    if (newChildMediaPath) {
      pathIndex[normalizeMediaPathKey(newChildMediaPath)] = newChild;
    }
  }
  var resolvedProjectItems = [];
  for (var projectItemIndex = 0; projectItemIndex < sortedFrames.length; projectItemIndex++) {
    var framePathForLookup = normalizeMediaPathKey(sortedFrames[projectItemIndex].path);
    var resolvedProjectItem = pathIndex[framePathForLookup];
    if (!resolvedProjectItem) {
      pathIndex = buildProjectItemPathIndex(rootItem);
      resolvedProjectItem = pathIndex[framePathForLookup];
    }
    if (!resolvedProjectItem) {
      return createFailureResult("Could not find imported project item for " + sortedFrames[projectItemIndex].path, 0, actualTrackIndex + 1, undefined, "resolve-project-items");
    }
    resolvedProjectItems.push(resolvedProjectItem);
  }
  finishStage("resolveProjectItemsMs");
  var sequenceName = buildCaptionOverlaySequenceName();
  var overlaySequence = app.project.createNewSequenceFromClips(sequenceName, [resolvedProjectItems[0]], targetBin);
  if (!overlaySequence) {
    return createFailureResult("Premiere failed to create a nested caption overlay sequence.", 0, actualTrackIndex + 1, sequenceName, "create-overlay-sequence");
  }
  if (!overlaySequence.videoTracks || overlaySequence.videoTracks.numTracks < 1) {
    return createFailureResult("The nested caption overlay sequence was created without a video track.", 0, actualTrackIndex + 1, sequenceName, "create-overlay-sequence");
  }
  finishStage("createOverlaySequenceMs");
  var overlayTrack = overlaySequence.videoTracks[0];
  var overlayFrameDurationSeconds = getSequenceFrameDurationSeconds(overlaySequence);
  for (var existingClipIndex = overlayTrack.clips.numItems - 1; existingClipIndex >= 0; existingClipIndex--) {
    overlayTrack.clips[existingClipIndex].remove(false, false);
  }
  var placementPlans = [];
  var placeOverlayFramesPrecomputeTimingMs = 0;
  var placeOverlayFramesOverwriteClipMs = 0;
  var placeOverlayFramesResolveInsertedClipMs = 0;
  var placeOverlayFramesFinalizeClipMs = 0;
  var finalizeOverlayPlacementTimingBreakdown = function finalizeOverlayPlacementTimingBreakdown() {
    timing.placeOverlayFramesPrecomputeTimingMs = placeOverlayFramesPrecomputeTimingMs;
    timing.placeOverlayFramesOverwriteClipMs = placeOverlayFramesOverwriteClipMs;
    timing.placeOverlayFramesResolveInsertedClipMs = placeOverlayFramesResolveInsertedClipMs;
    timing.placeOverlayFramesFinalizeClipMs = placeOverlayFramesFinalizeClipMs;
  };
  var placementPrecomputeStartedAtMs = new Date().getTime();
  for (var placementPlanIndex = 0; placementPlanIndex < sortedFrames.length; placementPlanIndex++) {
    var placementFrame = sortedFrames[placementPlanIndex];
    var placementNextFrame = placementPlanIndex + 1 < sortedFrames.length ? sortedFrames[placementPlanIndex + 1] : null;
    var plannedRelativeStartSeconds = (placementFrame.startMs - continuousRange.startMs) / 1000;
    var plannedEndSeconds = placementNextFrame ? (placementNextFrame.startMs - continuousRange.startMs) / 1000 : continuousRange.durationMs / 1000;
    var relativeStartSeconds = snapSecondsUpToFrameGrid(plannedRelativeStartSeconds, overlayFrameDurationSeconds);
    var endSeconds = snapSecondsUpToFrameGrid(plannedEndSeconds, overlayFrameDurationSeconds);
    if (endSeconds <= relativeStartSeconds) {
      endSeconds = relativeStartSeconds + Math.max(overlayFrameDurationSeconds, 0.04);
    }
    placementPlans.push({
      frame: placementFrame,
      projectItem: resolvedProjectItems[placementPlanIndex],
      projectItemNodeId: resolvedProjectItems[placementPlanIndex].nodeId || "",
      relativeStartSeconds: relativeStartSeconds,
      endSeconds: endSeconds,
      endTime: secondsToTime(endSeconds),
      plannedStartMs: placementFrame.startMs,
      plannedEndMs: placementFrame.startMs + Math.max(1, placementFrame.durationMs),
      actualStartMs: Math.round(relativeStartSeconds * 1000 + continuousRange.startMs),
      actualEndMs: Math.round(endSeconds * 1000 + continuousRange.startMs)
    });
  }
  placeOverlayFramesPrecomputeTimingMs = new Date().getTime() - placementPrecomputeStartedAtMs;
  var placedCount = 0;
  var clipSearchIndex = 0;
  var placedClipReferences = [];
  var placedFrameTimings = [];
  for (var placementIndex = 0; placementIndex < placementPlans.length; placementIndex++) {
    var placementPlan = placementPlans[placementIndex];
    var frame = placementPlan.frame;
    var clipCountBeforeInsert = overlayTrack.clips.numItems;
    var overwriteStartedAtMs = new Date().getTime();
    var overwriteResult = overlayTrack.overwriteClip(placementPlan.projectItem, placementPlan.relativeStartSeconds);
    placeOverlayFramesOverwriteClipMs += new Date().getTime() - overwriteStartedAtMs;
    if (!overwriteResult) {
      finalizeOverlayPlacementTimingBreakdown();
      return createFailureResult("Premiere failed to place " + frame.path + " in " + sequenceName + ".", placedCount, actualTrackIndex + 1, sequenceName, "place-overlay-frames");
    }
    var resolveClipStartedAtMs = new Date().getTime();

    // Fast path: the overlay track started empty (all seed clips were
    // removed above) and frames are placed in strictly increasing,
    // non-overlapping time order, so every successful overwriteClip
    // APPENDS exactly one clip at the end of the track.  Trust that index
    // directly instead of rescanning the whole track for the just-placed
    // clip — that rescan read nodeId/start props across many candidate
    // clips and cost ~50% of total host time at scale (88s for 1057
    // clips).  A single cheap match verifies the assumption; only on a
    // miss (which should never happen for sequential placement) do we
    // fall back to the full search.
    var clipCountAfterInsert = overlayTrack.clips.numItems;
    var insertedClip = null;
    var insertedClipIndex = -1;

    // overwriteClip appended EXACTLY one new clip → it is unambiguously the
    // last one in this time-ordered track (we place at strictly increasing
    // start times).  Use that index directly without verifying nodeId/start,
    // which previously cost ~4-6 host bridge reads per clip (the verifying
    // version matched 1057/1057 placements, proving the assumption holds).
    // Any other delta (0, or >1 from an unexpected split) falls back to the
    // full search below.
    if (clipCountAfterInsert === clipCountBeforeInsert + 1) {
      insertedClipIndex = clipCountAfterInsert - 1;
      insertedClip = overlayTrack.clips[insertedClipIndex];
    }
    if (!insertedClip) {
      var resolvedClip = resolveInsertedClipOnTrack(overlayTrack, placementPlan.projectItemNodeId, placementPlan.relativeStartSeconds, clipSearchIndex, clipCountBeforeInsert);
      insertedClip = resolvedClip.clip;
      insertedClipIndex = resolvedClip.index;
    }
    placeOverlayFramesResolveInsertedClipMs += new Date().getTime() - resolveClipStartedAtMs;
    if (!insertedClip && overlayTrack.clips.numItems > 0) {
      insertedClipIndex = Math.max(0, overlayTrack.clips.numItems - 1);
      clipSearchIndex = insertedClipIndex;
      insertedClip = overlayTrack.clips[overlayTrack.clips.numItems - 1];
    } else if (insertedClipIndex >= 0) {
      clipSearchIndex = insertedClipIndex;
    }
    if (!insertedClip) {
      finalizeOverlayPlacementTimingBreakdown();
      return createFailureResult("Premiere placed a clip in " + sequenceName + ", but it could not be resolved afterward.", placedCount, actualTrackIndex + 1, sequenceName, "place-overlay-frames");
    }
    var finalizeClipStartedAtMs = new Date().getTime();
    insertedClip.end = placementPlan.endTime;
    placedFrameTimings.push({
      id: frame.id,
      path: frame.path,
      captionIndex: frame.captionIndex,
      stepIndex: frame.stepIndex,
      frameIndex: frame.frameIndex,
      plannedStartMs: placementPlan.plannedStartMs,
      plannedEndMs: placementPlan.plannedEndMs,
      actualStartMs: placementPlan.actualStartMs,
      actualEndMs: placementPlan.actualEndMs
    });
    placedClipReferences.push({
      frame: frame,
      clip: insertedClip,
      clipIndex: insertedClipIndex,
      startSeconds: placementPlan.relativeStartSeconds,
      endSeconds: placementPlan.endSeconds
    });
    clipSearchIndex = Math.max(0, insertedClipIndex);
    placedCount++;
    placeOverlayFramesFinalizeClipMs += new Date().getTime() - finalizeClipStartedAtMs;
  }
  finalizeOverlayPlacementTimingBreakdown();
  finishStage("placeOverlayFramesMs");
  var animationReport = applyAnimationPresetToPlacedClips(overlaySequence, 0, placedClipReferences, animationPresetId, timing);
  finishStage("applyAnimationPresetMs");
  if (originalSequence.sequenceID) {
    app.project.openSequence(originalSequence.sequenceID);
  }
  finishStage("reopenOriginalSequenceMs");

  // Use the ORIGINAL sequence reference (which owns the target/created
  // track) as authoritative — do NOT trust app.project.activeSequence here.
  // After building a large overlay, openSequence() can be slow to settle, so
  // activeSequence may transiently still be the 1-track overlay sequence;
  // trusting it made the track-index check below fail intermittently at
  // place-nested-sequence.  Only adopt activeSequence when it is provably the
  // same sequence we started from.
  var placementSequence = originalSequence;
  var activeSequenceAfterReopen = app.project.activeSequence;
  if (activeSequenceAfterReopen && originalSequence.sequenceID && activeSequenceAfterReopen.sequenceID === originalSequence.sequenceID) {
    placementSequence = activeSequenceAfterReopen;
  }
  if (actualTrackIndex < 0 || actualTrackIndex >= placementSequence.videoTracks.numTracks) {
    return createFailureResult("Premiere could not restore the target sequence for nested overlay placement." + " (track index " + actualTrackIndex + " out of range; restored sequence has " + placementSequence.videoTracks.numTracks + " video track(s); placed " + placedCount + " overlay clip(s).)", placedCount, actualTrackIndex + 1, sequenceName, "place-nested-sequence");
  }
  targetTrack = placementSequence.videoTracks[actualTrackIndex];
  var placementFrameDurationSeconds = getSequenceFrameDurationSeconds(placementSequence);
  var overlayStartSeconds = snapSecondsUpToFrameGrid(continuousRange.startMs / 1000, placementFrameDurationSeconds);
  var overlayEndSeconds = snapSecondsUpToFrameGrid((continuousRange.startMs + continuousRange.durationMs) / 1000, placementFrameDurationSeconds);
  if (overlayEndSeconds <= overlayStartSeconds) {
    overlayEndSeconds = overlayStartSeconds + Math.max(placementFrameDurationSeconds, 0.04);
  }
  var overlayProjectItem = overlaySequence.projectItem;
  var nestedOverwriteResult = overlayProjectItem ? targetTrack.overwriteClip(overlayProjectItem, overlayStartSeconds) : null;
  if (!nestedOverwriteResult) {
    return createFailureResult("Premiere created " + sequenceName + ", but failed to place the nested sequence on V" + (actualTrackIndex + 1) + ". (overlay projectItem " + (overlayProjectItem ? "present" : "MISSING") + "; placed " + placedCount + " overlay clip(s); nest start " + overlayStartSeconds.toFixed(3) + "s, end " + overlayEndSeconds.toFixed(3) + "s; target sequence has " + placementSequence.videoTracks.numTracks + " video track(s).)", placedCount, actualTrackIndex + 1, sequenceName, "place-nested-sequence");
  }
  var nestedClipResult = findClipOnTrack(targetTrack, overlaySequence.projectItem, overlayStartSeconds);
  if (nestedClipResult.clip) {
    nestedClipResult.clip.end = secondsToTime(overlayEndSeconds);
  }
  finishStage("placeNestedSequenceMs");
  var placementMessage = movedToAutoTrack ? "Created V" + (actualTrackIndex + 1) + " for nested caption overlays, built " + sequenceName + ", and placed it there." : "Built " + sequenceName + " and placed the nested caption overlay on V" + (actualTrackIndex + 1) + ".";
  var animationMessage = describeAnimationReport(animationReport);
  if (animationMessage) {
    placementMessage += " " + animationMessage;
  }
  return {
    success: true,
    message: placementMessage,
    placedCount: placedCount,
    animationReport: animationReport,
    trackNumber: actualTrackIndex + 1,
    binName: targetBin.name,
    sequenceName: sequenceName,
    placedFrameTimings: placedFrameTimings,
    timing: finalizeTiming()
  };
};

/**
 * Placement v2: import a pre-built FCP7 (xmeml) overlay timeline in ONE
 * app.project.importFiles() call — the same API FireCut uses — then nest the
 * resulting sequence onto the target track.  Replaces the per-clip scripted
 * overwriteClip loop (v1), which dominates host time at scale.
 */
var importCaptionOverlayFromXml = function importCaptionOverlayFromXml(request) {
  var startedAtMs = new Date().getTime();
  var stageStartedAtMs = startedAtMs;
  var timing = {
    totalMs: 0
  };
  var finishStage = function finishStage(name) {
    timing[name] = new Date().getTime() - stageStartedAtMs;
    stageStartedAtMs = new Date().getTime();
  };
  var fail = function fail(message, failedStage, placedCount) {
    timing.totalMs = new Date().getTime() - startedAtMs;
    timing.failedStage = failedStage;
    return {
      success: false,
      message: message,
      placedCount: typeof placedCount === "number" ? placedCount : 0,
      timing: timing
    };
  };
  var originalSequence = app.project.activeSequence;
  if (!originalSequence) {
    return fail("No active sequence found.", "validate-frames");
  }
  if (!request || !request.frames || request.frames.length === 0) {
    return fail("No caption animation frames were provided.", "validate-frames");
  }
  if (!request.xmlPath || !new File(request.xmlPath).exists) {
    return fail("Overlay XML not found at " + (request.xmlPath || "(empty)") + ".", "validate-frames");
  }
  var sortedFrames = sortFramesByTime(request.frames.slice(0));
  var continuousRange = buildContinuousFrameRange(sortedFrames);
  if (!continuousRange) {
    return fail("No valid caption animation range was resolved.", "validate-frames");
  }
  finishStage("validateFramesMs");

  // --- Resolve / auto-create the target track on the ORIGINAL sequence ---
  var trackIndex = request.trackIndex;
  if (trackIndex < 0 || trackIndex >= originalSequence.videoTracks.numTracks) {
    return fail("Target track V" + (trackIndex + 1) + " does not exist. Sequence has " + originalSequence.videoTracks.numTracks + " video tracks.", "prepare-track");
  }
  var actualTrackIndex = trackIndex;
  var targetTrack = originalSequence.videoTracks[actualTrackIndex];
  var overlappingClips = collectOverlappingClips(targetTrack, sortedFrames);
  var movedToAutoTrack = false;
  if (overlappingClips.length > 0) {
    var hasUnmanaged = false;
    for (var oi = 0; oi < overlappingClips.length; oi++) {
      if (!isManagedKalakarClip(overlappingClips[oi])) {
        hasUnmanaged = true;
        break;
      }
    }
    var mustMove = hasUnmanaged || !request.clearExisting;
    if (mustMove && request.autoCreateTrack) {
      var newTrackIndex = createOverlayVideoTrack(originalSequence);
      if (newTrackIndex !== null) {
        var refreshed = app.project.activeSequence;
        if (refreshed && newTrackIndex < refreshed.videoTracks.numTracks) {
          actualTrackIndex = newTrackIndex;
          targetTrack = refreshed.videoTracks[actualTrackIndex];
          overlappingClips = [];
          movedToAutoTrack = true;
        }
      }
    }
    if (overlappingClips.length > 0) {
      if (hasUnmanaged) {
        return fail("Target track V" + (trackIndex + 1) + " contains non-Kalakar clips inside the caption range. Move them or choose another track.", "prepare-track");
      }
      if (request.clearExisting) {
        for (var ri = overlappingClips.length - 1; ri >= 0; ri--) {
          overlappingClips[ri].remove(false, false);
        }
      } else {
        return fail("Target track V" + (trackIndex + 1) + " has overlapping clips. Enable Replace Track to replace overlapping Kalakar captions only.", "prepare-track");
      }
    }
  }
  finishStage("prepareTrackMs");

  // --- Snapshot existing sequence IDs, then import the XML in ONE call ---
  var seqIdsBefore = {};
  for (var sb = 0; sb < app.project.sequences.numSequences; sb++) {
    var existing = app.project.sequences[sb];
    if (existing && existing.sequenceID) {
      seqIdsBefore[existing.sequenceID] = true;
    }
  }
  var seqCountBefore = app.project.sequences.numSequences;
  var rootItem = app.project.rootItem;
  var targetBin = ensureBin(rootItem, request.binName || "Kalakar Caption PNGs");
  app.project.importFiles([request.xmlPath], true, targetBin, false);
  finishStage("importXmlMs");

  // --- Find the imported overlay sequence (new ID first, else newest name) ---
  var overlaySequence = null;
  var newestNameMatch = null;
  for (var sa = 0; sa < app.project.sequences.numSequences; sa++) {
    var candidate = app.project.sequences[sa];
    if (!candidate) {
      continue;
    }
    if (candidate.sequenceID && !seqIdsBefore[candidate.sequenceID]) {
      overlaySequence = candidate;
    }
    if (candidate.name === request.overlaySequenceName) {
      newestNameMatch = candidate;
    }
  }
  if (!overlaySequence) {
    overlaySequence = newestNameMatch;
  }
  if (!overlaySequence) {
    return fail("importFiles did not create a sequence from the overlay XML." + " (sequences before " + seqCountBefore + ", after " + app.project.sequences.numSequences + "; looked for name '" + request.overlaySequenceName + "'. XML: " + request.xmlPath + ")", "find-sequence");
  }
  finishStage("findSequenceMs");

  // --- Nest the overlay sequence onto the target track ---
  if (originalSequence.sequenceID) {
    app.project.openSequence(originalSequence.sequenceID);
  }
  var placementSequence = originalSequence;
  var activeAfter = app.project.activeSequence;
  if (activeAfter && originalSequence.sequenceID && activeAfter.sequenceID === originalSequence.sequenceID) {
    placementSequence = activeAfter;
  }
  if (actualTrackIndex < 0 || actualTrackIndex >= placementSequence.videoTracks.numTracks) {
    return fail("Could not restore the target sequence for nested overlay placement." + " (track index " + actualTrackIndex + " out of range; restored sequence has " + placementSequence.videoTracks.numTracks + " video track(s).)", "place-nested-sequence", sortedFrames.length);
  }
  targetTrack = placementSequence.videoTracks[actualTrackIndex];
  var frameDurSec = getSequenceFrameDurationSeconds(placementSequence);
  var overlayStartSeconds = snapSecondsUpToFrameGrid(continuousRange.startMs / 1000, frameDurSec);
  var overlayEndSeconds = snapSecondsUpToFrameGrid((continuousRange.startMs + continuousRange.durationMs) / 1000, frameDurSec);
  if (overlayEndSeconds <= overlayStartSeconds) {
    overlayEndSeconds = overlayStartSeconds + Math.max(frameDurSec, 0.04);
  }
  var overlayProjectItem = overlaySequence.projectItem;
  var nestedResult = overlayProjectItem ? targetTrack.overwriteClip(overlayProjectItem, overlayStartSeconds) : null;
  if (!nestedResult) {
    return fail("Imported the overlay sequence but failed to place it on V" + (actualTrackIndex + 1) + ". (overlay projectItem " + (overlayProjectItem ? "present" : "MISSING") + "; nest start " + overlayStartSeconds.toFixed(3) + "s.)", "place-nested-sequence", sortedFrames.length);
  }
  var nestedClip = findClipOnTrack(targetTrack, overlaySequence.projectItem, overlayStartSeconds);
  if (nestedClip.clip) {
    nestedClip.clip.end = secondsToTime(overlayEndSeconds);
  }
  finishStage("nestMs");
  timing.totalMs = new Date().getTime() - startedAtMs;
  return {
    success: true,
    message: movedToAutoTrack ? "Created V" + (actualTrackIndex + 1) + " and placed the imported caption overlay there." : "Placed the imported caption overlay on V" + (actualTrackIndex + 1) + ".",
    placedCount: sortedFrames.length,
    trackNumber: actualTrackIndex + 1,
    sequenceName: request.overlaySequenceName,
    timing: timing
  };
};
var placeCaptionAnimationFramesOnTrack = function placeCaptionAnimationFramesOnTrack(request) {
  var animationPresetId = request && request.animationPresetId ? request.animationPresetId : "none";
  var createFailureResult = function createFailureResult(message, placedCount) {
    return {
      success: false,
      message: message,
      placedCount: typeof placedCount === "number" ? placedCount : 0,
      animationReport: createAnimationReport(animationPresetId)
    };
  };
  var sequence = app.project.activeSequence;
  if (!sequence) {
    return createFailureResult("No active sequence found.");
  }
  if (!request || !request.frames || request.frames.length === 0) {
    return createFailureResult("No caption animation frames were provided.");
  }
  var trackIndex = request.trackIndex;
  if (trackIndex < 0 || trackIndex >= sequence.videoTracks.numTracks) {
    return createFailureResult("Target track V" + (trackIndex + 1) + " does not exist. Sequence has " + sequence.videoTracks.numTracks + " video tracks.");
  }
  var actualTrackIndex = trackIndex;
  var targetTrack = sequence.videoTracks[actualTrackIndex];
  var rootItem = app.project.rootItem;
  var targetBin = ensureBin(rootItem, request.binName || "Kalakar Caption PNGs");
  var importPaths = [];
  var sortedFrames = sortFramesByTime(request.frames.slice(0));
  for (var framePathIndex = 0; framePathIndex < sortedFrames.length; framePathIndex++) {
    var framePath = sortedFrames[framePathIndex].path;
    if (framePath) {
      if (!new File(framePath).exists) {
        return createFailureResult("Animation frame file is missing: " + framePath);
      }
      importPaths.push(framePath);
    }
  }
  if (importPaths.length === 0) {
    return createFailureResult("No valid animation frame paths were supplied.");
  }
  app.project.importFiles(importPaths, true, targetBin, false);
  var pathIndex = buildProjectItemPathIndex(targetBin);
  var resolvedProjectItems = [];
  for (var projectItemIndex = 0; projectItemIndex < sortedFrames.length; projectItemIndex++) {
    var framePathForLookup = normalizeMediaPathKey(sortedFrames[projectItemIndex].path);
    var resolvedProjectItem = pathIndex[framePathForLookup];
    if (!resolvedProjectItem) {
      pathIndex = buildProjectItemPathIndex(rootItem);
      resolvedProjectItem = pathIndex[framePathForLookup];
    }
    if (!resolvedProjectItem) {
      return createFailureResult("Could not find imported project item for " + sortedFrames[projectItemIndex].path);
    }
    resolvedProjectItems.push(resolvedProjectItem);
  }
  var overlappingClips = collectOverlappingClips(targetTrack, sortedFrames);
  var movedToAutoTrack = false;
  if (overlappingClips.length > 0 && !request.clearExisting) {
    if (request.autoCreateTrack) {
      var autoTrackIndex = createOverlayVideoTrack(sequence);
      if (autoTrackIndex !== null) {
        var refreshedSequenceForAutoTrack = app.project.activeSequence;
        if (refreshedSequenceForAutoTrack && autoTrackIndex < refreshedSequenceForAutoTrack.videoTracks.numTracks) {
          actualTrackIndex = autoTrackIndex;
          targetTrack = refreshedSequenceForAutoTrack.videoTracks[actualTrackIndex];
          overlappingClips = [];
          movedToAutoTrack = true;
        }
      }
    }
    if (overlappingClips.length > 0) {
      return createFailureResult("Target track V" + (trackIndex + 1) + " has overlapping clips. Enable Replace Track to replace overlapping Kalakar captions only.");
    }
  }
  if (overlappingClips.length > 0 && request.clearExisting) {
    var hasUnmanagedOverlap = false;
    for (var overlapIndex = 0; overlapIndex < overlappingClips.length; overlapIndex++) {
      if (!isManagedKalakarClip(overlappingClips[overlapIndex])) {
        hasUnmanagedOverlap = true;
        break;
      }
    }
    if (hasUnmanagedOverlap && request.autoCreateTrack) {
      var fallbackTrackIndex = createOverlayVideoTrack(sequence);
      if (fallbackTrackIndex !== null) {
        var refreshedSequenceForFallback = app.project.activeSequence;
        if (refreshedSequenceForFallback && fallbackTrackIndex < refreshedSequenceForFallback.videoTracks.numTracks) {
          actualTrackIndex = fallbackTrackIndex;
          targetTrack = refreshedSequenceForFallback.videoTracks[actualTrackIndex];
          overlappingClips = [];
          movedToAutoTrack = true;
        }
      }
    }
    if (hasUnmanagedOverlap && overlappingClips.length > 0) {
      return createFailureResult("Target track V" + (trackIndex + 1) + " contains non-Kalakar clips inside the caption range. Move them or choose a different track.");
    }
    if (overlappingClips.length > 0) {
      for (var removalIndex = overlappingClips.length - 1; removalIndex >= 0; removalIndex--) {
        overlappingClips[removalIndex].remove(false, false);
      }
    }
  }
  var placedCount = 0;
  var clipSearchIndex = 0;
  var placedClipReferences = [];
  for (var placementIndex = 0; placementIndex < sortedFrames.length; placementIndex++) {
    var frame = sortedFrames[placementIndex];
    var projectItem = resolvedProjectItems[placementIndex];
    var startSeconds = frame.startMs / 1000;
    var endSeconds = (frame.startMs + frame.durationMs) / 1000;
    if (frame.durationMs <= 0 || endSeconds <= startSeconds) {
      endSeconds = startSeconds + 0.04;
    }
    var overwriteResult = targetTrack.overwriteClip(projectItem, startSeconds);
    if (!overwriteResult) {
      return createFailureResult("Premiere failed to place " + frame.path + " on the target track.", placedCount);
    }
    var resolvedClip = findClipOnTrack(targetTrack, projectItem, startSeconds, clipSearchIndex);
    var insertedClip = resolvedClip.clip;
    var insertedClipIndex = resolvedClip.index;
    if (!insertedClip && targetTrack.clips.numItems > 0) {
      insertedClipIndex = Math.max(0, targetTrack.clips.numItems - 1);
      clipSearchIndex = insertedClipIndex;
      insertedClip = targetTrack.clips[targetTrack.clips.numItems - 1];
    } else if (resolvedClip.index >= 0) {
      clipSearchIndex = resolvedClip.index;
    }
    if (!insertedClip) {
      return createFailureResult("Premiere placed the clip, but it could not be resolved afterward.", placedCount);
    }
    insertedClip.end = secondsToTime(endSeconds);
    placedClipReferences.push({
      frame: frame,
      clip: insertedClip,
      clipIndex: insertedClipIndex,
      startSeconds: startSeconds,
      endSeconds: endSeconds
    });
    clipSearchIndex = Math.max(0, insertedClipIndex);
    placedCount++;
  }
  var placedSequence = app.project.activeSequence || sequence;
  var animationReport = applyAnimationPresetToPlacedClips(placedSequence, actualTrackIndex, placedClipReferences, animationPresetId);
  var placementMessage = movedToAutoTrack ? "Created V" + (actualTrackIndex + 1) + " for caption overlays and placed " + placedCount + " caption states there." : "Placed " + placedCount + " caption states on V" + (actualTrackIndex + 1) + ".";
  var animationMessage = describeAnimationReport(animationReport);
  if (animationMessage) {
    placementMessage += " " + animationMessage;
  }
  return {
    success: true,
    message: placementMessage,
    placedCount: placedCount,
    animationReport: animationReport,
    trackNumber: actualTrackIndex + 1,
    binName: targetBin.name
  };
};
var resolveCaptionAnimationTrack = function resolveCaptionAnimationTrack(request) {
  var sequence = app.project.activeSequence;
  if (!sequence) {
    return {
      success: false,
      message: "No active sequence found."
    };
  }
  if (!request || !request.frames || request.frames.length === 0) {
    return {
      success: false,
      message: "No caption animation frames were provided."
    };
  }
  var trackIndex = request.trackIndex;
  if (trackIndex < 0 || trackIndex >= sequence.videoTracks.numTracks) {
    return {
      success: false,
      message: "Target track V" + (trackIndex + 1) + " does not exist. Sequence has " + sequence.videoTracks.numTracks + " video tracks."
    };
  }
  var actualTrackIndex = trackIndex;
  var targetTrack = sequence.videoTracks[actualTrackIndex];
  var overlappingClips = collectOverlappingClips(targetTrack, request.frames);
  var movedToAutoTrack = false;
  if (overlappingClips.length > 0 && !request.clearExisting) {
    if (request.autoCreateTrack) {
      var autoTrackIndex = createOverlayVideoTrack(sequence);
      if (autoTrackIndex !== null) {
        var refreshedSequenceForAutoTrack = app.project.activeSequence;
        if (refreshedSequenceForAutoTrack && autoTrackIndex < refreshedSequenceForAutoTrack.videoTracks.numTracks) {
          actualTrackIndex = autoTrackIndex;
          targetTrack = refreshedSequenceForAutoTrack.videoTracks[actualTrackIndex];
          overlappingClips = collectOverlappingClips(targetTrack, request.frames);
          movedToAutoTrack = true;
        }
      }
    }
    if (overlappingClips.length > 0) {
      return {
        success: false,
        message: "Target track V" + (trackIndex + 1) + " has overlapping clips. Enable Replace Track to replace overlapping Kalakar captions only."
      };
    }
  }
  if (overlappingClips.length > 0 && request.clearExisting) {
    var hasUnmanagedOverlap = false;
    for (var overlapIndex = 0; overlapIndex < overlappingClips.length; overlapIndex++) {
      if (!isManagedKalakarClip(overlappingClips[overlapIndex])) {
        hasUnmanagedOverlap = true;
        break;
      }
    }
    if (hasUnmanagedOverlap && request.autoCreateTrack) {
      var fallbackTrackIndex = createOverlayVideoTrack(sequence);
      if (fallbackTrackIndex !== null) {
        var refreshedSequenceForFallback = app.project.activeSequence;
        if (refreshedSequenceForFallback && fallbackTrackIndex < refreshedSequenceForFallback.videoTracks.numTracks) {
          actualTrackIndex = fallbackTrackIndex;
          targetTrack = refreshedSequenceForFallback.videoTracks[actualTrackIndex];
          overlappingClips = collectOverlappingClips(targetTrack, request.frames);
          movedToAutoTrack = true;
          hasUnmanagedOverlap = false;
          for (var fallbackOverlapIndex = 0; fallbackOverlapIndex < overlappingClips.length; fallbackOverlapIndex++) {
            if (!isManagedKalakarClip(overlappingClips[fallbackOverlapIndex])) {
              hasUnmanagedOverlap = true;
              break;
            }
          }
        }
      }
    }
    if (hasUnmanagedOverlap && overlappingClips.length > 0) {
      return {
        success: false,
        message: "Target track V" + (trackIndex + 1) + " contains non-Kalakar clips inside the caption range. Move them or choose a different track."
      };
    }
  }
  return {
    success: true,
    message: movedToAutoTrack ? "Created V" + (actualTrackIndex + 1) + " for caption overlays." : "Using V" + (actualTrackIndex + 1) + " for caption overlays.",
    trackNumber: actualTrackIndex + 1
  };
};

// Normalize a path to the host's native separator. app.project.path can return
// forward slashes even on Windows; mixing them with backslashes produces a path
// Premiere's native exporter rejects ("Unknown error exception" on Windows).
var normalizePathSeparators = function normalizePathSeparators(value) {
  if ($.os.indexOf("Windows") !== -1) {
    return value.replace(/\//g, "\\");
  }
  return value.replace(/\\/g, "/");
};

// Strip characters that are illegal in Windows filenames (and trim trailing
// dots/spaces, which Windows also rejects) so a sequence name can be used as a
// file name. macOS tolerates most of these, which is why export only failed on
// Windows.
var sanitizeFileName = function sanitizeFileName(value) {
  // NOTE: the forward slash is escaped (\/) inside the character class. An
  // unescaped "/" there makes Premiere's Windows ExtendScript parser terminate
  // the regex literal early and throw a syntax error at load — which takes down
  // the whole host bundle. (macOS tolerates it, hence Windows-only breakage.)
  var cleaned = String(value || "").replace(/[<>:"\/\\|?*]/g, "_").replace(/[\x00-\x1F]/g, "_").replace(/[ .]+$/, "");
  return cleaned.length > 0 ? cleaned : "sequence";
};
var createExportResult = function createExportResult(ok, message, extras) {
  return {
    ok: ok,
    message: message,
    mode: extras && extras.mode ? extras.mode : undefined,
    outputPath: extras && extras.outputPath ? extras.outputPath : undefined,
    jobId: extras && extras.jobId ? extras.jobId : undefined
  };
};
var exportSequenceToMP3 = function exportSequenceToMP3(request) {
  var sequence = app.project.activeSequence;
  if (!sequence) {
    return createExportResult(false, "No active sequence found.");
  }
  var presetPath = typeof request === "string" ? request : request && request.presetPath;
  var requestedScope = typeof request === "string" ? undefined : request && request.scope;

  // The preset path is assembled on the panel side and can arrive with mixed
  // separators on Windows (e.g. "C:/.../com.kalakar\presets\foo.epr"). File is
  // lenient about that, but Premiere's native exporter is not, so normalize it
  // to a single OS-native separator like we do for the output path.
  if (presetPath) {
    presetPath = normalizePathSeparators(presetPath);
  }
  var presetFile = new File(presetPath);
  if (!presetFile.exists) {
    return createExportResult(false, "Preset file not found at: " + presetPath);
  }
  var seqName = sanitizeFileName(sequence.name);
  var projectPath = app.project.path;
  var extension = ".mp3";
  var outPath;
  var sep = $.os.indexOf("Windows") !== -1 ? "\\" : "/";

  // app.project.path is not guaranteed to use the OS-native separator on
  // Windows (ExtendScript often returns forward slashes), so split on either
  // "/" or "\" rather than the $.os-derived `sep`. Otherwise lastIndexOf
  // returns -1 and the file is written to the drive root with a broken name.
  var baseDirectory;
  if (projectPath && projectPath.length > 0) {
    var lastSeparatorIndex = Math.max(projectPath.lastIndexOf("/"), projectPath.lastIndexOf("\\"));
    baseDirectory = lastSeparatorIndex >= 0 ? projectPath.substring(0, lastSeparatorIndex) : projectPath;
  } else {
    baseDirectory = Folder.myDocuments.fsName;
  }

  // Force a single, OS-native separator throughout so the native exporter does
  // not receive a mixed-separator path (e.g. "C:/a/b\\Seq.mp3"), which it
  // rejects on Windows.
  baseDirectory = normalizePathSeparators(baseDirectory);
  outPath = baseDirectory + sep + seqName + extension;
  var i = 1;
  while (new File(outPath).exists) {
    outPath = baseDirectory + sep + seqName + "_" + i + extension;
    i++;
  }
  var inOutInfo = getSequenceInOutInfo(sequence);
  var workAreaType = 0;
  if (requestedScope === "in-out-range") {
    if (!inOutInfo.hasInOutSelection) {
      return createExportResult(false, "No active in/out range is set on the current sequence.");
    }
    workAreaType = 1;
  } else if (requestedScope === "whole-sequence") {
    workAreaType = 0;
  } else {
    workAreaType = inOutInfo.hasInOutSelection ? 1 : 0;
  }

  // Captured for diagnostics: the direct-export path swallows its failure to
  // fall back to AME, but its result/error is usually more specific than AME's
  // generic "Unknown error exception", so surface it if the AME path also fails.
  var directResult = "";
  var directError = "";
  try {
    directResult = sequence.exportAsMediaDirect(outPath, presetPath, workAreaType);
    if (directResult === "No Error" || !directResult) {
      var outFile = new File(outPath);
      if (outFile.exists) {
        return createExportResult(true, "Audio exported directly from Premiere.", {
          mode: "direct",
          outputPath: outPath
        });
      }
    }
  } catch (e) {
    directError = e && e.message ? e.message : String(e);
  }
  if (typeof app.encoder === "undefined") {
    return createExportResult(false, "Adobe Media Encoder is unavailable for export fallback.");
  }
  var jobID;
  try {
    jobID = app.encoder.encodeSequence(sequence, outPath, presetPath, workAreaType, 0);
  } catch (encodeError) {
    return createExportResult(false, "Adobe Media Encoder rejected the export job: " + (encodeError && encodeError.message ? encodeError.message : String(encodeError)) + " | direct-export result: " + (directResult || "(none)") + (directError ? " | direct-export error: " + directError : "") + " | preset: " + presetPath + " | output: " + outPath);
  }
  if (jobID) {
    app.encoder.launchEncoder();
    app.encoder.startBatch();
    return createExportResult(true, "Queued audio export in Adobe Media Encoder.", {
      mode: "ame",
      outputPath: outPath,
      jobId: String(jobID)
    });
  }
  return createExportResult(false, "Failed to queue encode job. Check preset compatibility.");
};
var createVideoExportResult = function createVideoExportResult(ok, message, extras) {
  return {
    ok: ok,
    message: message,
    mode: extras && extras.mode ? extras.mode : undefined,
    outputPath: extras && extras.outputPath ? extras.outputPath : undefined,
    jobId: extras && extras.jobId ? extras.jobId : undefined
  };
};

/**
 * Render the active sequence to a flattened H.264 .mp4 used as the
 * project-editor video preview source.
 *
 * Mirrors exportSequenceToMP3 (same preset/work-area handling) with two
 * deliberate differences:
 *  - Writes an .mp4 to a dedicated temp cache folder (the file is kept and
 *    reused as the preview source, not deleted after upload like the MP3).
 *  - Prefers Adobe Media Encoder (async) over exportAsMediaDirect. Direct
 *    export is synchronous and freezes Premiere's UI; this render runs in the
 *    background while the user works on captions, so a UI freeze is not
 *    acceptable. We fall back to the (blocking) direct export only when AME is
 *    unavailable.
 */
var exportSequenceToPreviewVideo = function exportSequenceToPreviewVideo(request) {
  var sequence = app.project.activeSequence;
  if (!sequence) {
    return createVideoExportResult(false, "No active sequence found.");
  }
  var presetPath = typeof request === "string" ? request : request && request.presetPath;
  var requestedScope = typeof request === "string" ? undefined : request && request.scope;
  var projectUuid = typeof request === "string" ? undefined : request && request.projectUuid;
  if (presetPath) {
    presetPath = normalizePathSeparators(presetPath);
  }
  var presetFile = new File(presetPath);
  if (!presetFile.exists) {
    return createVideoExportResult(false, "Preset file not found at: " + presetPath);
  }
  var sep = $.os.indexOf("Windows") !== -1 ? "\\" : "/";

  // Render into the app's userData dir (Application Support on macOS, AppData
  // on Windows) rather than Folder.temp. On macOS Folder.temp resolves to a
  // system-protected "TemporaryItems" directory that a separate process (Adobe
  // Media Encoder) cannot write into and that the panel cannot even stat — the
  // job reports success yet the file is never visible, so the wait never ends.
  // userData is unprotected and writable by AME, Premiere, and the panel alike,
  // and unlike ~/Documents it is not TCC-gated, so it won't prompt.
  var baseCacheDirectory = Folder.userData.fsName + sep + "com.kalakar";
  var baseCacheFolder = new Folder(baseCacheDirectory);
  if (!baseCacheFolder.exists) {
    baseCacheFolder.create();
  }
  var cacheDirectory = normalizePathSeparators(baseCacheDirectory + sep + "preview");
  var cacheFolder = new Folder(cacheDirectory);
  if (!cacheFolder.exists) {
    cacheFolder.create();
  }

  // Name the file by project uuid so each project gets its own render — two
  // projects can share a sequence name and would otherwise overwrite each
  // other. Fall back to the sequence name only if no uuid was supplied.
  var fileBase = sanitizeFileName(projectUuid || sequence.name);
  var extension = ".mp4";
  var outPath = cacheDirectory + sep + fileBase + extension;

  // Drop a stale preview for the same project so the cache does not grow
  // unbounded; if it is locked (still open in the panel), fall back to a
  // unique name.
  var existing = new File(outPath);
  if (existing.exists) {
    if (!existing.remove()) {
      var i = 1;
      while (new File(outPath).exists) {
        outPath = cacheDirectory + sep + fileBase + "_" + i + extension;
        i++;
      }
    }
  }
  var inOutInfo = getSequenceInOutInfo(sequence);
  var workAreaType = 0;
  if (requestedScope === "in-out-range") {
    if (!inOutInfo.hasInOutSelection) {
      return createVideoExportResult(false, "No active in/out range is set on the current sequence.");
    }
    workAreaType = 1;
  } else if (requestedScope === "whole-sequence") {
    workAreaType = 0;
  } else {
    workAreaType = inOutInfo.hasInOutSelection ? 1 : 0;
  }

  // Hide Kalakar caption clips from the preview render: the panel plays this
  // file UNDER its own live caption overlay, so captions baked into the
  // footage double up on screen (and go stale the moment the user restyles
  // or re-exports). Mute every video track whose clips are ALL managed
  // kalakar PNGs for the duration of the render, then restore. Only the
  // synchronous direct path can be wrapped safely — the AME fallback renders
  // asynchronously after this function returns, so mutes are restored before
  // it queues and that rare path keeps the old (baked-captions) behavior.
  var mutedTrackIndexes = [];
  try {
    for (var muteTrackIndex = 0; muteTrackIndex < sequence.videoTracks.numTracks; muteTrackIndex++) {
      var muteTrack = sequence.videoTracks[muteTrackIndex];
      if (muteTrack.isMuted()) {
        continue;
      }
      var muteClipCount = muteTrack.clips.numItems;
      if (muteClipCount === 0) {
        continue;
      }
      var allManaged = true;
      for (var muteClipIndex = 0; muteClipIndex < muteClipCount; muteClipIndex++) {
        if (!isManagedKalakarClip(muteTrack.clips[muteClipIndex])) {
          allManaged = false;
          break;
        }
      }
      if (allManaged) {
        muteTrack.setMute(1);
        mutedTrackIndexes.push(muteTrackIndex);
      }
    }
  } catch (muteError) {
    // Best-effort — a mute failure must not block the preview render.
  }
  var restoreMutedTracks = function restoreMutedTracks() {
    for (var restoreIndex = 0; restoreIndex < mutedTrackIndexes.length; restoreIndex++) {
      try {
        sequence.videoTracks[mutedTrackIndexes[restoreIndex]].setMute(0);
      } catch (restoreError) {
        // Leave the remaining tracks' restore attempts running.
      }
    }
    mutedTrackIndexes = [];
  };

  // Direct export FIRST — synchronous and, crucially, requires no Adobe Media
  // Encoder installation. (app.encoder exists in Premiere's scripting API even
  // when AME is NOT installed, so an AME-first approach silently queues a job
  // that nothing will ever run, and the wait for the output file never ends.)
  // This is the same path the MP3 export uses. It blocks Premiere's UI for the
  // render's duration, but it runs as a background step after the caption flow,
  // and it is the only path that works without AME. The file exists the instant
  // this returns, so the panel's poll finds it immediately.
  var directResult = "";
  var directError = "";
  try {
    directResult = sequence.exportAsMediaDirect(outPath, presetPath, workAreaType);
    if (directResult === "No Error" || !directResult) {
      var outFile = new File(outPath);
      if (outFile.exists) {
        return createVideoExportResult(true, "Rendered preview video directly from Premiere.", {
          mode: "direct",
          outputPath: outPath
        });
      }
    }
  } catch (e) {
    directError = e && e.message ? e.message : String(e);
  } finally {
    restoreMutedTracks();
  }

  // Fallback: queue in Adobe Media Encoder (async). Only reached if direct
  // export failed, and only useful if AME is actually installed and running —
  // it returns a job id even when AME is absent, so treat this as best-effort.
  var ameError = "";
  if (typeof app.encoder !== "undefined") {
    var jobID;
    try {
      app.encoder.launchEncoder();
      jobID = app.encoder.encodeSequence(sequence, outPath, presetPath, workAreaType, 0,
      // removeUponCompletion
      1 // startQueueImmediately
      );
    } catch (encodeError) {
      ameError = encodeError && encodeError.message ? encodeError.message : String(encodeError);
    }
    if (jobID) {
      try {
        app.encoder.startBatch();
      } catch (startBatchError) {
        // startBatch is best-effort; the job is already queued to start.
      }
      return createVideoExportResult(true, "Queued preview video render in Adobe Media Encoder.", {
        mode: "ame",
        outputPath: outPath,
        jobId: String(jobID)
      });
    }
  }
  return createVideoExportResult(false, "Failed to render preview video." + (ameError ? " | AME error: " + ameError : "") + " | direct-export result: " + (directResult || "(none)") + (directError ? " | direct-export error: " + directError : "") + " | preset: " + presetPath + " | output: " + outPath);
};

var ppro = /*#__PURE__*/__objectFreeze({
  __proto__: null,
  createNativeCaptionTrackFromSrt: createNativeCaptionTrackFromSrt,
  exportSequenceToMP3: exportSequenceToMP3,
  exportSequenceToPreviewVideo: exportSequenceToPreviewVideo,
  getActiveSequenceCaptionInfo: getActiveSequenceCaptionInfo,
  getAvailableVideoTransitions: getAvailableVideoTransitions,
  importCaptionOverlayFromXml: importCaptionOverlayFromXml,
  placeCaptionAnimationFramesAsNestedSequence: placeCaptionAnimationFramesAsNestedSequence,
  placeCaptionAnimationFramesOnTrack: placeCaptionAnimationFramesOnTrack,
  qeDomFunction: qeDomFunction,
  resolveCaptionAnimationTrack: resolveCaptionAnimationTrack
});

var host = typeof $ !== "undefined" ? $ : window;

// A safe way to get the app name since some versions of Adobe Apps broken BridgeTalk in various places (e.g. After Effects 24-25)
// in that case we have to do various checks per app to deterimine the app name

var getAppNameSafely = function getAppNameSafely() {
  var compare = function compare(a, b) {
    return a.toLowerCase().indexOf(b.toLowerCase()) > -1;
  };
  var exists = function exists(a) {
    return typeof a !== "undefined";
  };
  var isBridgeTalkWorking = typeof BridgeTalk !== "undefined" && typeof BridgeTalk.appName !== "undefined";
  if (isBridgeTalkWorking) {
    return BridgeTalk.appName;
  } else if (app) {
    
    if (exists(app.name)) {
      
      var name = app.name;
      if (compare(name, "photoshop")) return "photoshop";
      if (compare(name, "illustrator")) return "illustrator";
      if (compare(name, "audition")) return "audition";
      if (compare(name, "bridge")) return "bridge";
      if (compare(name, "indesign")) return "indesign";
    }
    
    if (exists(app.appName)) {
      
      var appName = app.appName;
      if (compare(appName, "after effects")) return "aftereffects";
      if (compare(appName, "animate")) return "animate";
    }
    
    if (exists(app.path)) {
      
      var path = app.path;
      if (compare(path, "premiere")) return "premierepro";
    }
    
    if (exists(app.getEncoderHost) && exists(AMEFrontendEvent)) {
      return "ame";
    }
  }
  return "unknown";
};
switch (getAppNameSafely()) {
  case "premierepro":
  case "premiereprobeta":
    host[ns] = ppro;
    break;
}
// prettier-ignore

// https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-class.html?highlight=bridgetalk#appname
})(this);