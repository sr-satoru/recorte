import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Play, Pause, Upload, Copy, Check, Video,
  Layers, Scissors, Maximize2, RefreshCw, Send, Sliders,
  HelpCircle, Eye, Download, Info
} from 'lucide-react';

const ASPECT_PRESETS = [
  { label: 'Auto (Detectar)', value: 'auto', ratio: null },
  { label: '2.39:1 Cinemascope', value: '2.39:1', ratio: 2.39 },
  { label: '2.35:1 Anamórfico', value: '2.35:1', ratio: 2.35 },
  { label: '1.85:1 Cinema Flat', value: '1.85:1', ratio: 1.85 },
  { label: '16:9 HDTV', value: '16:9', ratio: 16 / 9 },
  { label: '4:3 Clássico SD', value: '4:3', ratio: 4 / 3 },
  { label: 'Livre / Custom', value: 'custom', ratio: null },
];

const DEMO_SCENARIOS = [
  {
    id: 'letterbox',
    name: 'Filme 2.39:1 (Letterbox - Barras Topo e Base)',
    width: 1920,
    height: 1080,
    cropDefault: { x: 0, y: 138, width: 1920, height: 804 },
    theme: 'cinema'
  },
  {
    id: 'pillarbox',
    name: 'Série Clássica 4:3 (Pillarbox - Barras Laterais)',
    width: 1920,
    height: 1080,
    cropDefault: { x: 240, y: 0, width: 1440, height: 1080 },
    theme: 'vintage'
  }
];

export default function CropStudio({ onAddToQueue, showToast }) {
  const [selectedDemo, setSelectedDemo] = useState('letterbox');
  const [customVideoSrc, setCustomVideoSrc] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPath, setVideoPath] = useState('/media/movies/Blade_Runner_2049_1080p.mkv');

  // Dimensions
  const [frameDimensions, setFrameDimensions] = useState({ width: 1920, height: 1080 });
  const [cropBox, setCropBox] = useState({ x: 0, y: 138, width: 1920, height: 804 });
  const [selectedPreset, setSelectedPreset] = useState('2.39:1');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(null);

  // Draw simulated or video frame to canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = frameDimensions;

    canvas.width = width;
    canvas.height = height;

    if (customVideoSrc && videoRef.current && videoRef.current.readyState >= 2) {
      ctx.drawImage(videoRef.current, 0, 0, width, height);
    } else {
      // Draw simulated cinematic frame
      ctx.fillStyle = '#050608';
      ctx.fillRect(0, 0, width, height);

      if (selectedDemo === 'letterbox') {
        // Top and bottom black bars
        const contentTop = 138;
        const contentHeight = 804;

        // Content area gradient / cinematic art
        const grad = ctx.createLinearGradient(0, contentTop, width, contentTop + contentHeight);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.3, '#1e1b4b');
        grad.addColorStop(0.6, '#0f766e');
        grad.addColorStop(1, '#090d16');
        ctx.fillStyle = grad;
        ctx.fillRect(0, contentTop, width, contentHeight);

        // Cyberpunk / cinematic visual accents
        ctx.fillStyle = 'rgba(236, 72, 153, 0.35)';
        ctx.beginPath();
        ctx.arc(width * 0.72, contentTop + contentHeight * 0.4, 220, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(6, 182, 212, 0.45)';
        ctx.beginPath();
        ctx.arc(width * 0.35, contentTop + contentHeight * 0.6, 280, 0, Math.PI * 2);
        ctx.fill();

        // Neon horizon line
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(0, contentTop + contentHeight * 0.7);
        ctx.lineTo(width, contentTop + contentHeight * 0.7);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Label on video
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Outfit, sans-serif';
        ctx.fillText('CINEMATIC 2.39:1 LETTERBOX DEMO', 80, contentTop + 120);
        ctx.font = '22px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Barras pretas superior e inferior detectadas automaticamente (138px cada)', 80, contentTop + 165);
      } else {
        // Pillarbox (bars left & right)
        const contentLeft = 240;
        const contentWidth = 1440;

        const grad = ctx.createLinearGradient(contentLeft, 0, contentLeft + contentWidth, height);
        grad.addColorStop(0, '#1c1917');
        grad.addColorStop(0.5, '#431407');
        grad.addColorStop(1, '#18181b');
        ctx.fillStyle = grad;
        ctx.fillRect(contentLeft, 0, contentWidth, height);

        // Classic retro circles
        ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
        ctx.beginPath();
        ctx.arc(contentLeft + contentWidth * 0.5, height * 0.45, 260, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Outfit, sans-serif';
        ctx.fillText('VINTAGE 4:3 PILLARBOX DEMO', contentLeft + 60, 140);
        ctx.font = '22px Inter, sans-serif';
        ctx.fillStyle = '#d4d4d8';
        ctx.fillText('Barras pretas laterais (240px cada lado) - Corte para 1440x1080', contentLeft + 60, 185);
      }
    }
  }, [frameDimensions, customVideoSrc, selectedDemo]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle video file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomVideoSrc(url);
      setVideoFile(file);
      setVideoPath(`/uploads/${file.name}`);
      showToast(`Vídeo carregado: ${file.name}`, 'success');
    }
  };

  const onLoadedMetadata = () => {
    if (videoRef.current) {
      const w = videoRef.current.videoWidth || 1920;
      const h = videoRef.current.videoHeight || 1080;
      setFrameDimensions({ width: w, height: h });
      setCropBox({ x: 0, y: 0, width: w, height: h });
      setTimeout(drawCanvas, 100);
    }
  };

  // Smart Black Bar Detection
  const handleAutoDetect = () => {
    setIsDetecting(true);
    showToast('Analisando luminância de quadros para detecção de bordas...', 'info');

    setTimeout(() => {
      if (customVideoSrc && canvasRef.current) {
        // In-browser pixel luminance edge detection
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const w = canvas.width;
        const h = canvas.height;

        let top = 0;
        let bottom = h - 1;
        let left = 0;
        let right = w - 1;

        const isRowBlack = (row) => {
          for (let col = 0; col < w; col += 8) {
            const idx = (row * w + col) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            // Luminance threshold
            if (r > 20 || g > 20 || b > 20) return false;
          }
          return true;
        };

        const isColBlack = (col) => {
          for (let row = 0; row < h; row += 8) {
            const idx = (row * w + col) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (r > 20 || g > 20 || b > 20) return false;
          }
          return true;
        };

        while (top < h / 2 && isRowBlack(top)) top++;
        while (bottom > h / 2 && isRowBlack(bottom)) bottom--;
        while (left < w / 2 && isColBlack(left)) left++;
        while (right > w / 2 && isColBlack(right)) right--;

        const detectedWidth = Math.max(100, right - left + 1);
        const detectedHeight = Math.max(100, bottom - top + 1);

        setCropBox({
          x: left,
          y: top,
          width: detectedWidth,
          height: detectedHeight
        });
      } else {
        // Demo scenario auto-detect
        if (selectedDemo === 'letterbox') {
          setCropBox({ x: 0, y: 138, width: 1920, height: 804 });
          setSelectedPreset('2.39:1');
        } else {
          setCropBox({ x: 240, y: 0, width: 1440, height: 1080 });
          setSelectedPreset('4:3');
        }
      }
      setIsDetecting(false);
      showToast('Barras pretas detectadas com precisão!', 'success');
    }, 600);
  };

  // Change preset
  const handleApplyPreset = (preset) => {
    setSelectedPreset(preset.value);
    if (!preset.ratio) return;

    const { width: fullW, height: fullH } = frameDimensions;
    const targetRatio = preset.ratio;
    const currentRatio = fullW / fullH;

    let newW = fullW;
    let newH = fullH;
    let newX = 0;
    let newY = 0;

    if (currentRatio > targetRatio) {
      // Pillarbox needed (shrink width)
      newW = Math.round(fullH * targetRatio);
      newX = Math.round((fullW - newW) / 2);
    } else {
      // Letterbox needed (shrink height)
      newH = Math.round(fullW / targetRatio);
      newY = Math.round((fullH - newH) / 2);
    }

    // Ensure even dimensions for FFmpeg
    newW = Math.floor(newW / 2) * 2;
    newH = Math.floor(newH / 2) * 2;

    setCropBox({
      x: newX,
      y: newY,
      width: newW,
      height: newH
    });
  };

  // Switch demo scenario
  const handleSelectDemo = (scenarioId) => {
    setSelectedDemo(scenarioId);
    setCustomVideoSrc(null);
    setVideoFile(null);
    const scen = DEMO_SCENARIOS.find(s => s.id === scenarioId);
    if (scen) {
      setFrameDimensions({ width: scen.width, height: scen.height });
      setCropBox(scen.cropDefault);
      setSelectedPreset(scenarioId === 'letterbox' ? '2.39:1' : '4:3');
      setVideoPath(scenarioId === 'letterbox' ? '/media/movies/Blade_Runner_2049_1080p.mkv' : '/media/shows/Evangelion_S01E01.mkv');
    }
  };

  // Calculations for stats
  const originalPixels = frameDimensions.width * frameDimensions.height;
  const croppedPixels = cropBox.width * cropBox.height;
  const pixelsSavedPercent = Math.max(0, ((1 - croppedPixels / originalPixels) * 100)).toFixed(1);
  const currentRatio = (cropBox.width / cropBox.height).toFixed(2);

  // Generate FFmpeg command string
  const ffmpegCommand = `ffmpeg -i "${videoPath}" -vf "crop=${cropBox.width}:${cropBox.height}:${cropBox.x}:${cropBox.y}" -c:v libx264 -crf 19 -preset slow -c:a copy output_cropped.mkv`;
  const starCliCommand = `node src/main.js crop "${videoPath}" "in-place" --crop "${cropBox.width}:${cropBox.height}:${cropBox.x}:${cropBox.y}"`;

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(key);
    showToast('Comando copiado com sucesso!', 'success');
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const handleSendToQueue = () => {
    onAddToQueue(videoPath);
    showToast(`Adicionado à fila: ${videoPath}`, 'success');
  };

  const downloadSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create an offscreen canvas with just the cropped area
    const offCanvas = document.createElement('canvas');
    offCanvas.width = cropBox.width;
    offCanvas.height = cropBox.height;
    const offCtx = offCanvas.getContext('2d');

    offCtx.drawImage(
      canvas,
      cropBox.x, cropBox.y, cropBox.width, cropBox.height,
      0, 0, cropBox.width, cropBox.height
    );

    const link = document.createElement('a');
    link.download = `crop_${cropBox.width}x${cropBox.height}.png`;
    link.href = offCanvas.toDataURL('image/png');
    link.click();
    showToast('Snapshot cortado baixado!', 'success');
  };

  // Convert crop box to percentage for responsive overlay rendering
  const cropLeftPct = (cropBox.x / frameDimensions.width) * 100;
  const cropTopPct = (cropBox.y / frameDimensions.height) * 100;
  const cropWidthPct = (cropBox.width / frameDimensions.width) * 100;
  const cropHeightPct = (cropBox.height / frameDimensions.height) * 100;

  return (
    <div className="crop-studio-layout">
      {/* Top Banner & Scenario Select */}
      <section className="studio-topbar glass-panel">
        <div className="topbar-left">
          <div className="badge-tag">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Estúdio Interativo de Recorte</span>
          </div>
          <h1 className="studio-title">Preview Visual & Detecção Automática</h1>
          <p className="studio-desc">
            Visualize o vídeo em tempo real, detecte barras pretas de letterbox/pillarbox e ajuste os limites com precisão pixel a pixel.
          </p>
        </div>

        <div className="topbar-right">
          <div className="source-picker">
            <span className="source-label">Cenários de Demonstração:</span>
            <div className="source-buttons">
              {DEMO_SCENARIOS.map((scen) => (
                <button
                  key={scen.id}
                  className={`btn btn-sm ${selectedDemo === scen.id && !customVideoSrc ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleSelectDemo(scen.id)}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>{scen.name.split(' (')[0]}</span>
                </button>
              ))}

              <label className="btn btn-sm btn-cyan file-upload-btn">
                <Upload className="w-3.5 h-3.5" />
                <span>Carregar Meu Vídeo</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Main Studio Area: Canvas + Video Player + Live Overlay */}
      <div className="studio-grid">
        <div className="studio-viewer glass-panel">
          <div className="viewer-header">
            <div className="viewer-meta">
              <span className="meta-badge">Resolução Original: {frameDimensions.width} × {frameDimensions.height}</span>
              <span className="meta-badge highlight">Área de Corte: {cropBox.width} × {cropBox.height} ({currentRatio}:1)</span>
              <span className="meta-badge saved">Barras Removidas: {pixelsSavedPercent}%</span>
            </div>

            <div className="viewer-actions">
              <button
                id="btn-auto-detect"
                className={`btn btn-emerald btn-sm ${isDetecting ? 'animate-pulse' : ''}`}
                onClick={handleAutoDetect}
                disabled={isDetecting}
              >
                <Sparkles className={`w-4 h-4 ${isDetecting ? 'animate-spin' : ''}`} />
                <span>{isDetecting ? 'Detectando...' : 'Auto-Detectar Barras'}</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={downloadSnapshot}
                title="Baixar frame cortado como PNG"
              >
                <Download className="w-4 h-4" />
                <span>Snapshot</span>
              </button>
            </div>
          </div>

          {/* Interactive Screen Container */}
          <div className="screen-container" ref={containerRef}>
            {customVideoSrc && (
              <video
                ref={videoRef}
                src={customVideoSrc}
                style={{ display: 'none' }}
                onLoadedMetadata={onLoadedMetadata}
                onTimeUpdate={drawCanvas}
                loop
                muted
              />
            )}

            <canvas
              ref={canvasRef}
              className="screen-canvas"
              width={frameDimensions.width}
              height={frameDimensions.height}
            />

            {/* Dark Mask Overlays for Cropped Regions */}
            {/* Top Mask */}
            <div
              className="crop-mask crop-mask-top"
              style={{ top: 0, left: 0, right: 0, height: `${cropTopPct}%` }}
            >
              {cropTopPct > 3 && <span className="mask-label">Barra Preta Superior ({cropBox.y}px)</span>}
            </div>

            {/* Bottom Mask */}
            <div
              className="crop-mask crop-mask-bottom"
              style={{
                top: `${cropTopPct + cropHeightPct}%`,
                left: 0,
                right: 0,
                bottom: 0
              }}
            >
              {(100 - cropTopPct - cropHeightPct) > 3 && (
                <span className="mask-label">
                  Barra Preta Inferior ({frameDimensions.height - (cropBox.y + cropBox.height)}px)
                </span>
              )}
            </div>

            {/* Left Mask */}
            <div
              className="crop-mask crop-mask-left"
              style={{
                top: `${cropTopPct}%`,
                left: 0,
                width: `${cropLeftPct}%`,
                height: `${cropHeightPct}%`
              }}
            >
              {cropLeftPct > 3 && <span className="mask-label">{cropBox.x}px</span>}
            </div>

            {/* Right Mask */}
            <div
              className="crop-mask crop-mask-right"
              style={{
                top: `${cropTopPct}%`,
                left: `${cropLeftPct + cropWidthPct}%`,
                right: 0,
                height: `${cropHeightPct}%`
              }}
            >
              {(100 - cropLeftPct - cropWidthPct) > 3 && (
                <span className="mask-label">
                  {frameDimensions.width - (cropBox.x + cropBox.width)}px
                </span>
              )}
            </div>

            {/* Visual Active Crop Box with Grid Lines */}
            <div
              className="active-crop-box"
              style={{
                left: `${cropLeftPct}%`,
                top: `${cropTopPct}%`,
                width: `${cropWidthPct}%`,
                height: `${cropHeightPct}%`
              }}
            >
              {/* Rule of Thirds Grid */}
              <div className="grid-line grid-v-1"></div>
              <div className="grid-line grid-v-2"></div>
              <div className="grid-line grid-h-1"></div>
              <div className="grid-line grid-h-2"></div>

              {/* Corner Handles */}
              <span className="crop-handle handle-nw"></span>
              <span className="crop-handle handle-ne"></span>
              <span className="crop-handle handle-sw"></span>
              <span className="crop-handle handle-se"></span>

              {/* HUD Badge in Center/Corner */}
              <div className="crop-box-hud">
                <span className="hud-res">{cropBox.width} × {cropBox.height}</span>
                <span className="hud-offset">X:{cropBox.x} Y:{cropBox.y}</span>
              </div>
            </div>
          </div>

          {/* Video Playback Controls if Custom Video */}
          {customVideoSrc && (
            <div className="player-controls">
              <button
                className="btn btn-secondary btn-icon"
                onClick={() => {
                  if (videoRef.current) {
                    if (isPlaying) {
                      videoRef.current.pause();
                    } else {
                      videoRef.current.play();
                    }
                    setIsPlaying(!isPlaying);
                  }
                }}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <span className="player-hint">Reproduzindo vídeo do usuário em tempo real</span>
            </div>
          )}

          {/* Aspect Ratio Preset Selector */}
          <div className="presets-bar">
            <span className="presets-label">
              <Layers className="w-4 h-4" />
              <span>Proporções Pré-definidas:</span>
            </span>
            <div className="preset-buttons">
              {ASPECT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  className={`btn-preset ${selectedPreset === preset.value ? 'active' : ''}`}
                  onClick={() => handleApplyPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar: Fine Tuning Coordinates & Quick Execution */}
        <aside className="studio-sidebar">
          {/* Fine Tuning Panel */}
          <div className="glass-panel sidebar-card">
            <div className="card-header">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <h2 className="card-title">Ajuste Fino de Dimensões</h2>
            </div>

            <div className="controls-grid">
              <div className="control-group">
                <label className="control-label">Largura de Corte (Width)</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    className="glass-input"
                    value={cropBox.width}
                    max={frameDimensions.width}
                    min={100}
                    step={2}
                    onChange={(e) => setCropBox({ ...cropBox, width: parseInt(e.target.value) || 100 })}
                  />
                  <span className="unit">px</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max={frameDimensions.width}
                  step="2"
                  value={cropBox.width}
                  onChange={(e) => setCropBox({ ...cropBox, width: parseInt(e.target.value) })}
                />
              </div>

              <div className="control-group">
                <label className="control-label">Altura de Corte (Height)</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    className="glass-input"
                    value={cropBox.height}
                    max={frameDimensions.height}
                    min={100}
                    step={2}
                    onChange={(e) => setCropBox({ ...cropBox, height: parseInt(e.target.value) || 100 })}
                  />
                  <span className="unit">px</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max={frameDimensions.height}
                  step="2"
                  value={cropBox.height}
                  onChange={(e) => setCropBox({ ...cropBox, height: parseInt(e.target.value) })}
                />
              </div>

              <div className="control-group">
                <label className="control-label">Deslocamento Horizontal (X Offset)</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    className="glass-input"
                    value={cropBox.x}
                    min={0}
                    max={frameDimensions.width - cropBox.width}
                    step={2}
                    onChange={(e) => setCropBox({ ...cropBox, x: parseInt(e.target.value) || 0 })}
                  />
                  <span className="unit">px</span>
                </div>
              </div>

              <div className="control-group">
                <label className="control-label">Deslocamento Vertical (Y Offset)</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    className="glass-input"
                    value={cropBox.y}
                    min={0}
                    max={frameDimensions.height - cropBox.height}
                    step={2}
                    onChange={(e) => setCropBox({ ...cropBox, y: parseInt(e.target.value) || 0 })}
                  />
                  <span className="unit">px</span>
                </div>
              </div>
            </div>

            <div className="quick-reset-row">
              <button
                className="btn btn-secondary btn-sm w-full"
                onClick={() => setCropBox({ x: 0, y: 0, width: frameDimensions.width, height: frameDimensions.height })}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Resetar para Tela Cheia</span>
              </button>
            </div>
          </div>

          {/* Target File & Server Enqueue */}
          <div className="glass-panel sidebar-card">
            <div className="card-header">
              <Send className="w-4 h-4 text-emerald-400" />
              <h2 className="card-title">Enfileirar no Servidor</h2>
            </div>

            <div className="file-target-group">
              <label className="control-label">Caminho do Arquivo no Servidor:</label>
              <input
                type="text"
                className="glass-input w-full font-mono"
                value={videoPath}
                onChange={(e) => setVideoPath(e.target.value)}
                placeholder="/caminho/do/video.mkv"
              />
              <p className="field-hint">
                Este caminho será enviado para o servidor Star processar em segundo plano.
              </p>

              <button
                id="btn-send-to-queue"
                className="btn btn-primary w-full mt-3"
                onClick={handleSendToQueue}
              >
                <Send className="w-4 h-4" />
                <span>Adicionar à Fila do Star</span>
              </button>
            </div>
          </div>

          {/* CLI & FFmpeg Generated Command */}
          <div className="glass-panel sidebar-card">
            <div className="card-header">
              <Copy className="w-4 h-4 text-cyan-400" />
              <h2 className="card-title">Comandos Gerados</h2>
            </div>

            <div className="command-box-group">
              <div className="command-header">
                <span className="command-title">Comando Star CLI</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyToClipboard(starCliCommand, 'star')}
                >
                  {copiedCmd === 'star' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCmd === 'star' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="code-block text-xs">{starCliCommand}</pre>

              <div className="command-header mt-3">
                <span className="command-title">Comando Direto FFmpeg</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyToClipboard(ffmpegCommand, 'ffmpeg')}
                >
                  {copiedCmd === 'ffmpeg' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCmd === 'ffmpeg' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="code-block text-xs">{ffmpegCommand}</pre>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
