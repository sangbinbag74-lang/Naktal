$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*bulk-opening-preparpc*' -and (
    $_.CommandLine -like '*--from=201202 --to=201412*' -or
    $_.CommandLine -like '*--from=202101 --to=202604*'
  )
}
foreach ($p in $targets) { Write-Host "killing $($p.ProcessId)"; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
