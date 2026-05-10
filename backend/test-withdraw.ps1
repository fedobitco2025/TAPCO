$body = @{
    toAddress = "0x1234567890123456789012345678901234567890"
    amount = 5
} | ConvertTo-Json

Write-Host "Sending withdraw request..." -ForegroundColor Cyan
Write-Host "Body: $body" -ForegroundColor Gray

$response = Invoke-WebRequest -Uri 'http://localhost:4000/blockchain/withdraw' `
  -Method Post `
  -ContentType 'application/json' `
  -Body $body

Write-Host "Response Status: $($response.StatusCode)" -ForegroundColor Green
Write-Host "Response Content:" -ForegroundColor Cyan
Write-Host $response.Content -ForegroundColor White
