# ReplicaGuard: Self-Healing Distributed File Storage System

ReplicaGuard is an educational, distributed file storage system inspired by the design principles of the **Google File System (GFS)**. It features independent storage node processes, dynamic heartbeat monitoring, automatic fault detection, and target-pull replica self-healing.

---

## 🏛 Architecture & Design

ReplicaGuard runs on a single computer simulating a distributed cluster through separate operating-system processes, distinct network ports, and isolated local storage directories:

- **Coordinator (Master)** — `http://localhost:4100`:
  - Central metadata store tracking file IDs, names, sizes, SHA-256 checksums, and replica locations.
  - Heartbeat monitor maintaining node states: `HEALTHY`, `SUSPECT`, `DEAD`.
  - Placement engine for initial uploads and recovery orchestration.
  - System status and queryable recovery event audit log.
- **Storage Node 1** — `http://localhost:4101` (`storage/node-1/`)
- **Storage Node 2** — `http://localhost:4102` (`storage/node-2/`)
- **Storage Node 3** — `http://localhost:4103` (`storage/node-3/`)
- **Storage Node 4 (Optional Spare)** — `http://localhost:4104` (`storage/node-4/`)

```
                          ┌────────────────────────┐
                          │   Client (CLI/curl)    │
                          └───────────┬────────────┘
                                      │
                   Upload / Download  │ Status / Query
                                      ▼
                          ┌────────────────────────┐
                          │   Coordinator (:4100)  │
                          │   (Metadata, Monitor)  │
                          └─────┬────────────┬─────┘
                                │            │
           Heartbeats & Placement            │ Placement & Recovery
                                │            │
         ┌──────────────────────┼────────────┴─────────┐
         ▼                      ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Storage Node 1  │  │  Storage Node 2  │  │  Storage Node 3  │  │ Storage Node 4  │
│  (:4101)         │  │  (:4102)         │  │  (:4103)         │  │ (:4104 - Spare)  │
└────────┬─────────┘  └──────────────────┘  └──────────────────┘  └────────▲─────────┘
         │                                                                 │
         └──────────────── Target-Pull Replica Copy ───────────────────────┘
```

### Self-Healing & Target-Pull Recovery
1. The **Coordinator** periodically checks node heartbeats. If a node fails to report within `FAILURE_TIMEOUT_MS` (default ~15s), it is marked `DEAD`.
2. The **RecoveryEngine** discovers files with fewer than `REPLICATION_FACTOR` (default 3) live replicas.
3. The Coordinator selects a healthy source replica and an eligible spare node without a replica (e.g., `Node 4` or a recovered node).
4. The destination node receives an authenticated target-pull command and streams the file **directly from the source node**.
5. The destination node verifies the SHA-256 checksum **before storing**. Only upon destination confirmation does the Coordinator record the new replica.
6. If no spare node is available, the system honestly reports the file as `DEGRADED` rather than falsely claiming it is healed.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18.0.0+ (Tested on v24.19.0)
- **npm**: v7.0.0+ (npm workspaces support)

### 2. Setup
```bash
# Clone and install dependencies
npm install

# Build all TypeScript packages
npm run build

# Run full test suite across all packages (58 unit & integration tests)
npm test
```

### 3. Run the Cluster
In your primary terminal, start the Coordinator and Storage Nodes 1, 2, and 3:
```bash
npm run dev
```

In a second terminal, you can start the spare Node 4 when needed for recovery experiments:
```bash
npm run dev:spare
```

---

## 📖 API Usage & Demo Walkthrough

### 1. Check System Status
```bash
curl http://localhost:4100/status
```
Response:
```json
{
  "coordinator": { "uptimeSeconds": 12, "timestamp": "..." },
  "nodes": { "total": 3, "healthy": 3, "suspect": 0, "dead": 0 },
  "files": { "total": 0, "fullyReplicated": 0, "underReplicated": 0 },
  "recovery": { "inProgress": 0, "recentEvents": [] }
}
```

### 2. Upload a File
Upload any file using `multipart/form-data`:
```bash
curl -F "file=@README.md" http://localhost:4100/files
```
Response:
```json
{
  "fileId": "6c45781a-c5ad-4ee1-b0f9-232d3e421c99",
  "originalName": "README.md",
  "sizeBytes": 4210,
  "checksum": "sha256:d8a2...",
  "status": "FULLY_REPLICATED",
  "replicas": [
    { "nodeId": "node-1", "storedAt": "..." },
    { "nodeId": "node-2", "storedAt": "..." },
    { "nodeId": "node-3", "storedAt": "..." }
  ]
}
```

### 3. Download and Verify File
Download the file by ID. The Coordinator proxies the stream from a verified healthy replica:
```bash
curl http://localhost:4100/files/6c45781a-c5ad-4ee1-b0f9-232d3e421c99 -o downloaded.md
```

### 4. Inspect File Metadata
```bash
curl http://localhost:4100/files/6c45781a-c5ad-4ee1-b0f9-232d3e421c99/metadata
```

---

## 🧪 Self-Healing Failure Simulation Walkthrough

### Step A: Simulate Node 2 Failure
Instead of killing the process, ReplicaGuard provides an administrative failure simulator endpoint:
```bash
curl -X POST http://localhost:4102/admin/simulate-failure
```
*Effect:* Node 2 immediately halts sending heartbeats and begins rejecting file access requests with HTTP 503.

### Step B: Observe Fault Detection
Watch the Coordinator console or query `/status`:
- Within ~5 seconds, Node 2 transitions from `HEALTHY` to `SUSPECT`.
- Within ~15 seconds, Node 2 transitions to `DEAD`.
```bash
curl http://localhost:4100/status
```
`nodes.dead` will report `1`, and `files.underReplicated` will report `1`.

### Step C: Honest Degraded Reporting (Without Spare)
With only Nodes 1 and 3 healthy, and a replication factor of 3, the file cannot be healed onto an existing node that already holds a copy. The status honestly reflects `underReplicated: 1`.

### Step D: Introduce Spare Node 4 for Self-Healing
Start Node 4 in another terminal:
```bash
npm run dev:spare
```
Node 4 registers itself with the Coordinator as `HEALTHY`.
During the next recovery scan (within 10s):
1. The Coordinator detects that Node 4 is eligible to receive a replica of the file.
2. The Coordinator dispatches a target-pull request to Node 4.
3. Node 4 pulls the file directly from healthy Node 1.
4. Node 4 calculates the SHA-256 checksum and confirms integrity.
5. The Coordinator updates file metadata and logs a `SUCCESS` event.

Verify recovery:
```bash
curl http://localhost:4100/recovery/events
curl http://localhost:4100/status
```
`files.fullyReplicated` returns to `1`!

### Step E: Recover Node 2
Restore Node 2 to normal operation:
```bash
curl -X POST http://localhost:4102/admin/recover
```
Node 2 resumes sending heartbeats and the Coordinator welcomes it back into the healthy pool.

---

## 🔒 Security & Reliability Architecture
- **Strict UUID v4 Validation:** All file paths are strictly validated as UUID v4 before touching the filesystem, completely neutralizing directory traversal (`../`) attacks.
- **Atomic File Writes:** Replicas are written to temporary files and atomically renamed to their final path upon completion to prevent partially written or corrupted files.
- **SSRF Prevention:** Recovery pull endpoints only accept connections from verified localhost/storage-node hosts.
- **Bounded In-Flight Limits:** The 50 MB limit is enforced during streaming upload reception by Fastify, preventing unbounded memory consumption.

---

## 📚 Educational Distributed Systems Trade-offs & Limitations
1. **Coordinator In-Memory State:** File and node metadata is stored in-memory behind a `MetadataStore` interface. If the Coordinator process stops, metadata is cleared. (A production version would swap in PostgreSQL).
2. **Single Coordinator (SPOF):** For clarity in teaching distributed replication principles, consensus leader election (e.g. Raft) is omitted in Phase 1.
3. **No Chunking:** Files are treated as single whole-file blobs rather than splitting into 64 MB chunks as in full-scale GFS.
