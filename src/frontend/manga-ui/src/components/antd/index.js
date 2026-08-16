/**
 * 项目级 antd 组件 — 统一 import 入口
 *
 * 主题由 AppThemeProvider 统一注入, 无需每个组件单独包裹 ConfigProvider
 *
 * Usage:
 *   import { AppThemeProvider } from '../components/antd/AppThemeProvider';
 *   import { Modal, Button, Select } from '../components/antd';
 *   ...
 *   <AppThemeProvider>
 *     <Modal open={x}><Button>ok</Button></Modal>
 *   </AppThemeProvider>
 */
export {
  Modal, Button, Select, Form, Input, Tag, Descriptions, Switch,
  Slider, Rate, Radio, Checkbox, Upload, DatePicker, InputNumber,
  Popconfirm, Dropdown, Tooltip,
  Table, Card, Tabs, Timeline, Collapse, Progress,
  Avatar, Badge, Empty, Result, Skeleton, Spin, Alert,
  Steps, Segmented, Breadcrumb, Pagination, Divider, Space, Typography,
} from 'antd';
