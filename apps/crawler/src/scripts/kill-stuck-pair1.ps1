$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*bulk-opening-preparpc*' -and (
    $_.CommandLine -like '*--from=201202 --to=201412*' -or
    $_.CommandLine -like '*--from=201501 --to=201712*'
  )
}
foreach ($p in $targets) { Write-Host "killing $($p.ProcessId): $($p.CommandLine.Substring(0,[Math]::Min(120,$p.CommandLine.Length)))"; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
