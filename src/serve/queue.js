import sqlite3 from 'sqlite3';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import resolveVideoPath from '../utils/resolvePath.js';

const MAX_POLL_INTERVAL = 3600000; // 1 hour in milliseconds
const MIN_POLL_INTERVAL = 300000; // 5 minutes in milliseconds

class Queue {
    constructor(options, detect, cropFile) {
        this.cliOptions = options;
        this.detectFunction = detect;
        this.cropFileFunction = cropFile;
        this.pathMappingsFunction = this._getPathMappings(options.paths);
        this.consumptionInProgress = false;
        this.itemBeingConsumed = null;
        this.currentProgress = null;
        this.activeChildProcess = null;
        this.isCancelled = false;
        this.processingWindows = options.window || [];
        this.db = new sqlite3.Database(options.config);
        this.wakeUpPoll = null;
        
        if (this.processingWindows.some(window => !window.hours)) {
            throw new Error('All processing windows must specify hours');
        }

        // Create table if it doesn't exist, ensure crop & output_folder columns exist, then start consumer
        this.db.run(`
            CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE,
                crop TEXT,
                output_folder TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Error creating queue table:', err);
            }
            this.db.run(`ALTER TABLE queue ADD COLUMN crop TEXT`, () => {
                this.db.run(`ALTER TABLE queue ADD COLUMN output_folder TEXT`, () => {
                    this._consumeFromQueue();
                });
            });
        });
    }

    _isWithinWindow() {
        if (this.processingWindows.length === 0) {
            // No windows specified, always allowed
            return true;
        }
        const now = new Date();
        // Check if current time is within any of the specified cron windows
        return this.processingWindows.some(({ cron, hours }) => {
            cron.reset(now)
            const lastStart = cron.prev();
            const end = new Date(lastStart.getTime() + hours * 60 * 60 * 1000);
            return lastStart.getTime() <= now.getTime() && now.getTime() < end.getTime();
        });
    }

    async _pollWakeup() {
        if (!this.processingWindows || this.processingWindows.length === 0) {
            return;
        }
        const now = new Date();
        const nextWindowStartsAt = this.processingWindows
            .map(({ cron }) => {
                cron.reset(now);
                return cron.next();
            })
            .reduce((previous, current) => previous.getTime() > current.getTime() ? current : previous);
        
        const millisUntilNextWindow = Math.max(0, nextWindowStartsAt.getTime() - Date.now());
        const timeToWait = Math.max(Math.min(millisUntilNextWindow, MAX_POLL_INTERVAL), MIN_POLL_INTERVAL);
        console.info(`Next poll at ${new Date(Date.now() + timeToWait).toString()}. Waiting...`);
        this.wakeUpPoll = setTimeout(this._consumeFromQueue.bind(this), timeToWait);
    }

    getCurrentProgress() {
        if (!this.consumptionInProgress || !this.itemBeingConsumed) {
            return null;
        }
        return {
            path: this.itemBeingConsumed,
            ...(this.currentProgress || {
                percentage: 0,
                time: '00:00:00',
                speed: '1x',
                fps: '0'
            }),
            isCancelled: this.isCancelled
        };
    }

    async cancelActiveJob() {
        if (!this.consumptionInProgress || !this.itemBeingConsumed) {
            return false;
        }

        const cancelledPath = this.itemBeingConsumed;
        this.isCancelled = true;
        console.info(`Cancelling active crop job on: ${cancelledPath}`);

        if (this.activeChildProcess) {
            try {
                this.activeChildProcess.abort();
            } catch (err) {
                console.error('Error aborting active child process:', err);
            }
        }

        try {
            await new Promise((resolve, reject) => {
                this.db.run(
                    'UPDATE queue SET status = ? WHERE path = ?',
                    ['cancelled', cancelledPath],
                    err => err ? reject(err) : resolve()
                );
            });
        } catch (err) {
            console.error('Error updating status to cancelled:', err);
        }

        return true;
    }

    async _consumeFromQueue() {
        if (this.consumptionInProgress) {
            return;
        }
        if (this.wakeUpPoll) {
            clearTimeout(this.wakeUpPoll);
            this.wakeUpPoll = null;
        }
        this.consumptionInProgress = true;

        try {
            while (true) {
                if (!this._isWithinWindow()) {
                    console.info('Queue processing paused: outside allowed windows');
                    break;
                }

                // Get the next pending item
                const nextItem = await new Promise((resolve, reject) => {
                    this.db.get(
                        'SELECT path, crop, output_folder FROM queue WHERE status = ? ORDER BY created_at ASC LIMIT 1',
                        ['pending'],
                        (err, row) => err ? reject(err) : resolve(row)
                    );
                });

                if (!nextItem) {
                    break; // No more items to process
                }

                this.itemBeingConsumed = nextItem.path;
                this.isCancelled = false;
                this.currentProgress = {
                    path: this.itemBeingConsumed,
                    percentage: 0,
                    time: '00:00:00',
                    speed: '1x',
                    fps: '0',
                    startedAt: Date.now()
                };

                const destFolder = nextItem.output_folder || this.cliOptions.outputFolder;
                // Resolve path to full absolute path if relative or browser-selected
                const actualFilePath = await resolveVideoPath(this.itemBeingConsumed, destFolder);
                console.info(`Starting crop on ${this.itemBeingConsumed} (Resolved: ${actualFilePath})`);

                let parsedCrop = null;
                if (nextItem.crop) {
                    try {
                        parsedCrop = JSON.parse(nextItem.crop);
                    } catch (_) {}
                }

                let targetOutput = 'in-place';
                if (destFolder && destFolder.trim() !== '') {
                    const resolvedDest = resolve(destFolder.trim());
                    if (!existsSync(resolvedDest)) {
                        await mkdir(resolvedDest, { recursive: true });
                    }
                    targetOutput = join(resolvedDest, basename(actualFilePath));
                }
                
                try {
                    await this.cropFileFunction(actualFilePath, targetOutput, {
                        ...this.cliOptions,
                        crop: parsedCrop || this.cliOptions.crop,
                        onProcessStarted: (childProc) => {
                            this.activeChildProcess = childProc;
                        },
                        onProgress: (prog) => {
                            this.currentProgress = {
                                path: this.itemBeingConsumed,
                                ...prog,
                                startedAt: this.currentProgress?.startedAt || Date.now()
                            };
                        }
                    });

                    // Update status to completed if not cancelled
                    if (!this.isCancelled) {
                        await new Promise((resolve, reject) => {
                            this.db.run(
                                'UPDATE queue SET status = ? WHERE path = ?',
                                ['completed', this.itemBeingConsumed],
                                err => err ? reject(err) : resolve()
                            );
                        });
                        console.info(`Crop complete on ${this.itemBeingConsumed}`);
                    }
                } catch (e) {
                    console.error(e);
                    const finalStatus = this.isCancelled ? 'cancelled' : 'failed';
                    // Update status
                    await new Promise((resolve, reject) => {
                        this.db.run(
                            'UPDATE queue SET status = ? WHERE path = ?',
                            [finalStatus, this.itemBeingConsumed],
                            err => err ? reject(err) : resolve()
                        );
                    });
                    if (this.isCancelled) {
                        console.info(`Crop cancelled on ${this.itemBeingConsumed}`);
                    }
                } finally {
                    this.activeChildProcess = null;
                    this.currentProgress = null;
                    this.isCancelled = false;
                }
            }
        } finally {
            this.consumptionInProgress = false;
            this.itemBeingConsumed = null;
            this.activeChildProcess = null;
            this.currentProgress = null;
            this.isCancelled = false;
        }

        this._pollWakeup();
    }

    _getPathMappings(paths) {
        const mappings = paths.split(',')
            .filter(mapping => mapping !== '')
            .map(spl => spl.split(':'))
            .filter(mapping => mapping.length === 2);
        return path => {
            for (let mapping of mappings) {
                path = path.replaceAll(mapping[0], mapping[1]);
            }
            return path;
        };
    }

    async addToQueue(path, crop = null, outputFolder = null) {
        const newFile = this.pathMappingsFunction(path);
        const cropStr = crop ? JSON.stringify(crop) : null;
        
        try {
            // Try to insert the new file (or re-queue if previously failed/cancelled)
            await new Promise((resolve, reject) => {
                this.db.run(
                    'INSERT INTO queue (path, crop, output_folder, status) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET crop = excluded.crop, output_folder = excluded.output_folder, status = ?',
                    [newFile, cropStr, outputFolder, 'pending', 'pending'],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });

            // Get the position of this item
            const position = await new Promise((resolve, reject) => {
                this.db.get(
                    'SELECT COUNT(*) as pos FROM queue WHERE created_at <= (SELECT created_at FROM queue WHERE path = ?)',
                    [newFile],
                    (err, row) => err ? reject(err) : resolve(row ? row.pos - 1 : 0)
                );
            });

            this._consumeFromQueue();
            return position;
        } catch (err) {
            console.error('Error adding to queue:', err);
            return -1;
        }
    }

    async removeFromQueue(path) {
        const deletedFile = this.pathMappingsFunction(path);
        
        try {
            // Update status to 'cancelled' instead of deleting
            const result = await new Promise((resolve, reject) => {
                this.db.run(
                    'UPDATE queue SET status = ? WHERE path = ? AND status = ?',
                    ['cancelled', deletedFile, 'pending'],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    }
                );
            });
            
            return result > 0 ? 0 : -1;
        } catch (err) {
            console.error('Error removing from queue:', err);
            return -1;
        }
    }

    async getQueueItems() {
        try {
            const items = await new Promise((resolve, reject) => {
                this.db.all(
                    'SELECT path FROM queue WHERE status = ? ORDER BY created_at ASC',
                    ['pending'],
                    (err, rows) => err ? reject(err) : resolve(rows.map(row => row.path))
                );
            });

            if (this.consumptionInProgress && this.itemBeingConsumed) {
                return [this.itemBeingConsumed, ...items];
            }
            return items;
        } catch (err) {
            console.error('Error getting queue items:', err);
            return [];
        }
    }

    async getDetailedQueueItems() {
        try {
            const items = await new Promise((resolve, reject) => {
                this.db.all(
                    'SELECT id, path, status, created_at FROM queue ORDER BY id DESC LIMIT 100',
                    [],
                    (err, rows) => err ? reject(err) : resolve(rows || [])
                );
            });
            return {
                items,
                inProgress: this.consumptionInProgress,
                activeItem: this.itemBeingConsumed,
                currentProgress: this.getCurrentProgress()
            };
        } catch (err) {
            console.error('Error getting detailed queue items:', err);
            return { items: [], inProgress: false, activeItem: null, currentProgress: null };
        }
    }
}

export default Queue;
