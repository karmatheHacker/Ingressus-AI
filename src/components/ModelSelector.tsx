import React, { useState, useMemo } from 'react'
import { Box, Text, useInput, useStdin, useStdout } from 'ink'
import type { ModelInfo } from '../antigravity/models.js'

export interface ModelSelectorProps {
  currentModelId: string
  models: readonly ModelInfo[]
  onSelect: (model: ModelInfo) => void
  onCancel: () => void
  initialFilter?: string
}

const VISIBLE_COUNT = 10

export const ModelSelector = React.memo(function ModelSelector({
  currentModelId,
  models,
  onSelect,
  onCancel,
  initialFilter = '',
}: ModelSelectorProps): React.ReactElement {
  const [filterText, setFilterText] = useState(initialFilter)
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = models.findIndex(m => m.id === currentModelId)
    return idx >= 0 ? idx : 0
  })

  const { stdout } = useStdout()
  const { isRawModeSupported } = useStdin()
  const columns = stdout?.columns ?? 80
  const boxWidth = Math.min(columns - 4, 110)

  // Filter models by name, id or tags
  const filteredModels = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    if (!q) return models
    return models.filter(
      m =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.tags && m.tags.some(t => t.toLowerCase().includes(q)))
    )
  }, [filterText, models])

  const safeIndex =
    filteredModels.length > 0
      ? Math.max(0, Math.min(selectedIndex, filteredModels.length - 1))
      : 0

  // Calculate scrolling window
  const startIndex = Math.max(
    0,
    Math.min(safeIndex - Math.floor(VISIBLE_COUNT / 2), filteredModels.length - VISIBLE_COUNT)
  )
  const visibleModels = filteredModels.slice(startIndex, startIndex + VISIBLE_COUNT)

  useInput(
    (input, key) => {
      if (key.escape) {
        if (filterText.length > 0) {
          setFilterText('')
          setSelectedIndex(0)
        } else {
          onCancel()
        }
        return
      }

      if (key.return) {
        if (filteredModels.length > 0 && filteredModels[safeIndex]) {
          onSelect(filteredModels[safeIndex])
        } else {
          onCancel()
        }
        return
      }

      if (key.upArrow) {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredModels.length - 1))
        return
      }

      if (key.downArrow) {
        setSelectedIndex(prev => (prev < filteredModels.length - 1 ? prev + 1 : 0))
        return
      }

      if (key.pageUp) {
        setSelectedIndex(prev => Math.max(0, prev - VISIBLE_COUNT))
        return
      }

      if (key.pageDown) {
        setSelectedIndex(prev => Math.min(filteredModels.length - 1, prev + VISIBLE_COUNT))
        return
      }

      if (key.backspace || key.delete) {
        setFilterText(prev => {
          const next = prev.slice(0, -1)
          setSelectedIndex(0)
          return next
        })
        return
      }

      // Normal text input for live filtering
      if (input && !key.ctrl && !key.meta) {
        setFilterText(prev => {
          const next = prev + input
          setSelectedIndex(0)
          return next
        })
      }
    },
    { isActive: Boolean(isRawModeSupported) }
  )

  const hiddenAbove = startIndex
  const hiddenBelow = Math.max(0, filteredModels.length - (startIndex + VISIBLE_COUNT))

  return (
    <Box flexDirection="column" width={boxWidth} alignSelf="center" marginTop={1}>
      <Box
        borderStyle="round"
        borderColor="#88c0d0"
        paddingX={1}
        flexDirection="column"
        width={boxWidth}
      >
        {/* Header / Filter line */}
        <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <Box flexDirection="row">
            <Text color="#88c0d0" bold>Select Antigravity Model</Text>
            {filterText ? (
              <Text>
                {' '}<Text dimColor>(filtering: </Text>
                <Text color="#ebcb8b">"{filterText}"</Text>
                <Text dimColor>)</Text>
              </Text>
            ) : null}
          </Box>
          <Text dimColor>
            {safeIndex + 1}/{filteredModels.length}
          </Text>
        </Box>

        {hiddenAbove > 0 && (
          <Box paddingLeft={2}>
            <Text dimColor>↑ {hiddenAbove} more above...</Text>
          </Box>
        )}

        {filteredModels.length === 0 ? (
          <Box paddingLeft={2} marginY={1}>
            <Text color="#bf616a">No models matching "{filterText}"</Text>
          </Box>
        ) : (
          visibleModels.map((m, relIdx) => {
            const actualIdx = startIndex + relIdx
            const isSelected = actualIdx === safeIndex
            const isCurrentActive = m.id === currentModelId

            const statusTag = isCurrentActive
              ? '[active]'
              : m.contextWindow >= 1000000
                ? '[1M context]'
                : `[${Math.round(m.contextWindow / 1000)}K context]`

            return (
              <Box key={m.id} flexDirection="row" width={boxWidth - 4}>
                <Text color={isSelected ? '#88c0d0' : '#4c566a'} bold={isSelected}>
                  {isSelected ? '> ' : '  '}
                </Text>
                <Text
                  color={isSelected ? '#eceff4' : '#d8dee9'}
                  bold={isSelected}
                >
                  {m.name}
                </Text>
                <Text> </Text>
                <Text
                  color={
                    isCurrentActive
                      ? '#a3be8c'
                      : isSelected
                        ? '#81a1c1'
                        : '#4c566a'
                  }
                  bold={isCurrentActive}
                >
                  {statusTag}
                </Text>
              </Box>
            )
          })
        )}

        {hiddenBelow > 0 && (
          <Box paddingLeft={2}>
            <Text dimColor>↓ {hiddenBelow} more below...</Text>
          </Box>
        )}

        {/* Footer help */}
        <Box marginTop={1} flexDirection="row" justifyContent="space-between">
          <Text dimColor>↑/↓ or type to filter</Text>
          <Text dimColor>Enter: select · Esc: cancel</Text>
        </Box>
      </Box>
    </Box>
  )
})
