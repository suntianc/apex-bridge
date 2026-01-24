# src/config/ - 构建时配置

本目录存放构建时 TypeScript 配置代码。

## 文件说明

| 文件                   | 用途                              |
| ---------------------- | --------------------------------- |
| `endpoint-mappings.ts` | API 端点映射（提供商 → 端点后缀） |

## 配置职责划分

| 目录          | 内容                  | 职责                       |
| ------------- | --------------------- | -------------------------- |
| `config/`     | JSON/YAML/MD 配置文件 | 运行时数据配置，用户可编辑 |
| `src/config/` | TypeScript 配置代码   | 构建时映射逻辑             |

## 使用方式

```typescript
import { buildApiUrl } from "../config/endpoint-mappings";
```
