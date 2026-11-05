import type { CoordinatorStatus, NodeItem, FileItem, RecoveryEventItem } from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4100';
const authHeaders = (): Record<string, string> => { const token = localStorage.getItem('rg_token'); return token ? { Authorization: `Bearer ${token}` } : {}; };
async function checked(res: Response) { if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || `Request failed (${res.status})`); } return res; }

export const api = {
  async health(): Promise<boolean> { const res = await fetch(`${API_BASE}/health`); return res.ok; },
  async authenticate(mode: 'login' | 'signup', email: string, password: string): Promise<any> { const res = await fetch(`${API_BASE}/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); await checked(res); return res.json(); },
  async me(): Promise<any> { const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() }); await checked(res); return res.json(); },
  async getStatus(): Promise<CoordinatorStatus> {
    const res = await fetch(`${API_BASE}/status`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch cluster status`);
    return res.json();
  },

  async getNodes(): Promise<NodeItem[]> {
    const res = await fetch(`${API_BASE}/nodes`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch nodes`);
    const data = await res.json();
    return data.nodes || [];
  },

  async getFiles(): Promise<FileItem[]> {
    const res = await fetch(`${API_BASE}/files`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch files`);
    const data = await res.json();
    return data.files || [];
  },

  async getRecoveryEvents(limit = 20): Promise<RecoveryEventItem[]> {
    const res = await fetch(`${API_BASE}/recovery/events?limit=${limit}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch recovery events`);
    const data = await res.json();
    return data.events || [];
  },

  async uploadFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/files`, {
      method: 'POST',
      body: formData,
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Upload failed with status ${res.status}`);
    }
    return res.json();
  },

  getDownloadUrl(fileId: string): string {
    const token = localStorage.getItem('rg_token') || '';
    return `${API_BASE}/files/${fileId}?token=${encodeURIComponent(token)}`;
  },

  async simulateFailure(port: number): Promise<void> {
    const res = await fetch(`http://localhost:${port}/admin/simulate-failure`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to simulate failure on port ${port}`);
  },

  async recoverNode(port: number): Promise<void> {
    const res = await fetch(`http://localhost:${port}/admin/recover`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to recover node on port ${port}`);
  },
};
