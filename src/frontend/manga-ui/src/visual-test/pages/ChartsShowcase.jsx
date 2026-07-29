import React from 'react';
import { motion } from 'framer-motion';
import { Line, Column, Pie, Area, Liquid, Gauge } from '@ant-design/charts';
import { useTheme } from '../ThemeContext';

// ─── 我们的图表设计令牌 ───
const DARK_PALETTE = ['#8b7aa0','#5a8a8a','#a08050','#b06060','#6b8b6b','#7d6f8a','#4a7575','#8a6d50'];
const LIGHT_PALETTE = ['#6d5c8a','#3d6b6b','#8a7040','#b05050','#5d8a5d','#6d5c8a','#3d6b6b','#8a7040'];

function useChartVars() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const PALETTE = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const axis = {
    x: { labelFill: '#8b8594', labelFontSize: 10, lineStroke: 'transparent', tickStroke: 'transparent' },
    y: {
      labelFill: '#8b8594', labelFontSize: 10,
      gridStroke: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)',
      gridStrokeWidth: 1, gridLineDash: [0,0],
      lineStroke: 'transparent', tickStroke: 'transparent',
    },
  };
  const chartTheme = {
    type: isDark ? 'classicDark' : 'classic',
    background: 'transparent',
    colors10: PALETTE,
    axisLabelFill: '#8b8594',
    axisLineStroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    axisTickStroke: 'transparent',
    gridStroke: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)',
  };
  const tooltip = {
    showTitle: false,
    domStyles: {
      'g2-tooltip': {
        background: isDark ? 'rgba(13,13,20,0.92) !important' : 'rgba(255,255,255,0.92) !important',
        backdropFilter: 'blur(12px) saturate(1.2)',
        boxShadow: isDark
          ? '0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05) !important'
          : '0 4px 16px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.5) !important',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'} !important`,
        borderRadius: '6px !important', padding: '8px 12px !important',
        color: (isDark ? '#c8c4cc' : '#25222a') + ' !important',
        fontSize: '12px !important',
      },
      'g2-tooltip-value': {
        color: (isDark ? '#8b7aa0' : '#6d5c8a') + ' !important',
        fontWeight: '600 !important', marginLeft: '8px !important',
      },
      'g2-tooltip-marker': { boxShadow: 'none !important' },
    },
  };
  const legend = {
    layout: { justifyContent: 'center' },
    itemName: { fill: '#8b8594', fontSize: 11 },
    marker: { symbol: 'circle', style: { r: 4 } },
    itemMarkerSize: 8,
  };
  return { PALETTE, axis, chartTheme, tooltip, legend };
}

export default function ChartsShowcase() {
  const { PALETTE, axis, chartTheme, tooltip, legend } = useChartVars();
  // 数据
  const lineData = [
    { date: '7/22', count: 12 }, { date: '7/23', count: 8 },
    { date: '7/24', count: 15 }, { date: '7/25', count: 22 },
    { date: '7/26', count: 18 }, { date: '7/27', count: 25 },
    { date: '7/28', count: 30 },
  ];

  const columnData = [
    { month: '1月', count: 45 }, { month: '2月', count: 52 },
    { month: '3月', count: 38 }, { month: '4月', count: 67 },
    { month: '5月', count: 55 }, { month: '6月', count: 72 },
    { month: '7月', count: 85 },
  ];

  const areaData = [
    { date: '周一', count: 5 }, { date: '周二', count: 8 },
    { date: '周三', count: 12 }, { date: '周四', count: 7 },
    { date: '周五', count: 15 }, { date: '周六', count: 22 },
    { date: '周日', count: 18 },
  ];

  const pieData = [
    { type: '漫画', value: 145 },
    { type: '同人志', value: 89 },
    { type: '画集', value: 34 },
    { type: '其他', value: 22 },
  ];

  return (
    <div className="vt-page">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="vt-page-header">
          <h1>AntV 图表可视化</h1>
          <p>@ant-design/charts + classicDark 主题 · 全色板与设计令牌对齐</p>
        </div>

        {/* 调色板展示 */}
        <div className="vt-demo-card" style={{ marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>图表调色板（8 色 · 全 token 一致）</h3>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PALETTE.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                background: 'var(--surface)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--divider)',
              }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%', background: c,
                }} />
                <span style={{
                  fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
                }}>
                  {c.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 第一行: 折线 + 柱状 */}
        <div className="vt-section">
          <h2 className="vt-section-title">趋势与对比</h2>
          <p className="vt-section-desc">下载量时间趋势 — 折线图（平滑曲线） + 柱状图（分类对比）</p>
          <div className="vt-demo-grid-2">
            <div className="vt-chart-box">
              <h4 style={chartTitle}>近7天下载趋势</h4>
              <Line
                data={lineData}
                xField="date" yField="count"
                smooth theme={chartTheme}
                color={PALETTE[0]}
                point={{ shapeField: 'circle', sizeField: 4 }}
                style={{ lineWidth: 2 }}
                axis={axis}
                tooltip={tooltip}
                height={200} autoFit
              />
            </div>

            <div className="vt-chart-box">
              <h4 style={chartTitle}>月度下载统计</h4>
              <Column
                data={columnData}
                xField="month" yField="count"
                theme={chartTheme}
                colorField={() => PALETTE[1]}
                columnStyle={{ radius: [3, 3, 0, 0] }}
                axis={axis}
                tooltip={tooltip}
                autoFit height={200}
              />
            </div>
          </div>
        </div>

        {/* 第二行: 面积 + 饼图 */}
        <div className="vt-section">
          <h2 className="vt-section-title">分布与占比</h2>
          <p className="vt-section-desc">面积图展示周下载节奏 + 饼图展示画廊分类占比</p>
          <div className="vt-demo-grid-2">
            <div className="vt-chart-box">
              <h4 style={chartTitle}>周下载节奏</h4>
              <Area
                data={areaData}
                xField="date" yField="count"
                theme={chartTheme}
                colorField={() => PALETTE[0]}
                style={{ fillOpacity: 0.15, strokeWidth: 2 }}
                smooth axis={axis}
                tooltip={tooltip}
                autoFit height={200}
              />
            </div>

            <div className="vt-chart-box">
              <h4 style={chartTitle}>画廊分类占比</h4>
              <Pie
                data={pieData}
                angleField="value" colorField="type"
                theme={chartTheme}
                radius={0.85}
                innerRadius={0.55}
                scale={{ color: { range: [PALETTE[0], PALETTE[1], PALETTE[2], PALETTE[3]] } }}
                label={{
                  text: d => `${d.type}\n${d.value}`,
                  position: 'outside',
                  connector: false,
                  style: { fill: '#8b8594', fontSize: 10, textAlign: 'center' },
                }}
                legend={legend}
                tooltip={tooltip}
                autoFit height={200}
              />
            </div>
          </div>
        </div>

        {/* 第三行: 仪表盘 + 水波图 */}
        <div className="vt-section">
          <h2 className="vt-section-title">仪表盘 & 进度</h2>
          <div className="vt-demo-grid-3">
            <div className="vt-chart-box">
              <h4 style={chartTitle}>磁盘使用率</h4>
              <Gauge
                percent={0.68}
                theme={chartTheme}
                range={{
                  color: [PALETTE[1], PALETTE[2], PALETTE[3]],
                  width: 12,
                }}
                axis={{
                  label: { style: { fill: '#5a5461', fontSize: 9 } },
                  tickLine: { style: { stroke: 'rgba(255,255,255,0.08)', length: 4 } },
                  line: { style: { stroke: 'rgba(255,255,255,0.08)' } },
                }}
                indicator={{
                  pointer: { style: { stroke: '#8b7aa0', lineWidth: 3 } },
                  pin: { style: { fill: '#8b7aa0', r: 4 } },
                }}
                statistic={{
                  content: {
                    style: { fontSize: 26, fill: '#c8c4cc', fontWeight: 600 },
                    offsetY: 0,
                    formatter: ({ percent }) => `${Math.round(percent * 100)}%`,
                  },
                }}
                autoFit height={180}
              />
            </div>

            <div className="vt-chart-box">
              <h4 style={chartTitle}>下载完成率</h4>
              <Liquid
                percent={0.85}
                theme={chartTheme}
                outline={{ border: 2, distance: 4, style: { stroke: PALETTE[0], opacity: 0.4 } }}
                wave={{ length: 120 }}
                color={PALETTE[0]}
                autoFit height={180}
              />
            </div>

            <div className="vt-chart-box">
              <h4 style={chartTitle}>翻译覆盖率</h4>
              <Liquid
                percent={0.62}
                theme={chartTheme}
                outline={{ border: 2, distance: 4, style: { stroke: PALETTE[1], opacity: 0.4 } }}
                wave={{ length: 80 }}
                color={PALETTE[1]}
                autoFit height={180}
              />
            </div>
          </div>
        </div>

        {/* 主题说明 */}
        <div className="vt-section" style={{ marginTop: 'var(--space-6)' }}>
          <h2 className="vt-section-title">主题策略</h2>
          <div className="vt-demo-grid-3">
            <div className="vt-demo-card">
              <h3>classicDark 主题</h3>
              <p>AntV 内置暗色主题为基础，<br/>覆盖 colors10 / axisLabel / grid。<br/>不影响 antd 其他组件。</p>
            </div>
            <div className="vt-demo-card">
              <h3>Tooltip 毛玻璃</h3>
              <p>rgba(13,13,20,0.92) + blur(12px)<br/>+ inset highlight 顶分割线<br/>+ 字体 accent 强调数值</p>
            </div>
            <div className="vt-demo-card">
              <h3>语义色锁定</h3>
              <p>磁盘使用率三段：青 → 橙 → 红<br/>完全使用 tokens.css 已有变量<br/>不会出现 AntV 默认的 #1890FF</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const chartTitle = {
  fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
  margin: '0 0 var(--space-2)', fontWeight: 'var(--weight-semibold)',
};