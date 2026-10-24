const steps = []
function step(name, fn) {
  try {
    const r = fn()
    steps.push(name + ': OK' + (r ? ' ' + r : ''))
    return r
  } catch (e) {
    steps.push(name + ': FAIL ' + e.message)
    throw e
  }
}
try {
  step('require ffi-napi', () => require('ffi-napi'))
  step('require ref-napi', () => require('ref-napi'))
  const vosk = step('require vosk', () => require('vosk'))
  step('setLogLevel', () => vosk.setLogLevel(-1))
  const model = step('new Model', () => new vosk.Model(process.argv[2] || (__dirname + '/../models/vosk-model-small-en-us-0.15')))
  step('new Recognizer', () => new vosk.Recognizer({ model, sampleRate: 16000 }))
  steps.push('ALL OK')
} catch (e) {
  steps.push('ABORT ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e))
}
console.log(steps.join('\n'))
