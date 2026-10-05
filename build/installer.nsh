!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

Var AddToPathCheckbox
Var AddToPathState

; Registry location that remembers the user's add-to-PATH decision so it can
; survive silent installs: electron-updater auto-updates run the new installer
; with /S (the custom page never shows) and the old uninstaller removes the
; PATH entry before customInstall gets a chance to re-add it.
!define XUMP_REG_KEY "Software\XuMP"
!define XUMP_REG_ADD_TO_PATH "AddToPath"

Page custom AddToPathPage AddToPathPageLeave

Function AddToPathPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Choose whether Setup should add XuMP to the system PATH."
  Pop $0

  ${NSD_CreateCheckbox} 0 30u 100% 12u "Add XuMP to PATH"
  Pop $AddToPathCheckbox
  ${If} $AddToPathState == ""
    StrCpy $AddToPathState ${BST_CHECKED}
  ${EndIf}
  ${NSD_SetState} $AddToPathCheckbox $AddToPathState

  nsDialogs::Show
FunctionEnd

Function AddToPathPageLeave
  ${NSD_GetState} $AddToPathCheckbox $AddToPathState
FunctionEnd

!macro customInit
  ; Pre-fill the decision before anything else runs. This must happen in
  ; .onInit (not in customInstall) because a silent upgrade first invokes the
  ; old uninstaller, which removes both the PATH entry and the registry value.
  ReadRegStr $AddToPathState HKLM "${XUMP_REG_KEY}" "${XUMP_REG_ADD_TO_PATH}"
  ${If} $AddToPathState == ""
    ; Fresh install: match the interactive default (checked).
    StrCpy $AddToPathState ${BST_CHECKED}
  ${EndIf}
!macroend

!macro customInstall
  ${If} $AddToPathState == ${BST_CHECKED}
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$installDir = ''$INSTDIR''; $$path = [Environment]::GetEnvironmentVariable(''Path'', ''Machine''); $$parts = @($$path -split '';'' | Where-Object { $$_ }); if ($$parts -notcontains $$installDir) { [Environment]::SetEnvironmentVariable(''Path'', (($$parts + $$installDir) -join '';''), ''Machine'') }"'
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}
  ; Persist the effective decision so silent upgrades can restore it.
  ${If} $AddToPathState == ${BST_CHECKED}
    WriteRegStr HKLM "${XUMP_REG_KEY}" "${XUMP_REG_ADD_TO_PATH}" "1"
  ${Else}
    WriteRegStr HKLM "${XUMP_REG_KEY}" "${XUMP_REG_ADD_TO_PATH}" "0"
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$installDir = ''$INSTDIR''; $$path = [Environment]::GetEnvironmentVariable(''Path'', ''Machine''); $$parts = @($$path -split '';'' | Where-Object { $$_ -and ($$_ -ne $$installDir) }); [Environment]::SetEnvironmentVariable(''Path'', ($$parts -join '';''), ''Machine'')"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  DeleteRegValue HKLM "${XUMP_REG_KEY}" "${XUMP_REG_ADD_TO_PATH}"
  DeleteRegKey /ifempty HKLM "${XUMP_REG_KEY}"
!macroend
