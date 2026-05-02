$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*bulk-opening-preparpc*' -and (
    $_.CommandLine -like '*--from=201202 --to=201412*' -or
    $_.CommandLine -like '*--from=201801 --to=202012*'
  )
}
foreach ($p in $targets) { Write-Host "killing $($p.ProcessId)"; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
