import fs from 'node:fs';
import path from 'node:path';
import { FileRecord, MetadataStore, NodeRecord, NodeState, RecoveryEvent, ReplicaRecord } from '@replicaguard/shared';

/**
 * In-memory implementation of MetadataStore.
 * Provides fast, synchronous Map-backed storage for nodes, files, and recovery events.
 */
export class InMemoryMetadataStore implements MetadataStore {
  private readonly nodes = new Map<string, NodeRecord>();
  private readonly files = new Map<string, FileRecord>();
  private readonly events: RecoveryEvent[] = [];
  private readonly persistencePath = path.resolve(process.env['METADATA_FILE'] ?? 'data/metadata.json');

  constructor() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.persistencePath, 'utf8')) as { nodes?: any[]; files?: any[]; events?: any[] };
      for (const n of saved.nodes ?? []) this.nodes.set(n.nodeId, { ...n, registeredAt: new Date(n.registeredAt), lastSeen: new Date(n.lastSeen) });
      for (const f of saved.files ?? []) this.files.set(f.fileId, { ...f, uploadedAt: new Date(f.uploadedAt), replicas: (f.replicas ?? []).map((r: any) => ({ ...r, storedAt: new Date(r.storedAt) })) });
      for (const e of saved.events ?? []) this.events.push({ ...e, startedAt: new Date(e.startedAt), completedAt: e.completedAt ? new Date(e.completedAt) : undefined });
    } catch { /* First start: no metadata file yet. */ }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.persistencePath), { recursive: true });
    const temp = `${this.persistencePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ nodes: [...this.nodes.values()], files: [...this.files.values()], events: this.events }, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.persistencePath);
  }

  // ── Nodes ──────────────────────────────────────────────────────────────────

  registerNode(node: NodeRecord): void {
    this.nodes.set(node.nodeId, { ...node });
    this.persist();
  }

  getNode(nodeId: string): NodeRecord | undefined {
    const node = this.nodes.get(nodeId);
    return node ? { ...node } : undefined;
  }

  listNodes(): NodeRecord[] {
    return Array.from(this.nodes.values()).map((n) => ({ ...n }));
  }

  updateNodeState(nodeId: string, state: NodeState): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.state = state;
      this.persist();
    }
  }

  updateHeartbeat(
    nodeId: string,
    lastSeen: Date,
    diskUsedBytes?: number,
    fileCount?: number,
  ): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.lastSeen = lastSeen;
      if (diskUsedBytes !== undefined) node.diskUsedBytes = diskUsedBytes;
      if (fileCount !== undefined) node.fileCount = fileCount;
      // If node was SUSPECT or DEAD, receiving a heartbeat restores it to HEALTHY
      node.state = NodeState.HEALTHY;
      this.persist();
    }
  }

  // ── Files ──────────────────────────────────────────────────────────────────

  saveFile(file: FileRecord): void {
    this.files.set(file.fileId, {
      ...file,
      replicas: file.replicas.map((r) => ({ ...r })),
    });
    this.persist();
  }

  getFile(fileId: string): FileRecord | undefined {
    const file = this.files.get(fileId);
    return file
      ? {
          ...file,
          replicas: file.replicas.map((r) => ({ ...r })),
        }
      : undefined;
  }

  listFiles(): FileRecord[] {
    return Array.from(this.files.values()).map((f) => ({
      ...f,
      replicas: f.replicas.map((r) => ({ ...r })),
    }));
  }

  addReplica(fileId: string, replica: ReplicaRecord): void {
    const file = this.files.get(fileId);
    if (file) {
      const exists = file.replicas.some((r) => r.nodeId === replica.nodeId);
      if (!exists) {
        file.replicas.push({ ...replica });
        this.persist();
      }
    }
  }

  removeReplica(fileId: string, nodeId: string): void {
    const file = this.files.get(fileId);
    if (file) {
      file.replicas = file.replicas.filter((r) => r.nodeId !== nodeId);
      this.persist();
    }
  }

  // ── Recovery Events ────────────────────────────────────────────────────────

  appendEvent(event: RecoveryEvent): void {
    this.events.push({ ...event });
    this.persist();
  }

  updateEvent(eventId: string, patch: Partial<RecoveryEvent>): void {
    const event = this.events.find((e) => e.eventId === eventId);
    if (event) {
      Object.assign(event, patch);
      this.persist();
    }
  }

  listEvents(opts?: {
    limit?: number;
    fileId?: string;
    status?: string;
  }): RecoveryEvent[] {
    let res = [...this.events];
    if (opts?.fileId) {
      res = res.filter((e) => e.fileId === opts.fileId);
    }
    if (opts?.status) {
      res = res.filter((e) => e.status === opts.status);
    }
    // Return newest first
    res.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    if (opts?.limit && opts.limit > 0) {
      res = res.slice(0, opts.limit);
    }
    return res.map((e) => ({ ...e }));
  }
}
