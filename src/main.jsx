import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import { applyDocumentLang, loadDictionary } from './lib/i18n.js'

applyDocumentLang()

// The app is loaded after the dictionary: its menus and labels are read when its modules load.
Promise.all([loadDictionary(), import('./Root.jsx')]).then(([, { default: Root }]) => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
})
