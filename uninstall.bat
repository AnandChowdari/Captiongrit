@echo off
setlocal enabledelayedexpansion

:: =========================================================
::    C A P T I O N G R I T
::    Windows Uninstaller
:: =========================================================

for /F %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "RED=%ESC%[31m"
set "GREEN=%ESC%[32m"
set "CYAN=%ESC%[36m"
set "NC=%ESC%[0m"

echo.
echo %CYAN% =========================================================%NC%
echo %CYAN%       C A P T I O N G R I T%NC%
echo %CYAN%     Windows Uninstaller%NC%
echo %CYAN% =========================================================%NC%
echo.

set "EXT_ID=com.captiongrit.panel"
set "DEST_PARENT=%APPDATA%\Adobe\CEP\extensions"
set "DEST=%DEST_PARENT%\%EXT_ID%"

if not exist "%DEST%\" (
    echo %GREEN%[OK] Captiongrit is not installed. Nothing to remove.%NC%
    pause
    exit /b 0
)

:: Safety check
echo %DEST% | findstr /I /C:"%EXT_ID%" >nul
if !errorlevel! neq 0 (
    echo %RED%[ERROR] Safety check failed! Destination path is invalid: %DEST%%NC%
    pause
    exit /b 1
)

echo Removing %DEST%...
rmdir /s /q "%DEST%"

if exist "%DEST%\" (
    echo %RED%[ERROR] Failed to remove directory. Is Premiere Pro running?%NC%
    echo Close Premiere Pro and try again.
    pause
    exit /b 1
)

echo.
echo %GREEN%[OK] Captiongrit has been uninstalled completely.%NC%
echo.
pause
