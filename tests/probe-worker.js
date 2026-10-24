/* Probe sttWorker directly: fork, init with real paths, log messages + timing. */
const { fork } = require('child_process')
const path = require('path')
const PROJ = path.resolve(__dirname, '..')
const t0 = Date.now()
const child = fork(path.join(PROJ, 'out', 'main', 'sttWorker.js'), [], {
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  serialization: 'advanced',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
const log = (tag, m) => console.log(`+${Date.now() - t0}ms [${tag}]`, JSON.stringify(m).slice(0, 300))
child.on('message', (m) => {
  log('MSG', m)
  if (m && m.type === 'status' && m.state === 'listening') {
    setTimeout(() => { log('DONE', 'listening reached'); child.kill(); process.exit(0) }, 500)
  }
})
child.on('exit', (c, s) => log('EXIT', { c, s }))
child.on('error', (e) => log('ERR', String(e)))
child.send({ cmd: 'init', modelPath: path.join(PROJ, 'models', 'vosk-model-small-en-us-0.15'), voskDllDir: path.join(PROJ, 'vendor', 'vosk'), sampleRate: 16000 })
setTimeout(() => { log('TIMEOUT', '30s — killing'); child.kill(); process.exit(1) }, 30000)
setTimeout(() => { log('DONE', 'ok'); child.kill(); process.exit(0) }, 31000)
