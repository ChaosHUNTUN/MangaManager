import { motion, AnimatePresence } from 'framer-motion';
import { LazyImage } from './PageCanvas';

const IMAGE_URL = (name) => {
  if (!name) return name;
  if (name.startsWith('http') || name.startsWith('/api')) return name;
  return `/local-images/${encodeURIComponent(name)}`;
};

export default function ThumbnailStrip({
  open, images, currentPage, pageStep, isCoverAlone, onJump,
}) {
  // 窗口化：只渲染当前页 ±40（最多 81 张），避免长画廊全量渲染/请求
  const WINDOW = 40
  const total = images.length
  const start = Math.max(0, currentPage - WINDOW)
  const end = Math.min(total, currentPage + WINDOW + 1)
  const indexes = []
  for (let i = start; i < end; i++) indexes.push(i)

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }} className="r-thumb-strip">
          <div className="r-thumb-row">
            {indexes.map(i => {
              const name = images[i]
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
