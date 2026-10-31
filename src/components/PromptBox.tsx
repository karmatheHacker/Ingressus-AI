import React, { useState, useEffect } from 'react'
import { Box, Text, useInput, useStdin, useStdout } from 'ink'
import os from 'node:os'
import { getSlashCommandSuggestions, type SlashCommand } from '../commands/registry.js'

interface PromptBoxProps {
  onSubmit: (value: string) => void
  onAbort?: () => void
  disabled?: boolean
  cwd?: string
  modelInfo?: string
  contextUsed?: number | null
  contextMax?: number | null
  isAuthenticated?: boolean
  initialValue?: string
}

function formatCwd(dir: string): string {
  const home = os.homedir()
  if (dir.startsWith(home)) {
    return '~' + dir.slice(home.length)
  }
  return dir
}

export function PromptBox({
  onSubmit,
  onAbort,
  disabled = false,
  cwd = process.cwd(),
  modelInfo = 'Tiny Fish / Web Agent',
  contextUsed = null,
  contextMax = 1000000,
  isAuthenticated = false,
  initialValue = '',
}: PromptBoxProps): React.ReactElement {
  const [value, setValue] = useState(initialValue)
  const [cursorPos, setCursorPos] = useState(initialValue.length)

  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)

  const { stdout } = useStdout()
  const { stdin, isRawModeSupported } = useStdin()
  const columns = stdout?.columns ?? 80
  const boxWidth = Math.min(columns - 4, 110)

  // Ensure stdin is continuously flowing and active after commands finish
  useEffect(() => {
    if (stdin && isRawModeSupported) {
      try {
        stdin.resume()
      } catch {}
    }
  }, [disabled, stdin, isRawModeSupported])

  // Slash commands filtering
  const isSlashActive = value.startsWith('/') && !value.includes(' ')
  const suggestions = isSlashActive ? getSlashCommandSuggestions(value) : []
  const safeIndex =
    suggestions.length > 0
      ? Math.max(0, Math.min(selectedSuggestionIndex, suggestions.length - 1))
      : 0

  useEffect(() => {
    setSelectedSuggestionIndex(0)
  }, [value])

  // Solid inverted cursor when focused - eliminates periodic 530ms re-renders & terminal flicker

  useInput(
    (input, key) => {
      if (disabled) {
        if (key.escape && onAbort) {
          onAbort()
        }
        return
      }

      if (key.escape) {
        setValue('')
        setCursorPos(0)
        return
      }

      // If suggestions are active and user presses up/down/tab
      if (isSlashActive && suggestions.length > 0) {
        if (key.downArrow) {
          setSelectedSuggestionIndex(prev => (prev + 1) % suggestions.length)
          return
        }
        if (key.upArrow) {
          setSelectedSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length)
          return
        }
        if (key.tab) {
          const item = suggestions[safeIndex]
          if (item) {
            const fill = item.displayText + ' '
            setValue(fill)
            setCursorPos(fill.length)
          }
          return
        }
      }

      if (key.return) {
        if (isSlashActive && suggestions.length > 0) {
          const item = suggestions[safeIndex]
          if (item) {
            if (item.requiresArgs) {
              const fill = item.displayText + ' '
              setValue(fill)
              setCursorPos(fill.length)
              return
            }
            setHistory(prev => [...prev, item.displayText])
            setHistoryIndex(-1)
            setValue('')
            setCursorPos(0)
            onSubmit(item.displayText)
            return
          }
        }

        const trimmed = value.trim()
        if (trimmed) {
          setHistory(prev => [...prev, trimmed])
          setHistoryIndex(-1)
          setValue('')
          setCursorPos(0)
          onSubmit(trimmed)
        }
        return
      }

      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          setValue(prev => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos))
          setCursorPos(prev => prev - 1)
        }
        return
      }

      if (key.leftArrow) {
        setCursorPos(prev => Math.max(0, prev - 1))
        return
      }

      if (key.rightArrow) {
        setCursorPos(prev => Math.min(value.length, prev + 1))
        return
      }

      if (key.upArrow) {
        if (history.length > 0) {
          const nextIndex =
            historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
          setHistoryIndex(nextIndex)
          const histVal = history[nextIndex] ?? ''
          setValue(histVal)
          setCursorPos(histVal.length)
        }
        return
      }

      if (key.downArrow) {
        if (historyIndex !== -1) {
          const nextIndex = historyIndex + 1
          if (nextIndex >= history.length) {
            setHistoryIndex(-1)
            setValue('')
            setCursorPos(0)
          } else {
            setHistoryIndex(nextIndex)
            const histVal = history[nextIndex] ?? ''
            setValue(histVal)
            setCursorPos(histVal.length)
          }
        }
        return
      }

      if (key.ctrl && input === 'u') {
        setValue('')
        setCursorPos(0)
        return
      }

      // Normal text input
      if (input && !key.ctrl && !key.meta) {
        setValue(prev => prev.slice(0, cursorPos) + input + prev.slice(cursorPos))
        setCursorPos(prev => prev + input.length)
      }
    },
    { isActive: Boolean(isRawModeSupported) }
  )

  // Context formatting
  const max = Math.max(1, contextMax || 1000000)
  const used = contextUsed !== null && contextUsed !== undefined ? Math.max(0, contextUsed) : null
  const pct = used !== null ? Math.max(0, Math.min(100, Math.round((used / max) * 100))) : 0
  const totalBars = 10
  const filledBars = Math.round((pct / 100) * totalBars)
  const barString = '█'.repeat(filledBars) + '░'.repeat(totalBars - filledBars)
  const barColor = pct > 85 ? '#bf616a' : pct > 60 ? '#ebcb8b' : '#a3be8c'

  const formatTokens = (n: number) => {
    if (n < 1000) return `${n}`
    if (n < 1000000) return `${Math.round(n / 1000)}K`
    const inMillions = Math.round((n / 1000000) * 10) / 10
    return inMillions % 1 === 0 ? `${inMillions}M` : `${inMillions.toFixed(1)}M`
  }

  const beforeCursor = value.slice(0, cursorPos)
  const atCursor = value[cursorPos] || ' '
  const afterCursor = value.slice(cursorPos + 1)

  // Calculate visible suggestions (max 6 rows displayed, scrolling window)
  const MAX_VISIBLE = 6
  const startIndex = Math.max(0, Math.min(safeIndex - 2, suggestions.length - MAX_VISIBLE))
  const visibleSuggestions = suggestions.slice(startIndex, startIndex + MAX_VISIBLE)

  return (
    <Box flexDirection="column" width={boxWidth} alignSelf="center" marginTop={1}>
      {/* Rounded Prompt Box */}
      <Box
        borderStyle="round"
        borderColor="#434c5e"
        paddingX={1}
        flexDirection="row"
        justifyContent="space-between"
        width={boxWidth}
      >
        <Box flexDirection="row" flexShrink={1}>
          <Text color="#81a1c1">{'>'} </Text>
          <Text>{beforeCursor}</Text>
          <Text
            color={!disabled ? '#eceff4' : undefined}
            backgroundColor={!disabled ? '#d8dee9' : undefined}
            inverse={!disabled}
          >
            {atCursor}
          </Text>
          <Text>{afterCursor}</Text>
        </Box>
        {disabled ? (
          <Box flexDirection="row" flexShrink={0} paddingLeft={1}>
            <Text color="#ebcb8b" bold>[Esc] to stop</Text>
          </Box>
        ) : null}
      </Box>

      {/* Suggestions Dropdown (appears when user types slash '/') */}
      {isSlashActive && suggestions.length > 0 && (
        <Box flexDirection="column" paddingX={1} width={boxWidth} marginY={0}>
          {visibleSuggestions.map((item, relIdx) => {
            const idx = startIndex + relIdx
            const isSelected = idx === safeIndex
            const nameColWidth = Math.min(34, Math.floor(boxWidth * 0.44))
            const padName =
              item.displayText.length < nameColWidth
                ? item.displayText + ' '.repeat(nameColWidth - item.displayText.length)
                : item.displayText.slice(0, nameColWidth - 1) + ' '

            const tagText = item.tag ? `${item.tag} ` : ''
            const remWidth = Math.max(10, boxWidth - nameColWidth - tagText.length - 4)
            const descText =
              item.description.length > remWidth
                ? item.description.slice(0, remWidth - 3) + '...'
                : item.description

            return (
              <Box key={item.name} flexDirection="row" width={boxWidth}>
                <Text color={isSelected ? '#88c0d0' : '#d8dee9'} bold={isSelected}>
                  {padName}
                </Text>
                {tagText ? (
                  <Text color={isSelected ? '#81a1c1' : '#616e88'}>{tagText}</Text>
                ) : null}
                <Text dimColor={!isSelected} color={isSelected ? '#eceff4' : undefined}>
                  {descText}
                </Text>
              </Box>
            )
          })}
        </Box>
      )}


      {/* Status / Footer Line */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        width={boxWidth}
        paddingX={1}
      >
        <Box flexDirection="row" flexShrink={1}>
          <Text dimColor wrap="truncate">{formatCwd(cwd)}</Text>
          <Text dimColor> · </Text>
          {isAuthenticated ? (
            <Text color="#88c0d0" wrap="truncate">{modelInfo}</Text>
          ) : (
            <Text wrap="truncate">
              <Text color="#d08770">antigravity disconnected</Text>
              <Text dimColor> · </Text>
              <Text color="#81a1c1">login to connect</Text>
            </Text>
          )}
        </Box>


        <Box flexDirection="row" flexShrink={0} paddingLeft={2}>
          <Text dimColor>Context </Text>
          {!isAuthenticated ? (
            <Text color="#616e88">--</Text>
          ) : used === null ? (
            <Text color="#81a1c1">fetching tokens...</Text>
          ) : (
            <>
              <Text color={barColor}>{barString}</Text>
              <Text dimColor> {formatTokens(used)}/{formatTokens(max)} ({pct}%)</Text>
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}

