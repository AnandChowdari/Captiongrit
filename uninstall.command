#!/bin/bash

# =========================================================
#    C A P T I O N G R I T
#    macOS Uninstaller
# =========================================================

set -u

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

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
echo -e "${CYAN}     macOS Uninstaller${NC}"
echo -e "${CYAN} =========================================================${NC}"
echo ""

SOURCE="$(cd "$(dirname "$0")" && pwd)"
EXT_ID="com.captiongrit.panel"
SYSTEM_DEST="/Library/Application Support/Adobe/CEP/extensions/$EXT_ID"
REAL_USER="${SUDO_USER:-$(whoami)}"
USER_DEST="/Users/$REAL_USER/Library/Application Support/Adobe/CEP/extensions/$EXT_ID"

# Require admin privileges if system CEP installation exists
if [ "$(id -u)" -ne 0 ] && [ -d "$SYSTEM_DEST" ]; then
    echo -e "${CYAN}[INFO] Administrator permission is required to remove system CEP extension.${NC}"
    echo -e "      Please enter your Mac password when prompted."
    echo ""
    exec sudo bash "$SOURCE/uninstall.command" "$@"
    exit $?
fi

REMOVED=0

if [ -d "$USER_DEST" ]; then
    echo "Removing user-level installation: $USER_DEST..."
    rm -rf "$USER_DEST"
    REMOVED=1
fi

if [ -d "$SYSTEM_DEST" ]; then
    DEST_BASENAME="$(basename "$SYSTEM_DEST")"
    if [ "$DEST_BASENAME" != "$EXT_ID" ]; then
        error_exit "Safety check failed!" "Destination path is invalid: $SYSTEM_DEST" "Contact support."
    fi
    echo "Removing system-level installation: $SYSTEM_DEST..."
    rm -rf "$SYSTEM_DEST"
    if [ -d "$SYSTEM_DEST" ]; then
        error_exit "Failed to remove directory." "Files are currently in use." "Close Premiere Pro and try again."
    fi
    REMOVED=1
fi

if [ $REMOVED -eq 0 ]; then
    echo -e "${GREEN}[OK] Captiongrit is not installed. Nothing to remove.${NC}"
else
    echo ""
    echo -e "${GREEN}[OK] Captiongrit has been uninstalled completely.${NC}"
fi

success_exit
