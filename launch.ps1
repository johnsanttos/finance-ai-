$ErrorActionPreference = "SilentlyContinue"
$AppDir = $PSScriptRoot
Set-Location -Path $AppDir

# 1. Backup diario automatico do banco SQLite
$DbFile = Join-Path $AppDir "prisma\dev.db"
$BackupDir = Join-Path $AppDir "backups"
if (Test-Path $DbFile) {
    if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }
    $Today = Get-Date -Format "yyyy-MM-dd"
    $BackupFile = Join-Path $BackupDir "dev-$Today.db"
    if (-not (Test-Path $BackupFile)) {
        Copy-Item -Path $DbFile -Destination $BackupFile -Force
    }
}

# Funcao para testar se a porta 3000 esta respondendo
function Test-PortOpen {
    try {
        $client = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 3000)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

# 2. Se o servidor ainda nao estiver rodando, inicia o Next.js usando o Node portatil ou do sistema
if (-not (Test-PortOpen)) {
    $PortableNode = Join-Path $AppDir "runtime\node.exe"
    if (Test-Path $PortableNode) {
        $NodeExe = $PortableNode
    } else {
        $NodeExe = "node"
    }

    $NextBin = Join-Path $AppDir "node_modules\next\dist\bin\next"
    $LogOut = Join-Path $AppDir "server.log"
    $LogErr = Join-Path $AppDir "server-error.log"

    # Caminho SQLite com barras normais (compativel com Prisma em qualquer letra de pendrive!)
    $DbUrlPath = ($DbFile -replace '\\', '/')
    $env:DATABASE_URL = "file:$DbUrlPath"
    $env:PORT = "3000"

    Start-Process -FilePath $NodeExe `
        -ArgumentList "`"$NextBin`" start -p 3000" `
        -WorkingDirectory $AppDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $LogOut `
        -RedirectStandardError $LogErr

    # Aguarda ate 25 segundos o servidor ficar pronto
    for ($i = 0; $i -lt 50; $i++) {
        if (Test-PortOpen) { break }
        Start-Sleep -Milliseconds 500
    }
}

# 3. Abre o FINANCE AI como janela de aplicativo (Edge/Chrome) ou navegador padrao
$EdgePath = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$ChromePath = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
$ChromePathX86 = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"

if (Test-Path $ChromePath) {
    Start-Process -FilePath $ChromePath -ArgumentList "--app=http://localhost:3000"
} elseif (Test-Path $ChromePathX86) {
    Start-Process -FilePath $ChromePathX86 -ArgumentList "--app=http://localhost:3000"
} elseif (Test-Path $EdgePath) {
    Start-Process -FilePath $EdgePath -ArgumentList "--app=http://localhost:3000"
} else {
    Start-Process "http://localhost:3000"
}
