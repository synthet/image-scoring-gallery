Get-ChildItem 'E:\DCIM' -Recurse -File -Filter *.NEF |
  Group-Object { $_.LastWriteTime.ToString('yyyy-MM-dd') } |
  Sort-Object Name | ForEach-Object { '{0} {1}' -f $_.Name, $_.Count }
