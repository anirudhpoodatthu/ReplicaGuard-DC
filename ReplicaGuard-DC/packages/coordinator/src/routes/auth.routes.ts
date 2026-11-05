import { FastifyInstance } from 'fastify';
import { createAccount, login, requireUser } from '../auth';
export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email?: string; password?: string } }>('/auth/signup', async (req, reply) => {
    try { const { email, password } = req.body || {}; if (!email || !password) return reply.code(400).send({ message: 'Email and password are required.' }); return reply.code(201).send(createAccount(email, password)); }
    catch (e: any) { return reply.code(e.statusCode || 500).send({ message: e.message || 'Signup failed.' }); }
  });
  app.post<{ Body: { email?: string; password?: string } }>('/auth/login', async (req, reply) => {
    try { const { email, password } = req.body || {}; if (!email || !password) return reply.code(400).send({ message: 'Email and password are required.' }); return reply.send(login(email, password)); }
    catch (e: any) { return reply.code(e.statusCode || 500).send({ message: e.message || 'Login failed.' }); }
  });
  app.get('/auth/me', async req => ({ user: requireUser(req) }));
}
