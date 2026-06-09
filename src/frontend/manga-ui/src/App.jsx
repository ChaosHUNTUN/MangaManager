import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LocalGallery from './pages/LocalGallery'
import Detail from './pages/Detail'
import Reader from './pages/Reader'
import EHentai from './pages/EHentai'
import ReaderLocal from './pages/ReaderLocal'
import NotFound from './pages/NotFound'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LocalGallery />} />
        <Route path="/manga/:id" element={<Detail />} />
        <Route path="/reader/:id" element={<Reader />} />
        <Route path="/reader-local/:gid" element={<ReaderLocal />} />
        <Route path="/ehentai" element={<EHentai />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
