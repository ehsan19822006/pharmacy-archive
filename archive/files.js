/**
 * وحدة الأرشيف — الحفظ التلقائي في المجلد المناسب
 * تقرأ نوع الوثيقة وتنشئ المجلد إن لم يكن موجوداً
 * ثم تحفظ الملف بالاسم الصحيح وتُعيد المسار الكامل
 */

const fs      = require('fs')
const path    = require('path')
const { PDFDocument } = require('pdf-lib')
const archiver = require('archiver')
const db      = require('../database/db')
const { app } = require('electron')

// ─── جذر الأرشيف ──────────────────────────────────────────────
function getRoot () {
  const stored = db.getSetting('archive_root')
  return stored || path.join(app.getPath('documents'), 'PharmacyArchive')
}

// ─── هيكل المجلدات الثابت ─────────────────────────────────────
const FOLDER_MAP = {
  shahada: 'شهادات_ودرجات',
  qaboul:  'قبول_وتسجيل',
  idari:   'وثائق_إدارية',
  bahth:   'أبحاث_ورسائل',
  aqd:     'عقود_واتفاقيات',
  other:   'وثائق_أخرى',
}

// ─── إنشاء هيكل الأرشيف الكامل ─────────────────────────────────
function ensureArchiveStructure () {
  const root = getRoot()
  const folders = Object.values(FOLDER_MAP)
  for (const f of folders) {
    fs.mkdirSync(path.join(root, f), { recursive: true })
  }
  return root
}

// ─── بناء اسم الملف الأرشيفي ───────────────────────────────────
function buildFileName (docType, personName, date) {
  const d    = date || new Date().toISOString().split('T')[0]
  const safe = (s) => (s || 'غير_محدد').replace(/[\\/:"*?<>|]/g, '_').replace(/\s+/g, '_')
  const folder = FOLDER_MAP[docType] || FOLDER_MAP.other
  const label  = {
    shahada: 'كشف_درجات',
    qaboul:  'استمارة_قبول',
    idari:   'وثيقة_إدارية',
    bahth:   'بحث_رسالة',
    aqd:     'عقد_اتفاقية',
    other:   'وثيقة',
  }[docType] || 'وثيقة'

  return {
    folder,
    fileName: `${label}__${safe(personName)}__${d}.pdf`
  }
}

// ─── الحفظ الرئيسي ──────────────────────────────────────────────
async function save ({ docType, personName, linkedId, linkedType, linkedName,
                       scannedFiles, ocrText, dpi, scannedBy, docDate }) {
  const root = ensureArchiveStructure()
  const { folder, fileName } = buildFileName(docType, personName || linkedName, docDate)

  const folderPath = path.join(root, folder)
  const finalPath  = path.join(folderPath, fileName)

  // دمج صور المسح في ملف PDF واحد
  await imagesToPdf(scannedFiles || [], finalPath)

  const stats = fs.existsSync(finalPath) ? fs.statSync(finalPath) : { size: 0 }

  // حفظ في قاعدة البيانات
  const docId = db.addDoc({
    name:        personName
                   ? `${FOLDER_MAP[docType]?.replace(/_/g, ' ')} — ${personName}`
                   : fileName.replace('.pdf', '').replace(/_/g, ' '),
    doc_type:    docType,
    folder_path: folderPath,
    file_name:   fileName,
    file_size:   stats.size,
    pages:        scannedFiles?.length || 1,
    ocr_text:    ocrText || '',
    linked_type: linkedType || 'general',
    linked_id:   linkedId   || null,
    linked_name: linkedName || personName || '',
    dpi:         dpi        || 300,
    scanned_by:  scannedBy  || 1,
    status:      'done',
  })

  return {
    success:    true,
    docId,
    folderPath,
    fileName,
    fullPath:   finalPath,
    folderName: folder.replace(/_/g, ' '),
    fileSize:   stats.size,
  }
}

// ─── تحويل الصور إلى PDF ────────────────────────────────────────
async function imagesToPdf (imagePaths, outputPath) {
  const pdfDoc = await PDFDocument.create()

  if (imagePaths.length === 0) {
    // إنشاء PDF فارغ احتياطياً
    pdfDoc.addPage()
  } else {
    for (const imgPath of imagePaths) {
      if (!fs.existsSync(imgPath)) continue
      try {
        const imgBytes = fs.readFileSync(imgPath)
        const ext = path.extname(imgPath).toLowerCase()
        let img
        if (ext === '.jpg' || ext === '.jpeg') img = await pdfDoc.embedJpg(imgBytes)
        else img = await pdfDoc.embedPng(imgBytes).catch(() => null)
        if (!img) continue
        const page = pdfDoc.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      } catch (e) {
        console.warn('[Archive] Could not embed image:', imgPath, e.message)
      }
    }
    if (pdfDoc.getPageCount() === 0) pdfDoc.addPage()
  }

  const pdfBytes = await pdfDoc.save()
  fs.writeFileSync(outputPath, pdfBytes)
  return outputPath
}

// ─── تصدير وثيقة ────────────────────────────────────────────────
async function exportDoc (docId) {
  const doc = db.getDocs({ id: docId })[0]
  if (!doc) return { success: false, error: 'الوثيقة غير موجودة' }
  const src = path.join(doc.folder_path, doc.file_name)
  if (!fs.existsSync(src)) return { success: false, error: 'الملف غير موجود على القرص' }
  return { success: true, path: src }
}

// ─── نسخة احتياطية ──────────────────────────────────────────────
async function backup () {
  const root       = getRoot()
  const backupDir  = db.getSetting('backup_path') || path.join(root, 'Backup')
  const ts         = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const zipPath    = path.join(backupDir, `backup_${ts}.zip`)

  fs.mkdirSync(backupDir, { recursive: true })

  return new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    output.on('close', () => resolve({ success: true, path: zipPath, size: archive.pointer() }))
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(root, 'PharmacyArchive')
    archive.finalize()
  })
}

module.exports = { save, exportDoc, backup, ensureArchiveStructure, buildFileName, getRoot }
