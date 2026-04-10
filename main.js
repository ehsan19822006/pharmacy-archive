const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs   = require('fs')
const db   = require('./database/db')
const scanner = require('./scanner/twain')
const ocr     = require('./scanner/ocr')
const archive = require('./archive/files')

let mainWindow

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'نظام الأرشفة الإلكترونية — كلية الصيدلة',
    icon: path.join(__dirname, 'src/assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'src/js/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    frame: true,
    autoHideMenuBar: false
  })

  mainWindow.loadFile('src/pages/index.html')

  const menuTemplate = [
    {
      label: 'الملف',
      submenu: [
        { label: 'مسح وثيقة جديدة', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu-scan') },
        { type: 'separator' },
        { label: 'النسخ الاحتياطي', click: () => mainWindow.webContents.send('menu-backup') },
        { type: 'separator' },
        { label: 'خروج', role: 'quit' }
      ]
    },
    {
      label: 'عرض',
      submenu: [
        { label: 'لوحة التحكم', accelerator: 'CmdOrCtrl+1', click: () => mainWindow.webContents.send('nav', 'dashboard') },
        { label: 'الأرشيف',     accelerator: 'CmdOrCtrl+2', click: () => mainWindow.webContents.send('nav', 'archive') },
        { label: 'الطلاب',      accelerator: 'CmdOrCtrl+3', click: () => mainWindow.webContents.send('nav', 'students') },
        { label: 'التقارير',    accelerator: 'CmdOrCtrl+4', click: () => mainWindow.webContents.send('nav', 'reports') },
        { type: 'separator' },
        { label: 'تكبير / تصغير', role: 'toggleDevTools' }
      ]
    },
    {
      label: 'مساعدة',
      submenu: [
        { label: 'حول البرنامج', click: () => mainWindow.webContents.send('menu-about') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
}

app.whenReady().then(() => {
  db.init()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ─── IPC: قاعدة البيانات ─────────────────────────────────────
ipcMain.handle('db-get-docs',      (_e, filter) => db.getDocs(filter))
ipcMain.handle('db-get-students',  (_e, q)      => db.getStudents(q))
ipcMain.handle('db-get-student',   (_e, id)     => db.getStudent(id))
ipcMain.handle('db-add-doc',       (_e, data)   => db.addDoc(data))
ipcMain.handle('db-delete-doc',    (_e, id)     => db.deleteDoc(id))
ipcMain.handle('db-get-stats',     ()           => db.getStats())
ipcMain.handle('db-get-users',     ()           => db.getUsers())
ipcMain.handle('db-add-user',      (_e, data)   => db.addUser(data))
ipcMain.handle('db-update-user',   (_e, id, data) => db.updateUser(id, data))

// ─── IPC: السكانر ────────────────────────────────────────────
ipcMain.handle('scanner-list',     ()           => scanner.listDevices())
ipcMain.handle('scanner-scan',     (_e, opts)   => scanner.scan(opts))
ipcMain.handle('scanner-status',   ()           => scanner.status())

// ─── IPC: OCR ────────────────────────────────────────────────
ipcMain.handle('ocr-read',         (_e, imgPath) => ocr.read(imgPath))
ipcMain.handle('ocr-classify',     (_e, text)    => ocr.classify(text))
ipcMain.handle('ocr-extract-name', (_e, text)    => ocr.extractName(text))

// ─── IPC: الأرشيف ────────────────────────────────────────────
ipcMain.handle('archive-save',     (_e, data)   => archive.save(data))
ipcMain.handle('archive-open',     (_e, p)      => shell.openPath(p))
ipcMain.handle('archive-export',   (_e, id)     => archive.exportDoc(id))
ipcMain.handle('archive-backup',   ()           => archive.backup())

// ─── IPC: حوارات النظام ──────────────────────────────────────
ipcMain.handle('dialog-save',      async (_e, opts) => {
  const r = await dialog.showSaveDialog(mainWindow, opts)
  return r.filePath
})
ipcMain.handle('dialog-open', async (_e, opts) => {
  const r = await dialog.showOpenDialog(mainWindow, opts)
  return r.filePaths
})
ipcMain.handle('app-version', () => app.getVersion())
ipcMain.handle('app-path',    () => app.getPath('userData'))
