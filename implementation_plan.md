# Refine Captiongrit Architecture & Fix Bugs

This plan addresses your requested changes regarding transcription accuracy, fixing the word-by-word engine crash, phonetic translation issues, batch processing performance, and branding.

## User Review Required

> [!WARNING]  
> **Batch Processing Performance**: The reason batch processing was taking so long is that the `DoubleCheck` (Multi-pass verification) engine was running sequentially on every single clip in the batch. Each clip was making 3-4 separate calls to the AI, hitting rate limits and slowing the entire pipeline to a crawl. By disabling this for the Basic plan, batch speed will dramatically improve.

## Open Questions

> [!IMPORTANT]  
> **Branding Theme**: You mentioned giving Basic, Pro, and Extreme as something like "cat shoes" (or perhaps "Catchy Hues" / "CapCut"?) in that build as a constant theme. Did you mean you want a "CapCut-style" dark and sleek theme across the UI? I will implement a sleek dark mode theme, but please clarify if you meant a specific color palette (e.g., cyan/black or purple/dark).

## Proposed Changes

### `main.js` (Core Engine Fixes)

#### [MODIFY] main.js
1. **Fix Transcription Modification (Prompt Engineering)**: 
   - Update `buildConversionPrompt` to strongly enforce that the AI should never translate or alter the words. I will add the rule: `"DO NOT TRANSLATE OR ALTER ANY WORDS. KEEP THE EXACT SOURCE WORDS EVEN IF THEY SEEM INCORRECT."`
2. **Fix Word-by-Word Engine Crash**:
   - The script was throwing an error and defaulting to base captions because `runWBWPass` was broken by a previous patch script. It is currently missing the loop that attaches the actual transcript words to the AI prompt, and the loop that processes the result! I will restore this logic so `runWBWPass` correctly sends and parses the pipe-separated tokens.
3. **Fix Translation Phonetics & Word-by-Word Translation**:
   - Currently, `translateCaptions` does not enforce phonetic output even if the user selected "English Phonetic" for the grid. I will update `translateCaptions(segments, translateLang, aiProvider, sourceLang, primaryLang, captionStyle)` to include instructions for English phonetic romanization (if `primaryLang === "phonetic"`) and strict single-word outputs (if `captionStyle === "word_by_word"`).
4. **Remove Multi-Pass Engine from Basic Tier**:
   - Change `basic: { ... hasDoubleCheck: false }` so the multi-pass engine never runs on the Basic tier. This fixes the misleading loading bar and speeds up basic batch processing.

### `index.html` & `style.css` (Branding)

#### [MODIFY] index.html & style.css
1. **Basic / Pro / Extreme Branding**: 
   - Apply a cohesive, premium dark-mode theme to the plugin UI to match the "CapCut" / sleek aesthetic.
   - Lock/hide the "Advanced Double Check" toggle entirely for Basic users to avoid confusion.

## Verification Plan

### Automated Tests
- N/A (Standard plugin environment)

### Manual Verification
- Run a test transcription with Word-by-Word mode to verify the AI engine no longer crashes.
- Translate a Telugu source clip to Tamil (English Phonetic) to ensure the output is Tanglish, not Tamil script.
- Verify batch processing on the Basic plan no longer triggers the multi-pass engine and completes significantly faster.
- Review the updated UI theme.
