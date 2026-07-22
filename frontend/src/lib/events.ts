export const SESSIONS_CHANGED_EVENT = 'aistudy:sessions-changed'
export const AGENT_CONVERSATIONS_CHANGED_EVENT = 'aistudy:agent-conversations-changed'

export function notifySessionsChanged() {
  window.dispatchEvent(new Event(SESSIONS_CHANGED_EVENT))
}

export function notifyAgentConversationsChanged() {
  window.dispatchEvent(new Event(AGENT_CONVERSATIONS_CHANGED_EVENT))
}
