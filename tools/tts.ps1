param([string]$Text = 'turn with me to John three sixteen', [string]$Out = '%TEMP%\opencode\ss-probe\tts.wav')
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -1
$synth.SetOutputToWaveFile([Environment]::ExpandEnvironmentVariables($Out))
$synth.Speak($Text)
$synth.Dispose()
Write-Output ("WAV " + [Environment]::ExpandEnvironmentVariables($Out))
