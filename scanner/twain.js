const { exec } = require('child_process')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

const PS_LIST = `
Add-Type -AssemblyName "WIA"
$dm = New-Object -ComObject "WIA.DeviceManager"
$result = @()
foreach ($info in $dm.DeviceInfos) {
    if ($info.Type -eq 1) {
        $result += [PSCustomObject]@{ id=$info.DeviceID; name=$info.Properties.Item("Name").Value }
    }
}
if ($result.Count -eq 0) { Write-Output "[]" } else { $result | ConvertTo-Json -Compress }
`

function buildScanScript(deviceId, outputPath, dpi) {
  const safePath = outputPath.replace(/\\/g, '\\\\')
  return `
Add-Type -AssemblyName "WIA"
try {
    $dm = New-Object -ComObject "WIA.DeviceManager"
    $device = $null
    foreach ($info in $dm.DeviceInfos) {
        if ($info.DeviceID -eq "${deviceId}") { $device = $info.Connect(); break }
    }
    if (-not $device) { throw "Device not found: ${deviceId}" }
    $item = $device.Items.Item(1)
    $item.Properties.Item("6147").Value = ${dpi}
    $item.Properties.Item("6148").Value = ${dpi}
    $item.Properties.Item("6146").Value = 2
    $img = $item.Transfer("{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}")
    $img.SaveFile("${safePath}")
    Write-Output "SUCCESS"
} catch { Write-Output "ERROR: $($_.Exception.Message)" }
`
}

function runPS(script) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `ps_${Date.now()}.ps1`)
    fs.writeFileSync(tmpFile, script, 'utf16le')
    exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { timeout: 30000 }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpFile) } catch(e) {}
        if (err) return reject(new Error(stderr || err.message))
        resolve(stdout.trim())
      })
  })
}

async function listDevices() {
  if (process.platform !== 'win32') return [{ id: 'demo', name: 'سكانر تجريبي' }]
  try {
    const out = await runPS(PS_LIST)
    if (!out || out === '[]') return []
    const raw = JSON.parse(out)
    return (Array.isArray(raw) ? raw : [raw]).map(d => ({ id: d.id, name: d.name }))
  } catch(e) {
    console.warn('[Scanner]', e.message)
    return []
  }
}

async function scan({ deviceId='demo', dpi=300, pages=1 } = {}) {
  const tmpDir = path.join(os.tmpdir(), 'pharmacy_scans')
  fs.mkdirSync(tmpDir, { recursive: true })
  const results = [], ts = Date.now()

  for (let i = 0; i < pages; i++) {
    const outPath = path.join(tmpDir, `scan_${ts}_p${i+1}.jpg`)
    if (process.platform !== 'win32' || deviceId === 'demo') {
      await new Promise(r => setTimeout(r, 800))
      fs.writeFileSync(outPath, Buffer.alloc(512, 0))
      results.push(outPath)
      continue
    }
    const result = await runPS(buildScanScript(deviceId, outPath, dpi))
    if (result.startsWith('ERROR')) throw new Error(result.replace('ERROR: ',''))
    results.push(outPath)
    if (i < pages-1) await new Promise(r => setTimeout(r, 1500))
  }
  return { success: true, files: results, pages: results.length, dpi }
}

async function status() {
  if (process.platform !== 'win32') return { connected: false, message: 'يتطلب Windows' }
  try {
    const devices = await listDevices()
    return {
      connected: devices.length > 0,
      count: devices.length,
      message: devices.length > 0 ? `${devices.length} سكانر متصل` : 'لا يوجد سكانر — تأكد من التوصيل والتعريف'
    }
  } catch(e) { return { connected: false, message: e.message } }
}

module.exports = { listDevices, scan, status }
