# Optional isolated Windows MySQL setup (official ZIP, workspace-local only).
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$localDir = Join-Path $workspace '.local'
New-Item -ItemType Directory -Force $localDir | Out-Null
$binary = Join-Path $localDir 'mysql-8.4.11-winx64\bin\mysqld.exe'
if (!(Test-Path $binary)) {
    Invoke-WebRequest 'https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.11-winx64.zip' -OutFile (Join-Path $localDir 'mysql.zip')
    Expand-Archive (Join-Path $localDir 'mysql.zip') $localDir -Force
}
$data = Join-Path $localDir 'mysql-data'
$base = Join-Path $localDir 'mysql-8.4.11-winx64'
if (!(Test-Path $data)) {
    & $binary --no-defaults --initialize-insecure "--basedir=$base" "--datadir=$data"
    if ($LASTEXITCODE -ne 0) { throw 'MySQL initialization failed' }
}
Start-Process -FilePath $binary -ArgumentList '--no-defaults',"--basedir=$($base.Replace('\','/'))","--datadir=$($data.Replace('\','/'))",'--port=3307','--bind-address=127.0.0.1','--mysqlx=0' -WindowStyle Hidden
Write-Output 'Server starts on loopback port 3307. First run only: use mysql client as root to run scripts/init-local.sql. Then root has the local admin password in that file.'
