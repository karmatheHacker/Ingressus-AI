import React from 'react'
import { Box, Text, useInput, useStdin, useStdout } from 'ink'
import type { ProposedFileEdit } from '../agent/coordinator.js'

export interface FilePermissionPromptProps {
  edit: ProposedFileEdit
  onApprove: () => void
  onReject: () => void
}

export const FilePermissionPrompt = React.memo(function FilePermissionPrompt({
  edit,
  onApprove,
  onReject,
}: FilePermissionPromptProps): React.ReactElement {
  const { stdout } = useStdout()
  const { isRawModeSupported } = useStdin()
  const columns = stdout?.columns ?? 80
  const boxWidth = Math.min(columns - 4, 110)

  useInput(
    (input, key) => {
      if (key.return || input === 'y' || input === 'Y') {
        onApprove()
        return
      }
      if (key.escape || input === 'n' || input === 'N') {
        onReject()
        return
      }
    },
    { isActive: Boolean(isRawModeSupported) }
  )

  const lineCount = edit.newContent.split('\n').length

  return (
    <Box flexDirection="column" width={boxWidth} alignSelf="center" marginTop={1}>
      <Box
        borderStyle="round"
        borderColor="#ebcb8b"
        paddingX={1}
        flexDirection="column"
        width={boxWidth}
      >
        <Box flexDirection="row" marginBottom={1}>
          <Text color="#ebcb8b" bold>? File Edit Permission Requested</Text>
        </Box>

        <Box flexDirection="column" paddingLeft={1} marginBottom={1}>
          <Box flexDirection="row">
            <Text dimColor>Target File: </Text>
            <Text color="#88c0d0" bold>{edit.filePath}</Text>
            <Text dimColor> ({lineCount} lines)</Text>
          </Box>
          <Box flexDirection="row" marginTop={0}>
            <Text dimColor>Reason: </Text>
            <Text color="#eceff4">{edit.reasoning}</Text>
          </Box>
        </Box>

        <Box flexDirection="row" justifyContent="space-between" marginTop={0}>
          <Text color="#a3be8c" bold>[Enter / y] Approve & Apply Edit</Text>
          <Text color="#bf616a" bold>[Esc / n] Reject</Text>
        </Box>
      </Box>
    </Box>
  )
})
