const fs = require('fs');
const path = require('path');

// This script renames .js files in dist/esm to .mjs and moves them to dist/
const esmDir = path.join(__dirname, '..', 'dist', 'esm');
const distDir = path.join(__dirname, '..', 'dist');

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
            content = content.replace(/from\s+['"](\.[^'"]+)['"]/g, (match, p1) => {
                if (!p1.endsWith('.js') && !p1.endsWith('.mjs')) {
                    return `from '${p1}.mjs'`;
                }
                return match.replace('.js', '.mjs');
            });

            fs.writeFileSync(destPath, content);
        }
    }
}

processDir(esmDir, esmDir);

// Clean up esm directory
fs.rmSync(esmDir, { recursive: true, force: true });

console.log('ESM build completed');
