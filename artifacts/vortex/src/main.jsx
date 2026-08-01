import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Mascot from './components/Mascot.jsx'
import { LangProvider } from './i18n.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LangProvider>
      <App />
      <Mascot />
    </LangProvider>
  </React.StrictMode>,
)
