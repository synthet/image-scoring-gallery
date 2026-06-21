$files = Get-ChildItem 'E:\DCIM' -Recurse -File -Filter *.NEF
"COUNT_NEF=$($files.Count)"
$files | ForEach-Object { $_.Name } | Sort-Object -Unique | Set-Content -Encoding ASCII '.agent\tmp\e_nef_names.txt'
"UNIQUE_NAMES=$((Get-Content '.agent\tmp\e_nef_names.txt').Count)"
# also non-NEF extensions present on the card
Get-ChildItem 'E:\DCIM' -Recurse -File | Group-Object Extension | ForEach-Object { '{0}={1}' -f $_.Name, $_.Count }
