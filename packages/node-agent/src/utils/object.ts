import { NodeAgentConfig } from '../config/types';

type PlainObject = Record<string, unknown>;

export function mergeDeep<T = any, U = any>(target: T, source: U): T & U {
  if (Array.isArray(target) && Array.isArray(source)) {
    return source.slice() as unknown as T & U;
  }

  if (isObject(target) && isObject(source)) {
    const output: PlainObject = { ...target };
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = output[key];

      if (Array.isArray(sourceValue)) {
        output[key] = Array.isArray(targetValue) ? sourceValue : [...sourceValue];
      } else if (isObject(sourceValue) && isObject(targetValue)) {
        output[key] = mergeDeep(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        output[key] = sourceValue;
      }
    }
    return output as T & U;
  }

  return (source !== undefined ? source : target) as T & U;
}

export function maskSensitive(config: NodeAgentConfig, pathsToMask: string[]): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(config)) as PlainObject;
  for (const path of pathsToMask) {
    const segments = path.split('.');
    let pointer: PlainObject | undefined = clone;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      if (!pointer || typeof pointer[segment] !== 'object') {
        pointer = undefined;
        break;
      }
      pointer = pointer[segment] as PlainObject;
    }
    if (pointer) {
      const lastKey = segments[segments.length - 1];
      if (pointer[lastKey] !== undefined) {
        pointer[lastKey] = '***';
      }
    }
  }
  return clone;
}

function isObject(value: unknown): value is PlainObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

