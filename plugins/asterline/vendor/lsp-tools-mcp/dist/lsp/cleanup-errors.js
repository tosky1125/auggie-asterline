export function reportBestEffortCleanupError(operation, error) {
    if (process.env["ASTERLINE_LSP_DEBUG_CLEANUP"] !== "1")
        return;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[asterline-lsp] ignored ${operation} failure during cleanup: ${message}`);
}
