import tmp from 'tmp';
import { promises as fs } from 'fs';
import * as path from 'path';

tmp.setGracefulCleanup();

export interface TempFileOptions {
  prefix?: string;
  postfix?: string;
  dir?: string;
  keep?: boolean;
}

export interface TempFile {
  path: string;
  cleanup: () => void;
}

export class TempFileManager {
  async createFile(options: TempFileOptions = {}): Promise<TempFile> {
    const tmpFile = tmp.fileSync({
      prefix: options.prefix,
      postfix: options.postfix,
      dir: options.dir,
      discardDescriptor: true,
      keep: options.keep === true
    });

    return {
      path: tmpFile.name,
      cleanup: () => {
        if (options.keep !== true) {
          tmpFile.removeCallback();
        }
      }
    };
  }

  async createDirectory(
    options: TempFileOptions = {}
  ): Promise<TempFile> {
    const tmpDir = tmp.dirSync({
      prefix: options.prefix,
      postfix: options.postfix,
      dir: options.dir,
      unsafeCleanup: options.keep !== true
    });

    return {
      path: tmpDir.name,
      cleanup: () => {
        if (options.keep !== true) {
          tmpDir.removeCallback();
        }
      }
    };
  }

  async writeTempFile(
    content: string | Buffer,
    options: TempFileOptions = {}
  ): Promise<TempFile> {
    const file = await this.createFile(options);
    await fs.writeFile(file.path, content);
    return file;
  }

  async readTempFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async remove(pathToRemove: string): Promise<void> {
    try {
      const stats = await fs.stat(pathToRemove);
      if (stats.isDirectory()) {
        await fs.rm(pathToRemove, { recursive: true, force: true });
      } else {
        await fs.unlink(pathToRemove);
      }
    } catch {
      // ignore errors
    }
  }
}

