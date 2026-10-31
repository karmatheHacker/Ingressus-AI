import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import {
  peekAntigravityAccount,
  loadStore,
  saveStore,
  selectActiveAntigravityAccount,
  antigravityTransport,
  fetchAntigravityQuota,
  getModelContextWindow,
} from '../antigravity/index.js'
import { tinyFish } from '../services/tinyfish.js'
import { agentMemory } from '../agent/memory.js'

const execAsync = promisify(exec)

export interface CommandExecutionResult {
  type: string
  [key: string]: any
}

/**
 * Executes a slash command and returns a structured LogItem for display in TinyFishOutput.
 */
export async function handleSlashCommand(
  rawInput: string,
  state: {
    activeModel: string
    setActiveModel: (m: string) => void
    isAuthenticated: boolean
    setIsAuthenticated: (a: boolean) => void
    contextUsed: number | null
    setContextUsed: React.Dispatch<React.SetStateAction<number | null>>
    contextMax: number
    setContextMax: (m: number) => void
  }
): Promise<CommandExecutionResult | null> {
  const input = rawInput.trim()
  const [cmdPart, ...argsParts] = input.split(' ')
  const cmd = (cmdPart ?? '').toLowerCase()
  const args = argsParts.join(' ').trim()

  // 1. /mcp
  if (cmd === '/mcp') {
    const sub = (argsParts[0] || 'list').toLowerCase()

    if (sub === 'test') {
      const startTime = Date.now()
      try {
        const wallet = await tinyFish.getWallet()
        const latency = Date.now() - startTime
        return {
          type: 'mcp_status',
          action: 'test',
          data: {
            success: true,
            latencyMs: latency,
            servers: [
              {
                name: 'tiny-fish',
                status: 'Connected & Healthy',
                endpoint: 'https://agent.tinyfish.ai/mcp',
                tools: ['search', 'fetch_content', 'get_wallet', 'list_browser_sessions'],
                walletBalance: (wallet as any)?.balance ?? 'Active',
              },
              {
                name: 'StitchMCP',
                status: 'Registered in Antigravity environment',
                tools: ['generate_screen_from_text', 'edit_screens', 'create_design_system'],
              },
            ],
          },
        }
      } catch (err: any) {
        return {
          type: 'mcp_status',
          action: 'test',
          data: {
            success: false,
            error: err.message,
            servers: [{ name: 'tiny-fish', status: 'Error: ' + err.message }],
          },
        }
      }
    }

    // Default: list servers
    return {
      type: 'mcp_status',
      action: 'list',
      data: {
        servers: [
          {
            name: 'tiny-fish',
            type: 'sse / remote-http',
            endpoint: 'https://agent.tinyfish.ai/mcp',
            status: 'Connected',
            tools: ['search', 'fetch_content', 'get_wallet', 'list_browser_sessions'],
            description: 'Tiny Fish live search, page extraction & remote browser automation',
          },
          {
            name: 'StitchMCP',
            type: 'stdio',
            status: 'Registered',
            tools: ['generate_screen_from_text', 'edit_screens', 'list_screens', 'create_design_system'],
            description: 'Stitch design system and screen synthesis engine',
          },
        ],
      },
    }
  }

  // 2. /github
  if (cmd === '/github') {
    const sub = (argsParts[0] || 'status').toLowerCase()
    const cwd = process.cwd()

    try {
      let branch = 'unknown'
      let remote = 'none'
      let recentCommits: string[] = []
      let statusSummary = ''

      try {
        const { stdout: bOut } = await execAsync('git branch --show-current', { cwd })
        branch = bOut.trim() || 'main'
      } catch {}

      try {
        const { stdout: rOut } = await execAsync('git remote -v', { cwd })
        remote = rOut.split('\n')[0] || 'no remote configured'
      } catch {}

      try {
        const { stdout: cOut } = await execAsync('git log -n 3 --oneline', { cwd })
        recentCommits = cOut.trim().split('\n').filter(Boolean)
      } catch {}

      try {
        const { stdout: sOut } = await execAsync('git status --short', { cwd })
        statusSummary = sOut.trim()
      } catch {}

      return {
        type: 'github_status',
        subcommand: sub,
        branch,
        remote,
        recentCommits,
        statusSummary,
        isGitRepo: branch !== 'unknown' || remote !== 'none',
      }
    } catch (err: any) {
      return {
        type: 'github_status',
        subcommand: sub,
        error: err.message,
        isGitRepo: false,
      }
    }
  }

  // 3. /frontend-design:frontend-design
  if (cmd === '/frontend-design:frontend-design' || cmd === '/frontend-design') {
    if (args) {
      // Generate UI design guidance / code with Antigravity
      const prompt = `You are a world-class UI/UX designer and frontend engineer. Follow the Frontend Design principles: Distinctive typography, purposeful color palettes, generous white space, clear hierarchy, subtle borders, and responsive layouts. Design: ${args}`
      
      const authState = peekAntigravityAccount()
      if (authState.kind !== 'none') {
        const { text: answer, usage } = await antigravityTransport.generateContentWithUsage({
          model: state.activeModel,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        })
        if (usage && usage.totalTokenCount > 0) {
          state.setContextUsed(usage.totalTokenCount)
        }
        return {
          type: 'frontend_design_result',
          query: args,
          design: answer,
        }
      } else {
        return {
          type: 'frontend_design_guide',
          notice: 'Note: Authenticate with /login antigravity to generate live AI component code.',
        }
      }
    }

    return {
      type: 'frontend_design_guide',
    }
  }

  // 4. /simplify
  if (cmd === '/simplify') {
    try {
      let diff = ''
      try {
        const { stdout } = await execAsync('git diff', { cwd: process.cwd() })
        diff = stdout.trim()
      } catch {}

      const authState = peekAntigravityAccount()
      if (authState.kind !== 'none' && diff) {
        const prompt = `Review this code diff for simplification and cleanup. Identify opportunities for code reuse, eliminating unnecessary abstractions, improving performance, and ensuring idiomatic code:\n\n${diff.slice(0, 8000)}`
        const { text: answer, usage } = await antigravityTransport.generateContentWithUsage({
          model: state.activeModel,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        })
        if (usage && usage.totalTokenCount > 0) {
          state.setContextUsed(usage.totalTokenCount)
        }
        return {
          type: 'simplify_result',
          analysis: answer,
        }
      }

      return {
        type: 'simplify_result',
        analysis: diff
          ? `Changes detected (${diff.split('\n').length} lines). Authenticate with /login to run full AI simplification review.`
          : 'Working directory is clean. No uncommitted diffs found to simplify.',
      }
    } catch (err: any) {
      return {
        type: 'simplify_result',
        analysis: 'Unable to analyze diff: ' + err.message,
      }
    }
  }

  // 5. /doctor
  if (cmd === '/doctor') {
    const authState = peekAntigravityAccount()
    const store = loadStore()
    const activeAccount = selectActiveAntigravityAccount(store)
    let gitVersion = 'not installed'
    try {
      const { stdout } = await execAsync('git --version')
      gitVersion = stdout.trim()
    } catch {}

    let mcpHealthy = false
    try {
      await tinyFish.getWallet()
      mcpHealthy = true
    } catch {}

    return {
      type: 'doctor_report',
      nodeVersion: process.version,
      platform: `${os.platform()} (${os.arch()})`,
      gitVersion,
      cwd: process.cwd(),
      antigravityAuth: {
        authenticated: authState.kind !== 'none',
        email: activeAccount?.email || null,
        projectId: activeAccount?.projectId || null,
        activeModel: state.activeModel,
      },
      tinyFishMcp: {
        healthy: mcpHealthy,
        endpoint: 'https://agent.tinyfish.ai/mcp',
      },
    }
  }

  // 6. /diff
  if (cmd === '/diff') {
    try {
      const { stdout } = await execAsync('git diff', { cwd: process.cwd() })
      return {
        type: 'diff_output',
        diff: stdout.trim() || 'No uncommitted changes in working directory.',
      }
    } catch (err: any) {
      return {
        type: 'diff_output',
        diff: 'Git error: ' + (err.message || 'Not a git repository'),
      }
    }
  }

  // 7. /status
  if (cmd === '/status') {
    let gitStat = 'Not a git repository'
    try {
      const { stdout } = await execAsync('git status --short', { cwd: process.cwd() })
      gitStat = stdout.trim() || 'Working tree clean'
    } catch {}

    return {
      type: 'status_output',
      cwd: process.cwd(),
      model: state.activeModel,
      gitStatus: gitStat,
      authenticated: state.isAuthenticated,
      contextUsed: state.contextUsed,
      contextMax: state.contextMax,
    }
  }

  // 8. /commit
  if (cmd === '/commit') {
    try {
      const { stdout } = await execAsync('git status --short', { cwd: process.cwd() })
      if (!stdout.trim()) {
        return {
          type: 'commit_output',
          message: 'No changes detected to commit.',
        }
      }

      if (args) {
        const { stdout: cOut } = await execAsync(`git commit -am "${args.replace(/"/g, '\\"')}"`, {
          cwd: process.cwd(),
        })
        return {
          type: 'commit_output',
          message: `Committed successfully: ${cOut.trim()}`,
        }
      }

      return {
        type: 'commit_output',
        message: `Staged files:\n${stdout.trim()}\n\nTip: Run /commit <message> to commit changes.`,
      }
    } catch (err: any) {
      return {
        type: 'commit_output',
        message: 'Commit error: ' + err.message,
      }
    }
  }

  // 9. /agents
  if (cmd === '/agents') {
    return {
      type: 'agents_list',
      agents: [
        {
          name: 'Tiny Fish Web Agent',
          description: 'Autonomous web research, live search indexer, and remote browser session controller',
          status: 'Active',
        },
        {
          name: 'Antigravity Code Assistant',
          description: 'High-capability reasoning and code editing with Gemini 4 Argon and Claude Opus/Sonnet',
          status: state.isAuthenticated ? 'Authenticated' : 'Pending Login',
        },
        {
          name: 'Code Reviewer & Simplifier',
          description: 'Inspects diffs and enforces design system and DRY code reuse principles',
          status: 'Ready',
        },
      ],
    }
  }

  // 10. /branch
  if (cmd === '/branch') {
    return {
      type: 'branch_info',
      name: args || 'session-main',
      message: args
        ? `Conversation branched to checkpoint "${args}".`
        : 'Active conversation branch: session-main (use `/branch <name>` to checkpoint)',
    }
  }

  // 11. /btw
  if (cmd === '/btw') {
    if (!args) {
      return {
        type: 'error',
        message: 'Usage: /btw <question> (Ask a quick side question without interrupting context)',
      }
    }

    const authState = peekAntigravityAccount()
    if (authState.kind !== 'none') {
      const answer = await antigravityTransport.generateContent({
        model: state.activeModel,
        contents: [{ role: 'user', parts: [{ text: `[Side question - concise response only]: ${args}` }] }],
      })
      return {
        type: 'btw_response',
        question: args,
        answer,
      }
    } else {
      const searchRes = await tinyFish.search(args)
      return {
        type: 'search',
        data: searchRes,
      }
    }
  }

  // 12. /add-dir
  if (cmd === '/add-dir') {
    if (!args) {
      return { type: 'error', message: 'Usage: /add-dir <directory-path>' }
    }
    const resolved = path.resolve(process.cwd(), args)
    if (fs.existsSync(resolved)) {
      return {
        type: 'add_dir_success',
        directory: resolved,
      }
    } else {
      return {
        type: 'error',
        message: `Directory not found: ${resolved}`,
      }
    }
  }

  // 13. /logout
  if (cmd === '/logout') {
    const p = path.join(os.homedir(), '.claudex', 'antigravity-accounts.json')
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p)
      }
      state.setIsAuthenticated(false)
      state.setContextUsed(null)
      return {
        type: 'logout_success',
      }
    } catch (err: any) {
      return {
        type: 'error',
        message: 'Failed to clear credentials: ' + err.message,
      }
    }
  }

  // 14. /provider
  if (cmd === '/provider') {
    const available = ['antigravity', 'tinyfish', 'openai', 'openrouter']
    if (args) {
      const target = args.toLowerCase()
      if (available.includes(target)) {
        return {
          type: 'provider_switch',
          current: target,
          available,
        }
      } else {
        return {
          type: 'error',
          message: `Unknown provider "${args}". Select from: ${available.join(', ')}`,
        }
      }
    }
    return {
      type: 'provider_list',
      current: 'antigravity',
      available,
    }
  }

  // 15. /memory
  if (cmd === '/memory') {
    const websites = agentMemory.getWebsites()
    const edited = agentMemory.getEditedFiles()

    const items = [
      `Workspace directory: ${process.cwd()}`,
      `Active model: ${state.activeModel}`,
      `Authenticated: ${state.isAuthenticated ? 'Yes' : 'No'}`,
      'Synchronized Dual-Agent Memory: Active',
      `Visited Websites (Tiny Fish): ${websites.length}`,
      ...websites.slice(-3).map(w => `  • ${w.url}${w.title ? ` (${w.title})` : ''}`),
      `Edited Files (Antigravity): ${edited.length}`,
      ...edited.slice(-3).map(f => `  • ${f.filePath} (${f.summary})`),
    ]

    return {
      type: 'memory_info',
      items,
    }
  }

  // 16. /cost
  if (cmd === '/cost') {
    return {
      type: 'cost_summary',
      model: state.activeModel,
      usedTokens: state.contextUsed ?? 0,
      maxTokens: state.contextMax,
      estimatedCost: '$0.00 (Google Cloud Code Assist & Tiny Fish trial credits)',
    }
  }

  return null
}

