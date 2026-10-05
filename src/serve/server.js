import express, { json as ejson } from 'express';
import { promisify } from 'util';
import { join, dirname, extname, resolve } from 'path';
import { existsSync } from 'fs';
import { readdir, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import Queue from './queue.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Server {
    static port = 4200;

    constructor(options, detect, cropFile) {
        this.options = options;
        this.detectFunction = detect;
        this.cropFileFunction = cropFile;
        this.app = express();
        this.app.use(ejson());

        // CORS support for web dashboard
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
            next();
        });

        this.app.get('/api/1/status', this.getStatus.bind(this));
        this.app.get('/api/1/queue', this.listQueue.bind(this));
        this.app.get('/api/1/queue/detailed', this.listDetailedQueue.bind(this));
        this.app.post('/api/1/queue/add', this.addToQueue.bind(this));
        this.app.post('/api/1/queue/remove', this.removeFromQueue.bind(this));
        this.app.post('/api/1/queue/cancel-active', this.cancelActiveJob.bind(this));
        this.app.post('/api/1/folder/scan', this.scanFolder.bind(this));
        this.app.get('/api/1/system/directories', this.listDirectories.bind(this));
        this.app.post('/api/1/system/resolve-folder', this.resolveFolder.bind(this));
        this.app.post('/api/1/system/create-folder', this.createFolder.bind(this));
        this.app.post('/api/1/webhook/sonarr', this.arrWebhook.bind(this));
        this.app.post('/api/1/webhook/radarr', this.arrWebhook.bind(this));

        // Serve built React Web UI if present
        const distPath = join(__dirname, '../../frontend/dist');
        if (existsSync(distPath)) {
            this.app.use(express.static(distPath));
            this.app.use((req, res, next) => {
                if (req.method === 'GET' && !req.path.startsWith('/api')) {
                    return res.sendFile(join(distPath, 'index.html'));
                }
                next();
            });
        }

        this.queue = new Queue(options, detect, cropFile);
    }

    async serve() {
        const listen = promisify(this.app.listen.bind(this.app));
        const instance = listen(Server.port);
        console.info(`Listening on port ${Server.port}`);
        await instance;
    }

    async getStatus(req, res) {
        res.json({
            success: true,
            status: 'online',
            service: 'star',
            port: Server.port,
            consumptionInProgress: this.queue.consumptionInProgress,
            activeItem: this.queue.itemBeingConsumed,
            currentProgress: this.queue.getCurrentProgress(),
            processingWindows: this.queue.processingWindows.length
        });
    }

    async cancelActiveJob(req, res) {
        const cancelled = await this.queue.cancelActiveJob();
        res.json({
            success: cancelled,
            detail: {
                type: 'queue/cancel-active',
                cancelled
            }
        });
    }

    async listQueue(req, res) {
        res.json({
            success: true,
            detail: {
                type: 'queue',
                subtype: 'list',
                items: await this.queue.getQueueItems()
            }
        });
    }

    async listDetailedQueue(req, res) {
        const details = await this.queue.getDetailedQueueItems();
        res.json({
            success: true,
            detail: {
                type: 'queue',
                subtype: 'detailed',
                ...details
            }
        });
    }

    async removeFromQueue(req, res) {
        if (!req.body || !req.body.file) {
            res.json({
                success: false,
                detail: {
                    type: 'queue/remove',
                    error: 'No file was provided in message body'
                }
            });
            return;
        }
        const removed = await this.queue.removeFromQueue(req.body.file);
        res.json({
            success: removed >= 0,
            detail: {
                type: 'queue/remove',
                removed: removed >= 0
            }
        });
    }

    async addToQueue(req, res) {
        if (!req.body || (!req.body.file && !req.body.files && !req.body.items)) {
            res.json({
                success: false,
                detail: {
                    type: 'queue/add',
                    error: 'Nenhum arquivo informado no corpo da requisição'
                }
            });
            return;
        }

        const outputFolder = req.body.outputFolder || null;

        if (Array.isArray(req.body.items)) {
            const added = [];
            for (const item of req.body.items) {
                const filePath = typeof item === 'string' ? item : item.file;
                const crop = item && item.crop ? item.crop : null;
                const itemOutputFolder = (item && item.outputFolder) || outputFolder;
                const pos = await this.queue.addToQueue(filePath, crop, itemOutputFolder);
                added.push({ file: filePath, position: pos });
            }
            res.json({
                success: true,
                detail: {
                    type: 'queue/add-multiple',
                    count: added.length,
                    items: added
                }
            });
            return;
        }

        if (Array.isArray(req.body.files)) {
            const added = [];
            for (const f of req.body.files) {
                const pos = await this.queue.addToQueue(f, null, outputFolder);
                added.push({ file: f, position: pos });
            }
            res.json({
                success: true,
                detail: {
                    type: 'queue/add-multiple',
                    count: added.length,
                    items: added
                }
            });
            return;
        }

        const addedPosition = await this.queue.addToQueue(req.body.file, req.body.crop || null, outputFolder);
        res.json({
            success: true,
            detail: {
                type: 'queue/add',
                position: addedPosition
            }
        });
    }

    async scanFolder(req, res) {
        const { folderPath } = req.body || {};
        if (!folderPath || !existsSync(folderPath)) {
            res.json({
                success: false,
                error: `Diretório não encontrado: ${folderPath || 'nenhum'}`
            });
            return;
        }

        try {
            const videoExts = ['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v', '.ts', '.flv'];
            const foundFiles = [];

            const walk = async (dir) => {
                const entries = await readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) {
                        continue;
                    }
                    const full = join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walk(full);
                    } else if (entry.isFile()) {
                        if (entry.name.endsWith('.d.ts')) continue;
                        const ext = extname(entry.name).toLowerCase();
                        if (videoExts.includes(ext)) {
                            foundFiles.push(full);
                        }
                    }
                }
            };

            await walk(folderPath);
            res.json({
                success: true,
                count: foundFiles.length,
                files: foundFiles
            });
        } catch (e) {
            res.json({
                success: false,
                error: e.message
            });
        }
    }

    async listDirectories(req, res) {
        try {
            const home = homedir();
            const requestedPath = req.query.path ? resolve(req.query.path) : home;
            const targetDir = existsSync(requestedPath) ? requestedPath : home;
            const entries = await readdir(targetDir, { withFileTypes: true });
            const dirs = entries
                .filter(e => e.isDirectory() && !e.name.startsWith('.'))
                .map(e => e.name)
                .sort((a, b) => a.localeCompare(b));

            const shortcuts = [
                { name: 'Início', path: home, icon: '🏠' },
                { name: 'Downloads', path: join(home, 'Downloads'), icon: '📥' },
                { name: 'Vídeos', path: join(home, 'Vídeos'), icon: '🎬' },
                { name: 'Videos', path: join(home, 'Videos'), icon: '🎬' },
                { name: 'Área de Trabalho', path: join(home, 'Área de trabalho'), icon: '🖥️' },
                { name: 'Desktop', path: join(home, 'Desktop'), icon: '🖥️' }
            ].filter(s => existsSync(s.path));

            res.json({
                success: true,
                current: targetDir,
                parent: dirname(targetDir),
                directories: dirs,
                shortcuts
            });
        } catch (err) {
            res.json({
                success: false,
                error: err.message
            });
        }
    }

    async resolveFolder(req, res) {
        try {
            const { folderName, sampleFile } = req.body || {};
            if (!folderName) {
                return res.json({ success: false, error: 'Nome da pasta não fornecido' });
            }

            const home = homedir();
            const candidates = [
                join(home, 'Downloads', folderName),
                join(home, 'Vídeos', folderName),
                join(home, 'Videos', folderName),
                join(home, 'Desktop', folderName),
                join(home, 'Área de trabalho', folderName),
                join(home, folderName)
            ];

            for (const cand of candidates) {
                if (existsSync(cand)) {
                    return res.json({ success: true, path: cand });
                }
            }

            if (sampleFile) {
                try {
                    const searchRoots = [join(home, 'Downloads'), join(home, 'Vídeos'), home].filter(existsSync);
                    const { stdout } = await execFileAsync('find', [...searchRoots, '-maxdepth', '5', '-name', sampleFile, '-print', '-quit'], { timeout: 3000 });
                    const file = stdout.trim();
                    if (file && existsSync(file)) {
                        return res.json({ success: true, path: dirname(file) });
                    }
                } catch (_) { }
            }

            try {
                const searchRoots = [join(home, 'Downloads'), join(home, 'Vídeos'), home].filter(existsSync);
                const { stdout } = await execFileAsync('find', [...searchRoots, '-maxdepth', '4', '-type', 'd', '-name', folderName, '-print', '-quit'], { timeout: 3000 });
                const dir = stdout.trim();
                if (dir && existsSync(dir)) {
                    return res.json({ success: true, path: dir });
                }
            } catch (_) { }

            return res.json({ success: true, path: join(home, 'Downloads', folderName) });
        } catch (err) {
            res.json({ success: false, error: err.message });
        }
    }

    async createFolder(req, res) {
        try {
            const { folderPath } = req.body || {};
            if (!folderPath) {
                return res.json({ success: false, error: 'Caminho não fornecido' });
            }
            await mkdir(folderPath, { recursive: true });
            res.json({ success: true, path: folderPath });
        } catch (err) {
            res.json({ success: false, error: err.message });
        }
    }

    getProgramName(event) {
        return event.episodes ? 'Sonarr' : 'Radarr';
    }

    async arrWebhook(req, res) {
        const event = req.body;
        switch (event.eventType) {
            case 'Download':
                const isSonarr = event.series && event.series.path && event.episodeFile && event.episodeFile.relativePath;
                const isRadarr = event.movie && event.movie.folderPath && event.movieFile && event.movieFile.relativePath;
                if (!isSonarr && !isRadarr) {
                    console.warn('Request received for downloadFolderImported without an importedPath:\n' + JSON.stringify(event, null, 4));
                    res.json({
                        success: false,
                        detail: {
                            type: 'webhook/arr/add',
                            error: 'No file path provided in event'
                        }
                    });
                    return;
                }
                const addPath = isSonarr
                    ? join(event.series.path, event.episodeFile.relativePath)
                    : join(event.movie.folderPath, event.movieFile.relativePath);
                const addedPosition = await this.queue.addToQueue(addPath);
                res.json({
                    success: true,
                    detail: {
                        type: 'webhook/arr/add',
                        position: addedPosition
                    }
                });
                break;
            case 'MovieFileDelete':
            case 'EpisodeFileDelete':
                const isSonarrDelete = event.episodeFile && event.episodeFile.path;
                const isRadarrDelete = event.movieFile && event.movieFile.path;
                if (!isSonarrDelete && !isRadarrDelete) {
                    console.warn('Request received for EpisodeFileDelete without a path:\n' + JSON.stringify(event, null, 4));
                    res.json({
                        success: false,
                        detail: {
                            type: 'webhook/arr/remove',
                            error: 'No file path provided in event'
                        }
                    });
                    return;
                }
                const deletePath = isSonarrDelete
                    ? event.episodeFile.path
                    : event.movieFile.path;
                const episodeDeletedPosition = await this.queue.removeFromQueue(deletePath);
                res.json({
                    success: true,
                    detail: {
                        type: 'webhook/arr/remove',
                        position: episodeDeletedPosition
                    }
                });
                break;
            case 'Test':
                this.handleTestArrEvent(req, res);
                break;
            default:
                this.handleIrrelevantArrEvent(req, res);
                break;
        }
    }

    handleTestArrEvent(req, res) {
        const program = this.getProgramName(req.body);
        console.info(`${program} performed a test.`);
        res.json({
            success: true,
            detail: {
                type: 'test',
                program
            }
        });
    }

    handleIrrelevantArrEvent(req, res) {
        const program = this.getProgramName(req.body);
        const warning = `Non-relevant ${program} event received: ${req.body.eventType}. Update your ${program} settings to remove this warning.`;
        console.warn(warning);
        console.warn('Event was:\n' + JSON.stringify(req.body, null, 4));
        res.json({
            success: false,
            detail: {
                type: 'event',
                subtype: req.body.eventType,
                error: warning
            }
        });
    }
}

export default async (...args) => {
    const serverInstance = new Server(...args);
    return await serverInstance.serve();
};
