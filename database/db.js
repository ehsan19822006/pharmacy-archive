const path=require('path'),fs=require('fs'),{app}=require('electron')
let db
async function init(){
  const SQL=await require('sql.js')()
  const dbPath=path.join(app.getPath('userData'),'pharmacy.db')
  db=fs.existsSync(dbPath)?new SQL.Database(fs.readFileSync(dbPath)):new SQL.Database()
  db.run(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'))
  const sv=()=>fs.writeFileSync(dbPath,Buffer.from(db.export()))
  sv();setInterval(sv,30000);db._save=sv
  console.log('[DB] ready')
}
function run(sql,p=[]){db.run(sql,p);db._save&&db._save()}
function get(sql,p=[]){const s=db.prepare(sql);s.bind(p);const r=s.step()?s.getAsObject():null;s.free();return r}
function all(sql,p=[]){const r=[],s=db.prepare(sql);s.bind(p);while(s.step())r.push(s.getAsObject());s.free();return r}
function getDocs(f={}){let sql='SELECT * FROM documents WHERE 1=1',p=[];if(f.type&&f.type!=='all'){sql+=' AND doc_type=?';p.push(f.type)}if(f.search){sql+=' AND (name LIKE ? OR linked_name LIKE ?)';p.push(`%${f.search}%`,`%${f.search}%`)}return all(sql+' ORDER BY scan_date DESC LIMIT 200',p)}
function addDoc(d){run('INSERT INTO documents(name,doc_type,folder_path,file_name,file_size,pages,ocr_text,linked_type,linked_id,linked_name,dpi,scanned_by,status)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[d.name,d.doc_type,d.folder_path,d.file_name,d.file_size||0,d.pages||1,d.ocr_text||'',d.linked_type||'general',d.linked_id||null,d.linked_name||'',d.dpi||300,d.scanned_by||1,d.status||'done']);return(get('SELECT last_insert_rowid() AS id')||{}).id}
function deleteDoc(id){run('DELETE FROM documents WHERE id=?',[id]);return true}
function getStudents(q=''){const l=`%${q}%`;return all('SELECT * FROM students WHERE full_name LIKE ? OR student_code LIKE ? LIMIT 100',[l,l])}
function getStudent(id){const s=get('SELECT * FROM students WHERE id=?',[id]);if(!s)return null;s.docs=all("SELECT * FROM documents WHERE linked_id=? AND linked_type='student'",[id]);return s}
function getStats(){return{totalDocs:(get('SELECT COUNT(*) AS n FROM documents')||{}).n||0,totalPages:(get('SELECT SUM(pages) AS n FROM documents')||{}).n||0,totalStudents:(get('SELECT COUNT(*) AS n FROM students')||{}).n||0,pendingOcr:0,byType:all('SELECT doc_type,COUNT(*) AS cnt FROM documents GROUP BY doc_type'),recentDocs:all('SELECT * FROM documents ORDER BY scan_date DESC LIMIT 10')}}
function getUsers(){return all('SELECT id,username,full_name,role,department,email,status,last_login,created_at FROM users')}
function addUser(d){run('INSERT INTO users(username,full_name,password,role,department,email,phone)VALUES(?,?,?,?,?,?,?)',[d.username,d.full_name,d.password||'123456',d.role,d.department,d.email,d.phone]);return(get('SELECT last_insert_rowid() AS id')||{}).id}
function updateUser(id,d){run(`UPDATE users SET ${Object.keys(d).map(k=>k+'=?').join(',')} WHERE id=?`,[...Object.values(d),id])}
function getSetting(k){const r=get('SELECT value FROM settings WHERE key=?',[k]);return r?r.value:null}
function setSetting(k,v){run('INSERT OR REPLACE INTO settings(key,value)VALUES(?,?)',[k,v])}
module.exports={init,getDocs,addDoc,deleteDoc,getStudents,getStudent,getStats,getUsers,addUser,updateUser,getSetting,setSetting}
