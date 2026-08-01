import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import Mascot from './components/Mascot.jsx'
import { LangProvider } from './i18n.jsx'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <App />
        <Mascot />
      </LangProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
