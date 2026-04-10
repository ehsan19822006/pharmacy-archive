const { createWorker } = require('tesseract.js')
const path = require('path')

let worker = null

async function getWorker () {
  if (!worker) {
    worker = await createWorker('ara+eng', 1, {
      langPath: path.join(process.resourcesPath || __dirname, '../tessdata'),
      logger: m => { if (m.status === 'recognizing text') console.log(`[OCR] ${Math.round(m.progress * 100)}%`) }
    })
  }
  return worker
}

// ─── قراءة النص من صورة ──────────────────────────────────────
async function read (imagePath) {
  try {
    const w = await getWorker()
    const { data } = await w.recognize(imagePath)
    return {
      success: true,
      text: data.text.trim(),
      confidence: Math.round(data.confidence)
    }
  } catch (err) {
    return { success: false, text: '', confidence: 0, error: err.message }
  }
}

// ─── تصنيف الوثيقة تلقائياً حسب النص ───────────────────────
function classify (text) {
  const t = text.toLowerCase()

  const rules = [
    {
      type: 'shahada',
      label: 'شهادات ودرجات',
      folder: 'شهادات_ودرجات',
      keywords: ['درجات', 'كشف', 'علامات', 'معدل', 'شهادة تخرج', 'نتائج', 'grades', 'gpa', 'transcript', 'certificate']
    },
    {
      type: 'qaboul',
      label: 'قبول وتسجيل',
      folder: 'قبول_وتسجيل',
      keywords: ['قبول', 'تسجيل', 'استمارة', 'التحاق', 'قيد', 'admission', 'enrollment', 'registration']
    },
    {
      type: 'bahth',
      label: 'أبحاث ورسائل',
      folder: 'أبحاث_ورسائل',
      keywords: ['رسالة', 'أطروحة', 'بحث', 'ماجستير', 'دكتوراه', 'thesis', 'dissertation', 'research', 'study']
    },
    {
      type: 'aqd',
      label: 'عقود واتفاقيات',
      folder: 'عقود_واتفاقيات',
      keywords: ['عقد', 'اتفاقية', 'تعيين', 'توظيف', 'توريد', 'contract', 'agreement', 'appointment']
    },
    {
      type: 'idari',
      label: 'وثائق إدارية',
      folder: 'وثائق_إدارية',
      keywords: ['محضر', 'قرار', 'مراسلة', 'تقرير', 'اجتماع', 'minutes', 'decision', 'memo', 'report']
    },
  ]

  let best = null, bestScore = 0

  for (const rule of rules) {
    const score = rule.keywords.reduce((acc, kw) => acc + (t.includes(kw) ? 1 : 0), 0)
    if (score > bestScore) { bestScore = score; best = rule }
  }

  return best || { type: 'other', label: 'أخرى', folder: 'وثائق_أخرى' }
}

// ─── استخراج اسم الشخص من النص ──────────────────────────────
function extractName (text) {
  const patterns = [
    /اسم الطالب[:\s]+([^\n]{3,40})/,
    /الاسم[:\s]+([^\n]{3,40})/,
    /الطالب[:\s]+([^\n]{3,40})/,
    /الباحث[:\s]+([^\n]{3,40})/,
    /الطرف الثاني[:\s]+([^\n]{3,40})/,
    /Name[:\s]+([^\n]{3,40})/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[1].trim().replace(/\s+/g, ' ')
  }
  return null
}

// ─── استخراج الرقم الأكاديمي ────────────────────────────────
function extractStudentCode (text) {
  const m = text.match(/\b(\d{4}-PH-\d{3,4})\b/i)
  return m ? m[1].toUpperCase() : null
}

module.exports = { read, classify, extractName, extractStudentCode }
