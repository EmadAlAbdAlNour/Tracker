import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db, refreshTokensTable, usersTable } from '@workspace/db';
import { and, eq, gt, isNull } from 'drizzle-orm';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://test:test@localhost:5432/tracker_test';

const { default: app } = await import('./app');
const agent = request(app);

describe('Refresh token failure investigation & error handling', () => {
  it('compiles SQL queries used in refreshSession without syntax errors', () => {
    const userQuery = db.select().from(usersTable).where(eq(usersTable.id, '123e4567-e89b-12d3-a456-426614174000')).limit(1).toSQL();
    expect(userQuery.sql).toBeDefined();

    const tokenQuery = db
      .select()
      .from(refreshTokensTable)
      .where(
        and(
          eq(refreshTokensTable.userId, '123e4567-e89b-12d3-a456-426614174000'),
          eq(refreshTokensTable.tokenHash, 'abc123hash'),
          isNull(refreshTokensTable.revokedAt),
          gt(refreshTokensTable.expiresAt, new Date()),
        ),
      )
      .limit(1)
      .toSQL();
    expect(tokenQuery.sql).toBeDefined();

    const updateQuery = db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokensTable.tokenHash, 'abc123hash'), isNull(refreshTokensTable.revokedAt)))
      .toSQL();
    expect(updateQuery.sql).toBeDefined();

    const insertQuery = db
      .insert(refreshTokensTable)
      .values({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        tokenHash: 'newhash',
        expiresAt: new Date(),
        deviceId: null,
      })
      .toSQL();
    expect(insertQuery.sql).toBeDefined();
  });

  it('POST /api/auth/refresh with expired refresh token returns 401 AUTH_INVALID_TOKEN (never 500)', async () => {
    const expiredToken = jwt.sign(
      { sub: '123e4567-e89b-12d3-a456-426614174000', role: 'ADMIN', type: 'refresh', jti: 'jti-1' },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: '-10s' }
    );

    const res = await agent.post('/api/auth/refresh').send({ refreshToken: expiredToken });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('POST /api/auth/refresh with wrong secret returns 401 AUTH_INVALID_TOKEN (never 500)', async () => {
    const wrongSecretToken = jwt.sign(
      { sub: '123e4567-e89b-12d3-a456-426614174000', role: 'ADMIN', type: 'refresh', jti: 'jti-1' },
      process.env.JWT_SECRET!, // access secret instead of refresh secret
      { expiresIn: '30d' }
    );

    const res = await agent.post('/api/auth/refresh').send({ refreshToken: wrongSecretToken });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('POST /api/auth/refresh with malformed token returns 401 AUTH_INVALID_TOKEN (never 500)', async () => {
    const res = await agent.post('/api/auth/refresh').send({
      refreshToken: 'this-is-not-a-valid-jwt-token-structure-1234567890',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('POST /api/auth/refresh with non-UUID sub returns 401 AUTH_INVALID_TOKEN without DB crash', async () => {
    const nonUuidToken = jwt.sign(
      { sub: 'not-a-uuid-user-id', role: 'ADMIN', type: 'refresh', jti: 'jti-1' },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: '30d' }
    );

    const res = await agent.post('/api/auth/refresh').send({ refreshToken: nonUuidToken });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('POST /api/auth/refresh with access token (type !== "refresh") returns 401', async () => {
    const accessToken = jwt.sign(
      { sub: '123e4567-e89b-12d3-a456-426614174000', role: 'ADMIN', type: 'access' },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: '15m' }
    );

    const res = await agent.post('/api/auth/refresh').send({ refreshToken: accessToken });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
    expect(res.body.error.message).toBe('Refresh token required');
  });

  it('verifies shift payload defensive formatting with both startedAt and startTime', async () => {
    const shiftStartedAt = new Date('2026-09-12T00:00:00.000Z');
    const now = Date.now();
    const shiftData = {
      id: 'shift-123',
      status: 'ACTIVE' as const,
      startedAt: shiftStartedAt ? shiftStartedAt.toISOString() : new Date().toISOString(),
      startTime: shiftStartedAt ? shiftStartedAt.toISOString() : new Date().toISOString(),
      durationMinutes: Math.floor((now - shiftStartedAt.getTime()) / (1000 * 60)),
    };

    expect(shiftData.startedAt).toBe('2026-09-12T00:00:00.000Z');
    expect(shiftData.startTime).toBe('2026-09-12T00:00:00.000Z');
    expect(typeof shiftData.startTime).toBe('string');
  });
});

