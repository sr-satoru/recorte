import React from 'react';
import { Crop, ListOrdered, Radio, Terminal, Server, RefreshCw, Sparkles, Activity } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, backendStatus, onRefreshStatus, queueCount = 0 }) {
  return (
    <header className="navbar-container">
      <div className="navbar-left">
        <div className="logo-group" onClick={() => setActiveTab('crop')}>
          <div className="logo-icon">
            <Crop className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="logo-title">
              STAR <span className="logo-badge">STUDIO</span>
            </div>
            <div className="logo-subtitle">Detecção Inteligente & Automação Sonarr/Radarr</div>
          </div>
        </div>

        <nav className="nav-tabs" id="main-navigation">
          <button
            id="nav-tab-dashboard"
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Crop className="w-4 h-4" />
            <span>Painel Principal (Prévia & Fila)</span>
            {queueCount > 0 && (
              <span className="tab-counter">{queueCount}</span>
            )}
          </button>

          <button
            id="nav-tab-webhooks"
            className={`nav-tab ${activeTab === 'webhooks' ? 'active' : ''}`}
            onClick={() => setActiveTab('webhooks')}
          >
            <Radio className="w-4 h-4" />
            <span>Sonarr & Radarr</span>
          </button>

          <button
            id="nav-tab-cli"
            className={`nav-tab ${activeTab === 'cli' ? 'active' : ''}`}
            onClick={() => setActiveTab('cli')}
          >
            <Terminal className="w-4 h-4" />
            <span>CLI & Docker</span>
          </button>
        </nav>
      </div>

      <div className="navbar-right">
        <div className={`status-pill ${backendStatus.online ? 'online' : 'demo'}`}>
          <span className="status-dot"></span>
          <span className="status-text">
            {backendStatus.online
              ? `Backend Conectado (:4200)`
              : 'Modo Offline / Demo'}
          </span>
          <button
            className="status-refresh-btn"
            title="Atualizar conexão com o servidor"
            onClick={onRefreshStatus}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${backendStatus.checking ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
