// docs/ai/tools/exec.js
//
// Tool-call dispatcher with Zod validation. The AI provider emits
// `{name, arguments}` pairs (or function_call equivalents) which we route to
// registered handlers. Handlers either return their result, return
// `{error: '...'}` to signal a soft domain failure (model self-corrects), or
// throw (treated as a hard failure, also surfaced back to the model).
//
// The `getToolDefinitions()` helper produces OpenAI-compatible tool descriptors
// from registered schemas so adapters can pass them straight into the request.

import { z } from '../../vendor/zod.min.js';

const registry = new Map();

export function resetRegistry() {
  registry.clear();
}

export function registerTool({ name, definition, schema, handler }) {
  registry.set(name, { definition, schema, handler });
}

export function listTools() {
  return Array.from(registry.entries()).map(([name, { definition, schema }]) => [name, definition, schema]);
}

/**
 * Build OpenAI-compatible tool descriptors from registered tools. Each tool
 * `parameters` is a minimal JSON Schema fragment sufficient for the providers
 * we ship (string/number/boolean/enum + optional). Hand-rolled rather than
 * pulling in `zod-to-json-schema`.
 */
export function getToolDefinitions() {
  // Spread the Map key (`name`) explicitly: `registerTool()` stores it
  // separately from `definition` (which carries description/schema fields), so
  // the adapter's `t.name` read is empty unless we put it back here.
  return Array.from(registry.entries()).map(([name, { definition, schema }]) => ({
    name,
    ...definition,
    parameters: schemaToJsonSchema(schema),
  }));
}

export async function execTool(name, args, ctx) {
  const tool = registry.get(name);
  if (!tool) {
    console.log('[bo2-tool] unknown', { name, args });
    return { ok: false, error: `unknown tool: ${name}` };
  }
  console.log('[bo2-tool] call', { name, args });

  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const error = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    console.log('[bo2-tool] validation_failed', { name, args, error });
    return { ok: false, error };
  }

  try {
    const result = await tool.handler(parsed.data, ctx);
    // Handlers signal domain failures by RETURNING `{ error }` (not throwing),
    // so the model receives a tool_result error and self-corrects. Treat that
    // as ok:false so the surrounding loop knows to feed the error back.
    if (result && typeof result === 'object' && 'error' in result) {
      const error = String(result.error);
      console.log('[bo2-tool] domain_error', { name, args, error });
      return { ok: false, error };
    }
    console.log('[bo2-tool] ok', { name, args, result });
    return { ok: true, result };
  } catch (err) {
    const error = err?.message ?? String(err);
    console.log('[bo2-tool] thrown', { name, args, error });
    return { ok: false, error };
  }
}

function schemaToJsonSchema(schema) {
  const shape = schema._def?.shape?.();
  if (!shape) return { type: 'object', properties: {} };
  const properties = {};
  const required = [];
  for (const key of Object.keys(shape)) {
    properties[key] = zodNodeToJsonSchema(shape[key]);
    if (!isOptional(shape[key])) required.push(key);
  }
  return { type: 'object', properties, required };
}

function zodNodeToJsonSchema(node) {
  const t = node._def?.typeName;
  if (t === 'ZodString') return { type: 'string' };
  if (t === 'ZodNumber') return { type: 'number' };
  if (t === 'ZodBoolean') return { type: 'boolean' };
  if (t === 'ZodEnum') return { type: 'string', enum: node._def.values };
  if (t === 'ZodOptional') return zodNodeToJsonSchema(node._def.innerType);
  if (t === 'ZodObject') return schemaToJsonSchema(node);
  if (t === 'ZodNumber') {
    const checks = node._def.checks ?? [];
    const integer = checks.some((c) => c.kind === 'int');
    const min = checks.find((c) => c.kind === 'min')?.value;
    const max = checks.find((c) => c.kind === 'max')?.value;
    return { type: 'number', ...(integer ? { integer: true } : {}), ...(min != null ? { minimum: min } : {}), ...(max != null ? { maximum: max } : {}) };
  }
  return { type: 'string' };
}

function isOptional(node) {
  return node._def?.typeName === 'ZodOptional';
}