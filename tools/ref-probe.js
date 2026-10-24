const path = require('path')

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

const dir = path.join(process.cwd(), 'node_modules', 'ref-napi', 'prebuilds', 'win32-x64')
console.log('node.napi.node -> ' + tryDlopen(path.join(dir, 'node.napi.node')))

try {
  const desc = Object.getOwnPropertyDescriptor(process.versions, 'electron')
  console.log('versions.electron descriptor: ' + JSON.stringify(desc && { configurable: desc.configurable, writable: desc.writable }))
  delete process.versions.electron
} catch (e) {
  console.log('delete fail: ' + e.message)
}
console.log('after delete, electron=' + process.versions.electron)
const gyp = require('node-gyp-build')
console.log('ref resolves now -> ' + gyp.path(path.join(process.cwd(), 'node_modules', 'ref-napi')))
