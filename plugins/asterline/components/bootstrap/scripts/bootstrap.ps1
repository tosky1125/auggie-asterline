$ErrorActionPreference = "Stop"
$root = if ($env:AUGMENT_PLUGIN_ROOT) { $env:AUGMENT_PLUGIN_ROOT } elseif ($env:PLUGIN_ROOT) { $env:PLUGIN_ROOT } else { Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
& node (Join-Path $root "components\bootstrap\dist\cli.js") hook session-start
exit 0
