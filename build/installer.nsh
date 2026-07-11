!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

Var AddToPathCheckbox
Var AddToPathState

Function .onInit
  StrCpy $AddToPathState ${BST_CHECKED}
FunctionEnd

Page custom AddToPathPage AddToPathPageLeave

Function AddToPathPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Choose whether Setup should add YesPlayMusic to the system PATH."
  Pop $0

  ${NSD_CreateCheckbox} 0 30u 100% 12u "Add YesPlayMusic to PATH"
  Pop $AddToPathCheckbox
  ${NSD_SetState} $AddToPathCheckbox $AddToPathState

  nsDialogs::Show
FunctionEnd

Function AddToPathPageLeave
  ${NSD_GetState} $AddToPathCheckbox $AddToPathState
FunctionEnd

!macro customInstall
  ${If} $AddToPathState == ${BST_CHECKED}
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$installDir = ''$INSTDIR''; $$path = [Environment]::GetEnvironmentVariable(''Path'', ''Machine''); $$parts = @($$path -split '';'' | Where-Object { $$_ }); if ($$parts -notcontains $$installDir) { [Environment]::SetEnvironmentVariable(''Path'', (($$parts + $$installDir) -join '';''), ''Machine'') }"'
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$installDir = ''$INSTDIR''; $$path = [Environment]::GetEnvironmentVariable(''Path'', ''Machine''); $$parts = @($$path -split '';'' | Where-Object { $$_ -and ($$_ -ne $$installDir) }); [Environment]::SetEnvironmentVariable(''Path'', ($$parts -join '';''), ''Machine'')"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
