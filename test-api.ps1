# PowerShell test script for LSP API

Write-Host "=== Testing LSP API ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health check
Write-Host "1. Health Check:" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
Write-Host ""
Write-Host ""

# Test 2: Find references to 'greetUser' function
Write-Host "2. Find References to 'greetUser' (line 3, character 9):" -ForegroundColor Yellow

# Get the current workspace path
$workspacePath = (Get-Location).Path.Replace('\', '/')
$fileUri = "file:///$workspacePath/test-sample.ts"

Write-Host "Using URI: $fileUri" -ForegroundColor Gray
Write-Host ""
Write-Host "=== For Postman, use this URI format ===" -ForegroundColor Cyan
Write-Host $fileUri -ForegroundColor Yellow
Write-Host ""

$body = @{
    uri = $fileUri
    position = @{
        line = 3
        character = 9
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/textDocument/references" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body
    
    Write-Host "Found $($response.references.Count) references:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
Write-Host ""

