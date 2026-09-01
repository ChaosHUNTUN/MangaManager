import { useState, useEffect, useRef, useMemo } from 'react'
import {
  fetchDownloadTasks, fetchActiveDownloadTasks,
  pauseDownloadTask, resumeDownloadTask, removeDownloadTask,
  restartDownloadTask, restartAllFailedTasks,
  pauseAllDownloadTasks, resumeAllDownloadTasks, API_BASE
} from '../api'

const STATUS_MAP = {
  pending: { label: '等待中', color: '#f59e0b', bg: '#78350f20' },
  downloading: { label: '下载中', color: '#3b82f6', bg: '#1d4ed820' },
  paused: { label: '已暂停', color: '#8b5cf6', bg: '#6d28d920' },
  completed: { label: '已完成', color: '#10b981', bg: '#04785720' },
  failed: { label: '失败', color: '#ef4444', bg: '#7f1d1d20' },
  removed: { label: '已移除', color: '#666', bg: '#1a1a2e' }
}

const formatBytes = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1e3).toFixed(0) + ' KB' : b + ' B'
const formatSpeed = (s) => s || '--'

export default function DownloadMonitor() {
  const [tasks, setTasks] = useState([])
  const [expanded, setExpanded] = useState(true)   // 独立页面默认展开
  const [statusFilter, setStatusFilter] = useState('all')
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const eventSourceRef = useRef(null)
  const dataVersionRef = useRef(0)

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

  useEffect(() => {
    // 初始加载（版本号防护：SSE 先到时跳过）
    const loadVersion = ++dataVersionRef.current
    fetchDownloadTasks().then(data => {
      if (dataVersionRef.current === loadVersion) setTasks(data)
    }).catch(() => {})

    // SSE 实时更新
    const es = new EventSource(`${API_BASE}/api/download/events`)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'download_init') {
          dataVersionRef.current++
          setTasks(msg.data || [])
        } else if (msg.type === 'download_update') {
          const update = msg.data
          setTasks(prev => {
            if (update.status === 'removed') {
              // 任务被删除：直接从列表移除，而不是残留为“已移除”灰条
              return prev.filter(t => t.gid !== update.gid)
            }
            const idx = prev.findIndex(t => t.gid === update.gid)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], ...update }
              return next
            }
            return [...prev, update]
          })
          // 下载完成时触发自动专辑匹配（LocalGallery 会重新加载画廊列表并自动匹配）
          if (update.status === 'completed') {
            window.dispatchEvent(new CustomEvent('local-gallery-auto-match'))
          }
        }
      } catch {}
    }

    es.onerror = () => {
      // SSE 断开后 3 秒重连（EventSource 默认自动重连）
    }

    return () => es.close()
  }, [])

  const showToast = (text, type = 'info') => {
    setToast({ text, type })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2000)
  }

  const activeCount = tasks.filter(t => t.status === 'downloading').length
  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const failedCount = tasks.filter(t => t.status === 'failed').length
  const pausedCount = tasks.filter(t => t.status === 'paused').length
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const totalActive = activeCount + pendingCount
  const filteredTasks = useMemo(() =>
    statusFilter === 'all' ? tasks : tasks.filter(t => t.status === statusFilter),
  [tasks, statusFilter])

  if (!expanded) {
    // 折叠状态：底部迷你栏
    return (
      <>
        <div
          className="dl-minibar"
          onClick={() => setExpanded(true)}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
            background: 'linear-gradient(180deg, transparent, #0f0f1a 30%)',
            padding: '8px 20px 6px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            borderTop: '1px solid #2a2a4a'
          }}
        >
          <span style={{ fontSize: '0.78rem', color: '#888' }}>📥 下载管理</span>
          {activeCount > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: 8, background: '#3b82f620', color: '#60a5fa', fontSize: '0.7rem', fontWeight: 600 }}>
              {activeCount} 下载中
            </span>
          )}
          {pendingCount > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: 8, background: '#f59e0b20', color: '#fbbf24', fontSize: '0.7rem', fontWeight: 600 }}>
              {pendingCount} 等待中
            </span>
          )}
          {failedCount > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: 8, background: '#ef444420', color: '#fca5a5', fontSize: '0.7rem', fontWeight: 600 }}>
              {failedCount} 失败
            </span>
          )}
          {totalActive === 0 && <span style={{ fontSize: '0.7rem', color: '#666' }}>空闲</span>}
          <span style={{ fontSize: '0.65rem', color: '#555' }}>▲ 展开</span>
        </div>
        {toast && <ToastBox toast={toast} />}
      </>
    )
  }

  return (
    <>
      {/* 展开状态：侧边/底部面板 */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
        background: '#0f0f1a', borderTop: '2px solid #2a2a4a',
        maxHeight: '45vh', overflowY: 'auto', boxShadow: '0 -4px 20px rgba(0,0,0,0.5)'
      }}>
        {/* 标题栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 20px', borderBottom: '1px solid #2a2a4a',
          background: '#14142a', position: 'sticky', top: 0, zIndex: 1
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e0e0e0' }}>📥 下载管理</span>
            <span style={{ fontSize: '0.7rem', color: '#888' }}>
              {tasks.filter(t => t.status !== 'completed').length} 个任务 · 已完成 {completedCount}
              {activeCount > 0 && ` · ${activeCount} 下载中`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(activeCount > 0 || pendingCount > 0) && (
              <button className="btn-sm" onClick={async () => {
                try { const r = await pauseAllDownloadTasks(); showToast(r.message || `已暂停 ${r.paused} 个任务`) }
                catch (e) { showToast('暂停失败: ' + e.message, 'error') }
              }} style={{ borderColor: '#8b5cf6', color: '#c4b5fd', fontSize: '0.7rem' }}>
                ⏸ 全部暂停
              </button>
            )}
            {pausedCount > 0 && (
              <button className="btn-sm" onClick={async () => {
                try { const r = await resumeAllDownloadTasks(); showToast(r.message || `已恢复 ${r.resumed} 个任务`) }
                catch (e) { showToast('恢复失败: ' + e.message, 'error') }
              }} style={{ borderColor: '#3b82f6', color: '#93c5fd', fontSize: '0.7rem' }}>
                ▶ 全部恢复
              </button>
            )}
            {failedCount > 0 && (
              <button className="btn-sm" onClick={async () => {
                try { const r = await restartAllFailedTasks(); showToast(`已重启 ${r.restarted} 个失败任务`) }
                catch (e) { showToast('重启失败: ' + e.message, 'error') }
              }} style={{ borderColor: '#ef4444', color: '#fca5a5', fontSize: '0.7rem' }}>
                🔄 重启全部失败 ({failedCount})
              </button>
            )}
            <button className="btn-sm" onClick={() => setExpanded(false)}
              style={{ borderColor: '#444', color: '#888', fontSize: '0.75rem' }}>
              ▼ 收起
            </button>
          </div>
        </div>

        {/* 状态筛选 */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 20px', borderBottom: '1px solid #2a2a4a', background: '#10102a', position: 'sticky', top: 0, zIndex: 1, flexWrap: 'wrap' }}>
          {[['all', '全部'], ['downloading', '下载中'], ['pending', '等待'], ['paused', '暂停'], ['failed', '失败'], ['completed', '已完成']].map(([key, label]) => (
            <button key={key} className="btn-sm" onClick={() => setStatusFilter(key)}
              style={{ borderColor: statusFilter === key ? '#7c3aed' : '#444', color: statusFilter === key ? '#c4b5fd' : '#888', fontSize: '0.7rem' }}>
              {label}{key !== 'all' ? ` (${tasks.filter(t => t.status === key).length})` : ''}
            </button>
          ))}
        </div>

        {/* 任务列表 */}
        {filteredTasks.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>
            {statusFilter === 'all' ? '暂无下载任务' : '该状态下暂无任务'}
          </div>
        ) : (
          <div style={{ padding: '8px 12px' }}>
            {filteredTasks.map(task => {
              // 队列位置：pending 任务按入队时间（CreatedAt 升序）排位
              const pendingOrdered = filteredTasks
                .filter(t => t.status === 'pending')
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
              const queuePos = pendingOrdered.findIndex(t => t.gid === task.gid) + 1
              return (
              <TaskRow
                key={task.gid}
                task={task}
                queuePos={task.status === 'pending' ? queuePos : 0}
                onPause={() => pauseDownloadTask(task.gid).then(() => showToast('已暂停')).catch(e => showToast(e.message, 'error'))}
                onResume={() => resumeDownloadTask(task.gid).then(() => showToast('已恢复')).catch(e => showToast(e.message, 'error'))}
                onRemove={() => {
                  // 先本地移除获得即时反馈，失败时由 SSE/下次拉取自动恢复
                  setTasks(prev => prev.filter(t => t.gid !== task.gid))
                  removeDownloadTask(task.gid)
                    .then(() => showToast('已移除'))
                    .catch(e => showToast(e.message, 'error'))
                }}
                onRestart={() => restartDownloadTask(task.gid).then(() => showToast('已重启')).catch(e => showToast(e.message, 'error'))}
              />
              )
            })}
          </div>
        )}
      </div>
      {toast && <ToastBox toast={toast} />}
    </>
  )
}

function TaskRow({ task, queuePos = 0, onPause, onResume, onRemove, onRestart }) {
  const st = STATUS_MAP[task.status] || STATUS_MAP.removed
  // 估算剩余时间：每页平均耗时 × 剩余页数（下载中且至少完成 1 页时）
  let etaText = ''
  if (task.status === 'downloading' && task.downloadedPages > 0 && task.totalPages > task.downloadedPages && task.startedAt) {
    const elapsedSec = (Date.now() - new Date(task.startedAt).getTime()) / 1000
    const avgPerPage = elapsedSec / task.downloadedPages
    const remainSec = (task.totalPages - task.downloadedPages) * avgPerPage
    if (remainSec > 0 && remainSec < 3600 * 24) {
      const m = Math.floor(remainSec / 60), s = Math.floor(remainSec % 60)
      etaText = m > 0 ? `预计剩余 ${m}分${s}秒` : `预计剩余 ${s}秒`
    }
  }

  return (
    <div className="dl-task-row" style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', marginBottom: 4, borderRadius: 8,
      background: '#14142a', border: '1px solid #2a2a4a',
      transition: 'all 0.2s'
    }}>
      {/* 封面缩略图 */}
      {task.coverUrl ? (
        <img src={task.coverUrl} alt="" style={{
          width: 36, height: 50, borderRadius: 4, objectFit: 'cover', flexShrink: 0,
          background: '#1a1a2e'
        }} />
      ) : (
        <div style={{
          width: 36, height: 50, borderRadius: 4, flexShrink: 0,
          background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.8rem', color: '#555'
        }}>📄</div>
      )}

      {/* 信息区 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.8rem', fontWeight: 600, color: '#ccc',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {task.title || `Gallery #${task.gid}`}
        </div>
        <div className="dl-task-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{
            padding: '1px 6px', borderRadius: 4, fontSize: '0.65rem',
            background: st.bg, color: st.color, fontWeight: 600
          }}>
            {st.label}
          </span>
          <span style={{ fontSize: '0.68rem', color: '#888' }}>
            {task.downloadedPages}/{task.totalPages || '?'} 页
            {task.downloadedBytes > 0 && ` · ${formatBytes(task.downloadedBytes)}`}
            {task.totalPages > 0 && (task.status === 'downloading' || task.status === 'paused') && (
              ` · ${Math.min(100, Math.round((task.progress || (task.downloadedPages / task.totalPages * 100)) || 0))}%`
            )}
          </span>
          {task.status === 'downloading' && task.speed && (
            <span style={{ fontSize: '0.68rem', color: '#60a5fa', fontWeight: 500 }}>
              {formatSpeed(task.speed)}{etaText && ` · ${etaText}`}
            </span>
          )}
          {task.failedPages > 0 && (
            <span style={{ fontSize: '0.68rem', color: '#f87171' }}>
              {task.failedPages} 页失败
            </span>
          )}
          {queuePos > 0 && (
            <span style={{ fontSize: '0.68rem', color: '#a78bfa' }}>第 {queuePos} 个等待</span>
          )}
          {task.errorMsg && (
            <span style={{ fontSize: '0.65rem', color: '#f87171', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}
              title={task.errorMsg}>
              {task.errorMsg}
            </span>
          )}
        </div>
        {/* 进度条 */}
        {task.totalPages > 0 && task.status !== 'completed' && (
          <div style={{
            marginTop: 4, height: 4, borderRadius: 2, background: '#2a2a4a', overflow: 'hidden'
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: task.status === 'failed' ? '#ef4444'
                : task.status === 'paused' ? '#8b5cf6'
                : 'linear-gradient(90deg, #3b82f6, #60a5fa)',
              width: `${Math.min(task.progress || (task.totalPages > 0 ? task.downloadedPages / task.totalPages * 100 : 0), 100)}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {task.status === 'downloading' && (
          <button className="dl-task-btn" onClick={onPause} title="暂停"
            style={btnStyle('#8b5cf6')}>⏸</button>
        )}
        {task.status === 'paused' && (
          <button className="dl-task-btn" onClick={onResume} title="继续"
            style={btnStyle('#3b82f6')}>▶</button>
        )}
        {task.status === 'failed' && (
          <button className="dl-task-btn" onClick={onRestart} title="重试"
            style={btnStyle('#f59e0b')}>🔄</button>
        )}
        <button className="dl-task-btn" onClick={onRemove} title={task.status === 'downloading' ? '取消下载' : '移除'}
          style={btnStyle('#ef4444')}>✕</button>
      </div>
    </div>
  )
}

function btnStyle(color) {
  return {
    width: 28, height: 28, borderRadius: 6, border: `1px solid ${color}40`,
    background: 'transparent', color, cursor: 'pointer',
    fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, lineHeight: 1
  }
}

function ToastBox({ toast }) {
  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 300,
      padding: '8px 20px', borderRadius: 10,
      background: toast.type === 'error' ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.85)',
      color: '#fff', fontSize: '0.85rem', fontWeight: 600,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      animation: 'toast-in 0.3s ease, toast-out 0.3s ease 1.7s forwards',
      pointerEvents: 'none'
    }}>{toast.text}</div>
  )
}
