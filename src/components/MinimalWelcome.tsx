import React, { useEffect, useState } from 'react'
import { Box, Text, useStdout } from 'ink'
import os from 'node:os'
import { IngressusWordmark, DEFAULT_PALETTE } from './IngressusWordmark.js'

export interface MinimalWelcomeProps {
  version?: string
  modelName?: string
  providerName?: string
  cwd?: string
  skipIntro?: boolean
  animatable?: boolean
}

function formatCwd(dir: string): string {
  const home = os.homedir()
  if (dir.startsWith(home)) {
    return '~' + dir.slice(home.length)
  }
  return dir
}

export const MinimalWelcome = React.memo(function MinimalWelcome({
  version = '1.0.0',
  modelName = 'Powered by Tiny Fish',
  providerName = '',
  cwd = process.cwd(),
  skipIntro = false,
  animatable = true,
}: MinimalWelcomeProps): React.ReactElement {
  const { stdout } = useStdout()
  const [columns, setColumns] = useState(() => stdout?.columns ?? 80)

  useEffect(() => {
    function onResize() {
      if (stdout?.columns) {
        setColumns(stdout.columns)
      }
    }
    stdout?.on('resize', onResize)
    return () => {
      stdout?.off('resize', onResize)
    }
  }, [stdout])

  const modelLine =
    modelName && providerName
      ? `${modelName} · ${providerName}`
      : modelName || providerName

  const displayCwd = formatCwd(cwd)

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      width={columns}
      paddingY={1}
    >
      <Text dimColor>Ingressus AI v{version}</Text>

      <Box
        flexDirection="column"
        alignItems="center"
        marginTop={1}
        flexShrink={0}
      >
        <IngressusWordmark
          palette={DEFAULT_PALETTE}
          skipIntro={skipIntro}
          animatable={animatable}
        />
      </Box>

      <Box marginTop={1} flexDirection="column" alignItems="center">
        {modelLine ? (
          <Text dimColor wrap="truncate">
            {modelLine}
          </Text>
        ) : null}
        <Text dimColor wrap="truncate">
          {displayCwd}
        </Text>
      </Box>
    </Box>
  )
})


