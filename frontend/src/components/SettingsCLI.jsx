import React, { useState } from 'react';
import {
  Terminal, Sliders, HardDrive, Clock, ShieldCheck,
  Copy, Check, Cpu, Zap, FolderTree
} from 'lucide-react';

export default function SettingsCLI({ showToast }) {
  const [copiedKey, setCopiedKey] = useState(null);

  // FFmpeg Options Builder
  const [crf, setCrf] = useState(19);
  const [preset, setPreset] = useState('slow');
  const [useMetadata, setUseMetadata] = useState(false);
  const [sourcePath, setSourcePath] = useState('/media/movies/Interestelar.mkv');
  const [inPlace, setInPlace] = useState(true);
  const [outputPath, setOutputPath] = useState('/media/movies/Interestelar_cropped.mkv');

  // Server Scheduler Window
  const [cronExp, setCronExp] = useState('0 2 * * *');
  const [durationHours, setDurationHours] = useState('6');
  const [pathMapping, setPathMapping] = useState('/downloads:/media/downloads');

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast('Comando copiado!', 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Build commands
  const ffmpegOptionsString = `-c:v libx264 -crf ${crf} -preset ${preset} -c:a copy`;
  const cropCommand = `node src/main.js crop "${sourcePath}" "${inPlace ? 'in-place' : outputPath}" --ffmpeg-options "${ffmpegOptionsString}"${useMetadata ? ' --metadata' : ''}`;
  const detectCommand = `node src/main.js detect "${sourcePath}" --json`;
  const serveCommand = `node src/main.js serve -p "${pathMapping}" -w "${cronExp}" ${durationHours}`;
  const dockerCommand = `docker run -d \\
  --name star \\
  -p 4200:4200 \\
  -v /seu/caminho/config:/config \\
  -v /seu/caminho/midia:/media \\
  drkno/star:latest`;

  return (
    <div className="settings-cli-layout">
      {/* Top Banner */}
      <section className="settings-topbar glass-panel">
        <div className="topbar-left">
          <div className="badge-tag">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>CLI & Parâmetros Avançados</span>
          </div>
          <h1 className="settings-title">Configurações do FFmpeg & Linha de Comando</h1>
          <p className="settings-desc">
            Personalize a qualidade de renderização do FFmpeg, horários de execução (janelas de processamento para não sobrecarregar a CPU) e mapeamento de volumes.
          </p>
        </div>
      </section>

      {/* Two Columns Grid */}
      <div className="settings-grid">
        {/* Left Column: Interactive Command Builder */}
        <div className="glass-panel settings-card">
          <div className="card-header">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h2 className="card-title">Gerador de Parâmetros do FFmpeg</h2>
          </div>

          <div className="builder-form">
            <div className="form-group">
              <label className="control-label flex justify-between">
                <span>Qualidade CRF: <strong>{crf}</strong></span>
                <span className="text-dim text-xs">(18 = Alta Qualidade, 28 = Arquivo Menor)</span>
              </label>
              <input
                type="range"
                min="14"
                max="30"
                value={crf}
                onChange={(e) => setCrf(parseInt(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="control-label">Preset de Velocidade do Encodificador:</label>
              <select
                className="glass-input w-full"
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
              >
                <option value="ultrafast">ultrafast (Muito rápido, arquivo maior)</option>
                <option value="superfast">superfast</option>
                <option value="veryfast">veryfast</option>
                <option value="faster">faster</option>
                <option value="fast">fast</option>
                <option value="medium">medium (Equilibrado)</option>
                <option value="slow">slow (Recomendado - Excelente compressão)</option>
                <option value="slower">slower</option>
                <option value="veryslow">veryslow (Máxima qualidade)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="control-label">Arquivo de Origem:</label>
              <input
                type="text"
                className="glass-input w-full font-mono text-xs"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={inPlace}
                  onChange={(e) => setInPlace(e.target.checked)}
                />
                <span>Substituir o arquivo original diretamente (in-place)</span>
              </label>
            </div>

            {!inPlace && (
              <div className="form-group">
                <label className="control-label">Arquivo de Destino:</label>
                <input
                  type="text"
                  className="glass-input w-full font-mono text-xs"
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                />
              </div>
            )}

            <div className="form-group">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={useMetadata}
                  onChange={(e) => setUseMetadata(e.target.checked)}
                />
                <div>
                  <span>Modo Metadata (sem re-codificar áudio/vídeo)</span>
                  <p className="text-dim text-xs">Apenas altera os cabeçalhos de exibição h264/hevc. Extremamente rápido, mas depende do suporte do player.</p>
                </div>
              </label>
            </div>

            <div className="command-output-box mt-4">
              <div className="command-header">
                <span className="command-title font-mono text-xs">Comando de Corte Gerado</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyText(cropCommand, 'crop')}
                >
                  {copiedKey === 'crop' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'crop' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="code-block text-xs mt-2">{cropCommand}</pre>
            </div>
          </div>
        </div>

        {/* Right Column: Server Options & Docker */}
        <div className="settings-column-right">
          {/* Scheduling Window */}
          <div className="glass-panel settings-card">
            <div className="card-header">
              <Clock className="w-4 h-4 text-amber-400" />
              <h2 className="card-title">Janela de Processamento Noturno</h2>
            </div>
            <p className="text-dim text-xs mb-3">
              Permite que o Star acumule tarefas durante o dia e processe vídeos somente de madrugada para não aquecer o servidor ou competir com o Plex/Jellyfin.
            </p>

            <div className="form-row">
              <div className="form-group flex-1">
                <label className="control-label">Expressão Cron de Início:</label>
                <input
                  type="text"
                  className="glass-input w-full font-mono text-xs"
                  value={cronExp}
                  onChange={(e) => setCronExp(e.target.value)}
                  placeholder="0 2 * * *"
                />
                <span className="field-hint">Ex: 0 2 * * * (todo dia às 02:00)</span>
              </div>

              <div className="form-group" style={{ width: '120px' }}>
                <label className="control-label">Duração (h):</label>
                <input
                  type="number"
                  className="glass-input w-full font-mono text-xs"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  min="1"
                  max="24"
                />
                <span className="field-hint">Horas ativas</span>
              </div>
            </div>

            <div className="form-group">
              <label className="control-label">Mapeamento de Pastas (Path Mappings):</label>
              <input
                type="text"
                className="glass-input w-full font-mono text-xs"
                value={pathMapping}
                onChange={(e) => setPathMapping(e.target.value)}
              />
              <span className="field-hint">Formato: pasta_sonarr:pasta_star</span>
            </div>

            <div className="command-output-box mt-3">
              <div className="command-header">
                <span className="command-title font-mono text-xs">Comando do Servidor com Janela</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyText(serveCommand, 'serve')}
                >
                  {copiedKey === 'serve' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'serve' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="code-block text-xs mt-2">{serveCommand}</pre>
            </div>
          </div>

          {/* Docker Run Card */}
          <div className="glass-panel settings-card">
            <div className="card-header">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <h2 className="card-title">Execução via Docker Container</h2>
            </div>
            <p className="text-dim text-xs mb-2">
              Você já baixou a imagem <code>drkno/star:latest</code>. Use o comando abaixo para iniciar o container:
            </p>
            <div className="command-output-box">
              <div className="command-header">
                <span className="command-title font-mono text-xs">Docker Run</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyText(dockerCommand, 'docker')}
                >
                  {copiedKey === 'docker' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'docker' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="code-block text-xs mt-2">{dockerCommand}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
