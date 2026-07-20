/**
 * 极简线性 SVG 图标库 — 16×16 视口，1.5px 描边
 * 所有图标默认继承 currentColor，尺寸继承 fontSize
 */

const Svg = ({ children, size = '1em', ...props }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, display: 'block' }} {...props}>
    {children}
  </svg>
)

// ── 导航 ──
export const IconHome = (p) => <Svg {...p}><path d="M2 6l6-4.5L14 6v7a1 1 0 01-1 1H3a1 1 0 01-1-1V6z"/></Svg>
export const IconGlobe = (p) => <Svg {...p}><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2a10 10 0 010 12"/></Svg>
export const IconFolder = (p) => <Svg {...p}><path d="M2 4.5V3a1 1 0 011-1h3.5L8 3.5H13a1 1 0 011 1v1.5M2 4.5v7a1 1 0 001 1h10a1 1 0 001-1v-7H2z"/></Svg>
export const IconAlbum = (p) => <Svg {...p}><rect x="2" y="1.5" width="12" height="13" rx="1.5"/><path d="M6 5.5h4M6 8h3M6 10.5h2"/></Svg>

// ── 操作 ──
export const IconImport = (p) => <Svg {...p}><path d="M8 2v9M4.5 7L8 10.5 11.5 7M2 13h12v1H2z"/></Svg>
export const IconBatch = (p) => <Svg {...p}><path d="M2 2h4l2 1.5h6v10H2V2zM2 5.5h12"/></Svg>
export const IconRandom = (p) => <Svg {...p}><path d="M4 5l2.5 3L4 11M9 5l2.5 3L9 11"/><path d="M11.5 2l-2 3h4l-2-3zM4.5 14l-2-3h4l-2 3z"/></Svg>
export const IconTrash = (p) => <Svg {...p}><path d="M3 4.5h10M5.5 4.5V3a1 1 0 011-1h3a1 1 0 011 1v1.5M6 7v4M8 7v4M10 7v4M2.5 4.5l1 9.5h9l1-9.5"/></Svg>
export const IconDownload = (p) => <Svg {...p}><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M2 13.5h12"/></Svg>
export const IconRedownload = (p) => <Svg {...p}><path d="M2 8a6 6 0 0112 0M2 8V3.5M2 8h3.5"/><path d="M14 14.5V10h-3.5"/><circle cx="8" cy="11.5" r="2"/></Svg>
export const IconEdit = (p) => <Svg {...p}><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z"/></Svg>
export const IconClose = (p) => <Svg {...p}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></Svg>
export const IconPin = (p) => <Svg {...p}><path d="M8 2v9M5.5 4.5h5M6.5 11L8 14l1.5-3"/></Svg>
export const IconPlus = (p) => <Svg {...p}><path d="M8 3v10M3 8h10"/></Svg>
export const IconSearch = (p) => <Svg {...p}><circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l4 4"/></Svg>
export const IconCheck = (p) => <Svg {...p}><path d="M3 8l3.5 3.5L13 5"/></Svg>
export const IconShield = (p) => <Svg {...p}><path d="M8 1.5l5.5 3v4.5c0 3-2.5 5-5.5 5.5-3-.5-5.5-2.5-5.5-5.5V4.5L8 1.5z"/></Svg>
export const IconCog = (p) => <Svg {...p}><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.8M8 12.7v1.8M13.2 8h-1.8M4.6 8H2.8M11.7 4.3l-1.3 1.3M5.6 10.4l-1.3 1.3M4.3 4.3l1.3 1.3M10.4 10.4l1.3 1.3"/></Svg>
export const IconSparkle = (p) => <Svg {...p}><path d="M8 1.5v2M8 12.5v2M3.5 8h-2M14.5 8h-2M4.8 4.8L3.4 3.4M12.6 12.6l-1.4-1.4M4.8 11.2L3.4 12.6M12.6 3.4l-1.4 1.4"/></Svg>

// ── 视图 ──
export const IconGrid = (p) => <Svg {...p}><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/><rect x="9" y="9" width="5.5" height="5.5" rx="1"/></Svg>
export const IconList = (p) => <Svg {...p}><rect x="1.5" y="2.5" width="13" height="3" rx="1"/><rect x="1.5" y="6.5" width="13" height="3" rx="1"/><rect x="1.5" y="10.5" width="13" height="3" rx="1"/></Svg>

// ── 导航方向 ──
export const IconChevronLeft = (p) => <Svg {...p}><path d="M10 3L5 8l5 5"/></Svg>
export const IconChevronRight = (p) => <Svg {...p}><path d="M6 3l5 5-5 5"/></Svg>
export const IconArrowUp = (p) => <Svg {...p}><path d="M8 13.5V3M4 7l4-4 4 4"/></Svg>
export const IconArrowDown = (p) => <Svg {...p}><path d="M8 2.5V13M12 9l-4 4-4-4"/></Svg>

// ── 拖拽 ──
export const IconGripDots = (p) => <Svg {...p}><circle cx="5.5" cy="3" r="1.2"/><circle cx="10.5" cy="3" r="1.2"/><circle cx="5.5" cy="8" r="1.2"/><circle cx="10.5" cy="8" r="1.2"/><circle cx="5.5" cy="13" r="1.2"/><circle cx="10.5" cy="13" r="1.2"/></Svg>
export const IconGripLines = (p) => <Svg {...p}><path d="M5.5 3v10M10.5 3v10"/></Svg>

// ── 其他 ──
export const IconEye = (p) => <Svg {...p}><circle cx="8" cy="8" r="3"/><path d="M2 8s3-6 6-6 6 6 6 6-3 6-6 6-6-6-6-6z"/></Svg>
export const IconBook = (p) => <Svg {...p}><path d="M2 2.5h5L8 3.5l1-1h5v10H8l-1-1-1 1H2v-10zM8 3.5V13"/></Svg>
export const IconTag = (p) => <Svg {...p}><path d="M2 2h6l6 6-4 4-6-6V2z"/><circle cx="5" cy="5" r="0.8" fill="currentColor" stroke="none"/></Svg>