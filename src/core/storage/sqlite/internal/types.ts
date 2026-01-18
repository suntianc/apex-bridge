/**
 * Database Row Types
 *
 * Type definitions for raw database rows.
 */

export interface ProviderRow {
  id: number;
  provider: string;
  name: string;
  description: string | null;
  base_config: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface ModelRow {
  id: number;
  provider_id: number;
  model_key: string;
  model_name: string;
  model_type: string;
  model_config: string;
  api_endpoint_suffix: string | null;
  enabled: number;
  is_default: number;
  display_order: number;
  created_at: number;
  updated_at: number;
}

export interface ModelFullRow extends ModelRow {
  provider: string;
  name: string;
  base_config: string;
  provider_enabled: number;
}

export interface CountRow {
  count: number;
}
