const path = require('path')
const fs = require('fs')
console.log('cwd=' + process.cwd())
console.log('argv1=' + process.argv[1])
console.log('dirname=' + __dirname)
const q = path.join(__dirname, '..', 'assets', 'sermonsight.ss')
console.log('resolved=' + q)
console.log('exists=' + fs.existsSync(q) + ' dirExists=' + fs.existsSync(path.dirname(q)))
const abs = 'C:\\Users\\The Kreadive Galaxy\\Desktop\\My Products\\SermonSight\\assets\\sermonsight.ss'
console.log('abs=' + abs + ' exists=' + fs.existsSync(abs) + ' dir=' + fs.existsSync(path.dirname(abs)))
try {
  const Database = require('better-sqlite3')
  const db = new Database(abs, { readonly: true })
  console.log('OPEN OK tables=' + JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)))
  db.close()
} catch (e) {
  console.log('OPEN FAIL ' + e.message)
}
