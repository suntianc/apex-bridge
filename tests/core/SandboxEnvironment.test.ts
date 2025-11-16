import { SandboxEnvironment } from '../../src/core/skills/SandboxEnvironment';
import { SandboxExecutionError } from '../../src/core/skills/CodeGenerationErrors';

describe('SandboxEnvironment', () => {
  it('executes safe code within sandbox', async () => {
    const sandbox = new SandboxEnvironment();
    const result = await sandbox.execute(`
      exports.execute = () => ({ answer: 42 });
    `);

    expect(result.result).toEqual({ answer: 42 });
    expect(result.securityReport.passed).toBe(true);
  });

  it('rejects unsafe access to require', async () => {
    const sandbox = new SandboxEnvironment();
    await expect(
      sandbox.execute(`
        exports.execute = () => require('fs');
      `)
    ).rejects.toThrow(SandboxExecutionError);
  });

  it('respects per-execution timeout override', async () => {
    const sandbox = new SandboxEnvironment();
    await expect(
      sandbox.execute(
        `
          exports.execute = async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return { done: true };
          };
        `,
        {
          resourceLimitsOverride: {
            executionTimeout: 50
          }
        }
      )
    ).rejects.toThrow(SandboxExecutionError);
  });

  it('injects environment variables into sandboxed process', async () => {
    const sandbox = new SandboxEnvironment();
    const result = await sandbox.execute(
      `
        exports.execute = () => ({
          injected: process.env.TEST_FLAG,
          missing: process.env.NODE_ENV
        });
      `,
      {
        environment: {
          TEST_FLAG: 'enabled'
        }
      }
    );

    expect(result.result).toEqual({
      injected: 'enabled',
      missing: undefined
    });
  });
});

