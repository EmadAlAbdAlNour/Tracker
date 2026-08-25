// Ensure CORS configuration is set before importing app
process.env.CORS_ALLOWED_ORIGINS = 'https://tracker-web-psi.vercel.app,http://localhost:3000,http://allowed.example.com';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/tracker_test';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

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
  };
});

// Import the app after mocks are in place and required environment variables are set.
const { default: app } = await import('./app');

describe('CORS Configuration (Production)', () => {
  const agent = request(app);

  describe('Allowed origins', () => {
    it('allows production frontend origin: https://tracker-web-psi.vercel.app', async () => {
      const res = await agent
        .get('/api/healthz')
        .set('Origin', 'https://tracker-web-psi.vercel.app');
      
      expect(res.headers['access-control-allow-origin']).toBe('https://tracker-web-psi.vercel.app');
      expect(res.status).toBe(200);
    });

    it('allows localhost for local development', async () => {
      const res = await agent
        .get('/api/healthz')
        .set('Origin', 'http://localhost:3000');
      
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.status).toBe(200);
    });

    it('allows example.com for testing', async () => {
      const res = await agent
        .get('/api/healthz')
        .set('Origin', 'http://allowed.example.com');
      
      expect(res.headers['access-control-allow-origin']).toBe('http://allowed.example.com');
      expect(res.status).toBe(200);
    });
  });

  describe('Disallowed origins', () => {
    it('rejects unknown origins with proper CORS rejection (not 500)', async () => {
      const res = await agent
        .get('/api/healthz')
        .set('Origin', 'https://evil.example.com');
      
      // Should NOT have the Access-Control-Allow-Origin header
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      // Should NOT be a 500 error (cors should reject cleanly)
      expect(res.status).not.toBe(500);
      expect(res.status).toBe(200);
    });

    it('rejects mismatched protocol (https vs http)', async () => {
      const res = await agent
        .get('/api/healthz')
        .set('Origin', 'https://localhost:3000');
      
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.status).not.toBe(500);
    });
  });

  describe('No Origin header', () => {
    it('allows requests with no Origin header (mobile/server-to-server compatibility)', async () => {
      const res = await agent
        .get('/api/healthz');
      
      // Should succeed (no Origin = no CORS check needed)
      expect(res.status).toBe(200);
    });

    it('allows POST requests with no Origin header', async () => {
      const res = await agent
        .post('/api/auth/login')
        .send({ emailOrPhone: 'test@example.com', password: 'test123' });
      
      // Will fail auth (no valid user), but should not fail CORS
      expect(res.status).not.toBe(500);
    });
  });

  describe('Credentials', () => {
    it('allows credentials with allowed origin', async () => {
      const res = await agent
        .get('/api/healthz')
        .set('Origin', 'https://tracker-web-psi.vercel.app');
      
      // Credentials should be allowed
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});
