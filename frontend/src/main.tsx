import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import IframeApp from './IframeApp.tsx'
import { HeroUIProvider } from "@heroui/react";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HeroUIProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/iframe" element={<IframeApp />} />
        </Routes>
      </BrowserRouter>
    </HeroUIProvider>
  </StrictMode>,
)
