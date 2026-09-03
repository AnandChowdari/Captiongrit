# Fix Random Logout & Max Devices Limit Bug

This plan addresses the issue where users are randomly logged out and incorrectly hit the "Max devices limit" even when logging back in on their only allowed device.

## User Review Required

> [!CAUTION]
> **Root Cause**: The "Max devices limit" error occurs because Premiere Pro occasionally clears the CEP `localStorage`, which forces the plugin to generate a new `deviceId` for the user. The current `getDeviceFingerprint()` function is unstable—it picks the MAC address of the *first* network adapter it finds. If a user connects to a VPN or switches from Wi-Fi to Ethernet, the adapter order changes, creating a new fingerprint. The server sees this as a new, second device and blocks the login, while still holding the old device ID hostage.

## Proposed Changes

### `main.js` (Core Engine Fixes)

#### [MODIFY] [main.js](file:///f:/Coding/Projects/Caption%20Integrit/main.js)
1. **Stable Fingerprinting**: 
   - Update `getDeviceFingerprint()` to collect all non-zero MAC addresses, sort them, and hash them together. This guarantees the exact same fingerprint is generated even if network adapters turn on/off or change order.
2. **Persistent File System Storage**: 
   - Instead of relying solely on Premiere Pro's volatile `localStorage`, the plugin will read and write the `deviceId` to a persistent file in the user's home directory (e.g., `~/.captiongrit_device_id`). This ensures the device ID survives cache clears and Premiere Pro updates.

## Verification Plan

### Manual Verification
- Clear `localStorage` manually using the plugin debugger.
- Close and reopen Premiere Pro to verify that the plugin successfully retrieves the persistent `deviceId` from the file system and logs in automatically.
- Toggle network adapters (e.g., connect/disconnect Wi-Fi) and verify the generated fingerprint remains identical.
- Ensure the server correctly recognizes the device and no longer throws the "Max devices limit" error.
