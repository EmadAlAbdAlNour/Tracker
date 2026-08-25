// Ensure required environment variables are set before importing app modules
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://test:test@localhost:5432/tracker_test';
process.env.CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS ?? 'http://allowed.example.com,http://localhost:3000';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Set deterministic env for tokens and CORS
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://test:test@localhost:5432/tracker_test';
process.env.CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS ?? 'http://allowed.example.com,http://localhost:3000';

// Mock services and auth helpers before importing the app so middleware uses mocked functions
vi.mock('./services/authService', () => {
  return {
    loginUser: vi.fn(),
    refreshSession: vi.fn(),
    logoutUser: vi.fn(),
    listDrivers: vi.fn(),
    getCurrentDriverProfile: vi.fn(),
    getDriverById: vi.fn(),
    getDriverByUserId: vi.fn(),
  };
});

vi.mock('./lib/auth', () => {
  return {
    getUserById: vi.fn(),
    sanitizeUser: (u: any) => u,
    hasRole: (user: any, roles: string[]) => roles.includes(user.role),
    // expose small helpers if needed
  };
});

// Import the app after mocks are in place and required environment variables are set.
const { default: app } = await import('./app');

import * as authService from './services/authService';
import * as libAuth from './lib/auth';
import jwt from 'jsonwebtoken';

const agent = request(app);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Phase0 regression tests (auth, authorization, pagination, CORS)', () => {
  it('POST /api/auth/login - valid login returns tokens and user', async () => {
    const mockUser = { id: 'user-1', name: 'Test', email: 't@x', phone: null, role: 'ADMIN', active: true };
    (authService.loginUser as any).mockResolvedValue({ accessToken: 'access-x', refreshToken: 'refresh-token-abcdefghijklmnopqrstuvwxyz', user: mockUser });

    const res = await agent.post('/api/auth/login').send({ emailOrPhone: 't@x', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken', 'access-x');
    expect(res.body).toHaveProperty('refreshToken', 'refresh-token-abcdefghijklmnopqrstuvwxyz');
    expect(res.body).toHaveProperty('user');
  });

  it('POST /api/auth/refresh - returns rotated tokens', async () => {
    const mockUser = { id: 'user-1', name: 'Test', email: 't@x', phone: null, role: 'ADMIN', active: true };
    (authService.refreshSession as any).mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2', user: mockUser });

    const res = await agent.post('/api/auth/refresh').send({ refreshToken: 'refresh-token-abcdefghijklmnopqrstuvwxyz' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken', 'access-2');
    expect(res.body).toHaveProperty('refreshToken', 'refresh-2');
  });

  it('GET /api/auth/me - requires auth and returns user when token valid', async () => {
    // mock getUserById used by requireAuth
    const mockUser = { id: 'user-42', name: 'Driver', email: 'd@x', phone: null, role: 'DRIVER', active: true };
    (libAuth.getUserById as any).mockResolvedValue(mockUser);

    const token = jwt.sign({ sub: mockUser.id, role: mockUser.role }, process.env.JWT_SECRET!);
    const res = await agent.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.id).toBe(mockUser.id);
  });

  it('Protected endpoint without token returns 401', async () => {
    const res = await agent.get('/api/drivers');
    expect(res.status).toBe(401);
  });

  it('Protected endpoint with invalid token returns 401', async () => {
    const res = await agent.get('/api/drivers').set('Authorization', 'Bearer invalid.token');
    expect(res.status).toBe(401);
  });

  it('GET /api/drivers - admin role allowed, pagination preserved', async () => {
    // Mock user resolution to ADMIN
    const adminUser = { id: 'admin-1', name: 'Admin', email: 'a@x', phone: null, role: 'ADMIN', active: true };
    (libAuth.getUserById as any).mockResolvedValue(adminUser);

    // Mock listDrivers to return one item and total
    (authService.listDrivers as any).mockResolvedValue({ items: [{ id: 'd1', userId: 'u1', name: 'D1', email: 'd1@x', phone: null, role: 'DRIVER', active: true }], total: 1 });

    const token = jwt.sign({ sub: adminUser.id, role: adminUser.role }, process.env.JWT_SECRET!);
    const res = await agent.get('/api/drivers?page=1&limit=20').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 20);
    expect(res.body).toHaveProperty('total', 1);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('GET /api/drivers - driver role forbidden', async () => {
    const driverUser = { id: 'driver-1', name: 'D', email: 'd@x', phone: null, role: 'DRIVER', active: true };
    (libAuth.getUserById as any).mockResolvedValue(driverUser);

    const token = jwt.sign({ sub: driverUser.id, role: driverUser.role }, process.env.JWT_SECRET!);
    const res = await agent.get('/api/drivers?page=1&limit=20').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/drivers - invalid pagination returns 400', async () => {
    const adminUser = { id: 'admin-1', name: 'Admin', email: 'a@x', phone: null, role: 'ADMIN', active: true };
    (libAuth.getUserById as any).mockResolvedValue(adminUser);
    const token = jwt.sign({ sub: adminUser.id, role: adminUser.role }, process.env.JWT_SECRET!);

    const res = await agent.get('/api/drivers?page=0&limit=0').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('CORS - allowed origin is accepted', async () => {
    const res = await agent.get('/api/healthz').set('Origin', 'http://allowed.example.com');
    // For allowed origin, Access-Control-Allow-Origin should be set
    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.example.com');
  });

  it('CORS - disallowed origin is rejected (no header)', async () => {
    const res = await agent.get('/api/healthz').set('Origin', 'http://evil.example.com');
    // CORS rejection means no Access-Control-Allow-Origin header; status is still 200
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.status).toBe(200);
  });
});



