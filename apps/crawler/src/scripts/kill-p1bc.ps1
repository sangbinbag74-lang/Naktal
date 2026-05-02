$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*bulk-opening-preparpc*' -and (
    $_.CommandLine -like '*--from=200601 --to=200912*' -or
    $_.CommandLine -like '*--from=201001 --to=201312*'
  )
}
foreach ($p in $targets) {
  Write-Host "killing $($p.ProcessId)"
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Host "done"
