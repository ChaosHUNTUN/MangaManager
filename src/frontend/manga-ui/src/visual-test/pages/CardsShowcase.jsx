import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Eye, LayoutGrid, AlignJustify, Check,
  GripVertical, FolderOpen, ArrowRight, Layers
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, useDraggable, useDroppable
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  rectSortingStrategy, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const MOCK_CARDS = [
  { id: 1, title: '[C97] 少女終末旅行 総集編', pages: 224, size: '156MB', rating: 4.8, lang: '日文', cat: { name: 'Manga', color: '#b06060' } },
  { id: 2, title: '[冬季漫展] 魔法少女リリカルなのは', pages: 48, size: '32MB', rating: 4.2, lang: '中文', cat: { name: 'Doujinshi', color: '#a08050' } },
  { id: 3, title: '進撃の巨人 最終卷特別編', pages: 180, size: '210MB', rating: 4.9, lang: '日文', cat: { name: 'Manga', color: '#b06060' } },
  { id: 4, title: 'One Punch Man 第25卷', pages: 200, size: '180MB', rating: 4.6, lang: '中文', cat: { name: 'Manga', color: '#b06060' } },
  { id: 5, title: '[C99] Hololive ぺこらママ', pages: 36, size: '28MB', rating: 4.3, lang: '日文', cat: { name: 'Doujinshi', color: '#a08050' } },
  { id: 6, title: 'よつばと! 第15卷', pages: 224, size: '190MB', rating: 4.7, lang: '日文', cat: { name: 'Manga', color: '#b06060' } },
];

const ALBUMS = [
  { id: 'album1', name: '日常系', colorVar: '--accent', items: new Set() },
  { id: 'album2', name: '战斗番', colorVar: '--accent-teal', items: new Set() },
  { id: 'album3', name: '同人精选', colorVar: '--warning', items: new Set() },
];

// ─────────────── Mini Card (for drag overlay & drop zones) ───────────────
function MiniCard({ card, compact }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center', padding: compact ? '6px 10px' : '8px 12px',
      background: 'var(--surface-high)', borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border-card)',
    }}>
      <BookOpen size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text-primary)'
        }}>
          {card.title}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {card.pages}p · {card.size}
        </div>
      </div>
      <span className="badge badge-accent" style={{ fontSize: 9, flexShrink: 0 }}>
        {card.cat.name}
      </span>
    </div>
  );
}

// ─────────────── Cover Placeholder ───────────────
function CoverPlaceholder({ index }) {
  const colors = [
    'var(--accent-bg)', 'var(--accent-teal-bg)',
    'rgba(176,96,96,0.08)', 'rgba(90,138,138,0.08)',
    'rgba(139,122,160,0.08)', 'rgba(160,128,80,0.08)',
  ];
  return (
    <div style={{
      width: '100%', paddingBottom: '138%', position: 'relative',
      background: `linear-gradient(135deg, ${colors[index % colors.length]} 0%, var(--surface) 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid var(--divider)',
    }}>
      <BookOpen size={28} style={{ color: 'var(--text-dim)' }} />
    </div>
  );
}

// ─────────────── Sortable Card Item ───────────────
function SortableCard({ card, index }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="card" {...attributes}>
      {/* drag handle */}
      <div
        {...listeners}
        s        style={{
          position: 'absolute', top: 8, left: 8, zIndex: 10,
          width: 28, height: 28, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'var(--glass-bg)',
          backdropFilter: 'blur(6px)',
          borderRadius: 'var(--radius-sm)', cursor: 'grab',
          border: '1px solid var(--divider)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <GripVertical size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      <CoverPlaceholder index={index} />
      <div className="card-info">
        <div className="card-title">{card.title}</div>
        <div className="card-meta">
          <span>{card.pages}p · {card.size}</span>
          <span>{card.rating}</span>
        </div>
        <div className="card-tags">
          <span className="card-tag badge badge-accent">{card.lang}</span>
          <span className="card-tag badge badge-teal">{card.cat.name}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────── Draggable Card (for DragToGroup demo) ───────────────
function DraggableCard({ card }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `draggable-${card.id}`, data: { card } });
  const style = {
    transform: `translate(${transform?.x ?? 0}px, ${transform?.y ?? 0}px)`,
    opacity: isDragging ? 0.4 : 1,
    cursor: 'grab',
  };
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style}>
      <div className="card">
        <div style={{
          position: 'absolute', top: 6, left: 6, zIndex: 10,
          padding: '2px 6px', fontSize: 9, fontWeight: 'var(--weight-semibold)',
          background: 'var(--glass-bg)', backdropFilter: 'blur(6px)',
          color: 'var(--text-secondary)',
          borderRadius: 'var(--radius-sm)', pointerEvents: 'none',
        }}>
          <GripVertical size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />
          拖动
        </div>
        <CoverPlaceholder index={card.id - 1} />
        <div className="card-info">
          <div className="card-title">{card.title}</div>
          <div className="card-meta">
            <span>{card.pages}p · {card.size}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────── Droppable Album Zone ───────────────
function DroppableAlbum({ album, isOver, cards }) {
  const { setNodeRef } = useDroppable({ id: album.id, data: { albumId: album.id } });
  return (
    <div
      ref={setNodeRef}
      style={{
        padding: 12, borderRadius: 'var(--radius-md)',
        background: isOver ? `var(${album.colorVar}-bg)` : 'var(--surface-high)',
        border: isOver
          ? `2px dashed var(${album.colorVar}-border)`
          : '2px dashed var(--divider)',
        transition: 'all var(--duration-instant) var(--ease-out)',
        minHeight: 100,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
        color: isOver ? `var(${album.colorVar})` : 'var(--text-secondary)',
      }}>
        <Layers size={14} style={{ color: `var(${album.colorVar})` }} />
        {album.name}
        {cards.length > 0 && (
          <span className="badge badge-accent" style={{ fontSize: 10, marginLeft: 'auto' }}>
            {cards.length}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 40 }}>
        {cards.length === 0 ? (
          <div style={{
            fontSize: 'var(--text-2xs)', color: 'var(--text-muted)',
            textAlign: 'center', padding: 12,
          }}>
            {isOver ? '松开以放入此专辑' : '拖拽卡片到此区域'}
          </div>
        ) : (
          cards.map(c => (
            <div key={c.id} style={{
              fontSize: 'var(--text-2xs)', color: 'var(--text-primary)',
              padding: '4px 8px', background: 'var(--surface)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--divider)',
            }}>
              {c.title}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────── 基础卡片 (hover + 选中, 非拖拽) ───────────────
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }
  }),
  hover: { y: -4, transition: { duration: 0.2 } },
  tap: { scale: 0.97, transition: { duration: 0.1 } },
};

// ─────────────── Page ───────────────
export default function CardsShowcase() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedCards, setSelectedCards] = useState(new Set());
  const [viewMode, setViewMode] = useState('grid');

  // Sortable state
  const [sortableItems, setSortableItems] = useState(MOCK_CARDS.map(c => c.id));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Drag-to-group state
  const [draggedCard, setDraggedCard] = useState(null);
  const [albumItems, setAlbumItems] = useState({
    album1: [], album2: [], album3: [],
  });
  const [overAlbumId, setOverAlbumId] = useState(null);
  const [unassignedCards, setUnassignedCards] = useState([...MOCK_CARDS]);
  const groupSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const sortedCards = useMemo(() => {
    const map = Object.fromEntries(MOCK_CARDS.map(c => [c.id, c]));
    return sortableItems.map(id => map[id]).filter(Boolean);
  }, [sortableItems]);

  const filteredCards = activeFilter === 'all'
    ? MOCK_CARDS
    : MOCK_CARDS.filter(c => c.cat.name === activeFilter);

  const toggleCard = (id) => {
    const next = new Set(selectedCards);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedCards(next);
  };

  // Sortable handlers
  function handleSortDragEnd(event) {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setSortableItems(items => {
        const oldIdx = items.indexOf(active.id);
        const newIdx = items.indexOf(over.id);
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  }

  // Group handlers
  function handleGroupDragStart(event) {
    setDraggedCard(event.active.data.current.card);
  }
  function handleGroupDragOver(event) {
    const droppableId = event.over?.id;
    if (droppableId && ALBUMS.some(a => a.id === droppableId)) {
      setOverAlbumId(droppableId);
    } else {
      setOverAlbumId(null);
    }
  }
  function handleGroupDragEnd(event) {
    const { active, over } = event;
    const card = active.data.current.card;
    setDraggedCard(null);
    setOverAlbumId(null);
    if (!over) return;
    // check if dropped on an album zone
    const albumId = over.id;
    if (!ALBUMS.some(a => a.id === albumId)) return;
    // already assigned?
    const alreadyIn = Object.values(albumItems).some(arr => arr.some(c => c.id === card.id));
    if (alreadyIn) return;
    // remove from unassigned
    setUnassignedCards(prev => prev.filter(c => c.id !== card.id));
    // add to album
    setAlbumItems(prev => ({
      ...prev,
      [albumId]: [...prev[albumId], card],
    }));
  }

  return (
    <div className="vt-page">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="vt-page-header">
          <h1>卡片动画 &amp; 拖拽系统</h1>
          <p>framer-motion 入场动画 · @dnd-kit 拖拽排序 · 拖入分组 Drop Zone</p>
        </div>

        {/* ========== Section 1: 基础 hover/选中 (保留) ========== */}
        <div className="vt-section">
          <h2 className="vt-section-title">1. 基础动画 (hover · 选中 · 网格/列表)</h2>
          <div className="vt-demo-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h3 style={{ margin: 0 }}>画廊卡片预览</h3>
              <div className="vt-row">
                {['grid', 'list'].map(mode => (
                  <motion.button
                    key={mode} className={`btn-sm ${viewMode === mode ? 'active' : ''}`}
                    onClick={() => setViewMode(mode)} whileTap={{ scale: 0.9 }}
                  >
                    {mode === 'grid' ? <><LayoutGrid size={13} /> 网格</> : <><AlignJustify size={13} /> 列表</>}
                  </motion.button>
                ))}
              </div>
            </div>
            <div className="vt-row">
              {['all', 'Manga', 'Doujinshi'].map(cat => (
                <motion.button
                  key={cat} className={`btn-sm ${activeFilter === cat ? 'active' : ''}`}
                  onClick={() => setActiveFilter(cat)} whileTap={{ scale: 0.9 }}
                >
                  {cat === 'all' ? '全部' : cat}
                </motion.button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {viewMode === 'grid' ? (
              <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid">
                {filteredCards.map((card, i) => (
                  <motion.div
                    key={card.id}
                    className={`card ${selectedCards.has(card.id) ? 'selected' : ''}`}
                    custom={i} variants={cardVariants} initial="hidden" animate="visible"
                    whileHover="hover" whileTap="tap" layout
                    onClick={() => toggleCard(card.id)}
                  >
                    {selectedCards.has(card.id) && <div className="card-check"><Check size={12} /></div>}
                    <CoverPlaceholder index={i} />
                    <div className="card-info">
                      <div className="card-title">{card.title}</div>
                      <div className="card-meta">
                        <span>{card.pages}p · {card.size}</span>
                        <span>{card.rating}</span>
                      </div>
                      <div className="card-tags">
                        <span className="card-tag badge badge-accent">{card.lang}</span>
                        <span className="card-tag badge badge-teal">{card.cat.name}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
              >
                {filteredCards.map((card, i) => (
                  <motion.div
                    key={card.id} custom={i} variants={cardVariants} initial="hidden" animate="visible"
                    whileHover={{ x: 4, backgroundColor: 'var(--surface-hover)' }}
                    style={{
                      display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)',
                      background: 'var(--surface-high)', borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-card)', cursor: 'pointer', alignItems: 'center',
                    }}
                  >
                    <div style={{ width: 48, height: 64, background: 'var(--surface)', borderRadius: 'var(--radius-sm)',
                      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BookOpen size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {card.title}
                      </div>
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                        {card.pages}p · {card.size} · {card.rating}
                      </div>
                    </div>
                    <span className="badge badge-accent" style={{ flexShrink: 0 }}>{card.lang}</span>
                    <span className="badge badge-teal" style={{ flexShrink: 0 }}>{card.cat.name}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ========== Section 2: 拖拽排序 ========== */}
        <div className="vt-section">
          <h2 className="vt-section-title">2. 拖拽排序 (DnD Sortable Grid)</h2>
          <p className="vt-section-desc">
            @dnd-kit/sortable + rectSortingStrategy · 拖动卡片左上角手柄调整顺序
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSortDragEnd}
          >
            <SortableContext items={sortableItems} strategy={rectSortingStrategy}>
              <div className="grid">
                {sortedCards.map((card, i) => (
                  <SortableCard key={card.id} card={card} index={i} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            当前顺序 ID：{sortableItems.join(', ')}
          </div>
        </div>

        {/* ========== Section 3: 拖入分组 ========== */}
        <div className="vt-section">
          <h2 className="vt-section-title">3. 拖入分组 (Drag &amp; Drop into Albums)</h2>
          <p className="vt-section-desc">
            @dnd-kit/core + useDraggable/useDroppable · 拖拽卡片到下方专辑区域完成分组
          </p>
          <DndContext
            sensors={groupSensors}
            collisionDetection={closestCenter}
            onDragStart={handleGroupDragStart}
            onDragOver={handleGroupDragOver}
            onDragEnd={handleGroupDragEnd}
          >
            {/* Unassigned cards */}
            <div className="vt-demo-card" style={{ marginBottom: 'var(--space-4)' }}>
              <h3>待分组作品 (拖拽到下方专辑)</h3>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {unassignedCards.map(card => (
                  <DraggableCard key={card.id} card={card} />
                ))}
              </div>
              {unassignedCards.length === 0 && (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                  全部已分组
                </div>
              )}
            </div>

            {/* Album Drop Zones */}
            <div className="vt-demo-grid-3">
              {ALBUMS.map(album => (
                <DroppableAlbum
                  key={album.id}
                  album={album}
                  isOver={overAlbumId === album.id}
                  cards={albumItems[album.id] || []}
                />
              ))}
            </div>

            {/* Drag Overlay */}
            <DragOverlay dropAnimation={null}>
              {draggedCard ? (
                <div style={{ opacity: 0.9, width: 180 }}>
                  <MiniCard card={draggedCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* ========== 参数说明 ========== */}
        <div className="vt-section" style={{ marginTop: 'var(--space-6)' }}>
          <h2 className="vt-section-title">拖拽参数</h2>
          <div className="vt-demo-grid-3">
            <div className="vt-demo-card">
              <h3>排序策略</h3>
              <p>rectSortingStrategy (网格用) / verticalListSortingStrategy (列表用)<br/>PointerSensor + activationConstraint.distance=5px 防止误触</p>
            </div>
            <div className="vt-demo-card">
              <h3>分组 Drop Zone</h3>
              <p>useDroppable + DragOverlay 实时视觉反馈<br/>onDragOver 高亮目标区域· onDragEnd 移动数据</p>
            </div>
            <div className="vt-demo-card">
              <h3>生产应用</h3>
              <p>AlbumSidebar 已使用 @dnd-kit<br/>可排序专辑内部顺序<br/>可拖拽作品到不同专辑</p>
            </div>
          </div>
        </div>

      </motion.div>
    </div>
  );
}
