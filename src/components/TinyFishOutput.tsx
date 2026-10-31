import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import type { SearchResponse } from '../services/tinyfish.js'

export type LogItem =
  | {
      type: 'user'
      text: string
    }
  | {
      type: 'loading'
      message: string
      model?: string
      isCustom?: boolean
    }
  | {
      type: 'search'
      data: SearchResponse
    }
  | {
      type: 'fetch'
      url: string
      content: string
    }
  | {
      type: 'wallet'
      data: any
    }
  | {
      type: 'sessions'
      data: any
    }
  | {
      type: 'antigravity_login_url'
      url: string
      browserOpened?: boolean
      browserName?: string
    }

  | {
      type: 'antigravity_login_success'
      email: string
      projectId: string
    }
  | {
      type: 'antigravity_chat'
      model: string
      text: string
    }
  | {
      type: 'antigravity_models'
      models: readonly { id: string; name: string }[]
    }
  | {
      type: 'model_switched'
      modelName: string
      modelId: string
      contextMax: number
    }
  | {
      type: 'agent_step'
      mode: 'search' | 'browse' | 'fetch' | 'agent' | 'context' | 'reasoning'
      title: string
      details?: string
    }
  | {
      type: 'dual_agent_research'
      query: string
      visited: Array<{ url: string; title?: string }>
    }
  | {
      type: 'antigravity_reasoning'
      model: string
      text: string
    }
  | {
      type: 'file_edit_applied'
      filePath: string
      reasoning: string
    }
  | {
      type: 'file_edit_rejected'
      filePath: string
    }
  | {
      type: 'agent_interrupted'
      message: string
    }
  | {
      type: 'antigravity_quota'
      data: {
        modelId: string
        usedTokens: number
        maxTokens: number
        remainingFraction: number
        resetTime?: string | null
      }
    }
  | {
      type: 'mcp_status'
      action: string
      data: any
    }
  | {
      type: 'github_status'
      subcommand: string
      branch?: string
      remote?: string
      recentCommits?: string[]
      statusSummary?: string
      isGitRepo?: boolean
      error?: string
    }
  | {
      type: 'frontend_design_guide'
      notice?: string
    }
  | {
      type: 'frontend_design_result'
      query: string
      design: string
    }
  | {
      type: 'simplify_result'
      analysis: string
    }
  | {
      type: 'doctor_report'
      nodeVersion: string
      platform: string
      gitVersion: string
      cwd: string
      antigravityAuth: any
      tinyFishMcp: any
    }
  | {
      type: 'diff_output'
      diff: string
    }
  | {
      type: 'status_output'
      cwd: string
      model: string
      gitStatus: string
      authenticated: boolean
      contextUsed: number | null
      contextMax: number
    }
  | {
      type: 'commit_output'
      message: string
    }
  | {
      type: 'agents_list'
      agents: Array<{ name: string; description: string; status: string }>
    }
  | {
      type: 'branch_info'
      name: string
      message: string
    }
  | {
      type: 'btw_response'
      question: string
      answer: string
    }
  | {
      type: 'add_dir_success'
      directory: string
    }
  | {
      type: 'logout_success'
    }
  | {
      type: 'provider_list' | 'provider_switch'
      current: string
      available: string[]
    }
  | {
      type: 'memory_info'
      items: string[]
    }
  | {
      type: 'cost_summary'
      model: string
      usedTokens: number
      maxTokens: number
      estimatedCost: string
    }
  | {
      type: 'help'
    }
  | {
      type: 'error'
      message: string
    }



const CLAUDE_ACTION_PHRASES = [
  'Cooking...',
  'Compacting...',
  'Coding...',
  'Thinking...',
  'Synthesizing...',
  'Brewing...',
  'Crunching tokens...',
  'Refining...',
  'Crafting answer...',
  'Connecting synapses...',
  'Polishing...',
  'Architecting...',
]

const CLAUDE_SPINNER_FRAMES = ['✦', '✧', '✢', '✶', '✻', '✽']

function ClaudeLoading({
  message,
  model,
  isCustom = false,
}: {
  message?: string
  model?: string
  isCustom?: boolean
}) {
  const [frameIdx, setFrameIdx] = useState(0)
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [elapsed, setElapsed] = useState('0.0')
  const [startTime] = useState(() => Date.now())

  // Spinner animation and elapsed timer
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now()
      setFrameIdx(prev => (prev + 1) % CLAUDE_SPINNER_FRAMES.length)
      setElapsed(((now - startTime) / 1000).toFixed(1) + 's')
    }, 120)
    return () => clearInterval(timer)
  }, [startTime])

  // Cycle through Claude action phrases (Cooking... -> Compacting... -> Coding... -> Thinking...)
  useEffect(() => {
    if (isCustom) return
    const phraseTimer = setInterval(() => {
      setPhraseIdx(prev => (prev + 1) % CLAUDE_ACTION_PHRASES.length)
    }, 1400)
    return () => clearInterval(phraseTimer)
  }, [isCustom])

  const currentPhrase = isCustom && message ? message : CLAUDE_ACTION_PHRASES[phraseIdx]
  const spinnerChar = CLAUDE_SPINNER_FRAMES[frameIdx]

  return (
    <Box marginY={1} paddingLeft={2} flexDirection="row">
      <Text color="#d97757" bold>{spinnerChar} </Text>
      <Text color="#eceff4" bold>{currentPhrase} </Text>
      <Text dimColor>
        ({elapsed}{model ? ` · ${model}` : ''})
      </Text>
    </Box>
  )
}

export const TinyFishOutput = React.memo(function TinyFishOutput({ logs }: { logs: LogItem[] }): React.ReactElement {
  if (logs.length === 0) {
    return (
      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text dimColor>
          Type any search query, or use <Text color="#88c0d0">/help</Text> for Tiny Fish & Antigravity commands
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginTop={1} width="95%" alignSelf="center">
      {logs.map((log, idx) => {
        if (log.type === 'user') {
          return (
            <Box key={idx} marginTop={1} flexDirection="row">
              <Text color="#81a1c1" bold>{'> '} </Text>
              <Text bold color="#eceff4">{log.text}</Text>
            </Box>
          )
        }

        if (log.type === 'loading') {
          return (
            <ClaudeLoading
              key={idx}
              message={log.message}
              model={log.model}
              isCustom={log.isCustom}
            />
          )
        }

        if (log.type === 'error') {
          return (
            <Box key={idx} marginY={1}>
              <Text color="#bf616a">✖ Error: {log.message}</Text>
            </Box>
          )
        }

        if (log.type === 'search') {
          const results = log.data.results || []
          return (
            <Box key={idx} flexDirection="column" marginY={1}>
              <Box marginBottom={1}>
                <Text color="#a3be8c" bold>
                  ✓ Tiny Fish Search Results ({results.length} found for "{log.data.query}"):
                </Text>
              </Box>

              {results.length === 0 ? (
                <Text dimColor>No results found.</Text>
              ) : (
                results.slice(0, 5).map((r, i) => (
                  <Box key={i} flexDirection="column" marginBottom={1} paddingLeft={2}>
                    <Box flexDirection="row">
                      <Text color="#88c0d0" bold>
                        {r.position || i + 1}. {r.title}
                      </Text>
                      {r.site_name ? (
                        <Text dimColor> ({r.site_name})</Text>
                      ) : null}
                    </Box>
                    <Text color="#5e81ac">{r.url}</Text>
                    <Text color="#d8dee9">{r.snippet}</Text>
                  </Box>
                ))
              )}
            </Box>
          )
        }

        if (log.type === 'fetch') {
          const preview =
            log.content.length > 600
              ? log.content.slice(0, 600) + '...\n[Content truncated]'
              : log.content

          return (
            <Box key={idx} flexDirection="column" marginY={1}>
              <Text color="#a3be8c" bold>
                ✓ Tiny Fish Extracted Page: {log.url}
              </Text>
              <Box
                borderStyle="single"
                borderColor="#4c566a"
                padding={1}
                marginTop={1}
                flexDirection="column"
              >
                <Text color="#e5e9f0">{preview}</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'wallet') {
          const w = log.data || {}
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>
                ✓ Tiny Fish Wallet:
              </Text>
              <Box marginTop={1} flexDirection="column" paddingLeft={2}>
                <Text color="#88c0d0">
                  Balance: <Text bold color="#eceff4">${w.available_balance ?? '0.00'} {w.currency ?? 'USD'}</Text>
                </Text>
                {w.auto_reload?.state ? (
                  <Text dimColor>Auto-reload: {w.auto_reload.state}</Text>
                ) : null}
                {w.as_of ? (
                  <Text dimColor>Last updated: {w.as_of}</Text>
                ) : null}
              </Box>
            </Box>
          )
        }

        if (log.type === 'sessions') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>
                ✓ Tiny Fish Browser Sessions:
              </Text>
              <Box marginTop={1} flexDirection="column">
                <Text color="#d8dee9">
                  {typeof log.data === 'object'
                    ? JSON.stringify(log.data, null, 2)
                    : String(log.data)}
                </Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'antigravity_login_url') {
          const browserLabel = log.browserOpened && log.browserName
            ? `✓ Opened Google sign-in in ${log.browserName}!`
            : log.browserOpened
              ? '✓ Opening Google sign-in in your browser...'
              : '⚠ Could not open browser automatically.'
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color={log.browserOpened ? '#a3be8c' : '#d08770'} bold>
                {browserLabel}
              </Text>
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>If your browser did not open, copy this URL:</Text>
                <Text color="#88c0d0" underline>{log.url}</Text>
                <Box marginTop={1} flexDirection="column">
                  <Text color="#ebcb8b" bold>After signing in with Google:</Text>
                  <Text dimColor>1. Google will display your authorization code (or redirect to callback).</Text>
                  <Text dimColor>2. Copy the authorization code and enter it below:</Text>
                  <Box marginTop={0} paddingLeft={1}>
                    <Text color="#a3be8c" bold>{'> '} /auth &lt;code&gt;</Text>
                  </Box>

                </Box>
              </Box>
            </Box>
          )
        }


        if (log.type === 'antigravity_login_success') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>
                ✓ Antigravity Authenticated Successfully!
              </Text>
              <Text dimColor>Account: {log.email}</Text>
              <Text dimColor>Project ID: {log.projectId}</Text>
            </Box>
          )
        }

        if (log.type === 'model_switched') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>
                ✓ Active Antigravity model switched to {log.modelName}
              </Text>
              <Text dimColor>ID: {log.modelId} · Context limit: {log.contextMax.toLocaleString()} tokens</Text>
            </Box>
          )
        }

        if (log.type === 'antigravity_models') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>
                Available Antigravity Models:
              </Text>
              <Box marginTop={1} flexDirection="column">
                {log.models.map(m => (
                  <Text key={m.id}>
                    <Text color="#a3be8c">• {m.name}</Text>
                    <Text dimColor> ({m.id})</Text>
                  </Text>
                ))}
              </Box>
              <Box marginTop={1}>
                <Text dimColor>Use </Text>
                <Text color="#ebcb8b">/model &lt;id&gt;</Text>
                <Text dimColor> to switch active model.</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'antigravity_chat') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>
                [{log.model}]
              </Text>
              <Box marginTop={1}>
                <Text color="#eceff4">{log.text}</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'agent_step') {
          const badgeColor =
            log.mode === 'search' ? '#88c0d0' :
            log.mode === 'browse' ? '#a3be8c' :
            log.mode === 'fetch' ? '#ebcb8b' :
            log.mode === 'agent' ? '#b48ead' :
            log.mode === 'context' ? '#81a1c1' : '#d08770'
          const icon =
            log.mode === 'search' ? '🔍' :
            log.mode === 'browse' ? '🌐' :
            log.mode === 'fetch' ? '⚡' :
            log.mode === 'agent' ? '🤖' :
            log.mode === 'context' ? '📥' : '💡'

          return (
            <Box key={idx} flexDirection="column" marginY={0} paddingLeft={2}>
              <Box flexDirection="row">
                <Text color={badgeColor} bold>{icon} [{log.title}]: </Text>
                <Text color="#eceff4">{log.details}</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'dual_agent_research') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>
                🌐 Tiny Fish Web Research:
              </Text>
              {log.visited.length > 0 ? (
                <Box flexDirection="column" marginTop={0}>
                  {log.visited.map((v, i) => (
                    <Box key={i} flexDirection="row" paddingLeft={1}>
                      <Text color="#a3be8c">↗ Visiting: </Text>
                      <Text color="#88c0d0" underline>{v.url}</Text>
                      {v.title ? <Text dimColor> ({v.title})</Text> : null}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box paddingLeft={1}>
                  <Text dimColor>Queried: "{log.query}" (no new pages visited)</Text>
                </Box>
              )}
            </Box>
          )
        }

        if (log.type === 'antigravity_reasoning') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>
                💡 Antigravity ({log.model}):
              </Text>
              <Box marginTop={1}>
                <Text color="#eceff4">{log.text}</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'file_edit_applied') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>
                ✓ File Edit Approved & Applied!
              </Text>
              <Text color="#88c0d0">  • File: {log.filePath}</Text>
              <Text dimColor>  • Reason: {log.reasoning}</Text>
            </Box>
          )
        }

        if (log.type === 'file_edit_rejected') {
          return (
            <Box key={idx} marginY={1} paddingLeft={2}>
              <Text color="#bf616a">✖ File edit for {log.filePath} rejected by user.</Text>
            </Box>
          )
        }

        if (log.type === 'agent_interrupted') {
          return (
            <Box key={idx} marginY={1} paddingLeft={2}>
              <Text color="#ebcb8b">■ {log.message}</Text>
            </Box>
          )
        }

        if (log.type === 'antigravity_quota') {
          const { modelId, usedTokens, maxTokens, remainingFraction, resetTime } = log.data
          const remainingPct = Math.round(remainingFraction * 100)
          const usedPct = 100 - remainingPct
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>✓ Antigravity Quota & Token Status:</Text>
              <Text>• Active Model: <Text color="#88c0d0">{modelId}</Text></Text>
              <Text>• Context Limit: <Text color="#d8dee9">{maxTokens.toLocaleString()} tokens</Text></Text>
              <Text>
                • Usage: <Text color="#ebcb8b">{usedTokens.toLocaleString()}</Text> used ({usedPct}%) · <Text color="#a3be8c">{remainingPct}% remaining</Text>
              </Text>
              {resetTime ? <Text dimColor>• Reset Time: {resetTime}</Text> : null}
            </Box>
          )
        }

        if (log.type === 'mcp_status') {
          const { action, data } = log
          const servers = data?.servers || []
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>
                ✓ Model Context Protocol (MCP) {action === 'test' ? 'Connectivity Test' : 'Servers'}:
              </Text>
              {data?.latencyMs ? (
                <Text dimColor>Ping latency: {data.latencyMs}ms</Text>
              ) : null}
              {servers.map((s: any, sIdx: number) => (
                <Box key={sIdx} flexDirection="column" marginTop={1} paddingLeft={1}>
                  <Box flexDirection="row">
                    <Text color="#88c0d0" bold>• {s.name}</Text>
                    <Text color={s.status.includes('Error') ? '#bf616a' : '#a3be8c'}> [{s.status}]</Text>
                  </Box>
                  {s.endpoint ? <Text dimColor>  Endpoint: {s.endpoint}</Text> : null}
                  {s.tools ? <Text color="#d8dee9">  Tools: {s.tools.join(', ')}</Text> : null}
                  {s.description ? <Text dimColor>  Description: {s.description}</Text> : null}
                </Box>
              ))}
              <Box marginTop={1}>
                <Text dimColor>Commands: /mcp list · /mcp test · /mcp enable &lt;name&gt; · /mcp disable &lt;name&gt;</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'github_status') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>
                ✓ GitHub & Repository Manager:
              </Text>
              {log.error ? (
                <Text color="#bf616a">{log.error}</Text>
              ) : (
                <Box flexDirection="column" marginTop={1}>
                  <Text>• Branch: <Text color="#88c0d0">{log.branch}</Text></Text>
                  <Text>• Remote: <Text dimColor>{log.remote}</Text></Text>
                  {log.recentCommits && log.recentCommits.length > 0 ? (
                    <Box flexDirection="column" marginTop={1}>
                      <Text color="#ebcb8b">Recent Commits:</Text>
                      {log.recentCommits.map((c, cIdx) => (
                        <Text key={cIdx} dimColor>  {c}</Text>
                      ))}
                    </Box>
                  ) : null}
                  {log.statusSummary ? (
                    <Box flexDirection="column" marginTop={1}>
                      <Text color="#d08770">Uncommitted Changes:</Text>
                      <Text dimColor>{log.statusSummary}</Text>
                    </Box>
                  ) : (
                    <Text color="#a3be8c">Working tree clean</Text>
                  )}
                </Box>
              )}
              <Box marginTop={1}>
                <Text dimColor>Subcommands: /github pr · /github issue · /github wrap · /github status</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'frontend_design_guide') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>
                ◆ Frontend Design System Principles:
              </Text>
              <Box flexDirection="column" marginTop={1}>
                <Text><Text color="#ebcb8b" bold>1. Distinctive Typography: </Text><Text dimColor>Pair purposeful display fonts with high-legibility body typefaces.</Text></Text>
                <Text><Text color="#ebcb8b" bold>2. Cohesive Color Palette: </Text><Text dimColor>One dominant neutral canvas, one accent color, and subtle borders.</Text></Text>
                <Text><Text color="#ebcb8b" bold>3. Spatial Hierarchy: </Text><Text dimColor>Generous whitespace, structured vertical rhythm, and clear grouping.</Text></Text>
                <Text><Text color="#ebcb8b" bold>4. Production Polish: </Text><Text dimColor>Smooth cubic-bezier transitions, semantic HTML, and responsive flex/grid layouts.</Text></Text>
              </Box>
              {log.notice ? (
                <Box marginTop={1}><Text color="#d08770">{log.notice}</Text></Box>
              ) : null}
              <Box marginTop={1}>
                <Text dimColor>Usage: /frontend-design &lt;description of component or page to build&gt;</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'frontend_design_result') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>
                ◆ Frontend Design Synthesis ("{log.query}"):
              </Text>
              <Box marginTop={1} paddingLeft={1}>
                <Text color="#eceff4">{log.design}</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'simplify_result') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>
                ◆ Code Review & Simplification Analysis:
              </Text>
              <Box marginTop={1} paddingLeft={1}>
                <Text color="#eceff4">{log.analysis}</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'doctor_report') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>
                ✓ Ingressus AI Doctor Diagnostics:
              </Text>
              <Box flexDirection="column" marginTop={1}>
                <Text>✔ Node.js Runtime: <Text color="#88c0d0">{log.nodeVersion}</Text> on {log.platform}</Text>
                <Text>✔ Git: <Text color="#88c0d0">{log.gitVersion}</Text></Text>
                <Text>✔ Working Directory: <Text dimColor>{log.cwd}</Text></Text>
                <Text>
                  {log.antigravityAuth.authenticated ? '✔' : '✖'} Antigravity Auth: {log.antigravityAuth.authenticated ? <Text color="#a3be8c">Connected ({log.antigravityAuth.email} · {log.antigravityAuth.projectId})</Text> : <Text color="#d08770">Not logged in (Run /login antigravity)</Text>}
                </Text>
                <Text>
                  {log.tinyFishMcp.healthy ? '✔' : '✖'} Tiny Fish MCP: {log.tinyFishMcp.healthy ? <Text color="#a3be8c">Operational ({log.tinyFishMcp.endpoint})</Text> : <Text color="#bf616a">Endpoint unreachable</Text>}
                </Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'diff_output') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>◆ Git Diff:</Text>
              <Box marginTop={1}>
                <Text color="#d8dee9">{log.diff}</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'status_output') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>✓ System & Session Status:</Text>
              <Box flexDirection="column" marginTop={1}>
                <Text>• Directory: <Text dimColor>{log.cwd}</Text></Text>
                <Text>• Active Model: <Text color="#88c0d0">{log.model}</Text></Text>
                <Text>• Auth Status: {log.authenticated ? <Text color="#a3be8c">Authenticated</Text> : <Text color="#616e88">Unauthenticated</Text>}</Text>
                <Text>• Git: <Text dimColor>{log.gitStatus}</Text></Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'commit_output') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>✓ Git Commit:</Text>
              <Text dimColor>{log.message}</Text>
            </Box>
          )
        }

        if (log.type === 'agents_list') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>◆ Configured Agents & Personas:</Text>
              {log.agents.map((a, aIdx) => (
                <Box key={aIdx} flexDirection="column" marginTop={1}>
                  <Box flexDirection="row">
                    <Text color="#eceff4" bold>• {a.name}</Text>
                    <Text color="#a3be8c"> [{a.status}]</Text>
                  </Box>
                  <Text dimColor>  {a.description}</Text>
                </Box>
              ))}
            </Box>
          )
        }

        if (log.type === 'branch_info') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>◆ Conversation Branch:</Text>
              <Text color="#d8dee9">{log.message}</Text>
            </Box>
          )
        }

        if (log.type === 'btw_response') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>◆ Side Question: "{log.question}"</Text>
              <Box marginTop={1}>
                <Text color="#eceff4">{log.answer}</Text>
              </Box>
            </Box>
          )
        }

        if (log.type === 'add_dir_success') {
          return (
            <Box key={idx} marginY={1} paddingLeft={2}>
              <Text color="#a3be8c">✓ Added working directory to context: <Text bold color="#eceff4">{log.directory}</Text></Text>
            </Box>
          )
        }

        if (log.type === 'logout_success') {
          return (
            <Box key={idx} marginY={1} paddingLeft={2}>
              <Text color="#a3be8c">✓ Successfully signed out of Antigravity and cleared cached tokens.</Text>
            </Box>
          )
        }

        if (log.type === 'provider_list' || log.type === 'provider_switch') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>✓ API Providers:</Text>
              <Text>• Active Provider: <Text color="#88c0d0" bold>{log.current}</Text></Text>
              <Text dimColor>• Available: {log.available.join(', ')}</Text>
              <Text dimColor>• Run /provider &lt;name&gt; to switch</Text>
            </Box>
          )
        }

        if (log.type === 'memory_info') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>◆ Project Memory:</Text>
              {log.items.map((m, mIdx) => (
                <Text key={mIdx} dimColor>• {m}</Text>
              ))}
            </Box>
          )
        }

        if (log.type === 'cost_summary') {
          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#a3be8c" bold>◆ Session Token & Cost Summary:</Text>
              <Text>• Model: <Text color="#88c0d0">{log.model}</Text></Text>
              <Text>• Context Used: <Text color="#ebcb8b">{log.usedTokens.toLocaleString()}</Text> / {log.maxTokens.toLocaleString()}</Text>
              <Text>• Estimated Cost: <Text color="#a3be8c">{log.estimatedCost}</Text></Text>
            </Box>
          )
        }

        if (log.type === 'help') {

          return (
            <Box key={idx} flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="#88c0d0" bold>
                Available Commands & Functions:
              </Text>

              <Box marginTop={1} flexDirection="column">
                <Text color="#a3be8c" bold>─── Tiny Fish Functions ───</Text>
                <Text>
                  <Text color="#ebcb8b">/search &lt;query&gt;</Text>
                  <Text dimColor> — Live web search via Tiny Fish MCP (or type query directly)</Text>
                </Text>
                <Text>
                  <Text color="#ebcb8b">/fetch &lt;url&gt;</Text>
                  <Text dimColor> — Extract clean token-efficient page content from URL</Text>
                </Text>
                <Text>
                  <Text color="#ebcb8b">/wallet</Text>
                  <Text dimColor> — Check Tiny Fish wallet balance & credits</Text>
                </Text>
                <Text>
                  <Text color="#ebcb8b">/sessions</Text>
                  <Text dimColor> — List remote browser automation sessions</Text>
                </Text>

                <Box marginTop={1} flexDirection="column">
                  <Text color="#a3be8c" bold>─── Tau & Antigravity Pipeline ───</Text>
                  <Text>
                    <Text color="#ebcb8b">/frontend-design &lt;prompt&gt;</Text>
                    <Text dimColor> — Generate distinctive, production-grade frontend UI code</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/simplify</Text>
                    <Text dimColor> — Review changed code for reuse, quality, and efficiency</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/mcp [list|test]</Text>
                    <Text dimColor> — Manage MCP servers (Tiny Fish, Stitch, etc.)</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/github [issue|pr|wrap|status]</Text>
                    <Text dimColor> — GitHub repo manager & git integration</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/doctor</Text>
                    <Text dimColor> — Check system environment, auth, and MCP connectivity</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/diff</Text> · <Text color="#ebcb8b">/status</Text> · <Text color="#ebcb8b">/commit</Text>
                    <Text dimColor> — Inspect git changes, repo status & AI commits</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/login</Text> · <Text color="#ebcb8b">/logout</Text> · <Text color="#ebcb8b">/auth &lt;code&gt;</Text>
                    <Text dimColor> — Google Antigravity OAuth account management</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/quota</Text>
                    <Text dimColor> — Fetch real quota & token limits from Google Code Assist</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/models</Text> · <Text color="#ebcb8b">/model &lt;id&gt;</Text>
                    <Text dimColor> — Browse and switch active Antigravity model</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/chat &lt;prompt&gt;</Text>
                    <Text dimColor> — Generate response with active Antigravity model</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/agents</Text> · <Text color="#ebcb8b">/branch</Text> · <Text color="#ebcb8b">/btw &lt;q&gt;</Text>
                    <Text dimColor> — Specialized agents, conversation branching & quick side inquiries</Text>
                  </Text>
                </Box>

                <Box marginTop={1} flexDirection="column">
                  <Text color="#a3be8c" bold>─── General ───</Text>
                  <Text>
                    <Text color="#ebcb8b">/clear</Text>
                    <Text dimColor> — Clear terminal output history</Text>
                  </Text>
                  <Text>
                    <Text color="#ebcb8b">/exit</Text> or <Text color="#ebcb8b">q</Text>
                    <Text dimColor> — Exit application</Text>
                  </Text>
                </Box>

              </Box>
            </Box>
          )
        }

        return null
      })}
    </Box>
  )
})

