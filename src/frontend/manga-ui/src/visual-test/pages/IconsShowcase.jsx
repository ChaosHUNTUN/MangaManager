import React, { useState } from 'react';
import { motion } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import {
  SearchOutlined, HomeOutlined, SettingOutlined, UserOutlined,
  HeartOutlined, StarOutlined, MessageOutlined, BellOutlined,
  PlayCircleOutlined, CameraOutlined, EditOutlined, DeleteOutlined,
  DownloadOutlined, UploadOutlined, LockOutlined, UnlockOutlined,
  EyeOutlined, EyeInvisibleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  SyncOutlined, PlusOutlined, MinusOutlined, QuestionCircleOutlined,
  WarningOutlined, InfoCircleOutlined, CopyOutlined, FolderOutlined,
  FileOutlined, TagOutlined, BookOutlined,
  PictureOutlined, VideoCameraOutlined, AudioOutlined,
  MenuOutlined,
  LeftOutlined, RightOutlined, UpOutlined, DownOutlined,
  DesktopOutlined, MobileOutlined, TabletOutlined,
  GlobalOutlined, GithubOutlined,
  CodeOutlined, ToolOutlined, WifiOutlined,
  CloudOutlined, DatabaseOutlined,
} from '@ant-design/icons';

const LUCIDE_ICONS = [
  // 导航
  { name: 'ArrowLeft', category: '导航' }, { name: 'ArrowRight', category: '导航' },
  { name: 'ArrowUp', category: '导航' }, { name: 'ArrowDown', category: '导航' },
  { name: 'ChevronLeft', category: '导航' }, { name: 'ChevronRight', category: '导航' },
  { name: 'ChevronUp', category: '导航' }, { name: 'ChevronDown', category: '导航' },
  { name: 'Home', category: '导航' }, { name: 'Menu', category: '导航' },
  { name: 'X', category: '导航' }, { name: 'PanelLeft', category: '导航' },
  // 操作
  { name: 'Search', category: '操作' }, { name: 'Plus', category: '操作' },
  { name: 'Minus', category: '操作' }, { name: 'Edit', category: '操作' },
  { name: 'Trash2', category: '操作' }, { name: 'Copy', category: '操作' },
  { name: 'Download', category: '操作' }, { name: 'Upload', category: '操作' },
  { name: 'Save', category: '操作' }, { name: 'RefreshCw', category: '操作' },
  // 状态
  { name: 'Check', category: '状态' }, { name: 'XCircle', category: '状态' },
  { name: 'AlertTriangle', category: '状态' }, { name: 'Info', category: '状态' },
  { name: 'HelpCircle', category: '状态' }, { name: 'Loader', category: '状态' },
  { name: 'Ban', category: '状态' }, { name: 'Shield', category: '状态' },
  // 媒体
  { name: 'Play', category: '媒体' }, { name: 'Pause', category: '媒体' },
  { name: 'Image', category: '媒体' }, { name: 'Video', category: '媒体' },
  { name: 'Camera', category: '媒体' }, { name: 'Music', category: '媒体' },
  { name: 'FileImage', category: '媒体' }, { name: 'FolderOpen', category: '媒体' },
  // 社交
  { name: 'Heart', category: '社交' }, { name: 'Star', category: '社交' },
  { name: 'Bookmark', category: '社交' }, { name: 'Share2', category: '社交' },
  { name: 'ThumbsUp', category: '社交' }, { name: 'MessageCircle', category: '社交' },
  { name: 'Bell', category: '社交' }, { name: 'User', category: '社交' },
  // 系统
  { name: 'Settings', category: '系统' }, { name: 'Wrench', category: '系统' },
  { name: 'Monitor', category: '系统' }, { name: 'Smartphone', category: '系统' },
  { name: 'Wifi', category: '系统' }, { name: 'Cloud', category: '系统' },
  { name: 'Database', category: '系统' }, { name: 'Terminal', category: '系统' },
];

const ANT_ICONS = [
  { Component: HomeOutlined, name: 'HomeOutlined', category: '导航' },
  { Component: LeftOutlined, name: 'LeftOutlined', category: '导航' },
  { Component: RightOutlined, name: 'RightOutlined', category: '导航' },
  { Component: UpOutlined, name: 'UpOutlined', category: '导航' },
  { Component: DownOutlined, name: 'DownOutlined', category: '导航' },
  { Component: GlobalOutlined, name: 'GlobalOutlined', category: '导航' },
  { Component: MenuOutlined, name: 'MenuOutlined', category: '导航' },
  { Component: SearchOutlined, name: 'SearchOutlined', category: '操作' },
  { Component: PlusOutlined, name: 'PlusOutlined', category: '操作' },
  { Component: MinusOutlined, name: 'MinusOutlined', category: '操作' },
  { Component: EditOutlined, name: 'EditOutlined', category: '操作' },
  { Component: DeleteOutlined, name: 'DeleteOutlined', category: '操作' },
  { Component: CopyOutlined, name: 'CopyOutlined', category: '操作' },
  { Component: DownloadOutlined, name: 'DownloadOutlined', category: '操作' },
  { Component: UploadOutlined, name: 'UploadOutlined', category: '操作' },
  { Component: SyncOutlined, name: 'SyncOutlined', category: '操作' },
  { Component: CheckCircleOutlined, name: 'CheckCircleOutlined', category: '状态' },
  { Component: CloseCircleOutlined, name: 'CloseCircleOutlined', category: '状态' },
  { Component: WarningOutlined, name: 'WarningOutlined', category: '状态' },
  { Component: InfoCircleOutlined, name: 'InfoCircleOutlined', category: '状态' },
  { Component: QuestionCircleOutlined, name: 'QuestionCircleOutlined', category: '状态' },
  { Component: LockOutlined, name: 'LockOutlined', category: '状态' },
  { Component: UnlockOutlined, name: 'UnlockOutlined', category: '状态' },
  { Component: PlayCircleOutlined, name: 'PlayCircleOutlined', category: '媒体' },
  { Component: CameraOutlined, name: 'CameraOutlined', category: '媒体' },
  { Component: PictureOutlined, name: 'PictureOutlined', category: '媒体' },
  { Component: VideoCameraOutlined, name: 'VideoCameraOutlined', category: '媒体' },
  { Component: AudioOutlined, name: 'AudioOutlined', category: '媒体' },
  { Component: FolderOutlined, name: 'FolderOutlined', category: '媒体' },
  { Component: FileOutlined, name: 'FileOutlined', category: '媒体' },
  { Component: HeartOutlined, name: 'HeartOutlined', category: '社交' },
  { Component: StarOutlined, name: 'StarOutlined', category: '社交' },
  { Component: MessageOutlined, name: 'MessageOutlined', category: '社交' },
  { Component: BellOutlined, name: 'BellOutlined', category: '社交' },
  { Component: UserOutlined, name: 'UserOutlined', category: '社交' },
  { Component: BookOutlined, name: 'BookOutlined', category: '社交' },
  { Component: TagOutlined, name: 'TagOutlined', category: '社交' },
  { Component: SettingOutlined, name: 'SettingOutlined', category: '系统' },
  { Component: ToolOutlined, name: 'ToolOutlined', category: '系统' },
  { Component: DesktopOutlined, name: 'DesktopOutlined', category: '系统' },
  { Component: MobileOutlined, name: 'MobileOutlined', category: '系统' },
  { Component: TabletOutlined, name: 'TabletOutlined', category: '系统' },
  { Component: WifiOutlined, name: 'WifiOutlined', category: '系统' },
  { Component: CloudOutlined, name: 'CloudOutlined', category: '系统' },
  { Component: DatabaseOutlined, name: 'DatabaseOutlined', category: '系统' },
  { Component: CodeOutlined, name: 'CodeOutlined', category: '系统' },
  { Component: GithubOutlined, name: 'GithubOutlined', category: '系统' },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.02 }
  }
};

const item = {
  hidden: { opacity: 0, scale: 0.8 },
  show: { opacity: 1, scale: 1 }
};

export default function IconsShowcase() {
  const [copied, setCopied] = useState('');

  const copyName = (name) => {
    navigator.clipboard.writeText(name);
    setCopied(name);
    setTimeout(() => setCopied(''), 1500);
  };

  // 获取 Lucide 图标组件
  const getLucideIcon = (name) => {
    const IconComp = LucideIcons[name];
    return IconComp ? <IconComp size={22} /> : <span>?</span>;
  };

  return (
    <div className="vt-page">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="vt-page-header">
          <h1>图标系统对比</h1>
          <p>Lucide React 1000+ 线性图标 vs @ant-design/icons 2000+ 面性图标 — 风格对比与选型参考</p>
        </div>

        {/* Lucide Icons */}
        <div className="vt-section">
          <h2 className="vt-section-title">Lucide React — 线性图标</h2>
          <p className="vt-section-desc">
            轻量 SVG 图标库，统一 1.5px 描边风格，天然适配暗色主题的极简线性设计语言
          </p>

          {[...new Set(LUCIDE_ICONS.map(i => i.category))].map(cat => {
            const catIcons = LUCIDE_ICONS.filter(i => i.category === cat);
            return (
              <div key={cat} style={{ marginBottom: 'var(--space-4)' }}>
                <h4 style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                  {cat}
                </h4>
                <motion.div
                  className="vt-icon-grid"
                  variants={container}
                  initial="hidden"
                  animate="show"
                >
                  {catIcons.map(icon => (
                    <motion.div
                      key={icon.name}
                      className="vt-icon-cell"
                      variants={item}
                      onClick={() => copyName(icon.name)}
                      whileTap={{ scale: 0.9 }}
                    >
                      {getLucideIcon(icon.name)}
                      <span>{copied === icon.name ? '已复制!' : icon.name}</span>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Ant Design Icons */}
        <div className="vt-section">
          <h2 className="vt-section-title">@ant-design/icons — 面性图标</h2>
          <p className="vt-section-desc">
            Ant Design 官方图标库，Outlined 风格为主，提供 filled/two-tone 变体
          </p>

          {[...new Set(ANT_ICONS.map(i => i.category))].map(cat => {
            const catIcons = ANT_ICONS.filter(i => i.category === cat);
            return (
              <div key={cat} style={{ marginBottom: 'var(--space-4)' }}>
                <h4 style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                  {cat}
                </h4>
                <motion.div
                  className="vt-icon-grid"
                  variants={container}
                  initial="hidden"
                  animate="show"
                >
                  {catIcons.map(icon => {
                    const Comp = icon.Component;
                    return (
                      <motion.div
                        key={icon.name}
                        className="vt-icon-cell"
                        variants={item}
                        onClick={() => copyName(icon.name)}
                        whileTap={{ scale: 0.9 }}
                      >
                        <Comp style={{ fontSize: 22, color: 'var(--text-primary)' }} />
                        <span>{copied === icon.name ? '已复制!' : icon.name}</span>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* 对比结论 */}
        <div className="vt-section">
          <h2 className="vt-section-title">风格对比</h2>
          <div className="vt-demo-grid-2">
            <div className="vt-demo-card">
              <h3><LucideIcons.CheckCircle size={16} style={{ color: 'var(--success)', marginRight: 6, verticalAlign: 'middle' }} />Lucide React 推荐</h3>
              <p>线性风格，与项目 tokens.css 暗色主题高度一致。<br/>
              树摇友好，按需导入不增加包体积。<br/>
              当前 Icons.jsx 中的 24 个自定义 SVG 完全可被替换。</p>
            </div>
            <div className="vt-demo-card">
              <h3>@ant-design/icons</h3>
              <p>面性风格，视觉重量感更强。<br/>
              与 antd 组件搭配时风格统一。<br/>
              图标数量更多，但包体积较大。</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
