import React from 'react';
import ReactDOM from 'react-dom/client';
// @ts-ignore
import App from './App.jsx';
// @ts-ignore
import Mascot from './components/Mascot.jsx';
// @ts-ignore
import { LangProvider } from './i18n.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* @ts-ignore */}
    <LangProvider>
      <App />
      <Mascot />
    </LangProvider>
  </React.StrictMode>,
);
