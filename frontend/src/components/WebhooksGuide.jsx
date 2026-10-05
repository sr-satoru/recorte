import React, { useState } from 'react';
import {
  Radio, Copy, Check, Send, AlertCircle, CheckCircle2,
  ExternalLink, Tv, Film, Terminal, Zap
} from 'lucide-react';

export default function WebhooksGuide({ showToast, backendOnline }) {
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [simService, setSimService] = useState('sonarr');
  const [simEventType, setSimEventType] = useState('Download');
  const [simSeries, setSimSeries] = useState('Stranger Things');
  const [simFolderPath, setSimFolderPath] = useState('/media/tv/Stranger Things');
  const [simRelativePath, setSimRelativePath] = useState('Season 04/Stranger Things - S04E01.mkv');

  const [simResult, setSimResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const sonarrUrl = 'http://localhost:4200/api/1/webhook/sonarr';
  const radarrUrl = 'http://localhost:4200/api/1/webhook/radarr';

  const handleCopy = (url, key) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(key);
    showToast('URL do webhook copiada!', 'success');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleSimulateWebhook = async () => {
    setIsSimulating(true);
    setSimResult(null);

    let payload = {};
    const url = simService === 'sonarr' ? '/api/1/webhook/sonarr' : '/api/1/webhook/radarr';

    if (simEventType === 'Test') {
      payload = {
        eventType: 'Test',
        [simService === 'sonarr' ? 'episodes' : 'movies']: [{ id: 1 }]
      };
    } else if (simEventType === 'Download') {
      if (simService === 'sonarr') {
        payload = {
          eventType: 'Download',
          series: { path: simFolderPath },
          episodeFile: { relativePath: simRelativePath }
        };
      } else {
        payload = {
          eventType: 'Download',
          movie: { folderPath: simFolderPath },
          movieFile: { relativePath: simRelativePath }
        };
      }
    } else if (simEventType.includes('Delete')) {
      const fullPath = `${simFolderPath}/${simRelativePath}`;
      if (simService === 'sonarr') {
        payload = {
          eventType: 'EpisodeFileDelete',
          episodeFile: { path: fullPath }
        };
      } else {
        payload = {
          eventType: 'MovieFileDelete',
          movieFile: { path: fullPath }
        };
      }
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setSimResult({
        status: res.status,
        ok: res.ok,
        data
      });
      showToast('Webhook enviado com sucesso ao backend!', 'success');
    } catch (err) {
      setSimResult({
        status: 500,
        ok: false,
        data: { error: err.message, note: 'Certifique-se de que o backend "node src/main.js serve" está rodando na porta 4200.' }
      });
      showToast('Erro ao contatar o servidor de webhooks.', 'error');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="webhooks-guide-layout">
      {/* Top Banner */}
      <section className="webhooks-topbar glass-panel">
        <div className="topbar-left">
          <div className="badge-tag">
            <Radio className="w-3.5 h-3.5 text-secondary" />
            <span>Automação Total</span>
          </div>
          <h1 className="webhooks-title">Integração com Sonarr & Radarr</h1>
          <p className="webhooks-desc">
            Configure o Star para receber webhooks automáticos do Sonarr e Radarr assim que um episódio ou filme for baixado, cortando as barras pretas instantaneamente.
          </p>
        </div>
      </section>

      {/* URL Cards Grid */}
      <div className="webhook-cards-grid">
        <div className="glass-panel webhook-card sonarr-card">
          <div className="card-top">
            <div className="service-badge sonarr">
              <Tv className="w-4 h-4" />
              <span>Sonarr (Séries & Animes)</span>
            </div>
          </div>
          <p className="webhook-card-desc">
            Adicione esta URL no Sonarr para cortar episódios assim que o download terminar.
          </p>
          <div className="url-copy-box">
            <code className="font-mono text-xs">{sonarrUrl}</code>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleCopy(sonarrUrl, 'sonarr')}
            >
              {copiedUrl === 'sonarr' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl === 'sonarr' ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
        </div>

        <div className="glass-panel webhook-card radarr-card">
          <div className="card-top">
            <div className="service-badge radarr">
              <Film className="w-4 h-4" />
              <span>Radarr (Filmes)</span>
            </div>
          </div>
          <p className="webhook-card-desc">
            Adicione esta URL no Radarr para detectar e podar barras pretas de lançamentos de cinema.
          </p>
          <div className="url-copy-box">
            <code className="font-mono text-xs">{radarrUrl}</code>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleCopy(radarrUrl, 'radarr')}
            >
              {copiedUrl === 'radarr' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl === 'radarr' ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Two Column Setup & Interactive Simulator */}
      <div className="webhooks-content-grid">
        {/* Step-by-Step Instructions */}
        <div className="glass-panel instructions-card">
          <h2 className="card-title mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Como Configurar no Sonarr / Radarr
          </h2>

          <ol className="steps-list">
            <li className="step-item">
              <div className="step-number">1</div>
              <div className="step-content">
                <strong>Acesse as Configurações do Sonarr/Radarr</strong>
                <p>Navegue até <code>Settings</code> &gt; <code>Connect</code> e clique no botão <code>+</code> para adicionar uma nova conexão.</p>
              </div>
            </li>

            <li className="step-item">
              <div className="step-number">2</div>
              <div className="step-content">
                <strong>Selecione o tipo "Webhook"</strong>
                <p>Dê um nome como <code>Star Auto-Crop</code>.</p>
              </div>
            </li>

            <li className="step-item">
              <div className="step-number">3</div>
              <div className="step-content">
                <strong>Preencha a URL e os Gatilhos</strong>
                <p>Cole a URL correspondente (Sonarr ou Radarr acima). Marque os eventos:</p>
                <div className="triggers-tags">
                  <span className="trigger-badge">✔ On Download</span>
                  <span className="trigger-badge">✔ On Upgrade</span>
                  <span className="trigger-badge">✔ On File Delete</span>
                </div>
              </div>
            </li>

            <li className="step-item">
              <div className="step-number">4</div>
              <div className="step-content">
                <strong>Método e Formato</strong>
                <p>Defina o método como <code>POST</code>. Clique em <code>Test</code> para verificar a comunicação.</p>
              </div>
            </li>
          </ol>
        </div>

        {/* Interactive Webhook Simulator */}
        <div className="glass-panel simulator-card">
          <h2 className="card-title mb-2 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            Simulador de Teste de Webhook
          </h2>
          <p className="simulator-hint">
            Envie requisições de teste diretamente para o servidor Star sem precisar abrir o Sonarr/Radarr.
          </p>

          <div className="simulator-form">
            <div className="form-row">
              <div className="form-group flex-1">
                <label className="control-label">Serviço Alvo:</label>
                <select
                  className="glass-input w-full"
                  value={simService}
                  onChange={(e) => {
                    setSimService(e.target.value);
                    if (e.target.value === 'radarr') {
                      setSimSeries('Blade Runner 2049');
                      setSimFolderPath('/media/movies/Blade Runner 2049');
                      setSimRelativePath('Blade Runner 2049 (2017).mkv');
                    } else {
                      setSimSeries('Stranger Things');
                      setSimFolderPath('/media/tv/Stranger Things');
                      setSimRelativePath('Season 04/Stranger Things - S04E01.mkv');
                    }
                  }}
                >
                  <option value="sonarr">Sonarr (/api/1/webhook/sonarr)</option>
                  <option value="radarr">Radarr (/api/1/webhook/radarr)</option>
                </select>
              </div>

              <div className="form-group flex-1">
                <label className="control-label">Tipo de Evento:</label>
                <select
                  className="glass-input w-full"
                  value={simEventType}
                  onChange={(e) => setSimEventType(e.target.value)}
                >
                  <option value="Download">Download (Novo arquivo baixado)</option>
                  <option value={simService === 'sonarr' ? 'EpisodeFileDelete' : 'MovieFileDelete'}>
                    Delete (Remover da fila)
                  </option>
                  <option value="Test">Test (Teste de conexão)</option>
                </select>
              </div>
            </div>

            {simEventType !== 'Test' && (
              <>
                <div className="form-group">
                  <label className="control-label">Pasta Base:</label>
                  <input
                    type="text"
                    className="glass-input w-full font-mono text-xs"
                    value={simFolderPath}
                    onChange={(e) => setSimFolderPath(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="control-label">Caminho Relativo do Arquivo:</label>
                  <input
                    type="text"
                    className="glass-input w-full font-mono text-xs"
                    value={simRelativePath}
                    onChange={(e) => setSimRelativePath(e.target.value)}
                  />
                </div>
              </>
            )}

            <button
              className="btn btn-primary w-full mt-2"
              onClick={handleSimulateWebhook}
              disabled={isSimulating}
            >
              <Send className="w-4 h-4" />
              <span>{isSimulating ? 'Enviando...' : 'Disparar Webhook de Teste'}</span>
            </button>

            {simResult && (
              <div className={`simulation-result ${simResult.ok ? 'success' : 'error'} mt-4`}>
                <div className="result-header">
                  <span className="result-status">HTTP {simResult.status}</span>
                  <span className="result-badge">{simResult.ok ? 'Sucesso' : 'Falha na requisição'}</span>
                </div>
                <pre className="code-block text-xs mt-2">
                  {JSON.stringify(simResult.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
