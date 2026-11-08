!include "MUI2.nsh"
!ifndef APP_DIR
!error "APP_DIR is required"
!endif
!ifndef OUT_FILE
!error "OUT_FILE is required"
!endif
Name "SubtitleOS"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\SubtitleOS"
InstallDirRegKey HKCU "Software\SubtitleOS" "InstallDir"
RequestExecutionLevel user
SetCompressor zlib
!define MUI_ABORTWARNING
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\SubtitleOS.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "SubtitleOS" SEC_APP
  ; Ask users to close the app; never force-kill unsaved recording or editing work.
  nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq SubtitleOS.exe" /NH'
  Pop $0
  Pop $1
  ${If} $0 == 0
    ${If} $1 != ""
      MessageBox MB_OKCANCEL "Close SubtitleOS before continuing so any unsaved work is preserved." IDOK +2
      Abort
    ${EndIf}
  ${EndIf}
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\SubtitleOS"
  CreateShortcut "$SMPROGRAMS\SubtitleOS\SubtitleOS.lnk" "$INSTDIR\SubtitleOS.exe"
  CreateShortcut "$DESKTOP\SubtitleOS.lnk" "$INSTDIR\SubtitleOS.exe"
  WriteRegStr HKCU "Software\SubtitleOS" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SubtitleOS" "DisplayName" "SubtitleOS"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SubtitleOS" "DisplayVersion" "1.7.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SubtitleOS" "Publisher" "SubtitleOS"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SubtitleOS" "DisplayIcon" "$INSTDIR\SubtitleOS.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SubtitleOS" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SubtitleOS" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SubtitleOS" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\SubtitleOS.lnk"
  Delete "$SMPROGRAMS\SubtitleOS\SubtitleOS.lnk"
  RMDir "$SMPROGRAMS\SubtitleOS"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SubtitleOS"
  DeleteRegKey HKCU "Software\SubtitleOS"
  ; Keep userData: preferences and personal provider keys are not silently erased.
SectionEnd