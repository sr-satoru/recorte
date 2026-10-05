import React, { useState, useRef, useEffect, useCallback } from 'react';
import { saveVideosToDB, loadVideosFromDB, clearVideosFromDB } from './utils/storage.js';
import './App.css';

const API_BASE = (typeof window !== 'undefined' && window.location.port !== '4200') ? 'http://localhost:4200' : '';

export default function App() {
  const [videos, setVideos] = useState([]);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const saved = localStorage.getItem('star_selected_index');
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [outputFolder, setOutputFolder] = useState(() => {
    return localStorage.getItem('star_output_folder') || '';
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('star_active_tab') || 'crop';
  });
  const [serverQueueData, setServerQueueData] = useState({
    items: [],
    inProgress: false,
    activeItem: null,
    currentProgress: null
  });
  const [ffmpegStatus, setFfmpegStatus] = useState({
    appFfmpegReady: false,
    isDownloading: false,
    downloadPercent: 0,
    usingAppBinary: false,
    appBinDir: '',
    appFfmpegPath: ''
  });
  const [videoFilter, setVideoFilter] = useState('all');
  const [isCancelling, setIsCancelling] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Crop dimensions for active video
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 1920, height: 1080 });
  const [videoDims, setVideoDims] = useState({ width: 1920, height: 1080 });

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const outFolderInputRef = useRef(null);
  const dragStateRef = useRef(null);
  const activeVideoIdRef = useRef(null);

  // Folder browser modal states
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [browseData, setBrowseData] = useState({
    current: '',
    parent: '',
    directories: [],
    shortcuts: []
  });
  const [browseLoading, setBrowseLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [folderSearchQuery, setFolderSearchQuery] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getFileName = (pathStr) => {
    if (!pathStr) return '';
    const parts = pathStr.split(/[/\\]/);
    return parts[parts.length - 1] || pathStr;
  };

  // Persist outputFolder in localStorage
  useEffect(() => {
    localStorage.setItem('star_output_folder', outputFolder);
  }, [outputFolder]);

  // Persist activeTab in localStorage
  useEffect(() => {
    localStorage.setItem('star_active_tab', activeTab);
  }, [activeTab]);

  // Persist selectedIndex in localStorage
  useEffect(() => {
    localStorage.setItem('star_selected_index', selectedIndex.toString());
  }, [selectedIndex]);

  // Load videos from IndexedDB once on startup
  useEffect(() => {
    loadVideosFromDB().then((saved) => {
      if (saved && saved.length > 0) {
        setVideos(saved);
        const savedIdx = parseInt(localStorage.getItem('star_selected_index') || '0', 10);
        if (savedIdx >= 0 && savedIdx < saved.length) {
          setSelectedIndex(savedIdx);
        }
      }
      setIsStorageLoaded(true);
    });
  }, []);

  // Auto-save videos and crop definitions to IndexedDB whenever videos changes
  useEffect(() => {
    if (!isStorageLoaded) return;
    const timer = setTimeout(() => {
      saveVideosToDB(videos);
    }, 300);
    return () => clearTimeout(timer);
  }, [videos, isStorageLoaded]);

  // Poll backend server queue & active job status
  const fetchServerStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/1/queue/detailed`);
      const data = await res.json();
      if (data.success && data.detail) {
        setServerQueueData(data.detail);
        setBackendOnline(true);
      }
    } catch {
      setBackendOnline(false);
    }

    try {
      const ffmpegRes = await fetch(`${API_BASE}/api/1/system/ffmpeg-status`);
      const ffmpegData = await ffmpegRes.json();
      if (ffmpegData.success) {
        setFfmpegStatus(ffmpegData);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchServerStatus();
    const interval = setInterval(fetchServerStatus, 1500);
    return () => clearInterval(interval);
  }, [fetchServerStatus]);

  // Synchronize server status for any video in preview list
  const getVideoServerStatus = useCallback((v) => {
    if (!v) return { status: 'pending', label: 'Pendente', className: 'status-tag' };
    const vPath = v.path || v.name || '';
    const vName = v.name || vPath.split(/[\/\\]/).pop() || '';

    // Check if active
    if (serverQueueData?.inProgress && serverQueueData.activeItem) {
      const activePath = serverQueueData.activeItem;
      const activeName = activePath.split(/[\/\\]/).pop() || '';
      if (activePath === vPath || activeName === vName) {
        const pct = serverQueueData.currentProgress?.percentage || 0;
        return {
          status: 'processing',
          label: `⚡ Processando (${pct}%)`,
          className: 'status-tag processing'
        };
      }
    }

    // Check in server queue history/items
    if (serverQueueData?.items && Array.isArray(serverQueueData.items)) {
      const found = serverQueueData.items.find(item => {
        if (!item || !item.path) return false;
        if (item.path === vPath) return true;
        const itemName = item.path.split(/[\/\\]/).pop() || '';
        return itemName === vName;
      });

      if (found) {
        if (found.status === 'completed') {
          return { status: 'completed', label: '✓ Concluído', className: 'status-tag completed' };
        }
        if (found.status === 'failed') {
          return { status: 'failed', label: '✕ Falhou', className: 'status-tag failed' };
        }
        if (found.status === 'cancelled') {
          return { status: 'cancelled', label: 'Cancelado', className: 'status-tag' };
        }
        if (found.status === 'pending') {
          return { status: 'queued', label: 'Na Fila', className: 'status-tag' };
        }
      }
    }

    return { status: 'pending', label: v.status || 'Pendente', className: 'status-tag' };
  }, [serverQueueData]);

  // Cancel currently running job
  const handleCancelActive = async () => {
    if (!window.confirm('Deseja realmente cancelar o processamento do vídeo atual?')) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`${API_BASE}/api/1/queue/cancel-active`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Processamento cancelado.');
        await fetchServerStatus();
      } else {
        showToast('Nenhum processamento ativo para cancelar.');
      }
    } catch {
      showToast('Erro ao cancelar processamento.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Cancel / remove pending item from server queue
  const handleCancelQueueItem = async (filePath) => {
    try {
      const res = await fetch(`${API_BASE}/api/1/queue/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: filePath })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Item cancelado da fila.');
        fetchServerStatus();
      } else {
        showToast('Não foi possível cancelar item.');
      }
    } catch {
      showToast('Erro ao cancelar item.');
    }
  };

  const currentVideo = videos[selectedIndex] || null;
  const currentVideoRef = useRef(currentVideo);
  currentVideoRef.current = currentVideo;

  // When a video is selected, update player source only if video changed
  useEffect(() => {
    if (!currentVideo) {
      activeVideoIdRef.current = null;
      return;
    }

    if (currentVideo.blobUrl && videoRef.current && activeVideoIdRef.current !== currentVideo.id) {
      activeVideoIdRef.current = currentVideo.id;
      videoRef.current.src = currentVideo.blobUrl;
      videoRef.current.load();
      setIsPlaying(false);
      setCurrentTime(0);
    }

    if (currentVideo.crop) {
      setCrop(currentVideo.crop);
    }
  }, [selectedIndex, currentVideo?.id, currentVideo?.blobUrl]);

  // Video metadata loaded
  const onLoadedMetadata = () => {
    if (!videoRef.current) return;
    const w = videoRef.current.videoWidth || 1920;
    const h = videoRef.current.videoHeight || 1080;
    setVideoDims({ width: w, height: h });
    setDuration(videoRef.current.duration || 0);
    setCurrentTime(0);
    setIsPlaying(false);

    if (!currentVideo?.crop) {
      setCrop({ x: 0, y: 0, width: w, height: h });
    }
  };

  const onTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Play / Pause toggle
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => { });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Seek / Step forward or backward
  const handleStep = (secs) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + secs));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSeek = (e) => {
    if (!videoRef.current) return;
    const newTime = parseFloat(e.target.value);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Select folder (reads all videos inside)
  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts'];
    const validFiles = files.filter(f => {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      return videoExts.includes(ext);
    });

    if (validFiles.length === 0) {
      showToast('Nenhum vídeo encontrado na pasta.');
      return;
    }

    const newItems = validFiles.map((file, i) => ({
      id: Date.now() + i,
      name: file.name,
      path: file.webkitRelativePath || file.name,
      file,
      blobUrl: URL.createObjectURL(file),
      status: 'Pendente',
      crop: null
    }));

    setVideos(prev => [...prev, ...newItems]);
    setSelectedIndex(videos.length);
    showToast(`${validFiles.length} vídeo(s) carregado(s).`);
    e.target.value = '';
  };

  // Select individual video file(s)
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems = files.map((file, i) => ({
      id: Date.now() + i,
      name: file.name,
      path: file.name,
      file,
      blobUrl: URL.createObjectURL(file),
      status: 'Pendente',
      crop: null
    }));

    setVideos(prev => [...prev, ...newItems]);
    setSelectedIndex(videos.length);
    showToast(`${files.length} vídeo(s) adicionado(s).`);
    e.target.value = '';
  };

  // Handle Drag & Drop of files onto the player
  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      handleFileSelect({ target: { files } });
    }
  };

  // Remove video from list
  const handleRemove = (index, e) => {
    e.stopPropagation();
    setVideos(prev => prev.filter((_, i) => i !== index));
    if (selectedIndex >= index && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  // DRAG & RESIZE CROP BOX LOGIC
  const handleMouseDown = (e, action) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    dragStateRef.current = {
      action,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
      containerRect,
      videoW: videoDims.width,
      videoH: videoDims.height
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = useCallback((e) => {
    const ds = dragStateRef.current;
    if (!ds) return;

    const scaleX = ds.videoW / ds.containerRect.width;
    const scaleY = ds.videoH / ds.containerRect.height;
    const dx = (e.clientX - ds.startX) * scaleX;
    const dy = (e.clientY - ds.startY) * scaleY;

    let { x, y, width, height } = ds.initialCrop;

    if (ds.action === 'move') {
      x = Math.max(0, Math.min(ds.videoW - width, Math.round((x + dx) / 2) * 2));
      y = Math.max(0, Math.min(ds.videoH - height, Math.round((y + dy) / 2) * 2));
    } else {
      if (ds.action.includes('w')) {
        const newX = Math.max(0, Math.min(x + width - 40, Math.round((x + dx) / 2) * 2));
        width = width + (x - newX);
        x = newX;
      }
      if (ds.action.includes('e')) {
        width = Math.max(40, Math.min(ds.videoW - x, Math.round((width + dx) / 2) * 2));
      }
      if (ds.action.includes('n')) {
        const newY = Math.max(0, Math.min(y + height - 40, Math.round((y + dy) / 2) * 2));
        height = height + (y - newY);
        y = newY;
      }
      if (ds.action.includes('s')) {
        height = Math.max(40, Math.min(ds.videoH - y, Math.round((height + dy) / 2) * 2));
      }
    }

    width = Math.floor(width / 2) * 2;
    height = Math.floor(height / 2) * 2;
    x = Math.floor(x / 2) * 2;
    y = Math.floor(y / 2) * 2;

    const newCrop = { x, y, width, height };
    setCrop(newCrop);
    ds.lastCrop = newCrop;

    if (currentVideoRef.current) {
      currentVideoRef.current.crop = newCrop;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    const lastCrop = dragStateRef.current?.lastCrop;
    dragStateRef.current = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);

    if (lastCrop) {
      setVideos(prev => {
        if (!prev[selectedIndex]) return prev;
        const updated = [...prev];
        updated[selectedIndex] = { ...updated[selectedIndex], crop: lastCrop };
        return updated;
      });
    }
  }, [handleMouseMove, selectedIndex]);

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleCropChange = (field, value) => {
    const val = parseInt(value, 10) || 0;
    const newCrop = { ...crop, [field]: val };
    setCrop(newCrop);
    setVideos(prev => {
      if (!prev[selectedIndex]) return prev;
      const updated = [...prev];
      updated[selectedIndex] = { ...updated[selectedIndex], crop: newCrop };
      return updated;
    });
  };

  const handleResetCrop = () => {
    const fullCrop = { x: 0, y: 0, width: videoDims.width, height: videoDims.height };
    setCrop(fullCrop);
    setVideos(prev => {
      if (!prev[selectedIndex]) return prev;
      const updated = [...prev];
      updated[selectedIndex] = { ...updated[selectedIndex], crop: fullCrop };
      return updated;
    });
  };

  const handleClearList = () => {
    setVideos([]);
    setSelectedIndex(0);
    clearVideosFromDB();
    showToast('Lista de vídeos limpa.');
  };

  // Auto-detect black bars on current frame
  const handleAutoDetect = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const w = v.videoWidth || videoDims.width;
    const h = v.videoHeight || videoDims.height;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(v, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const isRowBlack = (row) => {
      for (let col = 0; col < w; col += 6) {
        const idx = (row * w + col) * 4;
        if (data[idx] > 22 || data[idx + 1] > 22 || data[idx + 2] > 22) return false;
      }
      return true;
    };

    const isColBlack = (col) => {
      for (let row = 0; row < h; row += 6) {
        const idx = (row * w + col) * 4;
        if (data[idx] > 22 || data[idx + 1] > 22 || data[idx + 2] > 22) return false;
      }
      return true;
    };

    let top = 0;
    let bottom = h - 1;
    let left = 0;
    let right = w - 1;

    while (top < h / 2 && isRowBlack(top)) top++;
    while (bottom > h / 2 && isRowBlack(bottom)) bottom--;
    while (left < w / 2 && isColBlack(left)) left++;
    while (right > w / 2 && isColBlack(right)) right--;

    const detectedW = Math.floor(Math.max(100, right - left + 1) / 2) * 2;
    const detectedH = Math.floor(Math.max(100, bottom - top + 1) / 2) * 2;

    const newCrop = { x: left, y: top, width: detectedW, height: detectedH };
    setCrop(newCrop);

    setVideos(prev => {
      if (!prev[selectedIndex]) return prev;
      const updated = [...prev];
      updated[selectedIndex] = { ...updated[selectedIndex], crop: newCrop };
      return updated;
    });

    showToast(`Bordas detectadas: ${detectedW}x${detectedH} (X:${left}, Y:${top})`);
  };

  // Process / Crop videos
  const handleProcess = async () => {
    if (videos.length === 0) {
      showToast('Nenhum vídeo na lista para processar.');
      return;
    }

    setIsProcessing(true);
    showToast('Enviando vídeos para a fila do Star...');

    const items = videos.map(v => ({
      file: v.path || v.name,
      name: v.name,
      crop: v.crop ? [v.crop.width, v.crop.height, v.crop.x, v.crop.y] : null
    }));

    if (backendOnline) {
      try {
        await fetch(`${API_BASE}/api/1/queue/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, outputFolder: outputFolder || null })
        });
        showToast('Vídeos enfileirados! Abrindo aba do servidor...');
        await fetchServerStatus();
        setActiveTab('server');
      } catch {
        showToast('Erro ao contatar o servidor.');
      }
    } else {
      showToast(`Processamento simulado para ${videos.length} vídeo(s).`);
    }

    setIsProcessing(false);
  };

  // Folder browser helper functions
  const loadDirectory = async (targetPath = '') => {
    setBrowseLoading(true);
    try {
      const url = targetPath
        ? `${API_BASE}/api/1/system/directories?path=${encodeURIComponent(targetPath)}`
        : `${API_BASE}/api/1/system/directories`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setBrowseData(data);
      } else {
        showToast(`Erro ao listar pastas: ${data.error || 'Desconhecido'}`);
      }
    } catch (err) {
      console.error('Erro ao listar pastas:', err);
      showToast('Erro ao comunicar com o servidor');
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleOpenFolderModal = () => {
    setShowFolderModal(true);
    setShowNewFolderInput(false);
    setNewFolderName('');
    setFolderSearchQuery('');
    loadDirectory(outputFolder || '');
  };

  const handleSelectCurrentFolder = (chosenPath) => {
    const p = chosenPath || browseData.current;
    if (p) {
      setOutputFolder(p);
      setShowFolderModal(false);
      showToast(`Pasta de saída definida: ${p}`);
    }
  };

  const handleCreateNewFolder = async () => {
    if (!newFolderName.trim() || !browseData.current) return;
    const cleanCurrent = browseData.current.replace(/\/+$/, '');
    const cleanNew = newFolderName.trim().replace(/^\/+/, '');
    const newPath = `${cleanCurrent}/${cleanNew}`;
    try {
      const res = await fetch(`${API_BASE}/api/1/system/create-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: newPath })
      });
      const data = await res.json();
      if (data.success) {
        setNewFolderName('');
        setShowNewFolderInput(false);
        showToast(`Pasta criada: ${cleanNew}`);
        await loadDirectory(data.path);
      } else {
        showToast(`Erro ao criar pasta: ${data.error}`);
      }
    } catch (err) {
      showToast('Erro ao criar pasta');
    }
  };

  const handleNativeOutputFolderSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const relPath = files[0].webkitRelativePath || '';
    const folderName = relPath.split('/')[0] || files[0].name;
    const sampleFile = files[0].name;

    showToast(`Detectando caminho de "${folderName}" no servidor...`);

    try {
      const res = await fetch(`${API_BASE}/api/1/system/resolve-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName, sampleFile })
      });
      const data = await res.json();
      if (data.success && data.path) {
        setOutputFolder(data.path);
        if (showFolderModal) {
          setShowFolderModal(false);
        }
        showToast(`Pasta configurada: ${data.path}`);
      } else {
        showToast('Não foi possível resolver o caminho exato da pasta.');
      }
    } catch (err) {
      console.error('Erro ao resolver pasta:', err);
      showToast('Erro ao comunicar com o servidor');
    } finally {
      e.target.value = '';
    }
  };

  // Calculate overlay percentages
  const leftPct = (crop.x / (videoDims.width || 1)) * 100;
  const topPct = (crop.y / (videoDims.height || 1)) * 100;
  const widthPct = (crop.width / (videoDims.width || 1)) * 100;
  const heightPct = (crop.height / (videoDims.height || 1)) * 100;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span>Star</span>
          </div>

          <div className="header-nav">
            <button
              type="button"
              className={`nav-tab ${activeTab === 'crop' ? 'active' : ''}`}
              onClick={() => setActiveTab('crop')}
            >
              ✂️ Prévia & Recorte
            </button>

            <button
              type="button"
              className={`nav-tab ${activeTab === 'server' ? 'active' : ''}`}
              onClick={() => setActiveTab('server')}
            >
              ⚡ Servidor & Fila
              {serverQueueData.inProgress && (
                <span className="badge-processing">
                  <span className="badge-dot"></span>
                  {serverQueueData.currentProgress?.percentage !== undefined
                    ? `${serverQueueData.currentProgress.percentage}%`
                    : 'Processando'}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="status-badge">
          <span className={`dot ${backendOnline ? 'online' : ''}`}></span>
          <span>{backendOnline ? 'Servidor Conectado (:4200)' : 'Modo Local'}</span>
        </div>

        {ffmpegStatus.isDownloading && (
          <div className="status-badge" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
            <span className="dot" style={{ backgroundColor: 'var(--accent)' }}></span>
            <span>Baixando FFmpeg isolado ({ffmpegStatus.downloadPercent}%)...</span>
          </div>
        )}
        {!ffmpegStatus.isDownloading && ffmpegStatus.appFfmpegReady && (
          <div className="status-badge" title={`FFmpeg isolado em: ${ffmpegStatus.appFfmpegPath || ffmpegStatus.appBinDir}`}>
            <span className="dot online"></span>
            <span>FFmpeg Dedicado</span>
          </div>
        )}
        {!ffmpegStatus.isDownloading && !ffmpegStatus.appFfmpegReady && backendOnline && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={async () => {
              try {
                await fetch(`${API_BASE}/api/1/system/ffmpeg-download`, { method: 'POST' });
                showToast('Download do FFmpeg iniciado!');
              } catch {
                showToast('Falha ao acionar download.');
              }
            }}
          >
            📥 Baixar FFmpeg Isolado
          </button>
        )}
      </header>

      {/* SERVER PROCESSING TAB */}
      {activeTab === 'server' ? (
        <div className="server-view">
          {/* Active Job Card */}
          {serverQueueData.inProgress && serverQueueData.activeItem ? (
            <div className="active-job-card">
              <div className="active-job-header">
                <div className="active-job-info">
                  <div className="active-job-badge">
                    <span className="badge-dot"></span>
                    Processando Agora
                  </div>
                  <div className="active-job-name">
                    {getFileName(serverQueueData.activeItem)}
                  </div>
                  <div className="active-job-path">
                    {serverQueueData.activeItem}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleCancelActive}
                  disabled={isCancelling}
                >
                  {isCancelling ? 'Cancelando...' : '🛑 Cancelar Processamento'}
                </button>
              </div>

              <div className="progress-section">
                <div className="progress-header">
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Progresso do Recorte</span>
                  <span className="progress-percentage">
                    {serverQueueData.currentProgress?.percentage !== undefined
                      ? `${serverQueueData.currentProgress.percentage}%`
                      : '0%'}
                  </span>
                </div>

                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${serverQueueData.currentProgress?.percentage || 0}%` }}
                  ></div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-box">
                  <span className="stat-label">Tempo Decorrido</span>
                  <span className="stat-value">
                    {serverQueueData.currentProgress?.time || '00:00:00'}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Velocidade FFmpeg</span>
                  <span className="stat-value">
                    {serverQueueData.currentProgress?.speed || '1.0x'}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Taxa de Quadros</span>
                  <span className="stat-value">
                    {serverQueueData.currentProgress?.fps || '0'} FPS
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Status</span>
                  <span className="stat-value" style={{ color: '#60a5fa' }}>
                    {serverQueueData.currentProgress?.isCancelled ? 'Cancelando...' : 'Codificando'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="idle-card">
              <div style={{ fontSize: '32px' }}>💤</div>
              <div className="idle-title">Nenhum vídeo sendo processado no momento</div>
              <div className="idle-subtitle">
                O servidor está conectado e pronto para processar novos vídeos da fila.
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveTab('crop')}
              >
                Ir para Prévia & Iniciar Cortes
              </button>
            </div>
          )}

          {/* Queue & History Card */}
          <div className="queue-history-card">
            <div className="queue-history-header">
              <span className="queue-title">
                Fila de Espera & Histórico do Servidor ({serverQueueData.items?.length || 0})
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={fetchServerStatus}
              >
                🔄 Atualizar
              </button>
            </div>

            {(!serverQueueData.items || serverQueueData.items.length === 0) ? (
              <div className="empty-queue">
                Nenhum histórico ou item na fila ainda.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="queue-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45px' }}>#</th>
                      <th>Arquivo</th>
                      <th style={{ width: '150px' }}>Status</th>
                      <th style={{ width: '160px' }}>Data / Hora</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serverQueueData.items.map((item, index) => {
                      const isItemActive = serverQueueData.inProgress && serverQueueData.activeItem === item.path;
                      return (
                        <tr key={item.id || index}>
                          <td style={{ color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                            {item.id}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#ffffff' }}>
                              {getFileName(item.path)}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                              {item.path}
                            </div>
                          </td>
                          <td>
                            {isItemActive ? (
                              <span className="status-badge-table pending" style={{ color: '#60a5fa', borderColor: '#3b82f6' }}>
                                Processando ({serverQueueData.currentProgress?.percentage || 0}%)
                              </span>
                            ) : (
                              <span className={`status-badge-table ${item.status}`}>
                                {item.status === 'pending' ? 'Na Fila' :
                                  item.status === 'completed' ? 'Concluído' :
                                    item.status === 'cancelled' ? 'Cancelado' :
                                      item.status === 'failed' ? 'Falhou' : item.status}
                              </span>
                            )}
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                            {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '-'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {isItemActive ? (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={handleCancelActive}
                                disabled={isCancelling}
                              >
                                Cancelar
                              </button>
                            ) : item.status === 'pending' ? (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handleCancelQueueItem(item.path)}
                              >
                                Cancelar
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>-</span>
                            )}
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
      ) : (
        <>
          {/* Toolbar: Entrada e Pasta para descarregar */}
          <div className="toolbar">
            <div className="tool-group">
              <button
                className="btn btn-secondary"
                onClick={() => folderInputRef.current?.click()}
              >
                📁 Selecionar Pasta
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                🎬 Adicionar Vídeo
              </button>

              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory="true"
                directory=""
                multiple
                style={{ display: 'none' }}
                onChange={handleFolderSelect}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            <div className="tool-group" style={{ flex: 2 }}>
              <label className="tool-label">Pasta de Saída (Onde salvar):</label>
              <div className="output-picker-wrapper">
                <input
                  type="text"
                  className="input-text output-folder-input"
                  placeholder="/caminho/para/salvar (ou deixe vazio para substituir no local)"
                  value={outputFolder}
                  onChange={(e) => setOutputFolder(e.target.value)}
                />
                {outputFolder && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon-clear"
                    onClick={() => setOutputFolder('')}
                    title="Limpar pasta (substituir no local original)"
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleOpenFolderModal}
                  title="Abrir navegador de pastas no computador"
                >
                  📁 Selecionar Pasta
                </button>
              </div>

              <input
                ref={outFolderInputRef}
                type="file"
                webkitdirectory="true"
                directory=""
                style={{ display: 'none' }}
                onChange={handleNativeOutputFolderSelect}
              />
            </div>

            <button
              className="btn"
              onClick={handleProcess}
              disabled={isProcessing || videos.length === 0}
            >
              {isProcessing ? 'Processando...' : `✂️ Processar (${videos.length})`}
            </button>
          </div>

          {/* Main Grid: Player on the left, Video list on the right */}
          <div className="main-grid">
            {/* Left: Player & Crop */}
            <div className="player-card">
              <div className="player-title">
                <span>
                  {currentVideo ? currentVideo.name : 'Nenhum vídeo selecionado'}
                </span>
                {currentVideo && (
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {videoDims.width} × {videoDims.height}
                  </span>
                )}
              </div>

              {/* Clean Player Screen with NO internal overlay controls */}
              <div
                ref={containerRef}
                className={`player-screen ${isDragOver ? 'drag-over' : ''}`}
                style={{ aspectRatio: `${videoDims.width} / ${videoDims.height}` }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleFileDrop}
              >
                {currentVideo ? (
                  <>
                    <video
                      ref={videoRef}
                      className="video-element"
                      onLoadedMetadata={onLoadedMetadata}
                      onTimeUpdate={onTimeUpdate}
                      onEnded={() => setIsPlaying(false)}
                      playsInline
                    />

                    {/* Shaded borders indicating black bars to be cut */}
                    <div
                      className="crop-shade"
                      style={{ top: 0, left: 0, right: 0, height: `${topPct}%` }}
                    />
                    <div
                      className="crop-shade"
                      style={{
                        top: `${topPct + heightPct}%`,
                        left: 0,
                        right: 0,
                        bottom: 0
                      }}
                    />
                    <div
                      className="crop-shade"
                      style={{
                        top: `${topPct}%`,
                        left: 0,
                        width: `${leftPct}%`,
                        height: `${heightPct}%`
                      }}
                    />
                    <div
                      className="crop-shade"
                      style={{
                        top: `${topPct}%`,
                        left: `${leftPct + widthPct}%`,
                        right: 0,
                        height: `${heightPct}%`
                      }}
                    />

                    {/* Draggable & Resizable Crop Box */}
                    <div
                      className="crop-overlay-box"
                      style={{
                        top: `${topPct}%`,
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        height: `${heightPct}%`
                      }}
                      onMouseDown={(e) => handleMouseDown(e, 'move')}
                    >
                      <div className="crop-hud-tag">
                        {crop.width} × {crop.height}
                      </div>

                      {/* Edge Handles */}
                      <div className="crop-edge-handle edge-n" onMouseDown={(e) => handleMouseDown(e, 'n')} />
                      <div className="crop-edge-handle edge-s" onMouseDown={(e) => handleMouseDown(e, 's')} />
                      <div className="crop-edge-handle edge-w" onMouseDown={(e) => handleMouseDown(e, 'w')} />
                      <div className="crop-edge-handle edge-e" onMouseDown={(e) => handleMouseDown(e, 'e')} />

                      {/* Corner Handles */}
                      <div className="crop-corner-handle handle-nw" onMouseDown={(e) => handleMouseDown(e, 'nw')} />
                      <div className="crop-corner-handle handle-ne" onMouseDown={(e) => handleMouseDown(e, 'ne')} />
                      <div className="crop-corner-handle handle-sw" onMouseDown={(e) => handleMouseDown(e, 'sw')} />
                      <div className="crop-corner-handle handle-se" onMouseDown={(e) => handleMouseDown(e, 'se')} />
                    </div>
                  </>
                ) : (
                  <div className="empty-player-text">
                    Carregue ou arraste um vídeo/pasta aqui para visualizar o corte
                  </div>
                )}
              </div>

              {/* BARRA DE REPRODUÇÃO E AVANÇO POR BAIXO DO PREVIEW (NÃO POLUI A IMAGEM) */}
              {currentVideo && (
                <div className="playback-bar-bottom">
                  <button
                    type="button"
                    className="btn-play-pause"
                    onClick={togglePlay}
                    title={isPlaying ? 'Pausar' : 'Reproduzir'}
                  >
                    {isPlaying ? '❚❚' : '▶'}
                  </button>

                  <button
                    type="button"
                    className="btn-step"
                    onClick={() => handleStep(-5)}
                    title="Voltar 5 segundos"
                  >
                    -5s
                  </button>

                  <button
                    type="button"
                    className="btn-step"
                    onClick={() => handleStep(5)}
                    title="Avançar 5 segundos"
                  >
                    +5s
                  </button>

                  <input
                    type="range"
                    className="timeline-slider"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                  />

                  <span className="time-display">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
              )}

              {/* Coordinates Inputs */}
              <div className="crop-controls-row">
                <div className="crop-control-item">
                  <label>Largura (W):</label>
                  <input
                    type="number"
                    value={crop.width}
                    step={2}
                    onChange={(e) => handleCropChange('width', e.target.value)}
                  />
                </div>
                <div className="crop-control-item">
                  <label>Altura (H):</label>
                  <input
                    type="number"
                    value={crop.height}
                    step={2}
                    onChange={(e) => handleCropChange('height', e.target.value)}
                  />
                </div>
                <div className="crop-control-item">
                  <label>Posição X:</label>
                  <input
                    type="number"
                    value={crop.x}
                    step={2}
                    onChange={(e) => handleCropChange('x', e.target.value)}
                  />
                </div>
                <div className="crop-control-item">
                  <label>Posição Y:</label>
                  <input
                    type="number"
                    value={crop.y}
                    step={2}
                    onChange={(e) => handleCropChange('y', e.target.value)}
                  />
                </div>
              </div>

              <div className="player-footer-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleAutoDetect}
                  disabled={!currentVideo}
                >
                  ✨ Detectar Corte Automaticamente
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleResetCrop}
                  disabled={!currentVideo}
                >
                  Resetar para Tela Cheia
                </button>
              </div>
            </div>

            {/* Right: Video List */}
            <div className="queue-card">
              <div className="queue-header">
                <span className="queue-title">
                  Vídeos ({videos.length})
                </span>
                {videos.length > 0 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleClearList}
                  >
                    Limpar Lista
                  </button>
                )}
              </div>

              {videos.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', margin: '8px 0 12px 0', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn btn-xs ${videoFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setVideoFilter('all')}
                  >
                    Todos ({videos.length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${videoFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setVideoFilter('pending')}
                  >
                    Pendentes ({videos.filter(v => getVideoServerStatus(v).status !== 'completed').length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${videoFilter === 'completed' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setVideoFilter('completed')}
                  >
                    ✓ Concluídos ({videos.filter(v => getVideoServerStatus(v).status === 'completed').length})
                  </button>
                </div>
              )}

              {videos.length === 0 ? (
                <div className="empty-queue">
                  Nenhum vídeo adicionado ainda.<br />
                  Clique em <strong>📁 Selecionar Pasta</strong> ou arraste um vídeo para cá.
                </div>
              ) : (
                <ul className="queue-list">
                  {videos
                    .map((v, originalIndex) => ({ v, originalIndex, statusInfo: getVideoServerStatus(v) }))
                    .filter(({ statusInfo }) => {
                      if (videoFilter === 'completed') return statusInfo.status === 'completed';
                      if (videoFilter === 'pending') return statusInfo.status !== 'completed';
                      return true;
                    })
                    .map(({ v, originalIndex, statusInfo }) => (
                      <li
                        key={v.id || originalIndex}
                        className={`queue-item ${originalIndex === selectedIndex ? 'active' : ''}`}
                        onClick={() => setSelectedIndex(originalIndex)}
                      >
                        <div className="queue-item-info">
                          <span className="queue-item-name">{v.name}</span>
                          <span className="queue-item-meta">
                            {v.crop ? `Corte: ${v.crop.width}x${v.crop.height}` : 'Sem corte definido'}
                          </span>
                        </div>

                        <div className="queue-item-actions">
                          <span className={statusInfo.className}>{statusInfo.label}</span>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={(e) => handleRemove(originalIndex, e)}
                            title="Remover vídeo"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {/* Folder Browser Modal */}
      {showFolderModal && (
        <div className="modal-overlay" onClick={() => setShowFolderModal(false)}>
          <div className="modal-dialog folder-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span>📁</span>
                <span>Selecionar Pasta de Saída no Computador</span>
              </div>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setShowFolderModal(false)}
                title="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Shortcuts */}
            {browseData.shortcuts && browseData.shortcuts.length > 0 && (
              <div className="modal-shortcuts">
                <span className="shortcuts-label">Atalhos:</span>
                {browseData.shortcuts.map((sc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`shortcut-chip ${browseData.current === sc.path ? 'active' : ''}`}
                    onClick={() => loadDirectory(sc.path)}
                  >
                    <span>{sc.icon}</span>
                    <span>{sc.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Path & Nav Bar */}
            <div className="modal-nav-bar">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => browseData.parent && loadDirectory(browseData.parent)}
                disabled={!browseData.parent || browseData.parent === browseData.current || browseLoading}
                title="Subir um nível de pasta"
              >
                ⬆ Subir
              </button>

              <div className="current-path-display" title={browseData.current}>
                {browseData.current || 'Carregando...'}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewFolderInput(!showNewFolderInput)}
                title="Criar nova subpasta neste local"
              >
                ➕ Nova Pasta
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => outFolderInputRef.current?.click()}
                title="Abrir janela de seleção de pastas nativa do sistema operacional"
              >
                💻 Janela do Sistema
              </button>
            </div>

            {/* Create new folder input bar */}
            {showNewFolderInput && (
              <div className="new-folder-bar">
                <input
                  type="text"
                  className="input-text"
                  placeholder="Nome da nova pasta..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateNewFolder();
                    if (e.key === 'Escape') setShowNewFolderInput(false);
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleCreateNewFolder}
                  disabled={!newFolderName.trim()}
                >
                  Criar
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setShowNewFolderInput(false);
                    setNewFolderName('');
                  }}
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Search filter within directory */}
            <div className="folder-search-bar">
              <input
                type="text"
                className="input-text"
                placeholder="Filtrar subpastas..."
                value={folderSearchQuery}
                onChange={(e) => setFolderSearchQuery(e.target.value)}
              />
            </div>

            {/* Folder List */}
            <div className="folder-list-container">
              {browseLoading ? (
                <div className="modal-loading">Carregando pastas...</div>
              ) : (
                <>
                  {(() => {
                    const filtered = (browseData.directories || []).filter(d =>
                      d.toLowerCase().includes(folderSearchQuery.toLowerCase())
                    );

                    if (filtered.length === 0) {
                      return (
                        <div className="folder-list-empty">
                          {folderSearchQuery
                            ? 'Nenhuma pasta corresponde ao filtro.'
                            : 'Nenhuma subpasta aqui. Você pode selecionar esta pasta diretamente ou criar uma nova acima.'}
                        </div>
                      );
                    }

                    return (
                      <div className="folder-grid">
                        {filtered.map((dirName) => {
                          const dirPath = `${browseData.current.replace(/\/+$/, '')}/${dirName}`;
                          return (
                            <div
                              key={dirName}
                              className="folder-item"
                              onClick={() => loadDirectory(dirPath)}
                              title={`Abrir pasta ${dirPath}`}
                            >
                              <span className="folder-item-icon">📁</span>
                              <span className="folder-item-name">{dirName}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Footer with confirmation */}
            <div className="modal-footer">
              <div className="modal-footer-selection">
                <span className="selection-label">Caminho que será anotado no servidor:</span>
                <span className="selection-path" title={browseData.current}>
                  {browseData.current || '(Nenhuma pasta selecionada)'}
                </span>
              </div>
              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowFolderModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleSelectCurrentFolder()}
                  disabled={!browseData.current || browseLoading}
                >
                  ✓ Usar Esta Pasta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simple Toast */}
      {toastMessage && <div className="toast">{toastMessage}</div>}
    </div>
  );
}
