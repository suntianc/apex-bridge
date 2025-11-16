import express, { Express } from 'express';
import request from 'supertest';
import {
  exportPreferences,
  importPreferences,
  listPreferences,
} from '../../src/api/controllers/PreferenceController';

describe('Preference bulk import/export integration', () => {
  let app: Express;
  const userId = 'e2e-user-bulk';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.get('/api/preferences', (req, res) => listPreferences(req as any, res as any));
    app.get('/api/preferences/export', (req, res) => exportPreferences(req as any, res as any));
    app.post('/api/preferences/import', (req, res) => importPreferences(req as any, res as any));
  });

  it('exports empty then imports and lists', async () => {
    const initial = await request(app).get('/api/preferences/export').query({ userId }).expect(200);
    expect(initial.body?.success).toBe(true);
    expect(Array.isArray(initial.body?.preferences)).toBe(true);

    const imported = await request(app)
      .post('/api/preferences/import')
      .set('x-admin-role', 'admin')
      .send({
        userId,
        preferences: [
          { type: 'toolsDisclosure', value: 'metadata' },
          { type: 'foo', value: 'bar' },
        ],
      })
      .expect(200);
    expect(imported.body?.success).toBe(true);
    expect(imported.body?.imported).toBeGreaterThanOrEqual(2);

    const list = await request(app).get('/api/preferences').query({ userId }).expect(200);
    expect(list.body?.success).toBe(true);
    expect(list.body?.preferences.some((p: any) => p.type === 'foo' && p.value === 'bar')).toBe(true);
  });
});


