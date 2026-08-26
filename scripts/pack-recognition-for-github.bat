@echo off
REM Crea un zip ligero (~100 KB) solo con el servicio Python para subir a GitHub.
REM Uso: scripts\pack-recognition-for-github.bat
REM Luego descomprime el zip en una carpeta nueva, crea repo en GitHub y sube solo eso.

set OUT=%~dp0..\recuerdos-recognition-github.zip
set SRC=%~dp0..\recognition

powershell -NoProfile -Command ^
  "$files = @('main.py','vision.py','requirements.txt','Dockerfile','render.yaml');" ^
  "$temp = Join-Path $env:TEMP 'recuerdos-recognition-pack';" ^
  "Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "New-Item -ItemType Directory -Path $temp | Out-Null;" ^
  "Copy-Item (Join-Path '%SRC%' 'main.py') $temp;" ^
  "Copy-Item (Join-Path '%SRC%' 'vision.py') $temp;" ^
  "Copy-Item (Join-Path '%SRC%' 'requirements.txt') $temp;" ^
  "Copy-Item (Join-Path '%SRC%' 'Dockerfile') $temp;" ^
  "Copy-Item (Join-Path '%~dp0..' 'render.yaml') $temp;" ^
  "Compress-Archive -Path (Join-Path $temp '*') -DestinationPath '%OUT%' -Force;" ^
  "Remove-Item $temp -Recurse -Force;" ^
  "$kb = [math]::Round((Get-Item '%OUT%').Length / 1KB, 1);" ^
  "Write-Host \"Creado: %OUT% ($kb KB)\" -ForegroundColor Green"

echo.
echo Siguiente paso:
echo   1. Descomprime recuerdos-recognition-github.zip en una carpeta nueva
echo   2. Crea un repo vacio en GitHub (ej. recuerdos-recognition)
echo   3. git init ^&^& git add . ^&^& git commit -m "Recognition service" ^&^& git push
echo   4. En Render: New -^> Blueprint -^> conecta ese repo
