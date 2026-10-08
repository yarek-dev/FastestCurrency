import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import './styles.css'
import { SWRConfig } from 'swr'
import { swrOptions } from './modules/chats/api/swr-config'
import { applyTheme, readTheme } from '@frontend/src/lib/theme'

applyTheme(readTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SWRConfig value={swrOptions}>
      <RouterProvider router={router} />
    </SWRConfig>
  </StrictMode>,
)
