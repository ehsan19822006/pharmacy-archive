@echo off
chcp 65001 >nul
setlocal

set OUTPUT_PATH=%1
set DPI=%2
if "%DPI%"=="" set DPI=300
if "%OUTPUT_PATH%"=="" set OUTPUT_PATH=%TEMP%\scan_output.jpg

echo Scanning with Canon DR-M260...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"try { ^
  $wia = [System.Activator]::CreateInstance([System.Type]::GetTypeFromProgID('WIA.DeviceManager')); ^
  foreach ($info in $wia.DeviceInfos) { ^
    if ($info.Type -eq 1) { ^
      $dev = $info.Connect(); ^
      $item = $dev.Items.Item(1); ^
      try { $item.Properties('Horizontal Resolution').Value = %DPI% } catch {}; ^
      try { $item.Properties('Vertical Resolution').Value = %DPI% } catch {}; ^
      $img = $item.Transfer('{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'); ^
      $img.SaveFile('%OUTPUT_PATH%'); ^
      Write-Host 'SUCCESS'; ^
      break ^
    } ^
  } ^
} catch { ^
  Write-Host 'ERROR:' $_.Exception.Message ^
}"

if exist "%OUTPUT_PATH%" (
    echo SCAN_DONE:%OUTPUT_PATH%
) else (
    echo SCAN_FAILED
)
