Get-ChildItem 'D:\Photos' -Recurse -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' -and $_.Name -ge '2026-04-01' } | ForEach-Object {
  $n = (Get-ChildItem $_.FullName -File -Filter *.NEF).Count
  '{0} {1}' -f $_.Name, $n
}
