@echo off
setlocal enabledelayedexpansion

:: =========================================================
::    C A P T I O N G R I T
::    Windows Installer
:: =========================================================

for /F %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "RED=%ESC%[31m"
set "GREEN=%ESC%[32m"
set "CYAN=%ESC%[36m"
set "NC=%ESC%[0m"

echo.
echo %CYAN% =========================================================%NC%
echo %CYAN%       C A P T I O N G R I T%NC%
echo %CYAN%     Adobe Premiere Pro CEP Extension - Windows Installer%NC%
echo %CYAN% =========================================================%NC%
echo.

:: 1. Resolve Paths
set "SOURCE=%~dp0"
set "EXT_ID=com.captiongrit.panel"
set "DEST_PARENT=%APPDATA%\Adobe\CEP\extensions"
set "DEST=%DEST_PARENT%\%EXT_ID%"

set "DRY_RUN=false"
if "%~1"=="--dry-run" (
    set "DRY_RUN=true"
    echo %CYAN%[INFO] DRY-RUN MODE ACTIVATED. No changes will be made.%NC%
    echo.
)

:: 2. Validate Source Package
if not exist "%SOURCE%%EXT_ID%\" (
    echo %RED%[ERROR] Extension payload not found.%NC%
    echo.
    echo Expected:
    echo Captiongrit-Folder\
    echo ^└── com.captiongrit.panel\
    echo.
    echo Please extract the ZIP completely before running install.bat.
    goto :ErrorEnd
)
if not exist "%SOURCE%%EXT_ID%\CSXS\manifest.xml" (
    echo %RED%[ERROR] Invalid payload! CSXS\manifest.xml is missing.%NC%
    echo Please extract the ZIP completely before running install.bat.
    goto :ErrorEnd
)

:: 3. Version Parsing (Safe)
set "NEW_VERSION=Unknown"
set "OLD_VERSION=Unknown"

if exist "%DEST%\CSXS\manifest.xml" (
    for /f "tokens=2 delims=^=" %%A in ('type "%DEST%\CSXS\manifest.xml" ^| findstr "ExtensionBundleVersion=" 2^>nul') do (
        set "temp=%%A"
        set "OLD_VERSION=!temp:~1,-2!"
    )
)
for /f "tokens=2 delims=^=" %%A in ('type "%SOURCE%%EXT_ID%\CSXS\manifest.xml" ^| findstr "ExtensionBundleVersion=" 2^>nul') do (
    set "temp=%%A"
    set "NEW_VERSION=!temp:~1,-2!"
)

echo  [STEP 1/5] Preparing installation...
echo      Existing version: !OLD_VERSION!
echo      Installing version: !NEW_VERSION!

:: 4. Remove Existing
if exist "%DEST%\" (
    echo %DEST% | findstr /I /C:"%EXT_ID%" >nul
    if !errorlevel! neq 0 (
        echo %RED%[ERROR] Safety check failed! Destination path is invalid: %DEST%%NC%
        goto :ErrorEnd
    )
    echo      Removing existing version...
    if "!DRY_RUN!"=="false" (
        rmdir /s /q "%DEST%" >nul 2>&1
        if exist "%DEST%\" (
            echo %RED%[ERROR] Failed to remove existing directory.%NC%
            echo Reason: Files are currently in use.
            echo Fix: Please close Premiere Pro and try again.
            goto :ErrorEnd
        )
    ) else (
        echo      ^<DRY-RUN^> Would run: rmdir /s /q "%DEST%"
    )
)

:: 5. Copy Files
echo.
echo  [STEP 2/5] Copying extension files...
if "!DRY_RUN!"=="false" (
    if not exist "%DEST_PARENT%\" mkdir "%DEST_PARENT%"
    robocopy "%SOURCE%%EXT_ID%" "%DEST%" /E /IS /IT /R:3 /W:1 >nul
    if !errorlevel! geq 8 (
        echo %RED%[ERROR] Copy failed.%NC%
        echo Reason: Premiere Pro may be running and locking files.
        echo Fix: Close Premiere Pro and try again.
        goto :ErrorEnd
    )
) else (
    echo      ^<DRY-RUN^> Would run: mkdir "%DEST_PARENT%"
    echo      ^<DRY-RUN^> Would run: robocopy "%SOURCE%%EXT_ID%" "%DEST%" /E /IS /IT /R:3 /W:1
)

:: 6. Debug Mode
echo.
echo  [STEP 3/5] Configuring Adobe PlayerDebugMode...
if "!DRY_RUN!"=="false" (
    for /L %%v in (1,1,17) do (
        reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
    )
) else (
    echo      ^<DRY-RUN^> Would write REG_SZ PlayerDebugMode=1 to HKCU\Software\Adobe\CSXS.1 through 17
)

:: 7. Verification
echo.
echo  [STEP 4/5] Verifying installation...
if "!DRY_RUN!"=="false" (
    set "MISSING=0"
    if not exist "%DEST%\" ( echo %RED%  - Missing extension folder%NC% & set "MISSING=1" )
    if not exist "%DEST%\CSXS\manifest.xml" ( echo %RED%  - Missing CSXS\manifest.xml%NC% & set "MISSING=1" )
    if not exist "%DEST%\bin\win\ffmpeg.exe" ( echo %RED%  - Missing FFmpeg binary%NC% & set "MISSING=1" )
    
    if !MISSING! equ 1 (
        echo %RED%[ERROR] Verification failed. Installation is incomplete.%NC%
        echo Reason: Files failed to copy or were blocked by antivirus.
        echo Fix: Try running the installer again or extracting the ZIP fully.
        goto :ErrorEnd
    )
    echo %GREEN%     [OK] Verification passed.%NC%
) else (
    echo      ^<DRY-RUN^> Verification skipped in dry-run mode.
)

:: 8. Success
echo.
echo %GREEN% =========================================================%NC%
echo %GREEN%   Installation completed successfully.%NC%
echo %GREEN% =========================================================%NC%
echo.
echo    Installed to: %DEST%
echo.
echo    Next steps:
echo      1. Launch (or restart) Premiere Pro
echo      2. Go to: Window -^> Extensions -^> Captiongrit
echo.
goto :End

:ErrorEnd
echo.
echo Press any key to exit...
pause >nul
exit /b 1

:End
echo Press any key to exit...
pause >nul
exit /b 0
