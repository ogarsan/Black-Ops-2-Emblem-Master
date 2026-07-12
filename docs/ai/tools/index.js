// docs/ai/tools/index.js
//
// Single import aggregator. Each tool file self-registers on import (calls
// `registerTool()` at module top-level). Importing this file from main.js
// guarantees the full tool registry is populated before the first user send.
//
// Order is not significant — `registerTool` is idempotent within a session
// (last registration wins if duplicates exist; we don't have any).

import './add_layer.js';
import './get_emblem_state.js';
import './get_canvas_info.js';
import './get_free_layers.js';
import './update_layer.js';
import './delete_layer.js';
import './move_layer.js';
import './clear_emblem.js';
import './set_playercard.js';