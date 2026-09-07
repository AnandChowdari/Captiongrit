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
DEST_PARENT="/Library/Application Support/Adobe/CEP/extensions"
DEST="$DEST_PARENT/$EXT_ID"
REAL_USER="${SUDO_USER:-$(whoami)}"

# 2. Dry-Run Check
DRY_RUN=false
if [ "${1-}" = "--dry-run" ]; then
    DRY_RUN=true
    echo -e "${CYAN}[INFO] DRY-RUN MODE ACTIVATED. No changes will be made.${NC}"
    echo ""
fi

# 3. Check for Running Adobe Applications
echo -e " [+] Checking running applications..."
if pgrep -fi "Adobe Premiere Pro" >/dev/null 2>&1 || pgrep -fi "After Effects" >/dev/null 2>&1; then
    echo -e "${RED} [WARN] Adobe Premiere Pro or After Effects is currently running.${NC}"
    echo -e "${CYAN} Please save your work and quit Premiere Pro / After Effects before proceeding.${NC}"
    if [ "$DRY_RUN" = false ]; then
        read -n 1 -s -r -p " Press any key once Premiere Pro is closed to continue..."
        echo ""
    fi
else
    echo -e "${GREEN}     [OK] Premiere Pro is closed.${NC}"
fi

# 4. Safely Request Administrator Privileges if needed
if [ "$DRY_RUN" = false ] && [ "$(id -u)" -ne 0 ]; then
    echo ""
    echo -e "${CYAN}[INFO] Administrator permission is required to install the CEP extension system-wide.${NC}"
    echo -e "      Please enter your Mac password when prompted."
    echo ""
    exec sudo bash "$SOURCE/install.command" "$@"
    exit $?
fi

# 5. Validate Source Package
if [ ! -d "$SOURCE/$EXT_ID" ]; then
    error_exit "Extension payload not found." "Expected to find directory: $SOURCE/$EXT_ID" "Extract the ZIP completely before running."
fi
if [ ! -f "$SOURCE/$EXT_ID/CSXS/manifest.xml" ]; then
    error_exit "Invalid payload!" "CSXS/manifest.xml is missing." "Extract the ZIP completely before running."
fi

# 6. Version Check
NEW_VERSION=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$SOURCE/$EXT_ID/CSXS/manifest.xml" | head -n 1)
OLD_VERSION="Unknown"
if [ -f "$DEST/CSXS/manifest.xml" ]; then
    OLD_VERSION=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$DEST/CSXS/manifest.xml" | head -n 1)
    if [ -z "$OLD_VERSION" ]; then OLD_VERSION="Unknown"; fi
fi
if [ -z "$NEW_VERSION" ]; then NEW_VERSION="Unknown"; fi

echo ""
echo -e " [+] Preparing installation..."
echo "     Existing version: $OLD_VERSION"
echo "     Installing version: $NEW_VERSION"
echo "     Target CEP path: $DEST"

# 7. Remove Legacy User-Level Copy & Previous Version
USER_DEST="/Users/$REAL_USER/Library/Application Support/Adobe/CEP/extensions/$EXT_ID"
if [ -d "$USER_DEST" ]; then
    echo "     Removing legacy user-level extension copy..."
    if [ "$DRY_RUN" = false ]; then
        rm -rf "$USER_DEST"
    fi
fi

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

# 8. Copy Extension
echo ""
echo -e " [+] Copying extension files to system CEP directory..."
if [ "$DRY_RUN" = false ]; then
    mkdir -p "$DEST_PARENT"
    ditto "$SOURCE/$EXT_ID" "$DEST"
    if [ $? -ne 0 ] || [ ! -d "$DEST" ]; then
        error_exit "Copy failed." "macOS security or permission error while writing to $DEST_PARENT." "Try running the installer again."
    fi
else
    echo "     <DRY-RUN> Would run: mkdir -p \"$DEST_PARENT\""
    echo "     <DRY-RUN> Would run: ditto \"$SOURCE/$EXT_ID\" \"$DEST\""
fi

# 9. Configure Permissions
echo ""
echo -e " [+] Setting file and executable permissions..."
if [ "$DRY_RUN" = false ]; then
    chmod -R 755 "$DEST"
    if [ -f "$DEST/bin/mac/ffmpeg" ]; then
        chmod 755 "$DEST/bin/mac/ffmpeg"
        if [ $? -ne 0 ]; then
            error_exit "Failed to set executable permissions on FFmpeg." "Insufficient disk privileges." "Check folder permissions."
        fi
    fi
else
    echo "     <DRY-RUN> Would run: chmod -R 755 \"$DEST\""
    if [ -f "$SOURCE/$EXT_ID/bin/mac/ffmpeg" ]; then
        echo "     <DRY-RUN> Would run: chmod 755 \"$DEST/bin/mac/ffmpeg\""
    fi
fi

# 10. Remove Quarantine Attributes
echo ""
echo -e " [+] Removing Apple quarantine flags..."
if [ "$DRY_RUN" = false ]; then
    xattr -cr "$DEST" 2>/dev/null || true
    xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
else
    echo "     <DRY-RUN> Would run: xattr -cr \"$DEST\""
fi

# 11. Configure PlayerDebugMode for Invoking User
echo ""
echo -e " [+] Configuring Adobe PlayerDebugMode..."
DEBUG_SUCCESS=true
if [ "$DRY_RUN" = false ]; then
    for v in {7..17}; do
        if [ -n "$REAL_USER" ] && [ "$REAL_USER" != "root" ]; then
            sudo -u "$REAL_USER" defaults write com.adobe.CSXS.$v PlayerDebugMode 1 2>/dev/null || DEBUG_SUCCESS=false
        else
            defaults write com.adobe.CSXS.$v PlayerDebugMode 1 2>/dev/null || DEBUG_SUCCESS=false
        fi
    done
    if [ "$DEBUG_SUCCESS" = false ]; then
        echo -e "${CYAN}     [WARN] Could not set PlayerDebugMode for some CSXS versions.${NC}"
    fi
else
    echo "     <DRY-RUN> Would write PlayerDebugMode=1 for user '$REAL_USER' (com.adobe.CSXS.7 - 17)"
fi

# 12. Final Installation Validation
echo ""
echo -e " [+] Verifying installation..."
if [ "$DRY_RUN" = false ]; then
    MISSING=0
    if [ ! -d "$DEST" ]; then echo -e "${RED}  - Missing extension directory: $DEST${NC}"; MISSING=1; fi
    if [ ! -d "$DEST/CSXS" ]; then echo -e "${RED}  - Missing CSXS directory${NC}"; MISSING=1; fi
    if [ ! -f "$DEST/CSXS/manifest.xml" ]; then echo -e "${RED}  - Missing CSXS/manifest.xml${NC}"; MISSING=1; fi
    if [ ! -f "$DEST/index.html" ]; then echo -e "${RED}  - Missing index.html${NC}"; MISSING=1; fi
    if [ ! -f "$DEST/main.js" ]; then echo -e "${RED}  - Missing main.js${NC}"; MISSING=1; fi
    if [ ! -f "$DEST/host.jsx" ]; then echo -e "${RED}  - Missing host.jsx${NC}"; MISSING=1; fi

    # Validate FFmpeg executable permissions if present
    if [ -f "$SOURCE/$EXT_ID/bin/mac/ffmpeg" ]; then
        if [ ! -f "$DEST/bin/mac/ffmpeg" ]; then
            echo -e "${RED}  - Missing FFmpeg binary in $DEST/bin/mac/ffmpeg${NC}"
            MISSING=1
        elif [ ! -x "$DEST/bin/mac/ffmpeg" ]; then
            echo -e "${RED}  - FFmpeg binary lacks executable permission${NC}"
            MISSING=1
        fi
    fi

    # Read back manifest from DEST to confirm accessibility & bundle ID match
    INSTALLED_ID=$(sed -n 's/.*ExtensionBundleId="\([^"]*\)".*/\1/p' "$DEST/CSXS/manifest.xml" | head -n 1)
    if [ "$INSTALLED_ID" != "$EXT_ID" ]; then
        echo -e "${RED}  - Manifest bundle ID mismatch (Found: '$INSTALLED_ID', Expected: '$EXT_ID')${NC}"
        MISSING=1
    fi

    if [ $MISSING -eq 1 ]; then
        error_exit "Verification failed. Installation is incomplete." "Files failed to copy or permissions were blocked." "Try running the installer again."
    fi

    echo -e "${GREEN}     [OK] Captiongrit extension installed${NC}"
    echo -e "${GREEN}     [OK] CEP manifest found and verified ($INSTALLED_ID)${NC}"
    echo -e "${GREEN}     [OK] macOS host files and core scripts verified${NC}"
    if [ -f "$DEST/bin/mac/ffmpeg" ]; then
        echo -e "${GREEN}     [OK] Required executable permissions verified${NC}"
    fi
    echo -e "${GREEN}     [OK] macOS quarantine attributes cleared${NC}"
    echo -e "${GREEN}     [OK] Adobe CEP installation path verified${NC}"
else
    echo "     <DRY-RUN> Verification skipped in dry-run mode."
fi

# 13. Success Output
echo ""
echo -e "${GREEN} =========================================================${NC}"
echo -e "${GREEN}   Captiongrit installed successfully!${NC}"
echo -e "${GREEN} =========================================================${NC}"
echo ""
echo "   Version installed: $NEW_VERSION"
echo "   Destination: $DEST"
echo "   PlayerDebugMode: Configured for user '$REAL_USER'"
echo ""
echo "   Next steps:"
echo "     1. Launch (or restart) Premiere Pro"
echo "     2. Go to: Window -> Extensions -> Captiongrit"
echo ""

success_exit
