REPLICAGUARD-DC — START HERE
============================

This build adds a My Drive-style end-user dashboard while retaining the original
ReplicaGuard admin console (Overview, Storage Nodes, Files & Replicas, Recovery
Center, Activity Logs and Settings).

RUN ON WINDOWS
1. Install Node.js LTS: https://nodejs.org/
2. Extract the ZIP to a normal folder.
3. Double-click START-REPLICAGUARD.bat. It checks and repairs missing dependencies, builds the workspaces, and starts the app automatically.
4. Open the Vite Local URL shown in the service terminal, normally http://localhost:5173.
5. You do not need to run npm install, npm ci, or npm run build manually. Keep the service terminal open.

The first start needs internet access to install npm dependencies. Keep the service
terminal open while using the app.

USER DASHBOARD
Choose My Drive from the left sidebar. Upload, search and download files there.
Uploads go to the coordinator, which sends replicas to healthy storage nodes.
The page reports replica counts and checksum verification.

ADMIN DASHBOARD
Use Overview, Storage Nodes, Files & Replicas, Recovery Center, Activity Logs,
and Settings in the left sidebar. The original admin console is retained.

STORAGE
Storage node IDs remain node-1/node-2/node-3 for compatibility with the coordinator.
Their actual file directories are now:
  storage/server1
  storage/server2
  storage/server3
The startup script creates these folders.

IMPORTANT HONEST LIMITATIONS
- Three storage node processes run on one computer; they are not three separate
  physical servers.
- This is local development, not a public cloud deployment.
- Coordinator file metadata is persisted to data/metadata.json in this version. Keep backups of the data folder and storage directories.
- Build verification in the packaging environment was blocked because npm dependencies
  did not install completely. The launcher will attempt installation/build on your PC.
  If build fails, save the full terminal error output to troubleshoot.
- This is an educational demonstration; do not use it for confidential or irreplaceable files.


STORAGE PATH NOTE
Storage node replicas are stored under the repository-root storage/server1,
storage/server2, and storage/server3 directories. The node stores each replica
under its internal UUID filename (not the original user filename). Restart all
services after applying a storage-path fix, then upload a fresh test file.


IMPORTANT STORAGE / REPLICATION NOTES
=====================================
Expected replica directories are at the project root:
  storage\server1  (node-1 / port 4101)
  storage\server2  (node-2 / port 4102)
  storage\server3  (node-3 / port 4103)

The root npm dev script sets STORAGE_DIR explicitly for each node. The storage
node writes the binary body to <storageDir>/<fileId>, where fileId is a generated
UUID. Therefore Windows Explorer shows UUID-named files, not the original upload
filename. The coordinator only records a replica when the storage node returns
HTTP success and the returned SHA-256 checksum matches the source bytes.

After starting this version, upload a NEW test file and check all three folders.
Older dashboard records may be in-memory metadata from a previous running
process and do not prove that bytes are present in the new folders. Stop all old
ReplicaGuard terminals before starting this copy to avoid port conflicts.

Run CHECK-STORAGE-FOLDERS.bat to inspect the three directories.

BUILD ORDER FIX
==============
The root build now compiles @replicaguard/shared first, then storage-node,
coordinator, and web. This prevents coordinator TypeScript from resolving the
shared package before its dist/index.d.ts has been generated.
