/**
 * واجهة السكانر — تدعم أجهزة TWAIN/WIA على Windows
 * تستخدم PowerShell + Windows Image Acquisition (WIA)
 * للتواصل مع أجهزة السكانر المتصلة بالكمبيوتر
 */

const { execFile, exec } = require('child_process')
const path   = require('path')
const fs     = require('fs')
const os     = require('os')
const { app } = require('electron')

// سكريبت PowerShell للتواصل مع WIA
const WIA_LIST_SCRIPT = `
Add-Type -AssemblyName "WIA"
$deviceManager = New-Object WIA.DeviceManager
$devices = @()
foreach ($info in $deviceManager.DeviceInfos) {
  if ($info.Type -eq 1) {
    $devices += @{ id=$info.DeviceID; name=$info.Properties["Name"].Value }
  }
}
$devices | ConvertTo-Json
`

const WIA_SCAN_SCRIPT = (deviceId, outputPath, dpi, colorMode) => `
Add-Type -AssemblyName "WIA"
$deviceManager = New-Object WIA.DeviceManager
$device = $null
foreach ($info in $deviceManager.DeviceInfos) {
  if ($info.DeviceID -eq "${deviceId}") { $device = $info.Connect(); break }
}
if (-not $device) { throw "Scanner not found: ${deviceId}" }
$item = $device.Items[1]
$item.Properties["6147"].Value = ${dpi}   # Horizontal Resolution
$item.Properties["6148"].Value = ${dpi}   # Vertical Resolution
$item.Properties["6146"].Value = ${colorMode === 'color' ? 1 : 2}   # 1=Color 2=Grayscale
$imageFile = $device.Items[1].Transfer("{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}")
$imageFile.SaveFile("${outputPath.replace(/\\/g, '\\\\')}")
Write-Output "OK"
`

// ─── قائمة الأجهزة المتصلة ────────────────────────────────────
function listDevices () {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve([{ id: 'demo', name: 'Scanner Demo (تجريبي)' }])
    }
    exec(`powershell -Command "${WIA_LIST_SCRIPT.replace(/"/g, '\\"')}"`, (err, stdout) => {
      if (err) return resolve([])
      try {
        const raw = JSON.parse(stdout.trim())
        const list = Array.isArray(raw) ? raw : [raw]
        resolve(list.map(d => ({ id: d.id, name: d.name })))
      } catch {
        resolve([])
      }
    })
  })
}

// ─── المسح الضوئي ─────────────────────────────────────────────
function scan ({ deviceId = 'demo', dpi = 300, colorMode = 'grayscale', pages = 1 } = {}) {
  return new Promise(async (resolve, reject) => {
    const tmpDir   = path.join(os.tmpdir(), 'pharmacy_scan')
    fs.mkdirSync(tmpDir, { recursive: true })

    const results  = []
    const timestamp = Date.now()

    for (let i = 0; i < pages; i++) {
      const outputPath = path.join(tmpDir, `scan_${timestamp}_p${i + 1}.bmp`)

      if (process.platform !== 'win32' || deviceId === 'demo') {
        // وضع التجربة: إنشاء صورة بيضاء وهمية
        await simulateScan(outputPath)
        results.push(outputPath)
        continue
      }

      const script = WIA_SCAN_SCRIPT(deviceId, outputPath, dpi, colorMode)
      const scriptPath = path.join(tmpDir, `scan_${timestamp}_p${i}.ps1`)
      fs.writeFileSync(scriptPath, script, 'utf8')

      await new Promise((res, rej) => {
        execFile('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], (err, stdout, stderr) => {
          fs.unlinkSync(scriptPath)
          if (err) return rej(new Error(stderr || err.message))
          results.push(outputPath)
          res()
        })
      })
    }

    resolve({ success: true, files: results, pages: results.length, dpi })
  })
}

// وضع محاكاة للتطوير
function simulateScan (outputPath) {
  return new Promise(resolve => {
    setTimeout(() => {
      // كتابة ملف BMP بسيط (مؤقت للتطوير)
      const bmpHeader = Buffer.alloc(54)
      bmpHeader.write('BM', 0)
      fs.writeFileSync(outputPath, bmpHeader)
      resolve(outputPath)
    }, 800)
  })
}

function status () {
  return {
    platform: process.platform,
    supported: process.platform === 'win32',
    message: process.platform === 'win32'
      ? 'السكانر جاهز للاتصال'
      : 'يتطلب Windows للاتصال بالسكانر'
  }
}

module.exports = { listDevices, scan, status }
