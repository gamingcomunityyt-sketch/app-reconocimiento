# Configura el escaner en Vercel tras desplegar recognition/ en Render.
#
# Uso:
#   .\scripts\setup-scan-production.ps1 -RenderUrl "https://recuerdos-recognition.onrender.com" -Token "el-token-de-render"
#
# Si omites -Token, se genera uno nuevo (deberas copiarlo tambien en Render).

param(
  [Parameter(Mandatory = $true)]
  [string]$RenderUrl,

  [string]$Token = ""
)

$ErrorActionPreference = "Stop"

if (-not $Token) {
  $Token = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
  Write-Host ""
  Write-Host "Token generado (anade el mismo valor en Render -> Environment -> RECOGNITION_SERVICE_TOKEN):" -ForegroundColor Yellow
  Write-Host $Token
  Write-Host ""
}

$RenderUrl = $RenderUrl.TrimEnd("/")
$webDir = Join-Path $PSScriptRoot ".." "web"
Push-Location $webDir

try {
  Write-Host "Anadiendo RECOGNITION_SERVICE_URL..." -ForegroundColor Cyan
  $RenderUrl | npx vercel env add RECOGNITION_SERVICE_URL production

  Write-Host "Anadiendo RECOGNITION_SERVICE_TOKEN..." -ForegroundColor Cyan
  $Token | npx vercel env add RECOGNITION_SERVICE_TOKEN production

  Write-Host ""
  Write-Host "Variables guardadas. Redesplegando..." -ForegroundColor Cyan
  npx vercel --prod

  Write-Host ""
  Write-Host "Listo. Prueba /escanear en tu URL de Vercel." -ForegroundColor Green
  Write-Host "La primera peticion puede tardar ~30s si Render estaba dormido (plan free)." -ForegroundColor DarkGray
}
finally {
  Pop-Location
}
