import ChildProcess from './utils/spawn.js';

export const InputFfmpegTemplate = '<input_file>';
export const OutputFfmpegTemplate = '<output_file>';
export const CropXFfmpegTemplate = '<x>';
export const CropYFfmpegTemplate = '<y>';
export const CropXOFfmpegTemplate = '<xo>';
export const CropYOFfmpegTemplate = '<yo>';
export const DefaultFfmpegCropTemplate = `-y -i ${InputFfmpegTemplate} -map_metadata 0 -map 0 -crf 17 -vf crop=${CropXFfmpegTemplate}:${CropYFfmpegTemplate}:${CropXOFfmpegTemplate}:${CropYOFfmpegTemplate} -c:a copy -c:s copy ${OutputFfmpegTemplate}`;

class VideoStar {
    async cropFile(inputFile, outputFile, crop, fileX, fileY, metadata, ffmpegPath, ffmpegOptions, duration = 0, onProgress = null, onProcessStarted = null) {
        if (metadata) {
            const codec = await this._detectCodecName(inputFile, ffmpegPath);
            if (codec !== 'h264' && codec !== 'hevc') {
                throw new Error(`Metadata based crop not available for ${codec}`);
            }
            await this._metadata_crop(inputFile, outputFile, crop, fileX, fileY, codec, ffmpegPath, onProcessStarted);
        }
        else {
            await this._encode_crop(ffmpegOptions, inputFile, outputFile, crop, ffmpegPath, duration, onProgress, onProcessStarted);
        }
    }

    async _detectCodecName(inputFile, ffmpegPath) {
        const childProcess = new ChildProcess('ffprobe',
            ['-hide_banner', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inputFile],
            {},
            ffmpegPath
        );
        const stdOut = await childProcess.getStdOut();
        return JSON.parse(stdOut)
            .streams
            .filter(v => v.codec_type === 'video')
            .map(v => v.codec_name)[0];
    }

    async _metadata_crop(inputFile, outputFile, crop, fileX, fileY, codec, ffmpegPath, onProcessStarted = null) {
        const [x, y, xOffset, yOffset] = crop;
        const left = xOffset;
        const right = fileX - x - xOffset;
        const top = yOffset;
        const bottom = fileY - y - yOffset;

        const childProcess = new ChildProcess('ffmpeg',
            ['-i', inputFile, '-codec', 'copy', '-bsf:v', `${codec}_metadata=crop_left=${left}:crop_right=${right}:crop_top=${top}:crop_bottom=${bottom}`, outputFile],
            {
                // the following avoids a memory leak
                disableStdPipeAppend: true
            },
            ffmpegPath
        );
        if (onProcessStarted) onProcessStarted(childProcess);
        childProcess.on('stdout', this._onConsoleOutput);
        childProcess.on('stderr', this._onConsoleOutput);
        await childProcess.getAwaitablePromise();
    }

    async _encode_crop(template, inputFile, outputFile, crop, ffmpegPath, duration = 0, onProgress = null, onProcessStarted = null) {
        const ffmpegOptions = await this._parseCropTemplate(template, inputFile, outputFile, crop);
        const childProcess = new ChildProcess('ffmpeg',
            ffmpegOptions,
            {
                // the following avoids a memory leak
                disableStdPipeAppend: true
            },
            ffmpegPath
        );
        if (onProcessStarted) onProcessStarted(childProcess);
        childProcess.on('stdout', this._onConsoleOutput);
        childProcess.on('stderr', (sender, dataStr) => {
            this._onConsoleOutput(sender, dataStr);
            if (onProgress && dataStr.includes('time=')) {
                const match = dataStr.match(/time=([0-9:.]+)/);
                if (match) {
                    const timeParts = match[1].split(':');
                    let secs = 0;
                    if (timeParts.length === 3) {
                        secs = parseFloat(timeParts[0]) * 3600 + parseFloat(timeParts[1]) * 60 + parseFloat(timeParts[2]);
                    }
                    let pct = duration > 0 ? Math.min(99.9, (secs / duration) * 100) : 0;
                    const speedMatch = dataStr.match(/speed=\s*([0-9.]+x)/);
                    const fpsMatch = dataStr.match(/fps=\s*([0-9.]+)/);
                    onProgress({
                        time: match[1],
                        percentage: Math.round(pct * 10) / 10,
                        speed: speedMatch ? speedMatch[1] : '1x',
                        fps: fpsMatch ? fpsMatch[1] : '0'
                    });
                }
            }
        });
        await childProcess.getAwaitablePromise();
    }

    _onConsoleOutput(childProcess, dataStr) {
        console.error('ffmpeg: ' + dataStr);
        if (dataStr.includes('Conversion failed!')) {
            childProcess.abort();
        }
    }

    _parseCropTemplate(template, inputFile, outputFile, crop) {
        const [x, y, xOffset, yOffset] = crop;
        const options = template.split(' ');
        for (let i = 0; i < options.length; i++) {
            switch (options[i]) {
                case InputFfmpegTemplate:
                    options[i] = inputFile;
                    break;
                case OutputFfmpegTemplate:
                    options[i] = outputFile;
                    break;
                case CropXFfmpegTemplate:
                    options[i] = x;
                    break;
                case CropYFfmpegTemplate:
                    options[i] = y;
                    break;
                case CropXOFfmpegTemplate:
                    options[i] = xOffset;
                    break;
                case CropYOFfmpegTemplate:
                    options[i] = yOffset;
                    break;
                default:
                    options[i] = options[i]
                        .replaceAll(CropXFfmpegTemplate, x)
                        .replaceAll(CropYFfmpegTemplate, y)
                        .replaceAll(CropXOFfmpegTemplate, xOffset)
                        .replaceAll(CropYOFfmpegTemplate, yOffset);
                    break;
            }
        }
        return options;
    }
}

const instance = new VideoStar();
export default instance.cropFile.bind(instance);
