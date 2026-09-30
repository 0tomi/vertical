/**
 * vertical — Vertical subagent communication plugin for OpenCode v2
 *
 * Enables bidirectional parent-child messaging between subagents and supervisors
 * through silent synthetic channels (invisible to human chat UI):
 * - `notify_parent`: child subagents send blockers, questions, or updates to their supervisor.
 * - `steer`: supervisors inject guidance or answers into running subagents mid-flight.
 */

export interface NotifyParentArgs {
  message: string
}

export interface SteerArgs {
  sessionID: string
  message: string
}

export interface VerticalPluginConfig {
  /**
   * Optional prefix for steer messages delivered to subagents.
   * Default: "[SUPERVISOR STEER]"
   */
  steerPrefix?: string
}

const NOTIFY_PARENT_INSTRUCTION = `## Vertical Agent Communication

Subagents can communicate with their direct parent supervisor:
- If you are a subagent and need guidance, clarification, or encounter a blocker, call \`notify_parent(message="...")\`.
- Supervisors can redirect or instruct a running subagent mid-flight using \`steer(sessionID="...", message="...")\`.
- All communication is routed through a dedicated synthetic channel that does not pollute the human chat.
`

export function createVerticalPlugin(config: VerticalPluginConfig = {}) {
  const steerPrefix = config.steerPrefix ?? "[SUPERVISOR STEER]"

  return {
    id: "vertical",
    async setup(ctx: any) {
      // Helper to deliver messages silently via synthetic channel
      async function deliverSilentMessage(targetSessionID: string, text: string) {
        if (ctx.session?.synthetic) {
          return await ctx.session.synthetic({
            sessionID: targetSessionID,
            text,
            delivery: "steer",
            resume: true,
          })
        }
        // Fallback for runtimes without synthetic endpoint
        return await ctx.session?.prompt?.({
          sessionID: targetSessionID,
          text,
          delivery: "steer",
        })
      }

      // Register custom tools
      if (ctx.tool?.transform) {
        await ctx.tool.transform((registry: any) => {
          registry.add({
            name: "notify_parent",
            description:
              "Send an urgent question, blocker, or material update to your direct supervisor parent agent while continuing execution. Delivered silently via a synthetic channel without cluttering the user chat.",
            input: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description: "The message, question, or blocker description to send to your parent supervisor.",
                },
              },
              required: ["message"],
            },
            execute: async (args: NotifyParentArgs, toolCtx: any) => {
              const childSessionID = toolCtx?.sessionID
              if (!childSessionID) {
                return "❌ Error: sessionID is unavailable."
              }

              const trimmed = args?.message?.trim()
              if (!trimmed) {
                return "❌ Error: message cannot be empty."
              }

              try {
                const sessionRes = await ctx.session?.get?.({ sessionID: childSessionID })
                const sessionData = sessionRes?.data ?? sessionRes
                const parentID = sessionData?.parentID

                if (!parentID) {
                  return "❌ notify_parent can only be called from a subagent session with an active parent supervisor. This is a root session."
                }

                const agentName = sessionData?.agent || "subagent"
                const notification = [
                  `<child-notification sessionID="${childSessionID}" agent="${agentName}">`,
                  trimmed,
                  "",
                  "To reply or guide this subagent, use:",
                  `steer(sessionID="${childSessionID}", message="...")`,
                  "</child-notification>",
                ].join("\n")

                await deliverSilentMessage(parentID, notification)

                return `✅ Notification delivered silently to parent supervisor (${parentID}).`
              } catch (err: any) {
                return `❌ Failed to notify parent: ${err instanceof Error ? err.message : String(err)}`
              }
            },
          })

          registry.add({
            name: "steer",
            description:
              "Send intermediate guidance, additional context, or course corrections to a running subagent session without terminating it or cluttering user chat.",
            input: {
              type: "object",
              properties: {
                sessionID: {
                  type: "string",
                  description: "The sessionID of the target subagent to steer.",
                },
                message: {
                  type: "string",
                  description: "The instruction or response to inject into the subagent.",
                },
              },
              required: ["sessionID", "message"],
            },
            execute: async (args: SteerArgs) => {
              const targetSessionID = args?.sessionID?.trim()
              const trimmedMessage = args?.message?.trim()

              if (!targetSessionID || !trimmedMessage) {
                return "❌ Error: sessionID and message are both required."
              }

              try {
                const text = `${steerPrefix} ${trimmedMessage}`
                await deliverSilentMessage(targetSessionID, text)

                return `✅ Steer instruction delivered silently to subagent ${targetSessionID}.`
              } catch (err: any) {
                return `❌ Failed to steer subagent: ${err instanceof Error ? err.message : String(err)}`
              }
            },
          })
        })
      }

      // Inject system context instructions for LLM awareness
      if (ctx.session?.hook) {
        const injectVerticalContext = async (sessionCtx: any) => {
          if (!sessionCtx?.system) return
          if (sessionCtx.system.length > 0) {
            const last = sessionCtx.system[sessionCtx.system.length - 1]
            if (typeof last === "string") {
              sessionCtx.system[sessionCtx.system.length - 1] += "\n\n" + NOTIFY_PARENT_INSTRUCTION
            } else if (last && typeof last.text === "string") {
              last.text += "\n\n" + NOTIFY_PARENT_INSTRUCTION
            } else {
              sessionCtx.system.push({ text: NOTIFY_PARENT_INSTRUCTION })
            }
          } else {
            sessionCtx.system.push({ text: NOTIFY_PARENT_INSTRUCTION })
          }
        }

        await ctx.session.hook("context", injectVerticalContext)
        await ctx.session.hook("generate", injectVerticalContext)
      }
    },
  }
}

export default createVerticalPlugin()
