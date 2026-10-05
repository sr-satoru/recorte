import React, { useState } from 'react';
import {
  Sliders, Layers, Send, RefreshCw, Settings2
} from 'lucide-react';

const ASPECT_PRESETS = [
  { label: 'Auto (Detectar)', value: 'auto', ratio: null },
  { label: '2.39:1 Cinemascope', value: '2.39:1', ratio: 2.39 },
  { label: '2.35:1 Anamórfico', value: '2.35:1', ratio: 2.35 },
  { label: '1.85:1 Cinema Flat', value: '1.85:1', ratio: 1.85 },
  { label: '16:9 HDTV', value: '16:9', ratio: 16 / 9 },
  { label: '4:3 Clássico SD', value: '4:3', ratio: 4 / 3 },
  { label: 'Livre / Personalizado', value: 'custom', ratio: null },
];

export default function CropConfigPanel({
  cropBox,
  setCropBox,
  frameDimensions,
  selectedPreset,
  setSelectedPreset,
  videoPath,
  setVideoPath,
  onAddToQueue,
  showToast
}) {
  // FFmpeg settings
  const [crf, setCrf] = useState(19);
  const [preset, setPreset] = useState('slow');
  const [inPlace, setInPlace] = useState(true);
  const [useMetadata, setUseMetadata] = useState(false);

  // Change preset
  const handleApplyPreset = (presetObj) => {
    setSelectedPreset(presetObj.value);
    if (!presetObj.ratio) return;

    const { width: fullW, height: fullH } = frameDimensions;
    const targetRatio = presetObj.ratio;
    const currentRatio = fullW / fullH;

    let newW = fullW;
    let newH = fullH;
    let newX = 0;
    let newY = 0;

    if (currentRatio > targetRatio) {
      newW = Math.round(fullH * targetRatio);
      newX = Math.round((fullW - newW) / 2);
    } else {
      newH = Math.round(fullW / targetRatio);
      newY = Math.round((fullH - newH) / 2);
    }

    // Ensure even integers
    newW = Math.floor(newW / 2) * 2;
    newH = Math.floor(newH / 2) * 2;

    setCropBox({
      x: newX,
      y: newY,
      width: newW,
      height: newH
    });
  };

  return (
    <div className="panel-container glass-panel config-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title-group">
          <Sliders className="w-5 h-5 text-indigo-400" />
          <h2 className="panel-title">CONFIGURAÇÃO DOS RECORTES & PARÂMETROS</h2>
        </div>

        <div className="panel-header-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onAddToQueue(videoPath)}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Adicionar Corte à Fila</span>
          </button>
        </div>
      </div>

      {/* Preset Buttons Bar */}
      <div className="presets-full-bar">
        <div className="presets-tag">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>Proporções:</span>
        </div>
        <div className="preset-buttons-list">
          {ASPECT_PRESETS.map((p) => (
            <button
              key={p.value}
              className={`btn-preset ${selectedPreset === p.value ? 'active' : ''}`}
              onClick={() => handleApplyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2 Clean Balanced Columns */}
      <div className="config-grid">
        {/* Col 1: Fine-Tuning Sliders */}
        <div className="config-col glass-card-nested">
          <div className="config-col-title">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Dimensões do Corte (Pixels)</span>
          </div>

          <div className="sliders-container">
            <div className="slider-item">
              <div className="slider-header">
                <label>Largura (Width):</label>
                <span className="slider-val">{cropBox.width}px</span>
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

            <div className="slider-item">
              <div className="slider-header">
                <label>Altura (Height):</label>
                <span className="slider-val">{cropBox.height}px</span>
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

            <div className="slider-item">
              <div className="slider-header">
                <label>Deslocamento X (Left):</label>
                <span className="slider-val">{cropBox.x}px</span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.max(0, frameDimensions.width - cropBox.width)}
                step="2"
                value={cropBox.x}
                onChange={(e) => setCropBox({ ...cropBox, x: parseInt(e.target.value) })}
              />
            </div>

            <div className="slider-item">
              <div className="slider-header">
                <label>Deslocamento Y (Top):</label>
                <span className="slider-val">{cropBox.y}px</span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.max(0, frameDimensions.height - cropBox.height)}
                step="2"
                value={cropBox.y}
                onChange={(e) => setCropBox({ ...cropBox, y: parseInt(e.target.value) })}
              />
            </div>

            <button
              className="btn btn-secondary btn-sm w-full mt-2"
              onClick={() => setCropBox({ x: 0, y: 0, width: frameDimensions.width, height: frameDimensions.height })}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Resetar Dimensões para Tela Cheia</span>
            </button>
          </div>
        </div>

        {/* Col 2: FFmpeg Options & Output Target */}
        <div className="config-col glass-card-nested">
          <div className="config-col-title">
            <Settings2 className="w-4 h-4 text-cyan-400" />
            <span>Opções do Encodificador FFmpeg</span>
          </div>

          <div className="ffmpeg-options-form">
            <div className="form-group">
              <div className="slider-header">
                <label>Qualidade CRF: <strong>{crf}</strong></label>
                <span className="text-dim text-xs">(18 alta qualidade, 28 menor arquivo)</span>
              </div>
              <input
                type="range"
                min="16"
                max="28"
                value={crf}
                onChange={(e) => setCrf(parseInt(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="text-xs text-muted">Preset de Velocidade do Encodificador:</label>
              <select
                className="glass-input w-full text-xs"
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
              >
                <option value="ultrafast">ultrafast (Muito rápido, menor taxa de compressão)</option>
                <option value="fast">fast</option>
                <option value="medium">medium (Equilibrado)</option>
                <option value="slow">slow (Recomendado - Excelente qualidade)</option>
                <option value="veryslow">veryslow (Máxima compressão)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="text-xs text-muted">Arquivo em Edição:</label>
              <input
                type="text"
                className="glass-input w-full font-mono text-xs"
                value={videoPath}
                onChange={(e) => setVideoPath(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="checkbox-row text-xs">
                <input
                  type="checkbox"
                  checked={inPlace}
                  onChange={(e) => setInPlace(e.target.checked)}
                />
                <div>
                  <strong>Substituir arquivo original diretamente (in-place)</strong>
                  <p className="text-dim text-xs mt-0.5">O Star salva a versão cortada e substitui o arquivo original automaticamente.</p>
                </div>
              </label>
            </div>

            <div className="form-group">
              <label className="checkbox-row text-xs">
                <input
                  type="checkbox"
                  checked={useMetadata}
                  onChange={(e) => setUseMetadata(e.target.checked)}
                />
                <div>
                  <strong>Modo Metadata (corte instantâneo sem re-codificar)</strong>
                  <p className="text-dim text-xs mt-0.5">Altera apenas os cabeçalhos de exibição h264/hevc sem reprocessar o vídeo.</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
