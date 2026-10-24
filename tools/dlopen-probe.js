const path = require('path')
const fs = require('fs')

function tryDlopen(file) {
  try {
    const m = new module.constructor()
    m.paths = module.paths
    process.dlopen(m, file)
    return 'OK'
  } catch (e) {
    return 'FAIL ' + e.message
  }
}

const runtime = process.versions.electron ? 'electron-' + process.versions.electron : 'node-' + process.versions.node
console.log('runtime=' + runtime)

const gyp = require('node-gyp-build')
for (const pkg of ['ffi-napi', 'ref-napi']) {
  const dir = path.join(process.cwd(), 'node_modules', pkg)
  try {
    const resolved = gyp.path(dir)
    console.log(pkg + ' resolves -> ' + resolved)
    console.log(pkg + ' dlopen -> ' + tryDlopen(resolved))
  } catch (e) {
    console.log(pkg + ' resolve FAIL ' + e.message)
  }
}
const ffiDir = path.join(process.cwd(), 'node_modules', 'ffi-napi', 'prebuilds', 'win32-x64')
for (const f of fs.readdirSync(ffiDir)) {
  console.log('direct ' + f + ' -> ' + tryDlopen(path.join(ffiDir, f)))
}
