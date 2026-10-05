import React, { useRef, useState } from 'react';
import { 
  ListOrdered, Play, FolderPlus, FileVideo, CheckCircle2, 
  Trash2, RefreshCw, Copy, Check, Eye, HardDrive, Terminal
} from 'lucide-react';

export default function QueuePanel({
  queueData,
  onRefreshQueue,
  onAddFolderFiles,
  onAddSingleFile,
  onAddServerPath,
  onRemoveFromQueue,
  selectedVideo,
  onSelectVideo,
  showToast,
  autoRefresh,
  setAutoRefresh
}) {
  const [copiedId, setCopiedId] = useState(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualPath, setManualPath] = useState('');

  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFolderClick = () => {
    if (folderInputRef.current) {
      folderInputRef.current.click();
    }
  };

  const handleFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const onFolderChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onAddFolderFiles(files);
    }
    // reset input
    e.target.value = '';
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onAddSingleFile(file);
    }
    e.target.value = '';
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualPath.trim()) return;
    onAddServerPath(manualPath.trim());
    setManualPath('');
    setShowManualInput(false);
  };

  const handleCopyPath = (e, path, id) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    showToast('Caminho copiado!', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRemove = (e, path) => {
    e.stopPropagation();
    onRemoveFromQueue(path);
  };

  const items = queueData.items || [];
  const inProgress = queueData.inProgress || false;
  const activeItem = queueData.activeItem || null;

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const completedCount = items.filter(i => i.status === 'completed').length;

  return (
    <div className="panel-container glass-panel queue-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title-group">
          <ListOrdered className="w-5 h-5 text-cyan-400" />
          <h2 className="panel-title">FILA DE VÍDEOS</h2>
        </div>

        <div className="panel-header-actions">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span className="toggle-label text-xs">Auto (3s)</span>
          </label>

          <button
            className="btn btn-secondary btn-sm"
            onClick={onRefreshQueue}
            title="Atualizar lista agora"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* OS 2 BOTÕES PRINCIPAIS PEDIDOS PELO USUÁRIO */}
      <div className="queue-primary-actions-two">
        <button
          id="btn-add-folder"
          className="btn btn-primary flex-1 btn-large-action"
          onClick={handleFolderClick}
          title="Selecionar uma pasta e enfileirar todos os vídeos dela"
        >
          <FolderPlus className="w-4 h-4" />
          <span>📁 Adicionar Pasta Inteira</span>
        </button>

        <button
          id="btn-add-file"
          className="btn btn-cyan flex-1 btn-large-action"
          onClick={handleFileClick}
          title="Selecionar um arquivo de vídeo individual"
        >
          <FileVideo className="w-4 h-4" />
          <span>🎬 Adicionar Vídeo</span>
        </button>

        {/* Hidden File Inputs */}
        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory="true"
          directory=""
          multiple
          style={{ display: 'none' }}
          onChange={onFolderChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
      </div>

      {/* Secondary Toggle: Digitar caminho do servidor */}
      <div className="manual-path-toggle-row">
        <button
          type="button"
          className="link-btn-text"
          onClick={() => setShowManualInput(!showManualInput)}
        >
          <Terminal className="w-3 h-3" />
          <span>{showManualInput ? 'Ocultar entrada de caminho' : 'Ou digitar caminho no servidor (/media/...)'}</span>
        </button>
      </div>

      {showManualInput && (
        <form onSubmit={handleManualSubmit} className="manual-path-form">
          <input
            type="text"
            className="glass-input flex-1 font-mono text-xs"
            placeholder="/media/movies ou /media/videos/arquivo.mkv"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm">
            Adicionar
          </button>
        </form>
      )}

      {/* Mini Metrics Bar */}
      <div className="queue-mini-metrics">
        <div className="mini-metric">
          <span className="mini-label">Total:</span>
          <span className="mini-val text-white">{items.length}</span>
        </div>
        <div className="mini-metric">
          <span className="mini-label">Pendentes:</span>
          <span className="mini-val text-amber-400">{pendingCount}</span>
        </div>
        <div className="mini-metric">
          <span className="mini-label">Concluídos:</span>
          <span className="mini-val text-emerald-400">{completedCount}</span>
        </div>
      </div>

      {/* Active Processing Notice if consuming */}
      {inProgress && activeItem && (
        <div className="queue-active-card">
          <div className="active-card-top">
            <span className="badge badge-active animate-pulse">
              <Play className="w-3 h-3 fill-current" />
              Processando Agora
            </span>
          </div>
          <div className="active-card-path font-mono text-xs text-white">
            <FileVideo className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate">{activeItem}</span>
          </div>
          <div className="active-job-bar mt-2">
            <div className="active-job-progress shimmer-bar"></div>
          </div>
        </div>
      )}

      {/* Scrollable Queue Table - Click any row to preview! */}
      <div className="queue-table-header-tip">
        <span>💡 Clique em qualquer vídeo abaixo para ver a prévia na lateral:</span>
      </div>

      <div className="queue-items-scroll">
        {items.length === 0 ? (
          <div className="empty-queue-notice">
            <HardDrive className="w-8 h-8 text-slate-600 mb-2 mx-auto" />
            <p className="text-dim text-xs">Nenhum vídeo na fila. Use os botões acima para adicionar uma pasta ou vídeo.</p>
          </div>
        ) : (
          <table className="queue-compact-table">
            <thead>
              <tr>
                <th>Arquivo (Clique para Ver Prévia)</th>
                <th>Status</th>
                <th className="text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isSelected = selectedVideo && (
                  (item.id && item.id === selectedVideo.id) ||
                  (item.path && item.path === selectedVideo.path)
                );
                const isActive = inProgress && activeItem === item.path;

                let badgeClass = 'badge-pending';
                let statusLabel = 'Pendente';

                if (isActive) {
                  badgeClass = 'badge-active';
                  statusLabel = 'Ativo';
                } else if (item.status === 'completed') {
                  badgeClass = 'badge-completed';
                  statusLabel = 'Concluído';
                } else if (item.status === 'failed') {
                  badgeClass = 'badge-failed';
                  statusLabel = 'Falhou';
                }

                const fileName = item.name || item.path?.split('/').pop() || 'Vídeo';

                return (
                  <tr
                    key={item.id || item.path}
                    className={`queue-row-clickable ${isSelected ? 'row-selected' : ''} ${isActive ? 'row-active' : ''}`}
                    onClick={() => onSelectVideo(item)}
                  >
                    <td>
                      <div className="queue-file-cell" title={item.path}>
                        {isSelected ? (
                          <Eye className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-pulse" />
                        ) : (
                          <FileVideo className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        )}
                        <span className="file-name font-mono text-xs">{fileName}</span>
                        {isSelected && (
                          <span className="selected-eye-tag">👁 Prévia</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${badgeClass} text-xs`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="action-btns">
                        <button
                          className="btn-action-icon"
                          title="Copiar caminho completo"
                          onClick={(e) => handleCopyPath(e, item.path, item.id || item.path)}
                        >
                          {copiedId === (item.id || item.path) ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {item.status === 'pending' && (
                          <button
                            className="btn-action-icon text-rose-400"
                            title="Remover da fila"
                            onClick={(e) => handleRemove(e, item.path)}
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
        )}
      </div>
    </div>
  );
}
