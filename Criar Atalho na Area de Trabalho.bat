@echo off
chcp 65001 >nul
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$s = $ws.CreateShortcut((Join-Path $desktop 'FINANCE AI.lnk')); " ^
  "$s.TargetPath = 'wscript.exe'; " ^
  "$s.Arguments = '\"%APP_DIR%\Abrir FINANCE AI (Sem Janela Preta).vbs\"'; " ^
  "$s.WorkingDirectory = '%APP_DIR%'; " ^
  "$s.IconLocation = 'shell32.dll,21'; " ^
  "$s.Description = 'FINANCE AI - Controle Financeiro Portatil'; " ^
  "$s.Save()"

echo.
echo Atalho "FINANCE AI" criado com sucesso na sua Area de Trabalho!
timeout /t 3 >nul
