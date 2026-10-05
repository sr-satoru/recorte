import React, { useRef, useEffect, useCallback, useState } from 'react';
import { 
  Sparkles, Play, Pause, Download, 
  Eye, RefreshCw, FileVideo, Film, Check 
} from 'lucide-react';

export default function PreviewPanel({
  selectedVideo,
  cropBox,
  setCropBox,
  frameDimensions,
  setFrameDimensions,
  selectedPreset,
  setSelectedPreset,
  showToast
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const videoTitle = selectedVideo?.name || selectedVideo?.path?.split('/').pop() || 'Vídeo';

  // Draw frame to canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = frameDimensions;

    canvas.width = width;
    canvas.height = height;

    if (selectedVideo?.blobUrl && videoRef.current && videoRef.current.readyState >= 2) {
      // Draw actual user video frame
      ctx.drawImage(videoRef.current, 0, 0, width, height);
    } else {
      // Draw stylized cinematic frame with video info
      ctx.fillStyle = '#030509';
      ctx.fillRect(0, 0, width, height);

      // Determine simulated letterbox/pillarbox based on file name or current crop
      const isPillar = videoTitle.toLowerCase().includes('4:3') || videoTitle.toLowerCase().includes('bebop');
      
      if (!isPillar) {
        // Letterbox scene
        const contentTop = cropBox.y || 138;
        const contentHeight = cropBox.height || 804;

        const grad = ctx.createLinearGradient(0, contentTop, width, contentTop + contentHeight);
        grad.addColorStop(0, '#091026');
        grad.addColorStop(0.3, '#17203b');
        grad.addColorStop(0.7, '#243b55');
        grad.addColorStop(1, '#091026');
        ctx.fillStyle = grad;
        ctx.fillRect(0, contentTop, width, contentHeight);

        // Cyberpunk atmospheric lighting
        ctx.fillStyle = 'rgba(236, 72, 153, 0.45)';
        ctx.beginPath();
        ctx.arc(width * 0.7, contentTop + contentHeight * 0.42, 240, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(6, 182, 212, 0.5)';
        ctx.beginPath();
        ctx.arc(width * 0.32, contentTop + contentHeight * 0.58, 280, 0, Math.PI * 2);
        ctx.fill();

        // Neon horizon line
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(0, contentTop + contentHeight * 0.72);
        ctx.lineTo(width, contentTop + contentHeight * 0.72);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Typography
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Outfit, sans-serif';
        ctx.fillText(videoTitle.slice(0, 36), 80, contentTop + 110);
        ctx.font = '19px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`Prévia ativa selecionada na fila • Resolução: ${width}×${height}`, 80, contentTop + 150);
      } else {
        // Pillarbox scene
        const contentLeft = cropBox.x || 240;
        const contentWidth = cropBox.width || 1440;

        const grad = ctx.createLinearGradient(contentLeft, 0, contentLeft + contentWidth, height);
        grad.addColorStop(0, '#1c1917');
        grad.addColorStop(0.5, '#451a03');
        grad.addColorStop(1, '#18181b');
        ctx.fillStyle = grad;
        ctx.fillRect(contentLeft, 0, contentWidth, height);

        ctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.beginPath();
        ctx.arc(contentLeft + contentWidth * 0.5, height * 0.45, 260, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Outfit, sans-serif';
        ctx.fillText(videoTitle.slice(0, 36), contentLeft + 60, 140);
        ctx.font = '19px Inter, sans-serif';
        ctx.fillStyle = '#d4d4d8';
        ctx.fillText('Formato 4:3 (Pillarbox) • Barras laterais detectadas', contentLeft + 60, 180);
      }
    }
  }, [frameDimensions, selectedVideo, cropBox, videoTitle]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // When selected video changes, handle metadata or auto-dimensions
  useEffect(() => {
    if (selectedVideo?.blobUrl && videoRef.current) {
      videoRef.current.src = selectedVideo.blobUrl;
      videoRef.current.load();
    } else {
      // Check if it's 4:3 or 2.39:1
      const isPillar = videoTitle.toLowerCase().includes('4:3') || videoTitle.toLowerCase().includes('bebop');
      if (isPillar) {
        setCropBox({ x: 240, y: 0, width: 1440, height: 1080 });
        setSelectedPreset('4:3');
      } else {
        setCropBox({ x: 0, y: 138, width: 1920, height: 804 });
        setSelectedPreset('2.39:1');
      }
    }
  }, [selectedVideo, videoTitle, setCropBox, setSelectedPreset]);

  const onLoadedMetadata = () => {
    if (videoRef.current) {
      const w = videoRef.current.videoWidth || 1920;
      const h = videoRef.current.videoHeight || 1080;
      setFrameDimensions({ width: w, height: h });
      setCropBox({ x: 0, y: 0, width: w, height: h });
      setTimeout(drawCanvas, 120);
    }
  };

  // Auto-detect black bars
  const handleAutoDetect = () => {
    setIsDetecting(true);
    showToast(`Detectando barras pretas em: ${videoTitle}...`, 'info');

    setTimeout(() => {
      if (selectedVideo?.blobUrl && canvasRef.current) {
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
            if (data[idx] > 20 || data[idx + 1] > 20 || data[idx + 2] > 20) return false;
          }
          return true;
        };

        const isColBlack = (col) => {
          for (let row = 0; row < h; row += 8) {
            const idx = (row * w + col) * 4;
            if (data[idx] > 20 || data[idx + 1] > 20 || data[idx + 2] > 20) return false;
          }
          return true;
        };

        while (top < h / 2 && isRowBlack(top)) top++;
        while (bottom > h / 2 && isRowBlack(bottom)) bottom--;
        while (left < w / 2 && isColBlack(left)) left++;
        while (right > w / 2 && isColBlack(right)) right--;

        setCropBox({
          x: left,
          y: top,
          width: Math.max(100, right - left + 1),
          height: Math.max(100, bottom - top + 1)
        });
      } else {
        const isPillar = videoTitle.toLowerCase().includes('4:3') || videoTitle.toLowerCase().includes('bebop');
        if (isPillar) {
          setCropBox({ x: 240, y: 0, width: 1440, height: 1080 });
          setSelectedPreset('4:3');
        } else {
          setCropBox({ x: 0, y: 138, width: 1920, height: 804 });
          setSelectedPreset('2.39:1');
        }
      }
      setIsDetecting(false);
      showToast('Detecção concluída com sucesso!', 'success');
    }, 500);
  };

  const downloadSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    showToast('Snapshot do corte baixado!', 'success');
  };

  const cropLeftPct = (cropBox.x / frameDimensions.width) * 100;
  const cropTopPct = (cropBox.y / frameDimensions.height) * 100;
  const cropWidthPct = (cropBox.width / frameDimensions.width) * 100;
  const cropHeightPct = (cropBox.height / frameDimensions.height) * 100;
  const currentRatio = (cropBox.width / cropBox.height).toFixed(2);
  const originalPixels = frameDimensions.width * frameDimensions.height;
  const croppedPixels = cropBox.width * cropBox.height;
  const pixelsSavedPercent = Math.max(0, ((1 - croppedPixels / originalPixels) * 100)).toFixed(1);

  return (
    <div className="panel-container glass-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title-group">
          <Eye className="w-5 h-5 text-indigo-400" />
          <h2 className="panel-title">PRÉVIAS DO VÍDEO</h2>
        </div>

        <div className="panel-header-actions">
          <button
            id="btn-auto-detect"
            className={`btn btn-emerald btn-sm ${isDetecting ? 'animate-pulse' : ''}`}
            onClick={handleAutoDetect}
            disabled={isDetecting}
          >
            <Sparkles className={`w-3.5 h-3.5 ${isDetecting ? 'animate-spin' : ''}`} />
            <span>{isDetecting ? 'Detectando...' : 'Auto-Detectar Barras'}</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={downloadSnapshot}
            title="Baixar frame cortado em PNG"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Snapshot</span>
          </button>
        </div>
      </div>

      {/* Active Selected Video Bar */}
      <div className="active-video-header-bar">
        <div className="active-video-name-group">
          <Film className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="active-video-name font-mono truncate" title={selectedVideo?.path}>
            {videoTitle}
          </span>
        </div>

        <div className="meta-pills">
          <span className="meta-pill">{frameDimensions.width}×{frameDimensions.height}</span>
          <span className="meta-pill highlight">{cropBox.width}×{cropBox.height} ({currentRatio}:1)</span>
          <span className="meta-pill saved">-{pixelsSavedPercent}%</span>
        </div>
      </div>

      {/* Screen Canvas & Overlays */}
      <div className="screen-container">
        {selectedVideo?.blobUrl && (
          <video
            ref={videoRef}
            src={selectedVideo.blobUrl}
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
        <div
          className="crop-mask crop-mask-top"
          style={{ top: 0, left: 0, right: 0, height: `${cropTopPct}%` }}
        >
          {cropTopPct > 3 && <span className="mask-label">Topo: {cropBox.y}px</span>}
        </div>

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
              Base: {frameDimensions.height - (cropBox.y + cropBox.height)}px
            </span>
          )}
        </div>

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

        {/* Active Crop Box with Grid Lines */}
        <div
          className="active-crop-box"
          style={{
            left: `${cropLeftPct}%`,
            top: `${cropTopPct}%`,
            width: `${cropWidthPct}%`,
            height: `${cropHeightPct}%`
          }}
        >
          <div className="grid-line grid-v-1"></div>
          <div className="grid-line grid-v-2"></div>
          <div className="grid-line grid-h-1"></div>
          <div className="grid-line grid-h-2"></div>

          <span className="crop-handle handle-nw"></span>
          <span className="crop-handle handle-ne"></span>
          <span className="crop-handle handle-sw"></span>
          <span className="crop-handle handle-se"></span>

          <div className="crop-box-hud">
            <span className="hud-res">{cropBox.width} × {cropBox.height}</span>
            <span className="hud-offset">X:{cropBox.x} Y:{cropBox.y}</span>
          </div>
        </div>
      </div>

      {selectedVideo?.blobUrl && (
        <div className="player-controls">
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => {
              if (videoRef.current) {
                if (isPlaying) videoRef.current.pause();
                else videoRef.current.play();
                setIsPlaying(!isPlaying);
              }
            }}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <span className="player-hint">Reproduzindo arquivo local carregado</span>
        </div>
      )}
    </div>
  );
}
