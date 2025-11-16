import { SkillsToToolMapper } from '../../src/core/skills/SkillsToToolMapper';

// 该测试验证：当工具参数缺省时，会从偏好对象中补全默认值（不依赖完整装配）

class FakeSkillsIndex {
  private metas: any[];
  constructor(metas: any[]) {
    this.metas = metas;
  }
  getAllMetadata() {
    return this.metas;
  }
}

describe('Preference → Tool parameter defaults (mapper-level)', () => {
  test('fills missing params from preferences when schema has no default', async () => {
    const meta = {
      name: 'DemoAsyncTask',
      displayName: 'Demo Async Task',
      description: 'Demo',
      abp: {
        tools: [
          {
            name: 'DemoAsyncTask',
            parameters: {
              foo: { type: 'string', description: 'test param' }, // no schema default
              keep: { type: 'string', default: 'schema-default' }, // has default, should not be overridden by pref
            },
          },
        ],
      },
    };
    const index: any = new FakeSkillsIndex([meta]);
    const mapper = new SkillsToToolMapper(index);

    const execReq = await mapper.convertToolCallToExecutionRequestWithDefaults(
      { name: 'DemoAsyncTask', args: { keep: undefined } } as any,
      { foo: 'bar-from-pref', keep: 'should-not-override' }
    );

    expect(execReq.skillName).toBe('DemoAsyncTask');
    expect(execReq.parameters.foo).toBe('bar-from-pref');
    // schema 有默认值时不应被偏好覆盖（因为调用未提供，schema 默认优先于偏好）
    expect(execReq.parameters.keep).toBeUndefined();
  });
});


