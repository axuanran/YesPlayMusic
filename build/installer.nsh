!include WinMessages.nsh

!macro customInstall
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$installDir = ''$INSTDIR''; $$path = [Environment]::GetEnvironmentVariable(''Path'', ''Machine''); $$parts = @($$path -split '';'' | Where-Object { $$_ }); if ($$parts -notcontains $$installDir) { [Environment]::SetEnvironmentVariable(''Path'', (($$parts + $$installDir) -join '';''), ''Machine'') }"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$installDir = ''$INSTDIR''; $$path = [Environment]::GetEnvironmentVariable(''Path'', ''Machine''); $$parts = @($$path -split '';'' | Where-Object { $$_ -and ($$_ -ne $$installDir) }); [Environment]::SetEnvironmentVariable(''Path'', ($$parts -join '';''), ''Machine'')"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
