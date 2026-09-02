# Captiongrit Maintenance & Customization Guide

This document is a quick-reference guide for you to easily find and update essential parts of the plugin on your own without needing to search through thousands of lines of code.

## 1. Updating the Plugin Version
When you are ready to release a new version of the plugin (e.g. going from `1.0.0` to `1.0.1`), you need to update it in four places to ensure everything works perfectly:
- **`CSXS/manifest.xml`**: Change the version on **Line 2** (`ExtensionBundleVersion="1.0.0"`) and **Line 7** (`Version="1.0.0"`). This is what Adobe reads.
- **`package.json`**: Change the version on **Line 3** (`"version": "1.0.0"`).
- **`index.html`**: Search for `<span class="version">v1.0.0</span>` (around line 88). This controls what the user sees in the top right of the plugin UI.
- **`main.js`**: Search for `var CURRENT_VERSION = "1.0.0";` (around line 5122). This is critical so the plugin knows what version it is currently running when checking for updates!

## 2. Splash Screen Logo Size
If you want to make the animated logo on the "Restoring session..." screen bigger or smaller:
- **File**: `style.css`
- **Location**: Search for `.logo-icon-lg` (around line 1196).
- **Change**: Adjust the `width: 64px !important;` and `height: 64px !important;` to whatever size you prefer.

## 3. UI Colors & "Greyish" Blocks
If you want to tweak the transparency or border of the main settings grouping block we created:
- **File**: `index.html`
- **Location**: Search for `Grouped Settings Box` (around line 122).
- **Change**: You can edit the inline CSS: `background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05);`. Change `0.03` to `0.05` to make the background lighter, for example.

## 4. Default Primary Accent Color (Neon Green)
If you ever want to change the default neon green (`#C6FF34`) that the plugin ships with:
- **File**: `main.js`
- **Location**: Search for `function initTheme()` (around line 513).
- **Change**: Edit the line `var defaultColor = "#C6FF34";`.
- **Note**: Users can still change this in the Appearance tab, but this will be the default for new installations.

## 5. Adding New Languages or Translation Examples
If you want to add a new language or change the phonetic spelling shown in the UI widget:
- **File**: `main.js`
- **Location**: Search for `var LANG_EXAMPLES = {` (around line 155).
- **Change**: Add a new block for the language code. Example:
  ```javascript
  "it": { native: "Ciao", phonetic: "Ciao" }
  ```
- **Note**: You will also need to add the `<option value="it">Italian</option>` inside `index.html` under the `source-lang` and `translate-lang` dropdowns.

---

> **Tip:** Every time you make changes to these files, remember to run `node build.js` in your terminal to package them into the `dist` folder!
