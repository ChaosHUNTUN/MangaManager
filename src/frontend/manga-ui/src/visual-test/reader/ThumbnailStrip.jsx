import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LazyImage } from './PageCanvas';

const IMAGE_URL = (name) => `/local-images/${encodeURIComponent(name)}`;

export default function ThumbnailStrip({
  open, images, currentPage, pageStep, isCoverAlone, onJump,
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }} className="r-thumb-strip">
          <div className="r-thumb-row">
            {images.slice(0, 25).map((name, i) => {
              const active = isCoverAlone
                ? i === currentPage
                : currentPage === i || (pageStep === 2 && currentPage + 1 === i);
              return (
                <motion.div key={i} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}
                  onClick={() => onJump(i)}
                  className={`r-thumb ${active ? 'active' : ''}`}>
                  {name ? <LazyImage src={IMAGE_URL(name)} alt={`t${i + 1}`} /> : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 9, color: 'var(--text-muted)' }}>
                      {i + 1}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
