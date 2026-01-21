const fs = require('fs');
const path = require('path');

// This script renames .js files in dist/esm to .mjs and moves them to dist/
const esmDir = path.join(__dirname, '..', 'dist', 'esm');
const distDir = path.join(__dirname, '..', 'dist');

/**
 * Check if a path is a directory in the dist folder
 */
function isDirectoryImport(importPath, currentFile) {
    const currentDir = path.dirname(currentFile);
    const targetPath = path.join(currentDir, importPath);

    // Check if it's a directory with index.js
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        return fs.existsSync(path.join(targetPath, 'index.js'));
    }
    return false;
}

function processDir(dir, baseDir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, srcPath);

        if (entry.isDirectory()) {
            processDir(srcPath, baseDir);
        } else if (entry.name.endsWith('.js')) {
            const destPath = path.join(distDir, relativePath.replace(/\.js$/, '.mjs'));
            const destDirPath = path.dirname(destPath);

            if (!fs.existsSync(destDirPath)) {
                fs.mkdirSync(destDirPath, { recursive: true });
            }

            let content = fs.readFileSync(srcPath, 'utf8');

            // Fix imports to use .mjs extension
            content = content.replace(/from\s+['"](\.\.?\/[^'"]+)['"]/g, (match, importPath) => {
                // Skip if already has extension
                if (importPath.endsWith('.js') || importPath.endsWith('.mjs')) {
                    return match.replace('.js', '.mjs');
                }

                // Check if this is a directory import (has index.js)
                if (isDirectoryImport(importPath, srcPath)) {
                    return `from '${importPath}/index.mjs'`;
                }

                // Regular file import
                return `from '${importPath}.mjs'`;
            });

            fs.writeFileSync(destPath, content);
        }
    }
}

processDir(esmDir, esmDir);

// Clean up esm directory
fs.rmSync(esmDir, { recursive: true, force: true });

console.log('ESM build completed');
