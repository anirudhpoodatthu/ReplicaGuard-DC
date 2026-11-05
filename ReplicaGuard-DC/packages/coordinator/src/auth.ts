import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FastifyRequest } from 'fastify';

type User = { id: string; email: string; salt: string; passwordHash: string; role: 'user' | 'admin'; createdAt: string };
const dataDir = path.resolve(process.cwd(), 'data');
const usersPath = path.join(dataDir, 'users.json');
const secret = process.env['AUTH_SECRET'] || 'CHANGE-ME-ReplicaGuard-local-only-secret-please-set-AUTH_SECRET';
function readUsers(): User[] {
  try { return JSON.parse(fs.readFileSync(usersPath, 'utf8')) as User[]; } catch { return []; }
}
function writeUsers(users: User[]) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), { mode: 0o600 }); }
function sign(value: string) { return crypto.createHmac('sha256', secret).update(value).digest('base64url'); }
export function createAccount(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { statusCode: 400 });
  if (password.length < 10) throw Object.assign(new Error('Password must contain at least 10 characters.'), { statusCode: 400 });
  const users = readUsers();
  if (users.some(u => u.email === email)) throw Object.assign(new Error('An account with this email already exists.'), { statusCode: 409 });
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const user: User = { id: crypto.randomUUID(), email, salt, passwordHash, role: users.length === 0 && process.env['BOOTSTRAP_FIRST_USER_ADMIN'] === 'true' ? 'admin' : 'user', createdAt: new Date().toISOString() };
  users.push(user); writeUsers(users); return { token: makeToken(user), user: { id: user.id, email: user.email, role: user.role } };
}
export function login(emailRaw: string, password: string) {
  const user = readUsers().find(u => u.email === emailRaw.trim().toLowerCase());
  const actual = user ? crypto.scryptSync(password, user.salt, 64) : Buffer.alloc(64);
  const expected = Buffer.from(user?.passwordHash || '00'.repeat(64), 'hex');
  if (!user || expected.length !== actual.length || !crypto.timingSafeEqual(actual, expected)) throw Object.assign(new Error('Invalid email or password.'), { statusCode: 401 });
  return { token: makeToken(user), user: { id: user.id, email: user.email, role: user.role } };
}
function makeToken(user: User) { const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, role: user.role, exp: Date.now() + 7 * 86400000 })).toString('base64url'); return `${payload}.${sign(payload)}`; }
export type AuthUser = { id: string; email: string; role: 'user' | 'admin' };
export function getUser(req: FastifyRequest): AuthUser | null {
  const header = req.headers.authorization || '';
  const queryToken = (req.query as any)?.token;
  const token = header.startsWith('Bearer ') ? header.slice(7) : (typeof queryToken === 'string' ? queryToken : '');
  if (!token) return null; const parts = token.split('.'); if (parts.length !== 2) return null;
  const expected = sign(parts[0]); const a = Buffer.from(parts[1]); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p: { sub: string; email: string; role: 'user' | 'admin'; exp: number } = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); if (p.exp < Date.now() || !readUsers().some(u => u.id === p.sub)) return null; return { id: p.sub, email: p.email, role: p.role }; } catch { return null; }
}
export function requireUser(req: FastifyRequest) { const user = getUser(req); if (!user) throw Object.assign(new Error('Sign in to access your files.'), { statusCode: 401 }); return user; }
export function requireAdmin(req: FastifyRequest) { const user = requireUser(req); if (user.role !== 'admin') throw Object.assign(new Error('Administrator access required.'), { statusCode: 403 }); return user; }
