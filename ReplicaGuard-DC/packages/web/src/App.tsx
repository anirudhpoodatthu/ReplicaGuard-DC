import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Server,
  Files,
  Activity,
  History,
  Settings,
  RefreshCw,
  HardDrive,
  UploadCloud,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  Search,
  Folder,
  FileText,
  Image as ImageIcon,
  Film,
  File as FileIcon,
  CloudUpload,
  ArrowUpDown,
} from 'lucide-react';
import { api } from './api';
import type { CoordinatorStatus, NodeItem, FileItem, RecoveryEventItem } from './types';

export function App() {
  // User and admin experiences are separate URLs. The public user dashboard is `/`;
  // the administrative console is available only at `/admin` in this demo build.
  const isAdminRoute = window.location.pathname.startsWith('/admin');
  const [activeTab, setActiveTab] = useState<'drive' | 'overview' | 'nodes' | 'files' | 'recovery' | 'logs' | 'settings'>(isAdminRoute ? 'overview' : 'drive');
  const [status, setStatus] = useState<CoordinatorStatus | null>(null);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [events, setEvents] = useState<RecoveryEventItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('Never');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [driveSearch, setDriveSearch] = useState('');
  const [uploadMsg, setUploadMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [token, setToken] = useState<string>(() => localStorage.getItem('rg_token') || '');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(isAdminRoute ? 'login' : 'signup');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountRole, setAccountRole] = useState<'user' | 'admin' | ''>('');
  const [authReady, setAuthReady] = useState(false);
  const submitAuth = async (e: React.FormEvent) => { e.preventDefault(); setAuthBusy(true); setAuthError(''); try { const result = await api.authenticate(authMode, authEmail, authPassword); localStorage.setItem('rg_token', result.token); setToken(result.token); setUploadMsg(null); setFiles([]); setAccountEmail(result.user.email); setAccountRole(result.user.role || 'user'); setAuthReady(true); } catch (err: any) { setAuthError(err.message || 'Authentication failed'); } finally { setAuthBusy(false); } };
  const signOut = () => {
    // Clear session-specific UI immediately so another account never inherits it.
    localStorage.removeItem('rg_token');
    setToken('');
    setFiles([]);
    setEvents([]);
    setStatus(null);
    setNodes([]);
    setUploadMsg(null);
    setAccountEmail('');
    setAccountRole('');
    setAuthError('');
    setAuthEmail('');
    setAuthPassword('');
    setAuthReady(true);
    if (isAdminRoute) window.location.href = '/';
  };
  useEffect(() => {
    if (!token) { setAuthReady(true); setAccountRole(''); return; }
    setAuthReady(false);
    api.me().then((r: any) => { setAccountEmail(r.user.email); setAccountRole(r.user.role || 'user'); })
      .catch(() => { localStorage.removeItem('rg_token'); setToken(''); setAccountRole(''); setAccountEmail(''); })
      .finally(() => setAuthReady(true));
  }, [token]);

  // Poll coordinator health independently from admin-only monitoring endpoints.
  const fetchData = async () => {
    try {
      const healthy = await api.health();
      setIsConnected(healthy);
      if (!healthy) throw new Error('Coordinator health check failed');

      // Do not issue authenticated requests from stale React state after sign-out
      // or when the stored session no longer matches this component's session.
      const storedToken = localStorage.getItem('rg_token');
      if (!token || !storedToken || storedToken !== token) {
        setFiles([]);
        setStatus(null);
        setNodes([]);
        setEvents([]);
        return;
      }

      try {
        const nextFiles = await api.getFiles();
        if (localStorage.getItem('rg_token') === token) setFiles(nextFiles);
      } catch (err) {
        if (localStorage.getItem('rg_token') === token) console.error('File list request failed:', err);
      }

      if (isAdminRoute && accountRole === 'admin' && localStorage.getItem('rg_token') === token) {
        const results = await Promise.allSettled([api.getStatus(), api.getNodes(), api.getRecoveryEvents(25)]);
        if (results[0].status === 'fulfilled') setStatus(results[0].value);
        if (results[1].status === 'fulfilled') setNodes(results[1].value);
        if (results[2].status === 'fulfilled') setEvents(results[2].value);
        results.forEach((r) => { if (r.status === 'rejected') console.error('Admin monitoring request failed:', r.reason); });
      }
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Coordinator health check failed:', err);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [token, accountRole, isAdminRoute]);

  const handleManualRefresh = async () => {
    setLoading(true);
    await fetchData();
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 52428800) {
      setUploadMsg({ text: 'File exceeds 50 MB limit.', type: 'error' });
      return;
    }

    setUploading(true);
    setUploadMsg(null);
    try {
      await api.uploadFile(file);
      setUploadMsg({ text: `Successfully replicated "${file.name}" across cluster.`, type: 'success' });
      fetchData();
    } catch (err: any) {
      setUploadMsg({ text: err.message || 'Upload failed', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleSimulate = async (port: number) => {
    try {
      await api.simulateFailure(port);
      fetchData();
    } catch (err: any) {
      alert(`Simulation trigger failed: ${err.message}`);
    }
  };

  const handleRecover = async (port: number) => {
    try {
      await api.recoverNode(port);
      fetchData();
    } catch (err: any) {
      alert(`Node recovery trigger failed: ${err.message}`);
    }
  };

  if (!authReady) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Checking sign-in…</div>;
  if (isAdminRoute && token && accountRole && accountRole !== 'admin') { return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}><div><h2>Administrator access required</h2><p>This account is not an administrator.</p><button className="btn btn-secondary" onClick={() => { window.location.href = '/'; }}>Open User Drive</button><button className="btn" onClick={signOut}>Sign out</button></div></div>; }
  if (!token) return (
    <div className="app-shell user-shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form onSubmit={submitAuth} style={{ width: 'min(420px, 100%)', padding: 32, borderRadius: 18, background: 'var(--panel, #fff)', boxShadow: '0 18px 60px rgba(0,0,0,.12)', display: 'grid', gap: 16 }}>
        <div className="brand"><div className="brand-icon"><HardDrive size={18}/></div><div className="brand-text"><h2>ReplicaGuard</h2><span>Private distributed file storage</span></div></div>
        <h2 style={{ marginBottom: 0 }}>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Your files are private to your account.</p>
        <label>Email address<input type="email" required autoComplete="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} style={{ display: 'block', width: '100%', padding: 12, marginTop: 6, borderRadius: 8, border: '1px solid #cbd5e1' }}/></label>
        <label>Password<input type="password" required minLength={10} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} value={authPassword} onChange={e => setAuthPassword(e.target.value)} style={{ display: 'block', width: '100%', padding: 12, marginTop: 6, borderRadius: 8, border: '1px solid #cbd5e1' }}/></label>
        {authError && <p style={{ color: '#dc2626', margin: 0 }}>{authError}</p>}
        <button className="btn drive-upload-button" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
        <button type="button" className="btn btn-secondary" onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setAuthError(''); }}>{authMode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
        <small style={{ color: 'var(--text-muted)' }}>Use a unique password of at least 10 characters.</small>
      </form>
    </div>
  );

  return (
    <div className={`app-shell ${isAdminRoute ? "admin-shell" : "user-shell"}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <HardDrive size={18} />
          </div>
          <div className="brand-text">
            <h2>ReplicaGuard</h2>
            <span>Self-Healing Storage</span>
          </div>
        </div>

        <ul className="nav-links">
          {!isAdminRoute ? (
            <li className={`nav-item ${activeTab === 'drive' ? 'active' : ''}`} onClick={() => setActiveTab('drive')}>
              <HardDrive size={18} /> My Drive
            </li>
          ) : (
            <>
              <li className="nav-section-label">ADMIN CONSOLE</li>
              <li className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}><LayoutDashboard size={18} /> Overview</li>
              <li className={`nav-item ${activeTab === 'nodes' ? 'active' : ''}`} onClick={() => setActiveTab('nodes')}><Server size={18} /> Storage Nodes</li>
              <li className={`nav-item ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}><Files size={18} /> Files & Replicas</li>
              <li className={`nav-item ${activeTab === 'recovery' ? 'active' : ''}`} onClick={() => setActiveTab('recovery')}><Activity size={18} /> Recovery Center</li>
              <li className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}><History size={18} /> Activity Logs</li>
              <li className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><Settings size={18} /> Settings</li>
              <li className="nav-item admin-return" onClick={() => { window.location.href = '/'; }}><HardDrive size={18} /> Open User Drive</li>
            </>
          )}
        </ul>
      </aside>

      {/* Main Wrapper */}
      <div className="main-wrapper">
        {/* Header */}
        <header className="top-header">
          <div className="header-title">
            <h1>
              {activeTab === 'drive' && 'My Drive'}
              {activeTab === 'overview' && 'System Overview & Cluster Topology'}
              {activeTab === 'nodes' && 'Storage Node Pool & Diagnostics'}
              {activeTab === 'files' && 'File Repository & Replica Locations'}
              {activeTab === 'recovery' && 'Autonomous Self-Healing Engine'}
              {activeTab === 'logs' && 'Cluster Audit & Recovery Log'}
              {activeTab === 'settings' && 'System Configuration & Parameters'}
            </h1>
          </div>
          <div className="header-actions">
            {!isAdminRoute && token && <><span style={{fontSize:12}}>{accountEmail}</span><button className="btn btn-secondary btn-sm" onClick={signOut}>Sign out</button></>}
            <div className="connection-pill">
              <span className={`pulse-dot ${isConnected ? '' : 'offline'}`} />
              <span>{isConnected ? 'Coordinator Connected' : 'Coordinator Offline'}</span>
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Updated: {lastRefreshed}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleManualRefresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="page-content">
          {/* TAB: MY DRIVE — end-user dashboard */}
          {activeTab === 'drive' && (
            <div className="drive-page">
              <div className="drive-welcome">
                <div>
                  <div className="drive-eyebrow">REPLICAGUARD CLOUD FILES</div>
                  <h2>All your files, in one place.</h2>
                  <p>Upload once. ReplicaGuard distributes verified copies across your storage nodes.</p>
                </div>
                <label className="btn drive-upload-button">
                  <CloudUpload size={17} /> {uploading ? 'Uploading…' : '＋ New upload'}
                  <input type="file" hidden disabled={uploading} onChange={handleUpload} />
                </label>
              </div>

              {uploadMsg && (
                <div className={`drive-alert ${uploadMsg.type}`}>
                  {uploadMsg.type === 'success' ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                  <span>{uploadMsg.text}</span>
                </div>
              )}

              <div className="drive-search">
                <Search size={19} />
                <input aria-label="Search files" placeholder="Search in My Drive" value={driveSearch} onChange={(e) => setDriveSearch(e.target.value)} />
                {driveSearch && <button className="drive-clear" onClick={() => setDriveSearch('')}>Clear</button>}
              </div>

              <div className="drive-storage-strip">
                <div className="drive-storage-icon"><HardDrive size={21} /></div>
                <div className="drive-storage-copy">
                  <strong>Distributed storage</strong>
                  <span>{nodes.filter(n => n.state === 'HEALTHY').length} of {nodes.length || 3} storage nodes healthy · SHA-256 verification enabled</span>
                </div>
                <span className={`badge ${nodes.length > 0 && nodes.every(n => n.state === 'HEALTHY') ? 'badge-healthy' : 'badge-suspect'}`}>
                  {nodes.length > 0 && nodes.every(n => n.state === 'HEALTHY') ? 'All systems operational' : 'Cluster status: check'}
                </span>
              </div>

              <div className="drive-section-heading">
                <h3>Quick access</h3>
                <span>Files stored in your ReplicaGuard cluster</span>
              </div>
              <div className="drive-quick-grid">
                <button className="drive-quick-card" onClick={() => setDriveSearch('')}>
                  <span className="drive-quick-icon purple"><Folder size={22} /></span>
                  <span><strong>My Drive</strong><small>{files.length} files</small></span>
                </button>
                <button className="drive-quick-card" onClick={() => setDriveSearch('')}>
                  <span className="drive-quick-icon blue"><Clock size={22} /></span>
                  <span><strong>Recent</strong><small>Latest uploads</small></span>
                </button>
                <div className="drive-quick-card drive-quick-card-static">
                  <span className="drive-quick-icon green"><Server size={22} /></span>
                  <span><strong>Replica protection</strong><small>SHA-256 checks enabled</small></span>
                </div>
              </div>

              <div className="drive-section-heading drive-files-heading">
                <h3>{driveSearch ? 'Search results' : 'Files in My Drive'}</h3>
                <span>{files.filter(f => f.originalName.toLowerCase().includes(driveSearch.toLowerCase())).length} items</span>
              </div>
              <div className="drive-file-table">
                <div className="drive-table-head">
                  <span>Name <ArrowUpDown size={13} /></span><span>Uploaded</span><span>File size</span><span>Replication</span><span> </span>
                </div>
                {files.filter(f => f.originalName.toLowerCase().includes(driveSearch.toLowerCase())).slice().sort((a,b) => new Date(b.uploadedAt).getTime()-new Date(a.uploadedAt).getTime()).map(file => {
                  const ext = file.originalName.split('.').pop()?.toLowerCase() || '';
                  const isImage = ['png','jpg','jpeg','gif','webp','svg'].includes(ext);
                  const isVideo = ['mp4','mov','avi','mkv'].includes(ext);
                  const Icon = isImage ? ImageIcon : isVideo ? Film : ['pdf','doc','docx','txt','md'].includes(ext) ? FileText : FileIcon;
                  return <div className="drive-file-row" key={file.fileId}>
                    <span className="drive-file-name"><span className={`drive-file-icon ${isImage ? 'image' : isVideo ? 'video' : 'document'}`}><Icon size={18}/></span><span><strong>{file.originalName}</strong><small>{file.fileId.slice(0,8)} · SHA-256 verified</small></span></span>
                    <span className="drive-file-date">{new Date(file.uploadedAt).toLocaleDateString()}</span>
                    <span>{file.sizeBytes < 1024*1024 ? `${Math.max(1, Math.round(file.sizeBytes/1024))} KB` : `${(file.sizeBytes/1024/1024).toFixed(2)} MB`}</span>
                    <span><span className={`badge ${file.replicas.length >= 3 ? 'badge-healthy' : 'badge-suspect'}`}>{file.replicas.length}/3 copies</span></span>
                    <span><a className="drive-download" href={api.getDownloadUrl(file.fileId)} download={file.originalName} title="Download file"><Download size={17}/></a></span>
                  </div>;
                })}
                {files.filter(f => f.originalName.toLowerCase().includes(driveSearch.toLowerCase())).length === 0 && (
                  <div className="drive-empty">
                    <div className="drive-empty-art"><CloudUpload size={34}/></div>
                    <h3>{driveSearch ? 'No matching files' : 'Your drive is ready'}</h3>
                    <p>{driveSearch ? 'Try another search term.' : 'Upload your first file to see it here and watch ReplicaGuard create copies across the storage nodes.'}</p>
                    {!driveSearch && <label className="btn"><CloudUpload size={16}/> Upload your first file<input type="file" hidden disabled={uploading} onChange={handleUpload}/></label>}
                  </div>
                )}
              </div>
              <div className="drive-footer-note"><ShieldAlert size={14}/> Educational distributed-storage demo · files are stored on this computer in separate node folders.</div>
            </div>
          )}

          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              {/* Summary Metrics */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-header">
                    <span>Cluster Health</span>
                    <ShieldAlert size={16} />
                  </div>
                  <div
                    className="metric-value"
                    style={{
                      color:
                        status?.nodes.dead === 0 ? 'var(--success)' : 'var(--warning)',
                    }}
                  >
                    {status?.nodes.dead === 0 ? 'Healthy' : 'Degraded'}
                  </div>
                  <div className="metric-sub">
                    Uptime: {status ? `${status.coordinator.uptimeSeconds}s` : '0s'}
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span>Healthy Storage Nodes</span>
                    <Server size={16} />
                  </div>
                  <div className="metric-value">
                    {status?.nodes.healthy ?? 0} <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>/ {status?.nodes.total ?? 0}</span>
                  </div>
                  <div className="metric-sub">
                    {status?.nodes.dead ?? 0} offline / failed
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span>Active Files</span>
                    <Files size={16} />
                  </div>
                  <div className="metric-value">{status?.files.total ?? 0}</div>
                  <div className="metric-sub">
                    {status?.files.fullyReplicated ?? 0} fully replicated
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span>Self-Healing Operations</span>
                    <Activity size={16} />
                  </div>
                  <div className="metric-value" style={{ color: 'var(--purple)' }}>
                    {events.length}
                  </div>
                  <div className="metric-sub">
                    {status?.recovery.inProgress ?? 0} actively recovering
                  </div>
                </div>
              </div>

              {/* Topology Map */}
              <div className="topology-card">
                <div className="topology-title">
                  <span>Cluster Topology & Placement</span>
                  <span className="badge badge-neutral">Replication Factor: 3</span>
                </div>
                <div className="topology-container">
                  {/* Coordinator Node */}
                  <div className="coord-node">
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
                      Coordinator Service
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>localhost:4100</div>
                    <span className="badge badge-healthy" style={{ marginTop: 8 }}>
                      Leader Active
                    </span>
                  </div>

                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    ↓ Heartbeat Tracking & Target-Pull Dispatch ↓
                  </div>

                  {/* Storage Nodes Row */}
                  <div className="storage-nodes-row">
                    {nodes.map((node) => {
                      const stateClass = node.state.toLowerCase();
                      return (
                        <div key={node.nodeId} className={`storage-node-box ${stateClass}`}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: 13 }}>{node.nodeId}</strong>
                            <span className={`badge badge-${stateClass}`}>{node.state}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {node.host}:{node.port}
                          </div>
                          <div style={{ fontSize: 11 }}>
                            Replicas: <strong>{node.fileCount ?? 0}</strong>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {node.storageDir}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <button
                              className="btn btn-danger btn-sm"
                              style={{ flex: 1 }}
                              onClick={() => handleSimulate(node.port)}
                            >
                              Fail
                            </button>
                            <button
                              className="btn btn-success btn-sm"
                              style={{ flex: 1 }}
                              onClick={() => handleRecover(node.port)}
                            >
                              Restore
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {nodes.length === 0 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        No storage nodes registered yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB: STORAGE NODES */}
          {activeTab === 'nodes' && (
            <div className="topology-card">
              <div className="topology-title">
                <span>Registered Storage Node Pool</span>
                <span className="badge badge-neutral">{nodes.length} Nodes Configured</span>
              </div>
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>Node ID</th>
                    <th>Network Address</th>
                    <th>Health State</th>
                    <th>Stored Files</th>
                    <th>Disk Footprint</th>
                    <th>Storage Directory</th>
                    <th>Last Heartbeat</th>
                    <th>Failure Simulation</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => (
                    <tr key={node.nodeId}>
                      <td>
                        <strong>{node.nodeId}</strong>
                      </td>
                      <td>
                        <code>
                          {node.host}:{node.port}
                        </code>
                      </td>
                      <td>
                        <span className={`badge badge-${node.state.toLowerCase()}`}>
                          {node.state === 'HEALTHY' && <CheckCircle2 size={12} />}
                          {node.state === 'SUSPECT' && <Clock size={12} />}
                          {node.state === 'DEAD' && <XCircle size={12} />}
                          {node.state}
                        </span>
                      </td>
                      <td>{node.fileCount ?? 0} replicas</td>
                      <td>{((node.diskUsedBytes ?? 0) / 1024).toFixed(1)} KB</td>
                      <td>
                        <code>{node.storageDir}</code>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(node.lastSeen).toLocaleTimeString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleSimulate(node.port)}
                          >
                            Simulate Outage
                          </button>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleRecover(node.port)}
                          >
                            Restore
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {nodes.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No registered storage nodes found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: FILES */}
          {activeTab === 'files' && (
            <>
              {/* Upload Dropzone */}
              <div className="topology-card">
                <div className="topology-title">
                  <span>Upload & Replicate File</span>
                  <span className="badge badge-neutral">Max 50 MB / File</span>
                </div>
                <label className="dropzone">
                  <UploadCloud size={36} style={{ color: 'var(--primary)', marginBottom: 12 }} />
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {uploading ? 'Replicating file across storage nodes...' : 'Click to select or drop file here'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Files will be verified via SHA-256 and stored across active nodes.
                  </div>
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                </label>
                {uploadMsg && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontSize: 13,
                      background:
                        uploadMsg.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                      color: uploadMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {uploadMsg.text}
                  </div>
                )}
              </div>

              {/* Files Table */}
              <div className="topology-card">
                <div className="topology-title">
                  <span>File Repository</span>
                  <span className="badge badge-neutral">{files.length} Files Tracked</span>
                </div>
                <table className="panel-table">
                  <thead>
                    <tr>
                      <th>Filename</th>
                      <th>Size</th>
                      <th>SHA-256 Checksum</th>
                      <th>Live Replicas</th>
                      <th>Uploaded At</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => {
                      const isFullyReplicated = file.replicas.length >= 3;
                      return (
                        <tr key={file.fileId}>
                          <td>
                            <strong>{file.originalName}</strong>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {file.fileId}
                            </div>
                          </td>
                          <td>{(file.sizeBytes / 1024).toFixed(1)} KB</td>
                          <td>
                            <code style={{ fontSize: 11 }}>
                              {file.checksum.substring(0, 16)}...
                            </code>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {file.replicas.map((r) => (
                                <span key={r.nodeId} className="badge badge-healthy">
                                  {r.nodeId}
                                </span>
                              ))}
                              {!isFullyReplicated && (
                                <span className="badge badge-dead">DEGRADED</span>
                              )}
                            </div>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {new Date(file.uploadedAt).toLocaleString()}
                          </td>
                          <td>
                            <a
                              href={api.getDownloadUrl(file.fileId)}
                              download={file.originalName}
                              className="btn btn-sm"
                            >
                              <Download size={12} /> Download
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                    {files.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          No files uploaded to the cluster yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* TAB: RECOVERY */}
          {activeTab === 'recovery' && (
            <div className="topology-card">
              <div className="topology-title">
                <span>Autonomous Self-Healing Event Timeline</span>
                <span className="badge badge-purple">{events.length} Historical Events</span>
              </div>
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>File ID</th>
                    <th>Source Node</th>
                    <th>Target Node</th>
                    <th>Status</th>
                    <th>Outcome / Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.eventId}>
                      <td style={{ fontSize: 11 }}>
                        {new Date(ev.startedAt).toLocaleTimeString()}
                      </td>
                      <td>
                        <code>{ev.fileId.substring(0, 12)}...</code>
                      </td>
                      <td>
                        <strong>{ev.sourceNodeId}</strong>
                      </td>
                      <td>
                        <strong>{ev.targetNodeId}</strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            ev.status === 'SUCCESS'
                              ? 'badge-healthy'
                              : ev.status === 'IN_PROGRESS'
                              ? 'badge-suspect'
                              : 'badge-dead'
                          }`}
                        >
                          {ev.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {ev.errorMessage ? (
                          <span style={{ color: 'var(--danger)' }}>{ev.errorMessage}</span>
                        ) : (
                          'Checksum validated & replica committed.'
                        )}
                      </td>
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No recovery events recorded yet. Trigger a node failure to observe recovery.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: LOGS */}
          {activeTab === 'logs' && (
            <div className="topology-card">
              <div className="topology-title">
                <span>Cluster Activity & Event Stream</span>
              </div>
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>Event Time</th>
                    <th>Category</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.eventId}>
                      <td style={{ fontSize: 11 }}>{new Date(ev.startedAt).toLocaleString()}</td>
                      <td>
                        <span className="badge badge-purple">RECOVERY</span>
                      </td>
                      <td>
                        Target-pull replication from <strong>{ev.sourceNodeId}</strong> to{' '}
                        <strong>{ev.targetNodeId}</strong> for file <code>{ev.fileId}</code> —{' '}
                        <strong>{ev.status}</strong>
                      </td>
                    </tr>
                  ))}
                  {nodes.map((n) => (
                    <tr key={`reg-${n.nodeId}`}>
                      <td style={{ fontSize: 11 }}>{new Date(n.registeredAt).toLocaleString()}</td>
                      <td>
                        <span className="badge badge-healthy">NODE</span>
                      </td>
                      <td>
                        Storage node <strong>{n.nodeId}</strong> registered on{' '}
                        <code>
                          {n.host}:{n.port}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="topology-card">
              <div className="topology-title">
                <span>Cluster Settings & Read-Only Topology Parameters</span>
                <span className="badge badge-neutral">Authoritative Backend Config</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div className="metric-card">
                  <div className="metric-header">Replication Factor</div>
                  <div className="metric-value">3 Replicas</div>
                  <div className="metric-sub">Full cluster redundancy target</div>
                </div>
                <div className="metric-card">
                  <div className="metric-header">Failure Timeout</div>
                  <div className="metric-value">15,000 ms</div>
                  <div className="metric-sub">Time before unanswering node is marked DEAD</div>
                </div>
                <div className="metric-card">
                  <div className="metric-header">Heartbeat Interval</div>
                  <div className="metric-value">5,000 ms</div>
                  <div className="metric-sub">Periodic ping from storage nodes</div>
                </div>
                <div className="metric-card">
                  <div className="metric-header">Max Upload Limit</div>
                  <div className="metric-value">50 MB</div>
                  <div className="metric-sub">Enforced streaming limit</div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
