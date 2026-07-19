#!/bin/bash

# =========================================================
#    C A P T I O N G R I T
#    macOS Installer
# =========================================================

set -u

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper Functions
error_exit() {
    echo ""
    echo -e "${RED}[ERROR] $1${NC}"
    if [ -n "${2-}" ]; then
        echo -e "${RED}Reason: $2${NC}"
    fi
    if [ -n "${3-}" ]; then
        echo -e "${RED}Fix: $3${NC}"
    fi
    echo ""
    read -n 1 -s -r -p "Press any key to exit..."
    echo ""
    exit 1
}

success_exit() {
    echo ""
    read -n 1 -s -r -p "Press any key to close..."
    echo ""
    exit 0
}

echo ""
echo -e "${CYAN} =========================================================${NC}"
echo -e "${CYAN}       C A P T I O N G R I T${NC}"
echo -e "${CYAN}     Adobe Premiere Pro CEP Extension - macOS Installer${NC}"
echo -e "${CYAN} =========================================================${NC}"
echo ""

# 1. Resolve & Validate Paths
SOURCE="$(cd "$(dirname "$0")" && pwd)"
EXT_ID="com.captiongrit.panel"
DEST_PARENT="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$DEST_PARENT/$EXT_ID"

# 2. Dry-Run Check
DRY_RUN=false
if [ "${1-}" = "--dry-run" ]; then
    DRY_RUN=true
    echo -e "${CYAN}[INFO] DRY-RUN MODE ACTIVATED. No changes will be made.${NC}"
    echo ""
fi

# 3. Validate Source Package
if [ ! -d "$SOURCE/$EXT_ID" ]; then
    error_exit "Extension payload not found." "Expected to find directory: $SOURCE/$EXT_ID" "Extract the ZIP completely before running."
fi
if [ ! -f "$SOURCE/$EXT_ID/CSXS/manifest.xml" ]; then
    error_exit "Invalid payload!" "CSXS/manifest.xml is missing." "Extract the ZIP completely before running."
fi

# 4. Version Check
NEW_VERSION=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$SOURCE/$EXT_ID/CSXS/manifest.xml" | head -n 1)
OLD_VERSION="Unknown"
if [ -f "$DEST/CSXS/manifest.xml" ]; then
    OLD_VERSION=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$DEST/CSXS/manifest.xml" | head -n 1)
    if [ -z "$OLD_VERSION" ]; then OLD_VERSION="Unknown"; fi
fi
if [ -z "$NEW_VERSION" ]; then NEW_VERSION="Unknown"; fi

echo -e " [+] Preparing installation..."
echo "     Existing version: $OLD_VERSION"
echo "     Installing version: $NEW_VERSION"

# 5. Remove Existing Installation
if [ -d "$DEST" ]; then
    DEST_BASENAME="$(basename "$DEST")"
    if [ "$DEST_BASENAME" != "$EXT_ID" ]; then
        error_exit "Safety check failed!" "Destination path is invalid: $DEST" "Contact support."
    fi
    echo "     Removing existing version..."
    if [ "$DRY_RUN" = false ]; then
        rm -rf "$DEST"
        if [ -d "$DEST" ]; then
            error_exit "Failed to remove existing directory." "Files are currently in use." "Close Premiere Pro and try again."
        fi
    else
        echo "     <DRY-RUN> Would run: rm -rf \"$DEST\""
    fi
fi

# 6. Copy Extension
echo ""
echo -e " [+] Copying extension files..."
if [ "$DRY_RUN" = false ]; then
    mkdir -p "$DEST_PARENT"
    ditto "$SOURCE/$EXT_ID" "$DEST"
    if [ $? -ne 0 ]; then
        error_exit "Copy failed." "macOS security may be blocking access to this folder." "Move the extracted folder to your Desktop and try again."
    fi
else
    echo "     <DRY-RUN> Would run: mkdir -p \"$DEST_PARENT\""
    echo "     <DRY-RUN> Would run: ditto \"$SOURCE/$EXT_ID\" \"$DEST\""
fi

# 7. Configure Permissions
echo ""
echo -e " [+] Setting executable permissions..."
if [ "$DRY_RUN" = false ]; then
    if [ -f "$DEST/bin/mac/ffmpeg" ]; then
        chmod 755 "$DEST/bin/mac/ffmpeg"
        if [ $? -ne 0 ]; then
            error_exit "Failed to set executable permissions." "Insufficient disk privileges." "Check folder permissions."
        fi
    fi
else
    echo "     <DRY-RUN> Would run: chmod 755 \"$DEST/bin/mac/ffmpeg\""
fi

# 8. Remove Quarantine
echo ""
echo -e " [+] Removing Apple quarantine flags..."
if [ "$DRY_RUN" = false ]; then
    xattr -cr "$DEST" 2>/dev/null
    if [ $? -ne 0 ]; then
        echo -e "${CYAN}     [WARN] xattr returned a non-zero exit code. Continuing anyway.${NC}"
    fi
else
    echo "     <DRY-RUN> Would run: xattr -cr \"$DEST\""
fi

# 9. Configure PlayerDebugMode
echo ""
echo -e " [+] Configuring Adobe PlayerDebugMode..."
DEBUG_SUCCESS=true
if [ "$DRY_RUN" = false ]; then
    for v in {1..17}; do
        defaults write com.adobe.CSXS.$v PlayerDebugMode 1 2>/dev/null
        if [ $? -ne 0 ]; then
            DEBUG_SUCCESS=false
        fi
    done
    if [ "$DEBUG_SUCCESS" = false ]; then
        error_exit "Failed to set PlayerDebugMode." "System denied write access to defaults." "Try restarting your Mac or modifying System Settings."
    fi
else
    echo "     <DRY-RUN> Would write PlayerDebugMode=1 to com.adobe.CSXS.1 through 17"
fi

# 10. Final Verification
echo ""
echo -e " [+] Verifying installation..."
if [ "$DRY_RUN" = false ]; then
    MISSING=0
    if [ ! -d "$DEST" ]; then echo -e "${RED}  - Missing extension folder${NC}"; MISSING=1; fi
    if [ ! -d "$DEST/CSXS" ]; then echo -e "${RED}  - Missing CSXS directory${NC}"; MISSING=1; fi
    if [ ! -d "$DEST/bin" ]; then echo -e "${RED}  - Missing bin directory${NC}"; MISSING=1; fi
    if [ ! -f "$DEST/CSXS/manifest.xml" ]; then echo -e "${RED}  - Missing CSXS/manifest.xml${NC}"; MISSING=1; fi
    if [ ! -f "$DEST/bin/mac/ffmpeg" ]; then echo -e "${RED}  - Missing FFmpeg binary${NC}"; MISSING=1; fi
    
    if [ $MISSING -eq 1 ]; then
        error_exit "Verification failed. Installation is incomplete." "Files failed to copy or were blocked." "Try running the installer again."
    fi
    echo -e "${GREEN}     [OK] Verification passed.${NC}"
else
    echo "     <DRY-RUN> Verification skipped in dry-run mode."
fi

# 11. Success
echo ""
echo -e "${GREEN} =========================================================${NC}"
echo -e "${GREEN}   Captiongrit installed successfully!${NC}"
echo -e "${GREEN} =========================================================${NC}"
echo ""
echo "   Version installed: $NEW_VERSION"
echo "   Destination: $DEST"
echo "   PlayerDebugMode: Configured for CSXS.1 - CSXS.17"
echo ""
echo "   Next steps:"
echo "     1. Launch (or restart) Premiere Pro"
echo "     2. Go to: Window -> Extensions -> Captiongrit"
echo ""

success_exit
