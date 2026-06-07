import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { SCOUT_PROMPT } from "./prompts";

/**
 * Subagent roster handed to the Claude Agent SDK. The lead agent spawns these in
 * parallel to discover suppliers; each spawn surfaces in the UI as a node in the
 * SwarmView and its tool-calls stream into the live dashboard.
 */
export const SUBAGENTS: Record<string, AgentDefinition> = {
  "supplier-scout": {
    description:
      "Searches the web to find suppliers for a given part and adds them to the live dashboard. Use several in parallel by region/category.",
    prompt: SCOUT_PROMPT,
    tools: ["WebSearch", "WebFetch", "mcp__app__add_supplier"],
    model: "sonnet",
  },
};
