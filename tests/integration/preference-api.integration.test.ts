import express, { Express } from 'express';
import request from 'supertest';
import {
  listPreferences,
  createPreference,
  updatePreference,
  deletePreference,
} from '../../src/api/controllers/PreferenceController';

describe('Preference API integration (Express wiring)', () => {
  jest.setTimeout(20000);
  let app: Express;
  const userId = 'e2e-user-1';

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // 简单路由装配（与服务装配层等价的最小映射）
    app.get('/api/preferences', (req, res) => listPreferences(req as any, res as any));
    app.post('/api/preferences', (req, res) => createPreference(req as any, res as any));
    app.put('/api/preferences/:id', (req, res) => updatePreference(req as any, res as any));
    app.delete('/api/preferences/:id', (req, res) => deletePreference(req as any, res as any));
  });

  it('should create, list, update and delete a preference', async () => {
    // create
    const createRes = await request(app)
      .post('/api/preferences')
      .set('x-admin-role', 'admin')
      .send({
        userId,
        preference: {
          type: 'toolsDisclosure',
          value: 'brief',
          confidence: 0.9,
        },
      })
      .expect(200);
    expect(createRes.body?.success).toBe(true);
    const prefId = createRes.body?.preference?.id;
    expect(prefId).toBeDefined();

    // list
    const listRes = await request(app)
      .get('/api/preferences')
      .query({ userId })
      .expect(200);
    expect(listRes.body?.success).toBe(true);
    expect(Array.isArray(listRes.body?.preferences)).toBe(true);
    expect(listRes.body?.preferences.some((p: any) => p.id === prefId)).toBe(true);

    // update
    const updateRes = await request(app)
      .put(`/api/preferences/${encodeURIComponent(prefId)}`)
      .set('x-admin-role', 'admin')
      .send({
        userId,
        preference: {
          value: 'full',
        },
      })
      .expect(200);
    expect(updateRes.body?.success).toBe(true);
    expect(updateRes.body?.preference?.value).toBe('full');

    // delete
    const deleteRes = await request(app)
      .delete(`/api/preferences/${encodeURIComponent(prefId)}`)
      .set('x-admin-role', 'admin')
      .query({ userId })
      .expect(200);
    expect(deleteRes.body?.success).toBe(true);
  });
});


