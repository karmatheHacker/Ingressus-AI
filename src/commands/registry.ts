export interface SlashCommand {
  name: string
  displayText: string
  tag?: string
  description: string
  argumentHint?: string
  requiresArgs?: boolean
  category: 'skills' | 'git' | 'tools' | 'auth' | 'session' | 'tiny-fish'
}

/**
 * Canonical slash commands catalog ported from Tau & expanded for Ingressus AI.
 * Order reflects the default suggestion list shown when typing `/`.
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'frontend-design:frontend-design',
    displayText: '/frontend-design:frontend-design',
    tag: '(frontend-design)',
    description: 'Guidance for distinctive, intentional frontend design & UI generation',
    category: 'skills',
  },
  {
    name: 'simplify',
    displayText: '/simplify',
    description: 'Review changed code for reuse, quality, and efficiency',
    category: 'skills',
  },
  {
    name: 'add-dir',
    displayText: '/add-dir',
    argumentHint: '<path>',
    requiresArgs: true,
    description: 'Add a new working directory to the current session',
    category: 'session',
  },
  {
    name: 'agents',
    displayText: '/agents',
    description: 'Manage agent configurations & specialized subagents',
    category: 'session',
  },
  {
    name: 'branch',
    displayText: '/branch',
    argumentHint: '[name]',
    description: 'Create a branch of the current conversation at this point',
    category: 'session',
  },
  {
    name: 'btw',
    displayText: '/btw',
    argumentHint: '<question>',
    requiresArgs: true,
    description: 'Ask a quick side question without interrupting the conversation',
    category: 'session',
  },
  {
    name: 'login',
    displayText: '/login',
    tag: '(auth)',
    argumentHint: '[provider]',
    description: 'Authenticate with Google Antigravity OAuth (/login antigravity)',
    category: 'auth',
  },
  {
    name: 'logout',
    displayText: '/logout',
    tag: '(auth)',
    description: 'Sign out and clear cached Antigravity account tokens',
    category: 'auth',
  },
  {
    name: 'mcp',
    displayText: '/mcp',
    tag: '(tools)',
    argumentHint: '[list|test|enable|disable]',
    description: 'Manage Model Context Protocol servers (Tiny Fish, Stitch, etc.)',
    category: 'tools',
  },
  {
    name: 'github',
    displayText: '/github',
    tag: '(git)',
    argumentHint: '[issue|pr|wrap|changelog|triage|release]',
    description: 'GitHub repo manager — issue, pr, wrap, changelog, triage, release',
    category: 'git',
  },
  {
    name: 'diff',
    displayText: '/diff',
    tag: '(git)',
    description: 'Show uncommitted git changes and file statistics',
    category: 'git',
  },
  {
    name: 'status',
    displayText: '/status',
    tag: '(git)',
    description: 'Show repository git status and session state',
    category: 'git',
  },
  {
    name: 'commit',
    displayText: '/commit',
    tag: '(git)',
    argumentHint: '[message]',
    description: 'Commit staged changes with AI commit message',
    category: 'git',
  },
  {
    name: 'review',
    displayText: '/review',
    argumentHint: '[files...]',
    description: 'Review modified files or diffs for bugs and code quality',
    category: 'skills',
  },
  {
    name: 'doctor',
    displayText: '/doctor',
    description: 'Check environment, auth, Node, Git, and MCP connectivity',
    category: 'tools',
  },
  {
    name: 'quota',
    displayText: '/quota',
    description: 'Fetch authentic user quota & token limits from Google Code Assist',
    category: 'auth',
  },
  {
    name: 'models',
    displayText: '/models',
    description: 'Interactive model selector menu (Argon, Flash, Claude Opus/Sonnet)',
    category: 'auth',
  },
  {
    name: 'model',
    displayText: '/model',
    argumentHint: '[name]',
    requiresArgs: false,
    description: 'Switch active model from interactive list (or search by name)',
    category: 'auth',
  },
  {
    name: 'provider',
    displayText: '/provider',
    argumentHint: '[name]',
    description: 'Switch or inspect active provider (antigravity, openai, etc.)',
    category: 'auth',
  },
  {
    name: 'search',
    displayText: '/search',
    tag: '(tiny-fish)',
    argumentHint: '<query>',
    requiresArgs: true,
    description: 'Live web search via Tiny Fish MCP',
    category: 'tiny-fish',
  },
  {
    name: 'fetch',
    displayText: '/fetch',
    tag: '(tiny-fish)',
    argumentHint: '<url>',
    requiresArgs: true,
    description: 'Extract clean token-efficient page markdown via Tiny Fish',
    category: 'tiny-fish',
  },
  {
    name: 'wallet',
    displayText: '/wallet',
    tag: '(tiny-fish)',
    description: 'Check Tiny Fish wallet balance and API credits',
    category: 'tiny-fish',
  },
  {
    name: 'sessions',
    displayText: '/sessions',
    tag: '(tiny-fish)',
    description: 'List remote browser automation sessions',
    category: 'tiny-fish',
  },
  {
    name: 'memory',
    displayText: '/memory',
    description: 'Inspect and manage long-term project memory',
    category: 'session',
  },
  {
    name: 'cost',
    displayText: '/cost',
    description: 'Show token usage, pricing and session consumption',
    category: 'session',
  },
  {
    name: 'chat',
    displayText: '/chat',
    argumentHint: '<prompt>',
    requiresArgs: true,
    description: 'Send a prompt directly to the active Antigravity model',
    category: 'session',
  },
  {
    name: 'clear',
    displayText: '/clear',
    description: 'Clear terminal screen output history',
    category: 'session',
  },
  {
    name: 'help',
    displayText: '/help',
    description: 'Show full command list and usage guidance',
    category: 'session',
  },
  {
    name: 'exit',
    displayText: '/exit',
    description: 'Exit Ingressus AI',
    category: 'session',
  },
]

/**
 * Filter slash commands matching user input (e.g. "/" or "/m" or "/log").
 */
export function getSlashCommandSuggestions(query: string): SlashCommand[] {
  const trimmed = query.trim()
  if (!trimmed.startsWith('/')) return []

  const cleanQuery = trimmed.slice(1).toLowerCase()
  if (!cleanQuery) {
    return SLASH_COMMANDS
  }

  // Exact prefix matches on command name first, then substring in name, then tag, then description
  return SLASH_COMMANDS.filter(cmd => {
    const normName = cmd.name.toLowerCase()
    const normTag = (cmd.tag ?? '').toLowerCase()
    const normDesc = cmd.description.toLowerCase()

    return (
      normName.startsWith(cleanQuery) ||
      normName.includes(cleanQuery) ||
      normTag.includes(cleanQuery) ||
      normDesc.includes(cleanQuery)
    )
  }).sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(cleanQuery)
    const bStarts = b.name.toLowerCase().startsWith(cleanQuery)
    if (aStarts && !bStarts) return -1
    if (!aStarts && bStarts) return 1
    return 0
  })
}

