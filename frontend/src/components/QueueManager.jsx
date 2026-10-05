import React, { useState } from 'react';
import { 
  ListOrdered, Play, CheckCircle2, XCircle, Clock, 
  Trash2, RefreshCw, Plus, FileVideo, HardDrive, AlertTriangle,
  Copy, Check, Activity
} from 'lucide-react';

export default function QueueManager({ 
  queueData, 
  onRefreshQueue, 
  onAddToQueue, 
  onRemoveFromQueue, 
  showToast,
  autoRefresh,
  setAutoRefresh
}) {
  const [newFilePath, setNewFilePath] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newFilePath.trim()) {
      showToast('Por favor, informe o caminho do arquivo.', 'error');
      return;
    }
    onAddToQueue(newFilePath.trim());
    setNewFilePath('');
  };

  const handleCopyPath = (path, id) => {
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    showToast('Caminho copiado!', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const items = queueData.items || [];
  const inProgress = queueData.inProgress || false;
  const activeItem = queueData.activeItem || null;

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const completedCount = items.filter(i => i.status === 'completed').length;
  const failedCount = items.filter(i => i.status === 'failed').length;

  return (
    <div className="queue-manager-layout">
      {/* Top Header & Metrics */}
      <section className="queue-topbar glass-panel">
        <div className="queue-topbar-left">
          <div className="badge-tag">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Fila em Tempo Real</span>
          </div>
          <h1 className="queue-title">Gerenciador da Fila de Vídeos</h1>
          <p className="queue-desc">
            Acompanhe o status dos vídeos recebidos do Sonarr, Radarr ou inseridos manualmente para corte de bordas.
          </p>
        </div>

        <div className="queue-topbar-right">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span className="toggle-label">Auto-atualizar (3s)</span>
          </label>

          <button
            className="btn btn-secondary btn-sm"
            onClick={onRefreshQueue}
            title="Atualizar fila agora"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>
        </div>
      </section>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card glass-panel">
          <div className="metric-icon cyan">
            <ListOrdered className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="metric-info">
            <span className="metric-value">{items.length}</span>
            <span className="metric-label">Total de Itens</span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon amber">
            <Clock className="w-5 h-5 text-amber-400" />
          </div>
          <div className="metric-info">
            <span className="metric-value">{pendingCount}</span>
            <span className="metric-label">Pendentes na Fila</span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon emerald">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="metric-info">
            <span className="metric-value">{completedCount}</span>
            <span className="metric-label">Cortes Concluídos</span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-icon rose">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="metric-info">
            <span className="metric-value">{failedCount}</span>
            <span className="metric-label">Falhas / Cancelados</span>
          </div>
        </div>
      </div>

      {/* Active Processing Card Banner */}
      {inProgress && activeItem && (
        <div className="active-job-banner glass-panel">
          <div className="active-job-pulse"></div>
          <div className="active-job-content">
            <div className="active-job-header">
              <span className="badge badge-active animate-pulse">
                <Play className="w-3 h-3 fill-current" />
                Processando Agora
              </span>
              <span className="active-job-tag">Corte In-Place com FFmpeg</span>
            </div>
            <div className="active-job-path">
              <FileVideo className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="font-mono text-sm">{activeItem}</span>
            </div>
            <div className="active-job-bar">
              <div className="active-job-progress shimmer-bar"></div>
            </div>
          </div>
        </div>
      )}

      {/* Add New File & Queue List Table */}
      <div className="queue-main-grid">
        {/* Quick Enqueue Card */}
        <div className="glass-panel quick-add-card">
          <div className="card-header">
            <Plus className="w-4 h-4 text-indigo-400" />
            <h2 className="card-title">Enfileirar Novo Vídeo</h2>
          </div>
          <form onSubmit={handleAddSubmit} className="quick-add-form">
            <div className="input-group">
              <input
                type="text"
                className="glass-input w-full font-mono text-sm"
                placeholder="/media/movies/Nome_Do_Filme_1080p.mkv"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
              />
            </div>
            <div className="quick-add-buttons">
              <button type="submit" className="btn btn-primary btn-sm">
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar à Fila</span>
              </button>
            </div>
          </form>

          {/* Preset Samples */}
          <div className="sample-paths">
            <span className="sample-title">Exemplos rápidos de teste:</span>
            <div className="sample-tags">
              <button
                type="button"
                className="sample-tag"
                onClick={() => setNewFilePath('/media/movies/Dune_Part_Two_2024_2160p.mkv')}
              >
                + Dune 2 (4K)
              </button>
              <button
                type="button"
                className="sample-tag"
                onClick={() => setNewFilePath('/media/tv/Severance/Season 01/S01E01.mkv')}
              >
                + Severance S01E01
              </button>
              <button
                type="button"
                className="sample-tag"
                onClick={() => setNewFilePath('/media/anime/Cowboy_Bebop/S01E05.mkv')}
              >
                + Cowboy Bebop 4:3
              </button>
            </div>
          </div>
        </div>

        {/* Queue Table */}
        <div className="glass-panel queue-table-container">
          <div className="table-header-row">
            <h2 className="card-title">Histórico e Lista de Tarefas</h2>
            <span className="table-count-tag">{items.length} itens cadastrados</span>
          </div>

          {items.length === 0 ? (
            <div className="empty-queue-state">
              <HardDrive className="w-12 h-12 text-slate-600 mb-3" />
              <h3>Nenhum vídeo na fila</h3>
              <p>Os vídeos recebidos via webhook do Sonarr/Radarr ou adicionados manualmente aparecerão aqui.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Caminho do Arquivo</th>
                    <th>Status</th>
                    <th>Criado Em</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isActive = inProgress && activeItem === item.path;
                    let badgeClass = 'badge-pending';
                    let statusLabel = 'Pendente';

                    if (isActive) {
                      badgeClass = 'badge-active';
                      statusLabel = 'Em Processamento';
                    } else if (item.status === 'completed') {
                      badgeClass = 'badge-completed';
                      statusLabel = 'Concluído';
                    } else if (item.status === 'failed') {
                      badgeClass = 'badge-failed';
                      statusLabel = 'Falhou';
                    } else if (item.status === 'cancelled') {
                      badgeClass = 'badge-cancelled';
                      statusLabel = 'Cancelado';
                    }

                    return (
                      <tr key={item.id || item.path} className={isActive ? 'row-active' : ''}>
                        <td className="font-mono text-dim">#{item.id || '-'}</td>
                        <td>
                          <div className="file-info-cell">
                            <FileVideo className="w-4 h-4 text-indigo-400 shrink-0" />
                            <span className="file-path font-mono" title={item.path}>
                              {item.path}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`}>
                            {isActive && <span className="status-dot animate-pulse"></span>}
                            {statusLabel}
                          </span>
                        </td>
                        <td className="text-muted text-xs">
                          {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : 'Recentemente'}
                        </td>
                        <td className="text-right">
                          <div className="table-actions">
                            <button
                              className="btn btn-secondary btn-icon btn-sm"
                              title="Copiar caminho completo"
                              onClick={() => handleCopyPath(item.path, item.id || item.path)}
                            >
                              {copiedId === (item.id || item.path) ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {item.status === 'pending' && (
                              <button
                                className="btn btn-danger btn-icon btn-sm"
                                title="Cancelar / Remover da fila"
                                onClick={() => onRemoveFromQueue(item.path)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
