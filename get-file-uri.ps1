# Helper script to convert Windows file path to URI format for the API

param(
    [Parameter(Mandatory=$false)]
    [string]$FilePath
)

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          File Path to URI Converter for LSP API           ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if (-not $FilePath) {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\get-file-uri.ps1 'D:\path\to\your\file.ts'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or paste a file path when prompted:" -ForegroundColor Yellow
    Write-Host ""
    $FilePath = Read-Host "Enter file path"
}

# Remove quotes if present
$FilePath = $FilePath.Trim('"', "'")

# Convert to URI format
$uri = "file:///" + $FilePath.Replace('\', '/')

Write-Host ""
Write-Host "Windows Path:" -ForegroundColor Yellow
Write-Host "  $FilePath" -ForegroundColor White
Write-Host ""
Write-Host "API URI:" -ForegroundColor Green
Write-Host "  $uri" -ForegroundColor White
Write-Host ""
Write-Host "Copy this URI for Postman:" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host $uri -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host ""

# Also show example JSON for Postman
Write-Host "Example Postman Body (update line/character):" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
$exampleJson = @"
{
  "uri": "$uri",
  "position": {
    "line": 10,
    "character": 5
  }
}
"@
Write-Host $exampleJson -ForegroundColor White
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host ""
Write-Host "Remember: Line/character are 0-indexed!" -ForegroundColor Yellow
Write-Host "  VS Code shows 'Ln 11, Col 6' → Use line: 10, character: 5" -ForegroundColor Gray
Write-Host ""

