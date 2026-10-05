import { existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Resolves a file path that may be relative or just a basename (e.g. from browser file inputs)
 * into its full absolute filesystem path.
 */
export async function resolveVideoPath(filePath, fallbackFolder = null) {
    if (!filePath) return null;

    // 1. Direct or resolved absolute path
    if (existsSync(filePath)) return filePath;
    const directResolved = resolve(filePath);
    if (existsSync(directResolved)) return directResolved;

    // 2. Check within fallbackFolder
    if (fallbackFolder) {
        const c1 = join(fallbackFolder, filePath);
        if (existsSync(c1)) return c1;
        const c2 = join(fallbackFolder, basename(filePath));
        if (existsSync(c2)) return c2;
    }

    // 3. Check common user media directories
    const home = homedir();
    const commonRoots = [
        join(home, 'Downloads'),
        join(home, 'Videos'),
        join(home, 'Desktop'),
        join(home, 'Downloads/modelo'),
        join(home, 'Downloads/00')
    ];

    for (const root of commonRoots) {
        const c1 = join(root, filePath);
        if (existsSync(c1)) return c1;
        const c2 = join(root, basename(filePath));
        if (existsSync(c2)) return c2;
    }

    // 4. Fast system search in user directories using find command
    try {
        const fileName = basename(filePath);
        const searchDirs = [
            join(home, 'Downloads'),
            join(home, 'Videos'),
            join(home, 'Desktop')
        ].filter(existsSync);

        if (searchDirs.length > 0) {
            const { stdout } = await execFileAsync('find', [...searchDirs, '-name', fileName, '-print', '-quit'], { timeout: 3000 });
            const found = stdout.trim();
            if (found && existsSync(found)) {
                return found;
            }
        }
    } catch (_) {}

    return filePath;
}

export default resolveVideoPath;
