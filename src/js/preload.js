const { contextBridge, ipcRenderer } = require('electron')

// ─── جسر آمن بين الواجهة وعمليات النظام ─────────────────────
contextBridge.exposeInMainWorld('api', {

  // قاعدة البيانات
  db: {
    getDocs:     (filter)    => ipcRenderer.invoke('db-get-docs', filter),
    getStudents: (q)         => ipcRenderer.invoke('db-get-students', q),
    getStudent:  (id)        => ipcRenderer.invoke('db-get-student', id),
    addDoc:      (data)      => ipcRenderer.invoke('db-add-doc', data),
    deleteDoc:   (id)        => ipcRenderer.invoke('db-delete-doc', id),
    getStats:    ()          => ipcRenderer.invoke('db-get-stats'),
    getUsers:    ()          => ipcRenderer.invoke('db-get-users'),
    addUser:     (data)      => ipcRenderer.invoke('db-add-user', data),
    updateUser:  (id, data)  => ipcRenderer.invoke('db-update-user', id, data),
  },

  // السكانر
  scanner: {
    list:   ()      => ipcRenderer.invoke('scanner-list'),
    scan:   (opts)  => ipcRenderer.invoke('scanner-scan', opts),
    status: ()      => ipcRenderer.invoke('scanner-status'),
  },

  // OCR
  ocr: {
    read:        (imgPath) => ipcRenderer.invoke('ocr-read', imgPath),
    classify:    (text)    => ipcRenderer.invoke('ocr-classify', text),
    extractName: (text)    => ipcRenderer.invoke('ocr-extract-name', text),
  },

  // الأرشيف
  archive: {
    save:   (data) => ipcRenderer.invoke('archive-save', data),
    open:   (p)    => ipcRenderer.invoke('archive-open', p),
    export: (id)   => ipcRenderer.invoke('archive-export', id),
    backup: ()     => ipcRenderer.invoke('archive-backup'),
  },

  // حوارات النظام
  dialog: {
    save: (opts) => ipcRenderer.invoke('dialog-save', opts),
    open: (opts) => ipcRenderer.invoke('dialog-open', opts),
  },

  // معلومات التطبيق
  app: {
    version: () => ipcRenderer.invoke('app-version'),
    path:    () => ipcRenderer.invoke('app-path'),
  },

  // استقبال أحداث القائمة
  on: (channel, cb) => {
    const allowed = ['menu-scan','menu-backup','menu-about','nav']
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, ...args) => cb(...args))
  },
})
