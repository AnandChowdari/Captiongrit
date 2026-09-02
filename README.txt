=============================================================
             CAPTIONGRIT - PLUGIN GUIDE
=============================================================

Welcome to the Captiongrit plugin for Adobe After Effects
and Premiere Pro. This guide will walk you through the setup,
customization, and efficient usage of the plugin.

-------------------------------------------------------------
1. INSTALLATION
-------------------------------------------------------------
📺 Watch the Installation Video: https://youtu.be/JMMGoALepR0

The plugin includes an automated, one-click installer that sets up the plugin and FFmpeg automatically without requiring Administrator or Root passwords!

**WINDOWS INSTALLATION:**
1. Extract the downloaded ZIP file completely.
2. Open the extracted folder and double-click `install.bat`.
3. Wait for the green SUCCESS message.
4. Launch (or restart) Premiere Pro / After Effects.
5. Go to: Window -> Extensions -> Captiongrit.

**MACOS INSTALLATION (Important):**
Because this installer was downloaded from the internet, macOS will block it by default. You must remove the quarantine restriction first.

1. Extract the downloaded ZIP file completely.
2. Open the **Terminal** app on your Mac (Search for Terminal in Spotlight).
3. Type the following command followed by a space (DO NOT press Enter yet!):
   xattr -cr 
4. Drag and drop the EXTRACTED FOLDER into the Terminal window.
5. Press **Enter**. (This removes Apple's quarantine block).
6. Now you can either:
   - Double-click the `install.command` file inside the folder.
   - OR drag `install.command` into the Terminal and press Enter.
7. Wait for the SUCCESS message.
8. Launch (or restart) Premiere Pro / After Effects and go to Window -> Extensions -> Captiongrit.


-------------------------------------------------------------
2. SETTING UP API KEYS (FREE)
-------------------------------------------------------------
📺 Watch the API Setup Video: https://youtu.be/bnJ-pPlMwEg

The plugin supports multiple API providers for Speech-to-Text (STT)
and AI processing. They all offer generous FREE tiers.

A) Speech-To-Text (STT) Providers:
- ElevenLabs (Free Tier):
  Sign up at https://elevenlabs.io, go to your profile, and
  generate an API key.
- Deepgram ($200 Free Credits):
  Sign up at https://console.deepgram.com to get your API Token.

B) AI Translation / Formatting Providers:
- Google Gemini (Recommended - Free Tier):
  Get an API key from https://aistudio.google.com
- Groq (Free Fast Llama Inference):
  Get an API key from https://console.groq.com
- OpenRouter (Free Models Available):
  Get a key from https://openrouter.ai
- xAI Grok ($25 Free Credits):
  Get a key from https://console.x.ai

Once you have your keys, open the plugin, go to the "Settings" tab,
paste your keys, and click "Save Keys".


-------------------------------------------------------------
3. HOW TO USE EFFICIENTLY
-------------------------------------------------------------
1. Select a Clip
   In your timeline, select the video or audio clip you want to
   caption, then click "Click to Read Selected Clip" in the plugin.

2. Choose Languages
   Select the source language (or Auto Detect). Then choose the
   output caption style (Native Script, English Phonetic, or English).
   You can also toggle "Translate Captions" if needed.

3. Select AI and Style
   - AI Provider: "Auto" will pick the best available free model based 
     on the keys you provided.
   - Caption Style: Choose between Natural Phrase, Full Sentence, or 
     Word-by-Word.

4. Advanced Options
   In the "Advanced" tab, you can enter custom vocabulary (like brand 
   names, technical terms, or names like "Integrit" or "ChatGPT") to 
   ensure the AI spells them perfectly.

5. Generate
   Click "Generate Captions". Once done, you can choose to import them
   directly as Text Layers or export them as an SRT file.


=============================================================
Troubleshooting:
- If captions fail to generate, make sure FFmpeg is installed and 
  your API keys are correct.
- Ensure your sequence is active and a clip is selected.
=============================================================
