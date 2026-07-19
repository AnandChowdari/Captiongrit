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

EXT_ID="com.captiongrit.panel"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/$EXT_ID"

if [ ! -d "$DEST" ]; then
    echo -e "${GREEN}[OK] Captiongrit is not installed. Nothing to remove.${NC}"
    success_exit
fi

DEST_BASENAME="$(basename "$DEST")"
if [ "$DEST_BASENAME" != "$EXT_ID" ]; then
    error_exit "Safety check failed!" "Destination path is invalid: $DEST" "Contact support."
fi

echo -e "Removing $DEST..."
rm -rf "$DEST"

if [ $? -ne 0 ] || [ -d "$DEST" ]; then
    error_exit "Failed to remove directory." "Files are currently in use." "Close Premiere Pro and try again."
fi

echo ""
echo -e "${GREEN}[OK] Captiongrit has been uninstalled completely.${NC}"
echo ""

success_exit
