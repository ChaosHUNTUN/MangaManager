import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ConfigProvider, Form, Input, InputNumber, Select, DatePicker, Switch, Slider, Rate, Radio, Checkbox, Upload, Button } from 'antd';
import { useAntdTheme } from '../antdTheme';
import { UploadOutlined, InboxOutlined, SearchOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { Dragger } = Upload;

export default function FormsShowcase() {
  const antdThemeConfig = useAntdTheme();
  const [form] = Form.useForm();
  const [values, setValues] = useState({});

  return (
    <div className="vt-page">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="vt-page-header">
          <h1>表单组件</h1>
          <p>Ant Design Form 组件在暗色主题下的展示 — Input/Select/DatePicker/Switch/Slider 等</p>
        </div>

        <ConfigProvider theme={antdThemeConfig}>
          {/* 基础输入组件 */}
          <div className="vt-section">
            <h2 className="vt-section-title">基础输入组件</h2>
            <p className="vt-section-desc">Input / InputNumber / TextArea / Select / DatePicker</p>

            <div className="vt-demo-grid-2">
              <div className="vt-demo-card">
                <h3>Input 系列</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 300 }}>
                  <Input placeholder="基本输入框" />
                  <Input placeholder="带前缀" prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />} />
                  <Input.Password placeholder="密码输入" />
                  <InputNumber placeholder="数字输入" style={{ width: '100%' }} min={1} max={999} />
                  <TextArea placeholder="文本域" rows={3} />
                </div>
              </div>

              <div className="vt-demo-card">
                <h3>选择器</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 300 }}>
                  <Select placeholder="单选下拉" style={{ width: '100%' }}
                    options={[
                      { value: 'manga', label: '漫画 (Manga)' },
                      { value: 'doujin', label: '同人志 (Doujinshi)' },
                      { value: 'artbook', label: '画集 (Artbook)' },
                    ]}
                  />
                  <Select mode="multiple" placeholder="多选标签" style={{ width: '100%' }}
                    options={[
                      { value: 'japanese', label: '日文' },
                      { value: 'chinese', label: '中文' },
                      { value: 'english', label: '英文' },
                      { value: 'translated', label: '已翻译' },
                    ]}
                  />
                  <DatePicker placeholder="选择日期" style={{ width: '100%' }} />
                  <DatePicker.RangePicker style={{ width: '100%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* 开关 / 滑块 / 评分 */}
          <div className="vt-section">
            <h2 className="vt-section-title">开关 / 滑块 / 评分 / 单选</h2>
            <div className="vt-demo-grid-3">
              <div className="vt-demo-card">
                <h3>Switch 开关</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>启用里站</span>
                    <Switch defaultChecked />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>自动翻译</span>
                    <Switch />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>显示 NSFW</span>
                    <Switch defaultChecked disabled />
                  </div>
                </div>
              </div>

              <div className="vt-demo-card">
                <h3>Slider + Rate</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 4 }}>最低评分</div>
                    <Slider defaultValue={3} min={1} max={5} step={1} />
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 4 }}>最小页数</div>
                    <Slider range defaultValue={[0, 300]} min={0} max={500} />
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 4 }}>评分</div>
                    <Rate defaultValue={4} />
                  </div>
                </div>
              </div>

              <div className="vt-demo-card">
                <h3>Radio / Checkbox</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 6 }}>搜索范围</div>
                    <Radio.Group defaultValue="title">
                      <Radio value="title">标题</Radio>
                      <Radio value="tags">标签</Radio>
                      <Radio value="all">全部</Radio>
                    </Radio.Group>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 6 }}>分类筛选</div>
                    <Checkbox.Group defaultValue={['manga']}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Checkbox value="manga">漫画</Checkbox>
                        <Checkbox value="doujin">同人志</Checkbox>
                        <Checkbox value="artbook">画集</Checkbox>
                      </div>
                    </Checkbox.Group>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 上传组件 */}
          <div className="vt-section">
            <h2 className="vt-section-title">上传组件</h2>
            <div className="vt-demo-grid-2">
              <div className="vt-demo-card" style={{ overflow: 'hidden' }}>
                <h3>拖拽上传</h3>
                <Dragger>
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p style={{
                    color: 'var(--text-secondary)', fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--weight-semibold)', margin: '0 0 4px',
                  }}>
                    点击或拖拽文件到此区域
                  </p>
                  <p style={{
                    color: 'var(--text-muted)', fontSize: 'var(--text-2xs)',
                    margin: 0,
                  }}>
                    支持 zip / cbz 格式
                  </p>
                </Dragger>
              </div>
              <div className="vt-demo-card">
                <h3>按钮上传</h3>
                <Upload>
                  <Button icon={<UploadOutlined />}>
                    选择文件
                  </Button>
                </Upload>
              </div>
            </div>
          </div>

          {/* 完整表单示例 */}
          <div className="vt-section">
            <h2 className="vt-section-title">完整表单示例 — 专辑编辑</h2>
            <p className="vt-section-desc">组合多个组件形成真实业务表单</p>

            <div className="vt-form-demo">
              <Form
                form={form}
                layout="vertical"
                onValuesChange={(_, all) => setValues(all)}
              >
                <Form.Item label="专辑名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                  <Input placeholder="例如: 我的收藏" />
                </Form.Item>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item label="分类" name="category">
                    <Select placeholder="选择分类" options={[
                      { value: 'manga', label: '漫画' },
                      { value: 'doujin', label: '同人志' },
                      { value: 'artbook', label: '画集' },
                    ]} />
                  </Form.Item>
                  <Form.Item label="排序" name="order">
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                  </Form.Item>
                </div>

                <Form.Item label="关键标签" name="keyTag">
                  <Input placeholder="artist:tony" />
                </Form.Item>

                <Form.Item label="描述" name="description">
                  <TextArea rows={3} placeholder="专辑描述..." />
                </Form.Item>

                <Form.Item label="设为私有" name="private" valuePropName="checked">
                  <Switch />
                </Form.Item>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button>取消</Button>
                  <Button type="primary">保存</Button>
                </div>
              </Form>

              {Object.keys(values).length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginTop: 16, padding: 12, background: 'var(--surface)',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-card)'
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>表单数据预览</div>
                  <pre style={{ fontSize: 11, color: 'var(--accent-teal)', margin: 0 }}>
                    {JSON.stringify(values, null, 2)}
                  </pre>
                </motion.div>
              )}
            </div>
          </div>
        </ConfigProvider>
      </motion.div>
    </div>
  );
}
