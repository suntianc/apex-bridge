import { TempFileManager } from '../../src/utils/TempFileManager';
import { promises as fs } from 'fs';

describe('TempFileManager', () => {
  const manager = new TempFileManager();

  it('creates and cleans up temporary files', async () => {
    const tempFile = await manager.writeTempFile('hello', { prefix: 'test-' });
    const contents = await fs.readFile(tempFile.path, 'utf-8');
    expect(contents).toBe('hello');

    tempFile.cleanup();
    await expect(fs.readFile(tempFile.path, 'utf-8')).rejects.toThrow();
  });

  it('creates temporary directories', async () => {
    const tempDir = await manager.createDirectory({ prefix: 'dir-' });
    const filePath = `${tempDir.path}/file.txt`;
    await fs.writeFile(filePath, 'data', 'utf-8');
    const data = await fs.readFile(filePath, 'utf-8');
    expect(data).toBe('data');

    tempDir.cleanup();
    await expect(fs.readFile(filePath, 'utf-8')).rejects.toThrow();
  });
});

