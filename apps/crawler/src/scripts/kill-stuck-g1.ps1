$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*bulk-opening-preparpc*' -and (
    $_.CommandLine -like '*--from=201401 --to=201712*' -or
    $_.CommandLine -like '*--from=201801 --to=202012*' -or
    $_.CommandLine -like '*--from=202101 --to=202212*'
  )
}
foreach ($p in $targets) {
  Write-Host "killing $($p.ProcessId)"
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Host "done"
