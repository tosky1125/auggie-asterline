#Requires -Version 5.1

param([switch]$Help)

$ErrorActionPreference = 'Stop'
if ($Help) {
    Write-Output 'Asterline does not install ast-grep from this skill.'
    Write-Output 'SessionStart provisions the checksum-pinned runtime binary.'
    exit 0
}

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$asterlineHome = if ($env:ASTERLINE_HOME) { $env:ASTERLINE_HOME } else { Join-Path $HOME '.asterline' }
$runtimeBinary = Join-Path $asterlineHome "runtime/ast-grep/win32-$arch/sg.exe"
$candidates = @($env:ASTERLINE_AST_GREP_SG_PATH, $runtimeBinary)

foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        & $candidate --version
        exit $LASTEXITCODE
    }
}

$pathBinary = Get-Command 'ast-grep' -ErrorAction SilentlyContinue
if ($pathBinary) {
    & $pathBinary.Source --version
    exit $LASTEXITCODE
}

[Console]::Error.WriteLine('structure-search: ast-grep is unavailable.')
[Console]::Error.WriteLine('Asterline will not invoke a package manager from a skill.')
[Console]::Error.WriteLine('Restart Auggie so SessionStart can provision the pinned runtime binary.')
exit 3
