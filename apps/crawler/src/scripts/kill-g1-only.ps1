$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*bulk-opening-preparpc*'
}
foreach ($p in $targets) {
  Write-Host "killing $($p.ProcessId)"
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Host "done"
