import apiClient from './client';

export interface PreferenceDTO {
  id?: string;
  userId: string;
  key: string;
  value: unknown;
  source?: string;
  ttlMs?: number | null;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string | null;
}

export interface ListPreferencesQuery {
  userId: string;
}

export async function listPreferences(params: ListPreferencesQuery): Promise<PreferenceDTO[]> {
  const res = await apiClient.get('/api/preferences', { params });
  return (res as any).data?.data ?? (res as any).data ?? [];
}

export async function createPreference(pref: PreferenceDTO): Promise<PreferenceDTO> {
  const res = await apiClient.post('/api/preferences', pref);
  return (res as any).data?.data ?? (res as any).data;
}

export async function updatePreference(id: string, pref: Partial<PreferenceDTO>): Promise<PreferenceDTO> {
  const res = await apiClient.put(`/api/preferences/${encodeURIComponent(id)}`, pref);
  return (res as any).data?.data ?? (res as any).data;
}

export async function deletePreference(id: string): Promise<void> {
  await apiClient.delete(`/api/preferences/${encodeURIComponent(id)}`);
}

export async function exportPreferencesApi(userId: string): Promise<{ userId: string; preferences: PreferenceDTO[] }> {
  const res = await apiClient.get('/api/preferences/export', { params: { userId } });
  const data = (res as any).data?.data ?? (res as any).data;
  return data;
}

export async function importPreferencesApi(userId: string, preferences: Array<Pick<PreferenceDTO, 'key'|'value'|'source'|'ttlMs'>>): Promise<{ imported: number }> {
  const payload = {
    userId,
    // 兼容后端需要的 shape：type/value/confidence/context
    preferences: preferences.map((p) => ({
      type: p.key,
      value: p.value,
      context: { source: p.source },
      ttlMs: p.ttlMs
    }))
  };
  const res = await apiClient.post('/api/preferences/import', payload);
  const data = (res as any).data?.data ?? (res as any).data;
  return data;
}


