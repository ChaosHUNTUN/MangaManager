import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ConfigProvider } from 'antd';
import {
  Table, Tag, Card, Tabs, Timeline, Collapse, Progress,
  Tooltip, Popconfirm, Dropdown, Badge, Avatar, Empty,
  Result, Skeleton, Spin, Alert, Steps, Segmented,
  Breadcrumb, Pagination, Divider, Space, Typography,
} from 'antd';
import { useAntdTheme } from '../antdTheme';
import {
  DownloadOutlined, EditOutlined, DeleteOutlined, MoreOutlined,
  CheckCircleOutlined, SyncOutlined, ClockCircleOutlined, CloseCircleOutlined,
  UserOutlined, SmileOutlined, LoadingOutlined,
  TableOutlined, AppstoreOutlined, FileTextOutlined,
  HistoryOutlined, FolderOpenOutlined, BellOutlined,
  HomeOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const TABLE_DATA = [
  { key: 1, title: '[C97] 少女終末旅行 総集編', artist: 'つくみず', pages: 224, size: '156MB', rating: 4.8, status: 'done' },
  { key: 2, title: '[冬季漫展] 魔法少女リリカルなのは', artist: '都築真紀', pages: 48, size: '32MB', rating: 4.2, status: 'active' },
  { key: 3, title: '進撃の巨人 最終卷特別編', artist: '諫山創', pages: 180, size: '210MB', rating: 4.9, status: 'done' },
  { key: 4, title: 'One Punch Man 第25卷', artist: 'ONE', pages: 200, size: '180MB', rating: 4.6, status: 'pending' },
  { key: 5, title: '[C99] Hololive ぺこらママ', artist: 'ももこ', pages: 36, size: '28MB', rating: 4.3, status: 'error' },
];

const STATUS_MAP = {
  done: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
  active: { color: 'processing', icon: <SyncOutlined spin />, text: '进行中' },
  pending: { color: 'default', icon: <ClockCircleOutlined />, text: '等待中' },
  error: { color: 'error', icon: <CloseCircleOutlined />, text: '失败' },
};

const columns = [
  {
    title: '作品名', dataIndex: 'title', key: 'title',
    render: text => <span style={{ fontSize: 13 }}>{text}</span>,
  },
  { title: '作者', dataIndex: 'artist', key: 'artist', width: 100 },
  { title: '页数', dataIndex: 'pages', key: 'pages', width: 70, align: 'right' },
  { title: '大小', dataIndex: 'size', key: 'size', width: 80 },
  {
    title: '评分', dataIndex: 'rating', key: 'rating', width: 70,
    render: v => <span style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>★ {v}</span>,
  },
  {
    title: '状态', dataIndex: 'status', key: 'status', width: 100,
    render: s => {
      const st = STATUS_MAP[s];
      return <Tag color={st.color} icon={st.icon}>{st.text}</Tag>;
    },
  },
  {
    title: '操作', key: 'action', width: 160,
    render: () => (
      <Space>
        <Tooltip title="下载"><DownloadOutlined style={{ color: 'var(--accent-teal)', cursor: 'pointer' }} /></Tooltip>
        <Tooltip title="编辑"><EditOutlined style={{ color: 'var(--accent)', cursor: 'pointer' }} /></Tooltip>
        <Popconfirm title="确定删除？" okText="删除" cancelText="取消">
          <DeleteOutlined style={{ color: 'var(--error)', cursor: 'pointer' }} />
        </Popconfirm>
      </Space>
    ),
  },
];

export default function ComponentsShowcase() {
  const antdThemeConfig = useAntdTheme();
  const [tab, setTab] = useState('table');

  return (
    <div className="vt-page">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="vt-page-header">
          <h1>Ant Design 组件全家桶</h1>
          <p>antd 60+ 组件在暗色主题下的统一预览 — 表格 / 卡片 / 标签页 / 时间轴 / 折叠面板</p>
        </div>

        <ConfigProvider theme={antdThemeConfig}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { label: <span><TableOutlined style={{marginRight:6}}/>表格</span>, value: 'table' },
              { label: <span><AppstoreOutlined style={{marginRight:6}}/>卡片</span>, value: 'cards' },
              { label: <span><FileTextOutlined style={{marginRight:6}}/>标签页</span>, value: 'tabs' },
              { label: <span><HistoryOutlined style={{marginRight:6}}/>时间轴</span>, value: 'timeline' },
              { label: <span><FolderOpenOutlined style={{marginRight:6}}/>折叠</span>, value: 'collapse' },
              { label: <span><BellOutlined style={{marginRight:6}}/>反馈</span>, value: 'feedback' },
            ]}
            style={{ marginBottom: 24 }}
          />

          {tab === 'table' && (
            <div className="vt-section">
              <h2 className="vt-section-title">Table 表格</h2>
              <p className="vt-section-desc">状态标记 / 操作列 / 排序 / 固定列</p>
              <Table
                columns={columns}
                dataSource={TABLE_DATA}
                pagination={{ pageSize: 5, showSizeChanger: false, showTotal: t => `共 ${t} 项` }}
                size="middle"
                scroll={{ x: 800 }}
              />
            </div>
          )}

          {tab === 'cards' && (
            <div className="vt-section">
              <h2 className="vt-section-title">Card 卡片</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {TABLE_DATA.map(item => (
                  <Card
                    key={item.key}
                    size="small"
                    hoverable
                    actions={[
                      <DownloadOutlined key="dl" />,
                      <EditOutlined key="edit" />,
                      <DeleteOutlined key="del" />,
                    ]}
                  >
                    <Card.Meta
                      avatar={<Avatar icon={<UserOutlined />} style={{ backgroundColor: 'var(--accent-bg)' }} />}
                      title={item.title}
                      description={
                        <div>
                          <div>{item.artist} · {item.pages}p · {item.size}</div>
                          <div style={{ marginTop: 4 }}>★ {item.rating}</div>
                        </div>
                      }
                    />
                  </Card>
                ))}
              </div>
            </div>
          )}

          {tab === 'tabs' && (
            <div className="vt-section">
              <h2 className="vt-section-title">Tabs 标签页 + 徽标</h2>
              <Tabs
                defaultActiveKey="1"
                items={[
                  { key: '1', label: <span><Badge count={5} offset={[8, -2]}>全部作品</Badge></span>, children: <Paragraph>全部画廊列表...</Paragraph> },
                  { key: '2', label: <span><Badge count={12} offset={[8, -2]} color="var(--accent-teal)">下载中</Badge></span>, children: <Paragraph>正在下载任务...</Paragraph> },
                  { key: '3', label: '已完成', children: <Paragraph>已下载完成...</Paragraph> },
                ]}
              />
            </div>
          )}

          {tab === 'timeline' && (
            <div className="vt-section">
              <h2 className="vt-section-title">Timeline 时间轴 + Steps 步骤条</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <Timeline
                  items={[
                    { color: 'green', children: '创建标签: artist:tony' },
                    { color: 'green', children: '添加作品: 5部' },
                    { color: 'red', children: '自动同步失败 (网络错误)' },
                    { color: 'blue', children: '手动同步完成' },
                  ]}
                />
                <Steps
                  direction="vertical"
                  size="small"
                  current={2}
                  items={[
                    { title: '解析URL', description: 'E-Hentai 链接解析' },
                    { title: '下载图片', description: '并发下载中...' },
                    { title: '写入本地', description: '等待完成' },
                    { title: '索引入库', description: '等待完成' },
                  ]}
                />
              </div>
            </div>
          )}

          {tab === 'collapse' && (
            <div className="vt-section">
              <h2 className="vt-section-title">Collapse 折叠面板</h2>
              <Collapse
                items={[
                  {
                    key: '1',
                    label: 'Cookie 设置 (已配置)',
                    children: <Paragraph code copyable>igneous=xxx; ipb_member_id=12345; ipb_pass_hash=yyy</Paragraph>,
                    extra: <CheckCircleOutlined style={{ color: 'var(--success)' }} />,
                  },
                  {
                    key: '2',
                    label: '下载并发设置',
                    children: <div>最大并发: 5 线程 · 超时: 30s · 重试: 3次</div>,
                  },
                  {
                    key: '3',
                    label: '高级选项',
                    children: <Empty description="暂无高级配置" />,
                  },
                ]}
              />
            </div>
          )}

          {tab === 'feedback' && (
            <div className="vt-section">
              <h2 className="vt-section-title">反馈组件 — Alert / Result / Spin / Skeleton</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Alert message="操作成功" description="下载完成: [C97] 少女終末旅行 総集編" type="success" showIcon closable />
                <Alert message="警告" description="磁盘空间低于 10GB" type="warning" showIcon />
                <Alert message="错误" description="ExHentai 连接超时" type="error" showIcon />
                <Alert message="信息" description="正在扫描本地画廊..." type="info" showIcon />

                <Result
                  status="success"
                  title="下载完成"
                  subTitle="已成功下载 5 部作品，共 1.2GB"
                  extra={[
                    <motion.button key="view" className="btn-primary" whileTap={{ scale: 0.9 }}>查看详情</motion.button>,
                  ]}
                />

                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  <Spin tip="加载中..." size="large"><div style={{ padding: 40 }} /></Spin>
                  <Skeleton active paragraph={{ rows: 4 }} style={{ flex: 1 }} />
                </div>

                <Progress percent={75} status="active" strokeColor="var(--accent)" />
                <Progress percent={100} strokeColor="var(--success)" />
                <Progress percent={30} status="exception" strokeColor="var(--error)" />
              </div>
            </div>
          )}

          {/* 底部导航组件 */}
          <div className="vt-section" style={{ marginTop: 32 }}>
            <h2 className="vt-section-title">导航 / 辅助组件</h2>
            <div className="vt-demo-grid-2">
              <div className="vt-demo-card">
                <h3>Breadcrumb 面包屑</h3>
                <Breadcrumb items={[
                  { title: <span><HomeOutlined style={{marginRight:4}}/>本地画廊</span> },
                  { title: <span><FolderOpenOutlined style={{marginRight:4}}/>漫画</span> },
                  { title: <span style={{ color: 'var(--accent)' }}>進撃の巨人</span> },
                ]} />
                <Divider style={{ margin: '12px 0', borderColor: 'var(--divider)' }} />
                <Pagination defaultCurrent={1} total={50} showSizeChanger={false} size="small" />
              </div>

              <div className="vt-demo-card">
                <h3>Dropdown 下拉菜单</h3>
                <Dropdown menu={{
                  items: [
                    { key: '1', label: '下载', icon: <DownloadOutlined /> },
                    { key: '2', label: '编辑', icon: <EditOutlined /> },
                    { type: 'divider' },
                    { key: '3', label: '删除', icon: <DeleteOutlined />, danger: true },
                  ]
                }}>
                  <button className="btn-outline">
                    操作 <MoreOutlined />
                  </button>
                </Dropdown>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <Avatar icon={<UserOutlined />} />
                  <Avatar style={{ backgroundColor: 'var(--accent-bg)' }}>U</Avatar>
                  <Badge count={3}><Avatar shape="square" icon={<SmileOutlined />} /></Badge>
                </div>
              </div>
            </div>
          </div>
        </ConfigProvider>
      </motion.div>
    </div>
  );
}
