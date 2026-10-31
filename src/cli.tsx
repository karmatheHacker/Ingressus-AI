import React, { useState, useEffect } from 'react'
import { render, useApp, Box } from 'ink'
import { MinimalWelcome } from './components/MinimalWelcome.js'
import { PromptBox } from './components/PromptBox.js'
import { ModelSelector } from './components/ModelSelector.js'
import { TinyFishOutput, type LogItem } from './components/TinyFishOutput.js'
import { tinyFish } from './services/tinyfish.js'
import {
  ANTIGRAVITY_MODELS,
  startAntigravityLogin,
  finishAntigravityLogin,
  antigravityTransport,
  peekAntigravityAccount,
  isAntigravityModelId,
  fetchAntigravityQuota,
  getModelContextWindow,
  selectActiveAntigravityAccount,
  loadStore,
} from './antigravity/index.js'
import { handleSlashCommand } from './commands/handlers.js'
import { openBrowser } from './utils/browser.js'
import fs from 'node:fs'
import path from 'node:path'
import { runDualAgentWorkflow, type ProposedFileEdit } from './agent/coordinator.js'
import { agentMemory } from './agent/memory.js'
import { FilePermissionPrompt } from './components/FilePermissionPrompt.js'



function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    skipIntro: false,
    animatable: true,
    version: '1.0.0',
    model: 'gemini-4-argon-high',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--instant' || arg === '--no-intro') {
      options.skipIntro = true
    } else if (arg === '--no-anim' || arg === '--static') {
      options.animatable = false
    } else if (arg === '--model' && args[i + 1]) {
      options.model = args[++i]!
    } else if (arg === '--version' && args[i + 1]) {
      options.version = args[++i]!
    }
  }

  return options
}

const cliOptions = parseArgs()

function App() {
  const { exit } = useApp()
  const [logs, setLogs] = useState<LogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeModel, setActiveModel] = useState(cliOptions.model)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return peekAntigravityAccount().kind !== 'none'
  })
  const [contextUsed, setContextUsed] = useState<number | null>(null)
  const [contextMax, setContextMax] = useState<number>(() =>
    getModelContextWindow(cliOptions.model)
  )
  const [isSelectingModel, setIsSelectingModel] = useState(false)
  const [modelFilter, setModelFilter] = useState('')
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
  >([])
  const [pendingFileEdit, setPendingFileEdit] = useState<ProposedFileEdit | null>(null)
  const abortControllerRef = React.useRef<AbortController | null>(null)

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setLoading(false)
    setLogs(prev => [
      ...prev.filter(l => l.type !== 'loading'),
      { type: 'agent_interrupted', message: 'Agent stopped by user (Esc)' },
    ])
  }

  const handleApproveFileEdit = () => {
    if (!pendingFileEdit) return
    try {
      const target = path.isAbsolute(pendingFileEdit.filePath)
        ? pendingFileEdit.filePath
        : path.resolve(process.cwd(), pendingFileEdit.filePath)
      const dir = path.dirname(target)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(target, pendingFileEdit.newContent, 'utf8')
      agentMemory.recordFileEdit({
        filePath: pendingFileEdit.filePath,
        summary: pendingFileEdit.reasoning,
      })
      setLogs(prev => [
        ...prev,
        {
          type: 'file_edit_applied',
          filePath: pendingFileEdit.filePath,
          reasoning: pendingFileEdit.reasoning,
        },
      ])
    } catch (err: any) {
      setLogs(prev => [
        ...prev,
        { type: 'error', message: `Failed to write file: ${err.message}` },
      ])
    } finally {
      setPendingFileEdit(null)
    }
  }

  const handleRejectFileEdit = () => {
    if (!pendingFileEdit) return
    setLogs(prev => [
      ...prev,
      {
        type: 'file_edit_rejected',
        filePath: pendingFileEdit.filePath,
      },
    ])
    setPendingFileEdit(null)
  }

  const handleSwitchModel = (targetModel: string) => {
    const info = ANTIGRAVITY_MODELS.find(
      m =>
        m.id.toLowerCase() === targetModel.toLowerCase() ||
        m.name.toLowerCase() === targetModel.toLowerCase()
    )
    const modelId = info?.id || targetModel
    const displayName = info?.name || targetModel

    setActiveModel(modelId)
    const newMax = getModelContextWindow(modelId)
    setContextMax(newMax)
    setLogs(prev => [
      ...prev,
      {
        type: 'model_switched',
        modelName: displayName,
        modelId,
        contextMax: newMax,
      },
    ])

    // If authenticated, re-fetch authentic quota for the new model
    const store = loadStore()
    const account = selectActiveAntigravityAccount(store)
    if (account?.accessToken && account?.projectId) {
      fetchAntigravityQuota(account.accessToken, account.projectId, modelId)
        .then(quota => {
          if (quota) {
            setContextUsed(quota.usedTokens)
            setContextMax(quota.maxTokens)
          }
        })
        .catch(() => {})
    }
  }

  // On mount: check auth & fetch authentic token quota if logged in
  useEffect(() => {
    const authState = peekAntigravityAccount()
    if (authState.kind !== 'none') {
      setIsAuthenticated(true)
      const store = loadStore()
      const account = selectActiveAntigravityAccount(store)
      if (account?.accessToken && account?.projectId) {
        fetchAntigravityQuota(account.accessToken, account.projectId, activeModel)
          .then(quota => {
            if (quota) {
              setContextUsed(quota.usedTokens)
              setContextMax(quota.maxTokens)
            } else {
              setContextUsed(0)
            }
          })
          .catch(() => {
            setContextUsed(0)
          })
      } else {
        setContextUsed(0)
      }
    } else {
      setIsAuthenticated(false)
      setContextUsed(null)
    }
  }, [])


  const handleSubmit = async (rawInput: string) => {
    const input = rawInput.trim()
    if (!input) return

    // Quick local commands
    if (input === '/clear') {
      setLogs([])
      setConversationHistory([])
      return
    }

    if (input === '/exit' || input === '/quit' || input === 'exit') {
      exit()
      return
    }

    if (input === '/help') {
      setLogs(prev => [...prev, { type: 'user', text: input }, { type: 'help' }])
      return
    }

    // Tau Slash Commands (mcp, github, frontend-design, simplify, doctor, diff, status, etc.)
    const slashResult = await handleSlashCommand(input, {
      activeModel,
      setActiveModel,
      isAuthenticated,
      setIsAuthenticated,
      contextUsed,
      setContextUsed,
      contextMax,
      setContextMax,
    })

    if (slashResult) {
      setLogs(prev => [...prev, { type: 'user', text: input }, slashResult as LogItem])
      return
    }

    // Antigravity Login flow — supports /login, /login antigravity, /login chrome, /login edge, etc.
    if (input === '/login' || input.startsWith('/login ')) {
      const loginArgs = input.slice(6).trim().toLowerCase()
      // If user typed a browser name (not 'antigravity'), use it as preferred browser
      const preferredBrowser = loginArgs && loginArgs !== 'antigravity' ? loginArgs : undefined

      setLogs(prev => [...prev, { type: 'user', text: input }])
      const { url } = startAntigravityLogin()
      // Directly open browser — tries default, then any installed browser on the machine
      const browserResult = await openBrowser(url, preferredBrowser)
      setLogs(prev => [
        ...prev,
        {
          type: 'antigravity_login_url',
          url,
          browserOpened: browserResult.success,
          browserName: browserResult.browserName,
        },
      ])
      return
    }


    if (input.startsWith('/auth ') || (input.length > 30 && input.includes('4/0A'))) {
      const code = input.startsWith('/auth ') ? input.slice(6).trim() : input
      setLoading(true)
      setLogs(prev => [
        ...prev,
        { type: 'user', text: '/auth <code>' },
        { type: 'loading', message: 'Exchanging code and discovering Antigravity project...' },
      ])
      try {
        const result = await finishAntigravityLogin(code)
        setIsAuthenticated(true)
        setLogs(prev => [
          ...prev.filter(l => l.type !== 'loading'),
          {
            type: 'antigravity_login_success',
            email: result.email || 'authenticated user',
            projectId: result.projectId,
          },
          {
            type: 'loading',
            message: `Fetching authentic token quota for ${activeModel}...`,
          },
        ])

        // Immediately fetch authentic quota & tokens from Antigravity
        try {
          const quota = await fetchAntigravityQuota(result.accessToken, result.projectId, activeModel)
          if (quota) {
            setContextUsed(quota.usedTokens)
            setContextMax(quota.maxTokens)
            setLogs(prev => [
              ...prev.filter(l => l.type !== 'loading'),
              { type: 'antigravity_quota', data: quota },
            ])
          } else {
            setContextUsed(0)
            setLogs(prev => prev.filter(l => l.type !== 'loading'))
          }
        } catch {
          setContextUsed(0)
          setLogs(prev => prev.filter(l => l.type !== 'loading'))
        }
      } catch (err: any) {
        setLogs(prev => [
          ...prev.filter(l => l.type !== 'loading'),
          { type: 'error', message: err?.message || String(err) },
        ])
      } finally {
        setLoading(false)
      }
      return
    }

    // Antigravity Quota / Usage inspection
    if (input === '/quota' || input === '/usage') {
      const authState = peekAntigravityAccount()
      if (authState.kind === 'none') {
        setLogs(prev => [
          ...prev,
          { type: 'user', text: input },
          { type: 'error', message: 'You are not authenticated. Run /login antigravity first to view real token quota.' },
        ])
        return
      }

      setLoading(true)
      setLogs(prev => [
        ...prev,
        { type: 'user', text: input },
        { type: 'loading', message: `Querying Antigravity quota and tokens for ${activeModel}...` },
      ])

      try {
        const store = loadStore()
        const account = selectActiveAntigravityAccount(store)
        if (!account?.accessToken || !account?.projectId) {
          throw new Error('No active authenticated Antigravity account found.')
        }
        const quota = await fetchAntigravityQuota(account.accessToken, account.projectId, activeModel)
        if (quota) {
          setContextUsed(quota.usedTokens)
          setContextMax(quota.maxTokens)
          setLogs(prev => [
            ...prev.filter(l => l.type !== 'loading'),
            { type: 'antigravity_quota', data: quota },
          ])
        } else {
          throw new Error('Unable to retrieve quota summary from Antigravity endpoints.')
        }
      } catch (err: any) {
        setLogs(prev => [
          ...prev.filter(l => l.type !== 'loading'),
          { type: 'error', message: err?.message || String(err) },
        ])
      } finally {
        setLoading(false)
      }
      return
    }

    // Antigravity Models — Interactive Selector like Tau
    if (input === '/models' || input === '/model') {
      setIsSelectingModel(true)
      setModelFilter('')
      return
    }

    if (input.startsWith('/model ')) {
      const query = input.slice(7).trim().toLowerCase()
      const exact = ANTIGRAVITY_MODELS.find(
        m =>
          m.id.toLowerCase() === query ||
          m.name.toLowerCase() === query
      )
      if (exact) {
        handleSwitchModel(exact.id)
      } else {
        // Open interactive selector pre-filtered with the query
        setModelFilter(query)
        setIsSelectingModel(true)
      }
      return
    }

    setLoading(true)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setLogs(prev => [...prev, { type: 'user', text: input }])

    try {
      // Tiny Fish Wallet
      if (input === '/wallet') {
        setLogs(prev => [...prev, { type: 'loading', message: 'Fetching Tiny Fish wallet balance...', isCustom: true }])
        const wallet = await tinyFish.getWallet()
        if (contextUsed !== null) {
          setContextUsed(c => (c !== null ? c + 1200 : null))
        }
        setLogs(prev => [
          ...prev.filter(l => l.type !== 'loading'),
          { type: 'wallet', data: wallet },
        ])
      }
      // Tiny Fish Sessions
      else if (input === '/sessions') {
        setLogs(prev => [...prev, { type: 'loading', message: 'Listing Tiny Fish browser sessions...', isCustom: true }])
        const sessions = await tinyFish.listSessions()
        if (contextUsed !== null) {
          setContextUsed(c => (c !== null ? c + 1500 : null))
        }
        setLogs(prev => [
          ...prev.filter(l => l.type !== 'loading'),
          { type: 'sessions', data: sessions },
        ])
      }
      // Tiny Fish Fetch
      else if (input.startsWith('/fetch ') || input.startsWith('http://') || input.startsWith('https://')) {
        const url = input.startsWith('/fetch ') ? input.slice(7).trim() : input
        setLogs(prev => [...prev, { type: 'loading', message: `Fetching and extracting page: ${url}...`, isCustom: true }])
        const res = await tinyFish.fetchContent(url)
        const text = typeof res === 'string' ? res : res.content || res.markdown || JSON.stringify(res, null, 2)
        if (contextUsed !== null) {
          setContextUsed(c => (c !== null ? c + Math.min(25000, Math.round(text.length / 3)) : null))
        }
        setLogs(prev => [
          ...prev.filter(l => l.type !== 'loading'),
          { type: 'fetch', url, content: text },
        ])
      }
      // Explicit Chat with Antigravity
      else if (input.startsWith('/chat ')) {
        const promptText = input.slice(6).trim()
        setLogs(prev => [
          ...prev,
          { type: 'loading', message: 'Cooking...', model: activeModel },
        ])
        const newHistory = [
          ...conversationHistory,
          { role: 'user' as const, parts: [{ text: promptText }] },
        ]
        const { text: answer, usage } = await antigravityTransport.generateContentWithUsage({
          model: activeModel,
          contents: newHistory,
          signal: controller.signal,
        })
        setConversationHistory([
          ...newHistory,
          { role: 'model' as const, parts: [{ text: answer }] },
        ])
        if (usage && usage.totalTokenCount > 0) {
          setContextUsed(usage.totalTokenCount)
        } else if (contextUsed !== null) {
          setContextUsed(c => (c ?? 0) + Math.round((promptText.length + answer.length) / 3))
        }
        setLogs(prev => [
          ...prev.filter(l => l.type !== 'loading'),
          { type: 'antigravity_chat', model: activeModel, text: answer },
        ])
      }
      // Explicit Search or Collaborative Dual-Agent Query
      else {
        const isExplicitSearch = input.startsWith('/search ')
        const query = isExplicitSearch ? input.slice(8).trim() : input

        const authState = peekAntigravityAccount()
        if (!isExplicitSearch && authState.kind !== 'none') {
          // Both agents collaborate: Tiny Fish researches web + Antigravity codes & reasons
          setLogs(prev => [
            ...prev,
            { type: 'loading', message: 'Cooking...', model: activeModel },
          ])

          const result = await runDualAgentWorkflow(query, {
            model: activeModel,
            conversationHistory,
            signal: controller.signal,
            onStep: step => {
              setLogs(prev => [
                ...prev,
                {
                  type: 'agent_step',
                  mode: step.mode,
                  title: step.title,
                  details: step.details,
                },
              ])
            },
          })

          const newHistory = [
            ...conversationHistory,
            { role: 'user' as const, parts: [{ text: query }] },
            { role: 'model' as const, parts: [{ text: result.reasoningText }] },
          ]
          setConversationHistory(newHistory)

          if (result.usage && result.usage.totalTokenCount > 0) {
            setContextUsed(result.usage.totalTokenCount)
          } else if (contextUsed !== null) {
            setContextUsed(c => (c ?? 0) + Math.round((query.length + result.reasoningText.length) / 3))
          }

          setLogs(prev => {
            const next = prev.filter(l => l.type !== 'loading')
            if (result.visitedWebsites.length > 0) {
              next.push({
                type: 'dual_agent_research',
                query,
                visited: result.visitedWebsites,
              })
            }
            next.push({
              type: 'antigravity_reasoning',
              model: activeModel,
              text: result.reasoningText,
            })
            return next
          })

          if (result.proposedEdit) {
            setPendingFileEdit(result.proposedEdit)
          }
        } else {
          // Use TinyFish Search
          setLogs(prev => [...prev, { type: 'loading', message: `Searching Tiny Fish index for: "${query}"...`, isCustom: true }])
          const searchRes = await tinyFish.search(query)
          if (contextUsed !== null) {
            setContextUsed(c => (c !== null ? c + 2400 : null))
          }
          setLogs(prev => [
            ...prev.filter(l => l.type !== 'loading'),
            { type: 'search', data: searchRes },
          ])
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        setLogs(prev => [
          ...prev.filter(l => l.type !== 'loading'),
          { type: 'agent_interrupted', message: 'Agent stopped by user (Esc)' },
        ])
      } else {
        setLogs(prev => [
          ...prev.filter(l => l.type !== 'loading'),
          { type: 'error', message: err?.message || String(err) },
        ])
      }
    } finally {
      abortControllerRef.current = null
      setLoading(false)
    }
  }

  const modelDisplayInfo = isAuthenticated
    ? `Antigravity / ${activeModel}`
    : 'antigravity disconnected · login to connect'


  return (
    <Box flexDirection="column" paddingX={1} width="100%">
      {/* Top Welcome Header */}
      <MinimalWelcome
        version={cliOptions.version}
        modelName="Powered by Tiny Fish & Antigravity"
        providerName=""
        cwd={process.cwd()}
        skipIntro={cliOptions.skipIntro || logs.length > 0}
        animatable={cliOptions.animatable && logs.length === 0}
      />

      {/* Output / Search Results / Chat Area */}
      <TinyFishOutput logs={logs} />

      {/* Pending File Permission Prompt OR Interactive Model Selector OR Bottom Prompt Box */}
      {pendingFileEdit ? (
        <FilePermissionPrompt
          edit={pendingFileEdit}
          onApprove={handleApproveFileEdit}
          onReject={handleRejectFileEdit}
        />
      ) : isSelectingModel ? (
        <ModelSelector
          currentModelId={activeModel}
          models={ANTIGRAVITY_MODELS}
          initialFilter={modelFilter}
          onSelect={selected => {
            setIsSelectingModel(false)
            setModelFilter('')
            handleSwitchModel(selected.id)
          }}
          onCancel={() => {
            setIsSelectingModel(false)
            setModelFilter('')
          }}
        />
      ) : (
        <PromptBox
          onSubmit={handleSubmit}
          onAbort={handleAbort}
          disabled={loading}
          cwd={process.cwd()}
          modelInfo={modelDisplayInfo}
          contextUsed={contextUsed}
          contextMax={contextMax}
          isAuthenticated={isAuthenticated}
        />
      )}
    </Box>
  )
}

// Clear screen on initial launch
if (process.stdout.isTTY) {
  console.clear()
}

render(<App />)
