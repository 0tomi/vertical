# vertical

Bidirectional vertical subagent communication plugin for [OpenCode v2](https://github.com/anomalyco/opencode).

## Why Vertical?

OpenCode v2 features native subagent execution, but communication is strictly synchronous and unidirectional: a parent spawns a subagent and waits for it to complete (or launches it in the background to receive a notification upon completion).

In complex multi-agent architectures, agents need **vertical communication**:
- **Child agents** hit ambiguities, edge cases, or permission blockers and need to ask their parent supervisor for clarification mid-execution.
- **Parent supervisors** need to guide, supply missing context, or redirect running subagents on the fly without aborting work or waiting for full turn settlement.

`vertical` unlocks this workflow through OpenCode v2's **silent synthetic delivery pipeline** (`session.synthetic` with `delivery: "steer"`).

### 🤫 Silent by Design (Zero Chat Clutter)

Unlike naive message injection that posts raw XML blocks as user prompts into the main chat, `vertical` delivers messages directly to the LLM reasoning loop through synthetic messages without descriptions. 

This means:
- The supervisor agent **sees the notification and reacts immediately**.
- The human user's chat transcript **stays completely clean and unpolluted**.

---

## Capabilities & Tools

### 1. `notify_parent`
Called by any subagent running inside a child session:
- Automatically resolves the parent supervisor's session ID (`parentID`).
- Formats and delivers a structured `<child-notification>` block directly into the parent's session via a silent synthetic channel.
- Allows subagents to escalate questions or blockers without failing the task.

**Signature:**
```json
{
  "name": "notify_parent",
  "arguments": {
    "message": "Encountered a migration conflict in schema.prisma. Should we create a new migration or reset?"
  }
}
```

### 2. `steer`
Called by a supervisor (or parent session) to guide an active subagent:
- Delivers an in-flight prompt (`[SUPERVISOR STEER] ...`) to the target subagent.
- Does not terminate or interrupt ongoing execution—the message is ingested by the subagent's event loop immediately.

**Signature:**
```json
{
  "name": "steer",
  "arguments": {
    "sessionID": "ses_fa7459adaffeWwnTPoFmJzdN8O",
    "message": "Create a new migration instead of resetting."
  }
}
```

### 3. Contextual Awareness
The plugin automatically injects behavioral instructions into the agent's system prompt using `ctx.session.hook("context")`, ensuring the models understand when and how to communicate vertically.

---

## Installation

### Method 1: Drop-in file (Recommended)

Copy `src/index.ts` directly into your OpenCode plugins directory:

```bash
mkdir -p ~/.config/opencode/plugins
curl -sSL https://raw.githubusercontent.com/0tomi/vertical/main/src/index.ts -o ~/.config/opencode/plugins/vertical.ts
```

Then reload OpenCode:
```bash
opencode reload
```

### Method 2: Local repository clone

Clone this repository into your local projects directory:

```bash
git clone https://github.com/0tomi/vertical.git ~/Documents/vertical
```

Add the entrypoint to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "file:///home/<user>/Documents/vertical/src/index.ts"
  ]
}
```

Reload OpenCode:
```bash
opencode reload
```

---

## Verification

Check your OpenCode log to ensure the plugin loaded cleanly:

```bash
tail -n 20 ~/.local/share/opencode/log/opencode.log
```

You should see:
```text
level=INFO msg="loading plugin" id=/home/.../.config/opencode/plugins/vertical.ts
```

---

## License

[MIT](LICENSE) © Tomas
