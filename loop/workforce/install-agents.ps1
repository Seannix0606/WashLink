# Copies the workforce loop agents and slash command into .claude so Claude Code picks them up.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File loop\workforce\install-agents.ps1
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Force -Path "$root\.claude\agents", "$root\.claude\commands" | Out-Null
Copy-Item "$PSScriptRoot\agents\*.md" "$root\.claude\agents\" -Force
Copy-Item "$PSScriptRoot\commands\*.md" "$root\.claude\commands\" -Force
Write-Host "Installed workforce agents and /workforce-loop into $root\.claude"
