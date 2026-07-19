[Setup]
AppName=Captiongrit
AppVersion=1.0.0
AppPublisher=Flogrit
; Install directly to the User Path (no admin rights needed)
DefaultDirName={userappdata}\Adobe\CEP\extensions\com.captiongrit.panel
DisableProgramGroupPage=yes
DisableDirPage=yes
; The output executable name
OutputBaseFilename=Captiongrit-Installer
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
; Uncomment the next line if you convert your logo.png to an .ico file!
; SetupIconFile=logo.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; This grabs everything from the Pro dist folder. You can change this to Basic/Extreme if needed.
Source: "dist\Captiongrit-Pro\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; It also includes the fallback manual install scripts just in case!
Source: "dist\Captiongrit-Pro\install.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\Captiongrit-Pro\install.sh"; DestDir: "{app}"; Flags: ignoreversion

[Run]
; Optional: You can display a message after successful install
; Filename: "{cmd}"; Parameters: "/C echo Captiongrit Installed successfully! Please restart Premiere Pro. && pause"; Description: "View success message"; Flags: postinstall waituntilterminated
