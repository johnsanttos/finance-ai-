@echo off
chcp 65001 >nul
title Parar FINANCE AI
echo Encerrando servidor FINANCE AI na porta 3000...
powershell -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue; foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo.
echo FINANCE AI encerrado com seguranca! Voce ja pode remover o pendrive.
timeout /t 3 /nobreak >nul
