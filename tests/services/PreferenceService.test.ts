import { PreferenceService } from '../../src/services/PreferenceService';

describe('PreferenceService', () => {
  test('merges defaults < user < session with precedence', () => {
    const svc = new PreferenceService({ lang: 'en', toolsDisclosure: 'metadata' });
    svc.setUserPreferences('u1', { lang: 'zh', defaultCity: 'Shanghai' });
    let view = svc.getView({ userId: 'u1' });
    expect(view.merged.lang.value).toBe('zh');
    expect(view.merged.toolsDisclosure.value).toBe('metadata');
    expect(view.merged.defaultCity.value).toBe('Shanghai');

    svc.setSessionPreferences('s1', { toolsDisclosure: 'brief' });
    view = svc.getView({ userId: 'u1', sessionId: 's1' });
    expect(view.merged.toolsDisclosure.value).toBe('brief');
    expect(view.merged.lang.value).toBe('zh');
  });

  test('respects TTL expiration', async () => {
    const svc = new PreferenceService({ region: 'US' });
    svc.setUserPreferences('u2', { region: 'CN' }, { ttlMs: 10 });
    let view = svc.getView({ userId: 'u2' });
    expect(view.merged.region.value).toBe('CN');
    await new Promise((r) => setTimeout(r, 25));
    svc.sweepExpired();
    view = svc.getView({ userId: 'u2' });
    expect(view.merged.region.value).toBe('US');
  });

  test('runtime defaults overlay provided via getView(defaults)', () => {
    const svc = new PreferenceService({ lang: 'en' });
    const view = svc.getView({ userId: 'u3', defaults: { lang: 'jp', theme: 'dark' as any } });
    expect(view.merged.lang.value).toBe('jp');
    expect(view.merged.theme.value).toBe('dark');
    expect(view.sources.default).toBeTruthy();
  });
});


