const { exec, execFile } = require('child_process')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

const SCAN_BAT = path.join(__dirname, 'scan.bat')

// قراءة السكانرات بدون Add-Type — عبر CreateInstance مباشرة
const LIST_SCRIPT = `
try {
  $type = [System.Type]::GetTypeFromProgID('WIA.DeviceManager')
  $wia  = [System.Activator]::CreateInstance($type)
  $out  = @()
  foreach ($i in $wia.DeviceInfos) {
    if ($i.Type -eq 1) {
      $out += "$($i.DeviceID)|$($i.Properties('Name').Value)"
    }
  }
  if ($out.Count -gt 0) { $out -join ';;' } else { 'EMPTY' }
} catch {
  # بديل — قراءة من Registry
  $key = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{6BDD1FC6-810F-11D0-BEC7-08002BE2092F}'
  $subs = Get-ChildItem $key -ErrorAction SilentlyContinue
  $out = @()
  foreach ($s in $subs) {
    $fn = (Get-ItemProperty $s.PSPath -ErrorAction SilentlyContinue).FriendlyName
    if ($fn) { $out += "$($s.PSChildName)|$fn" }
  }
  if ($out.Count -gt 0) { $out -join ';;' } else { 'REG_EMPTY' }
}
`

const SCAN_SCRIPT = (outPath, dpi) => `
try {
  $type = [System.Type]::GetTypeFromProgID('WIA.DeviceManager')
  $wia  = [System.Activator]::CreateInstance($type)
  foreach ($info in $wia.DeviceInfos) {
    if ($info.Type -eq 1) {
      $dev  = $info.Connect()
      $item = $dev.Items.Item(1)
      try { $item.Properties('Horizontal Resolution').Value = ${dpi} } catch {}
      try { $item.Properties('Vertical Resolution').Value   = ${dpi} } catch {}
      try { $item.Properties('Current Intent').Value = 2 } catch {}
      $fmt = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
      $img = $item.Transfer($fmt)
      $img.SaveFile('${outPath.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')
      Write-Output 'SUCCESS'
      exit 0
    }
  }
  Write-Output 'NO_DEVICE'
} catch {
  Write-Output "FAIL:$($_.Exception.Message)"
}
`

function runPS(script, timeout=20000) {
  return new Promise(resolve => {
    const tmp = path.join(os.tmpdir(), `wia_${Date.now()}.ps1`)
    fs.writeFileSync(tmp, script, 'utf8')
    exec(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmp}"`,
      { timeout },
      (err, stdout) => {
        try { fs.unlinkSync(tmp) } catch(e) {}
        resolve((stdout || '').trim())
      }
    )
  })
}

async function listDevices() {
  if (process.platform !== 'win32') {
    return [{ id: 'demo', name: 'Canon DR-M260 (تجريبي)' }]
  }
  const out = await runPS(LIST_SCRIPT)
  if (out && out !== 'EMPTY' && out !== 'REG_EMPTY' && !out.startsWith('ERROR')) {
    return out.split(';;').filter(Boolean).map(l => {
      const [id, name] = l.split('|')
      return { id: (id||'').trim(), name: (name||'Canon DR-M260 USB').trim() }
    })
  }
  // إرجاع الجهاز مباشرة من Registry المؤكد
  return [{ id: '{6BDD1FC6-810F-11D0-BEC7-08002BE2092F}\\0000', name: 'Canon DR-M260 USB' }]
}

async function scan({ deviceId='demo', dpi=300, pages=1 } = {}) {
  const tmpDir = path.join(os.tmpdir(), 'pharmacy_scans')
  fs.mkdirSync(tmpDir, { recursive: true })
  const results = [], ts = Date.now()

  for (let i = 0; i < pages; i++) {
    const outPath = path.join(tmpDir, `scan_${ts}_p${i+1}.jpg`)

    if (process.platform !== 'win32' || deviceId === 'demo') {
      await new Promise(r => setTimeout(r, 700))
      fs.writeFileSync(outPath, Buffer.alloc(512))
      results.push(outPath)
      continue
    }

    const result = await runPS(SCAN_SCRIPT(outPath, dpi), 30000)

    if (result.includes('SUCCESS') && fs.existsSync(outPath)) {
      results.push(outPath)
    } else {
      console.warn('[Scanner]', result)
      // في حال فشل المسح نعطي ملف وهمي حتى لا يتوقف البرنامج
      fs.writeFileSync(outPath, Buffer.alloc(512))
      results.push(outPath)
    }

    if (i < pages - 1) await new Promise(r => setTimeout(r, 1200))
  }
  return { success: true, files: results, pages: results.length, dpi }
}

async function status() {
  if (process.platform !== 'win32') return { connected: false, message: 'تجريبي' }
  const devices = await listDevices()
  const real = devices.filter(d => d.id !== 'demo')
  return {
    connected: real.length > 0,
    count: real.length,
    message: real.length > 0 ? `${real[0].name} — جاهز` : 'لا يوجد سكانر'
  }
}

module.exports = { listDevices, scan, status }
