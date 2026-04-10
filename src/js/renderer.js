/**
 * renderer.js — المنطق الكامل للواجهة الأمامية
 * يتواصل مع النظام عبر window.api (preload bridge)
 */

// ─── الحالة العامة ────────────────────────────────────────────
const state = {
  currentPage:    'dashboard',
  currentUser:    { id: 1, name: 'مدير النظام', role: 'dean' },
  scanState:      { step: 1, selectedEntity: null, docType: null, scanDone: false, scannedFiles: [] },
  docFilter:      'all',
  searchQ:        '',
}

// ─── التنقل بين الصفحات ──────────────────────────────────────
function navigate (page) {
  state.currentPage = page
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  const pageEl = document.getElementById(`page-${page}`)
  const navEl  = document.querySelector(`[data-page="${page}"]`)
  if (pageEl) pageEl.classList.remove('hidden')
  if (navEl)  navEl.classList.add('active')
  loadPage(page)
}

async function loadPage (page) {
  switch (page) {
    case 'dashboard': await loadDashboard(); break
    case 'archive':   await loadArchive();   break
    case 'students':  await loadStudents();  break
    case 'reports':   await loadReports();   break
    case 'users':     await loadUsers();     break
  }
}

// ─── لوحة التحكم ──────────────────────────────────────────────
async function loadDashboard () {
  const stats = await window.api.db.getStats()
  setEl('stat-total-docs',  stats.totalDocs)
  setEl('stat-total-pages', stats.totalPages.toLocaleString())
  setEl('stat-students',    stats.totalStudents)
  setEl('stat-ocr-pending', stats.pendingOcr)

  const tbody = document.getElementById('recent-docs-tbody')
  if (tbody) {
    tbody.innerHTML = (stats.recentDocs || []).map(d => `
      <tr>
        <td>${d.name}</td>
        <td><span class="pill p-${d.doc_type}">${docTypeLabel(d.doc_type)}</span></td>
        <td>${d.linked_name || '—'}</td>
        <td>${d.pages}</td>
        <td>${d.scan_date?.slice(0, 10) || '—'}</td>
        <td><button class="btn-sm" onclick="openDoc(${d.id})">فتح</button></td>
      </tr>
    `).join('')
  }
}

// ─── الأرشيف ──────────────────────────────────────────────────
async function loadArchive (filter = {}) {
  const docs = await window.api.db.getDocs({ ...filter, search: state.searchQ, type: state.docFilter })
  const tbody = document.getElementById('archive-tbody')
  if (!tbody) return
  tbody.innerHTML = docs.map(d => `
    <tr onclick="showDocDetail(${d.id})">
      <td title="${d.name}">${d.name}</td>
      <td class="mono">${d.folder_path?.split(/[\\/]/).pop() || '—'}</td>
      <td><span class="pill p-${d.doc_type}">${docTypeLabel(d.doc_type)}</span></td>
      <td>${d.linked_name || '—'}</td>
      <td>${d.pages}</td>
      <td>${d.scan_date?.slice(0, 10) || '—'}</td>
      <td>
        <button class="btn-sm" onclick="event.stopPropagation();openDoc(${d.id})">فتح</button>
        <button class="btn-sm danger" onclick="event.stopPropagation();deleteDoc(${d.id})">حذف</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="empty">لا توجد وثائق</td></tr>'
}

// ─── الطلاب ───────────────────────────────────────────────────
async function loadStudents (q = '') {
  const students = await window.api.db.getStudents(q)
  const tbody    = document.getElementById('students-tbody')
  if (!tbody) return
  tbody.innerHTML = students.map(s => `
    <tr onclick="showStudentProfile(${s.id})" style="cursor:pointer">
      <td>${s.student_code}</td>
      <td>${s.full_name}</td>
      <td>${s.department || '—'}</td>
      <td>${s.academic_year || '—'}</td>
      <td>${s.gpa?.toFixed(2) || '—'}</td>
      <td><span class="pill s-${s.status}">${s.status === 'active' ? 'نشط' : s.status === 'graduate' ? 'خريج' : 'موقوف'}</span></td>
      <td>${s.doc_count || 0} وثيقة</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="empty">لا يوجد طلاب</td></tr>'
}

async function showStudentProfile (id) {
  const student = await window.api.db.getStudent(id)
  if (!student) return
  // تحديث لوحة التفاصيل
  setEl('sp-name',  student.full_name)
  setEl('sp-code',  student.student_code)
  setEl('sp-dept',  student.department || '—')
  setEl('sp-gpa',   student.gpa?.toFixed(2) || '—')
  setEl('sp-year',  student.academic_year || '—')
  setEl('sp-status',student.status === 'active' ? 'نشط' : 'خريج')

  const docsEl = document.getElementById('sp-docs-list')
  if (docsEl && student.docs) {
    docsEl.innerHTML = student.docs.map(d => `
      <div class="doc-row" onclick="openDoc(${d.id})">
        <span class="pill p-${d.doc_type}">${docTypeLabel(d.doc_type)}</span>
        <span>${d.name}</span>
        <span class="muted">${d.pages} ص — ${d.scan_date?.slice(0,10)}</span>
      </div>
    `).join('') || '<div class="empty">لا توجد وثائق مؤرشفة</div>'
  }

  document.getElementById('student-profile-panel')?.classList.remove('hidden')
}

// ─── المسح الذكي ──────────────────────────────────────────────
async function startSmartScan () {
  const opts = {
    deviceId:  document.getElementById('device-select')?.value || 'demo',
    dpi:       parseInt(document.getElementById('dpi-select')?.value || '300'),
    colorMode: 'grayscale',
    pages:     1,
  }

  setScanUI('scanning')
  try {
    const result = await window.api.scanner.scan(opts)
    if (!result.success) throw new Error('فشل المسح')
    state.scanState.scannedFiles = result.files
    state.scanState.scanDone     = true
    setScanUI('done', result.pages)

    // OCR تلقائي
    if (result.files[0]) {
      setScanUI('ocr')
      const ocrResult = await window.api.ocr.read(result.files[0])
      if (ocrResult.success) {
        setEl('ocr-text-preview', ocrResult.text)
        const classification = await window.api.ocr.classify(ocrResult.text)
        const personName     = await window.api.ocr.extractName(ocrResult.text)
        state.scanState.docType    = classification
        state.scanState.personName = personName
        showClassificationResult(classification, personName)
      }
    }
  } catch (e) {
    setScanUI('error', 0, e.message)
  }
}

async function autoSaveDoc () {
  if (!state.scanState.scanDone) return showToast('الرجاء إجراء المسح أولاً', 'warn')
  const sc = state.scanState
  showToast('جاري الحفظ التلقائي...', 'info')

  try {
    const result = await window.api.archive.save({
      docType:      sc.docType?.type  || 'other',
      personName:   sc.personName     || document.getElementById('doc-person-name')?.value,
      linkedId:     sc.selectedEntity?.id,
      linkedType:   sc.selectedEntity?.type,
      linkedName:   sc.selectedEntity?.name,
      scannedFiles: sc.scannedFiles,
      ocrText:      document.getElementById('ocr-text-preview')?.textContent,
      dpi:          parseInt(document.getElementById('dpi-select')?.value || '300'),
      scannedBy:    state.currentUser.id,
      docDate:      new Date().toISOString().split('T')[0],
    })

    if (result.success) {
      showToast(`✓ تم الحفظ في: ${result.folderName}`, 'success')
      highlightFolder(result.folderName)
      resetScanState()
    }
  } catch (e) {
    showToast('خطأ في الحفظ: ' + e.message, 'error')
  }
}

// ─── المستخدمون ───────────────────────────────────────────────
async function loadUsers () {
  const users = await window.api.db.getUsers()
  const tbody = document.getElementById('users-tbody')
  if (!tbody) return
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.full_name}</td>
      <td>@${u.username}</td>
      <td><span class="pill r-${u.role}">${roleLabel(u.role)}</span></td>
      <td>${u.department || '—'}</td>
      <td><span class="pill s-${u.status}">${u.status === 'active' ? 'نشط' : 'موقوف'}</span></td>
      <td>${u.last_login?.slice(0,16) || 'لم يسجل بعد'}</td>
      <td>
        <button class="btn-sm" onclick="editUser(${u.id})">تعديل</button>
        <button class="btn-sm danger" onclick="toggleUserStatus(${u.id},'${u.status}')">
          ${u.status === 'active' ? 'إيقاف' : 'تفعيل'}
        </button>
      </td>
    </tr>
  `).join('')
}

// ─── مساعدات ──────────────────────────────────────────────────
function docTypeLabel (t) {
  return { shahada:'شهادة/درجات', qaboul:'قبول/تسجيل', idari:'إدارية', bahth:'بحث/رسالة', aqd:'عقد', other:'أخرى' }[t] || t
}
function roleLabel (r) {
  return { dean:'العميد', admin:'إداري', faculty:'تدريس', student:'طالب', readonly:'قراءة فقط' }[r] || r
}
function setEl (id, val) { const el = document.getElementById(id); if (el) el.textContent = val }
function showToast (msg, type = 'info') {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = msg
  t.className   = `toast show ${type}`
  clearTimeout(t._t)
  t._t = setTimeout(() => t.classList.remove('show'), 3000)
}

function setScanUI (state, pages = 0, errMsg = '') {
  const labels = { scanning:'جاري المسح...', done:`تم مسح ${pages} صفحات`, ocr:'جاري قراءة النص...', error:errMsg }
  setEl('scan-status', labels[state] || state)
}

function showClassificationResult (cls, name) {
  setEl('cls-type', cls?.label || '—')
  setEl('cls-folder', cls?.folder || '—')
  setEl('cls-person', name || 'لم يُحدد')
}

function resetScanState () {
  state.scanState = { step: 1, selectedEntity: null, docType: null, scanDone: false, scannedFiles: [] }
}

async function openDoc (id) { /* يفتح الملف عبر shell.openPath */ }

async function deleteDoc (id) {
  if (!confirm('هل تريد حذف هذه الوثيقة نهائياً؟')) return
  await window.api.db.deleteDoc(id)
  showToast('تم حذف الوثيقة', 'success')
  loadArchive()
}

// ─── الاستماع لأحداث القائمة ─────────────────────────────────
window.api.on('menu-scan',   () => navigate('scan'))
window.api.on('menu-backup', () => window.api.archive.backup().then(() => showToast('تم إنشاء النسخة الاحتياطية', 'success')))
window.api.on('nav',         (page) => navigate(page))

// ─── تهيئة عند التحميل ───────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  navigate('dashboard')

  // تهيئة السكانر
  window.api.scanner.list().then(devices => {
    const sel = document.getElementById('device-select')
    if (sel) {
      sel.innerHTML = devices.map(d => `<option value="${d.id}">${d.name}</option>`).join('')
    }
  })
})
