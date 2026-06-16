import { basename, extname } from "node:path";
const BASENAME_EXTENSIONS = {
    Dockerfile: ".dockerfile",
    Containerfile: ".dockerfile",
};
export function effectiveExtension(filePath) {
    return BASENAME_EXTENSIONS[basename(filePath)] ?? extname(filePath);
}
