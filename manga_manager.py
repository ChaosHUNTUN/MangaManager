"""
MangaManager 项目管理工具
- 系统托盘驻留，右键菜单快速操作
- 可视化仪表盘窗口，实时状态监控
- 一键启动/停止/重启前后端服务
- 无需管理员权限即可运行
"""
import os
import sys
import json
import socket
import shutil
import threading
import time
import webbrowser
import subprocess
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional, List, Callable
from collections import deque

# ==================== 依赖检查 ====================
try:
    import pystray
    from PIL import Image, ImageDraw
except ImportError:
    print("请先安装依赖: pip install pystray pillow")
    sys.exit(1)

# tkinter 是 Python 标准库，直接导入
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox

# ==================== 常量 ====================
ROOT = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.join(ROOT, "src", "backend", "MangaManager.Api")
UI_DIR = os.path.join(ROOT, "src", "frontend", "manga-ui")
API_PORT = 5000
UI_PORT = 5173
REFRESH_INTERVAL = 2000  # 毫秒

# ==================== 工具函数 ====================

def find_exe(names: list, search_dirs: list) -> str:
    """查找可执行文件"""
    for name in names:
        for d in search_dirs:
            p = os.path.join(d, name)
            if os.path.exists(p):
                return p
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return names[0]


def is_admin() -> bool:
    """检测是否以管理员权限运行 (Windows)"""
    try:
        import ctypes
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except:
        return False


def is_port_open(port: int) -> bool:
    """检测端口是否被监听"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        r = s.connect_ex(("127.0.0.1", port))
        s.close()
        return r == 0
    except:
        return False


def get_process_by_port(port: int) -> Optional[dict]:
    """获取占用端口的进程信息"""
    try:
        r = subprocess.run(
            f'netstat -ano | findstr ":{port} " | findstr "LISTENING"',
            capture_output=True, text=True, shell=True
        )
        if r.stdout.strip():
            parts = r.stdout.strip().split()
            pid = parts[-1]
            # 获取进程名
            r2 = subprocess.run(
                f'tasklist /FI "PID eq {pid}" /FO CSV /NH',
                capture_output=True, text=True, shell=True
            )
            name = "unknown"
            if r2.stdout.strip():
                name = r2.stdout.strip().split(",")[0].strip('"')
            return {"pid": pid, "name": name}
    except:
        pass
    return None


def kill_port(port: int) -> bool:
    """杀掉占用端口的进程"""
    info = get_process_by_port(port)
    if not info:
        return False
    try:
        subprocess.run(
            f"taskkill /F /PID {info['pid']}",
            capture_output=True, text=True, shell=True
        )
        time.sleep(0.5)
        return not is_port_open(port)
    except:
        return False


# ==================== 服务管理 ====================

@dataclass
class Service:
    name: str
    port: int
    cwd: str
    cmd: list
    desc: str
    proc: Optional[subprocess.Popen] = None

    def start(self) -> bool:
        if self.is_running():
            return True
        try:
            self.proc = subprocess.Popen(
                self.cmd,
                cwd=self.cwd,
                creationflags=subprocess.CREATE_NO_WINDOW,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            for _ in range(30):
                time.sleep(0.3)
                if self.is_running():
                    return True
            return False
        except Exception as e:
            return False

    def stop(self) -> bool:
        killed = kill_port(self.port)
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=3)
            except:
                try:
                    self.proc.kill()
                except:
                    pass
        self.proc = None
        time.sleep(0.5)
        return not self.is_running()

    def is_running(self) -> bool:
        return is_port_open(self.port)


class ServiceManager:
    def __init__(self):
        dotnet = find_exe(["dotnet.exe", "dotnet"], [
            r"C:\Program Files\dotnet",
            r"C:\Program Files (x86)\dotnet",
        ])
        npx = find_exe(["npx.cmd", "npx.exe"], [
            r"C:\Program Files\nodejs",
            r"C:\Program Files (x86)\nodejs",
            os.path.expandvars(r"%APPDATA%\npm"),
        ])

        self.api = Service("API 后端", 5000, API_DIR,
                           [dotnet, "run", "--no-build", "--urls", "http://0.0.0.0:5000"],
                           "ASP.NET Core Web API")
        self.ui = Service("UI 前端", 5173, UI_DIR,
                          [npx, "vite", "--host", "0.0.0.0", "--port", "5173"],
                          "React + Vite 开发服务器")
        self.all = [self.api, self.ui]
        self.logs: deque = deque(maxlen=200)
        self._log_callbacks: List[Callable] = []

    def log(self, msg: str):
        ts = datetime.now().strftime("%H:%M:%S")
        entry = f"[{ts}] {msg}"
        self.logs.append(entry)
        for cb in self._log_callbacks:
            try:
                cb(entry)
            except:
                pass

    def start_all(self):
        self.log("正在启动所有服务...")
        threading.Thread(target=self._start_api, daemon=True).start()
        threading.Thread(target=self._start_ui, daemon=True).start()

    def _start_api(self):
        if self.api.is_running():
            self.log("[API] 已在运行")
            return
        self.log("[API] 启动中...")
        if self.api.start():
            self.log("[API] ✓ 启动成功 (端口 5000)")
        else:
            self.log("[API] ✗ 启动失败/超时")

    def _start_ui(self):
        if self.ui.is_running():
            self.log("[UI] 已在运行")
            return
        self.log("[UI] 启动中...")
        if self.ui.start():
            self.log("[UI] ✓ 启动成功 (端口 5173)")
        else:
            self.log("[UI] ✗ 启动失败/超时")

    def stop_all(self):
        self.log("正在停止所有服务...")
        for s in self.all:
            self.log(f"  停止 {s.name}...")
            if s.stop():
                self.log(f"  [{s.name}] ✓ 已停止")
            else:
                self.log(f"  [{s.name}] 未在运行")
        self.log("已停止")

    def restart_all(self):
        self.log("正在重启所有服务...")
        self.stop_all()
        time.sleep(1)
        self.start_all()

    def get_info(self) -> list:
        """获取服务状态信息"""
        results = []
        for s in self.all:
            running = s.is_running()
            pinfo = get_process_by_port(s.port) if running else None
            results.append({
                "name": s.name,
                "desc": s.desc,
                "port": s.port,
                "running": running,
                "pid": pinfo["pid"] if pinfo else None,
                "process": pinfo["name"] if pinfo else None,
            })
        return results


# ==================== 托盘图标 ====================

def create_tray_icon():
    """创建书本图标 64x64"""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 书体 (round corner via rectangle)
    d.rectangle([10, 8, 54, 56], fill="#7c3aed", outline="#5b21b6", width=2)
    # 书脊
    d.rectangle([29, 8, 35, 56], fill="#5b21b6")
    # 页码线
    for y, w in [(16, 14), (25, 18), (34, 14), (43, 10)]:
        d.rectangle([14, y, 14 + w, y + 3], fill="#c4b5fd")
        d.rectangle([38, y, 38 + w, y + 3], fill="#c4b5fd")
    return img


# ==================== 仪表盘窗口 ====================

class Dashboard:
    def __init__(self, manager: ServiceManager, tray_icon=None):
        self.manager = manager
        self.tray_icon = tray_icon
        self.root = tk.Tk()
        self.root.title("MangaManager 控制台")
        self.root.geometry("480x520")
        self.root.minsize(400, 400)
        self.root.configure(bg="#0f0f1a")
        self.root.protocol("WM_DELETE_WINDOW", self.hide_window)

        # 管理员权限提示
        self.admin = is_admin()

        # 样式
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TFrame", background="#0f0f1a")
        style.configure("TLabel", background="#0f0f1a", foreground="#ccc", font=("微软雅黑", 9))
        style.configure("Title.TLabel", font=("微软雅黑", 13, "bold"), foreground="#a78bfa")
        style.configure("StatusOn.TLabel", font=("微软雅黑", 9, "bold"), foreground="#10b981")
        style.configure("StatusOff.TLabel", font=("微软雅黑", 9), foreground="#666")
        style.configure("TButton", font=("微软雅黑", 9), padding=6)
        style.configure("Green.TButton", background="#065f46")
        style.configure("Red.TButton", background="#7f1d1d")

        self._build_ui()
        self._refresh()

    def _build_ui(self):
        # -- 顶部标题栏 --
        top_frame = ttk.Frame(self.root)
        top_frame.pack(fill="x", padx=14, pady=(14, 6))

        ttk.Label(top_frame, text="📚 MangaManager", style="Title.TLabel").pack(side="left")

        top_right = ttk.Frame(top_frame)
        top_right.pack(side="right")

        self.btn_minimize = tk.Button(
            top_right, text="─", bg="#1e1e36", fg="#888", bd=0,
            font=("Consolas", 12), width=2, cursor="hand2",
            command=self.hide_window, activebackground="#2a2a4a", activeforeground="#ccc"
        )
        self.btn_minimize.pack(side="right", padx=(2, 0))

        self.btn_close = tk.Button(
            top_right, text="✕", bg="#1e1e36", fg="#f87171", bd=0,
            font=("Consolas", 11), width=2, cursor="hand2",
            command=self.quit_all, activebackground="#3b1a1a", activeforeground="#fca5a5"
        )
        self.btn_close.pack(side="right")

        # -- 权限提示 --
        if not self.admin:
            perm_frame = tk.Frame(self.root, bg="#1a1a2e", highlightbackground="#fbbf24", highlightthickness=1)
            perm_frame.pack(fill="x", padx=14, pady=0)
            tk.Label(perm_frame, text="⚠ 当前以普通用户运行，启动/停止服务不需要管理员权限",
                     bg="#1a1a2e", fg="#fbbf24", font=("微软雅黑", 8), padx=8, pady=3).pack()

        # -- 服务状态卡片 --
        self.status_frame = ttk.Frame(self.root)
        self.status_frame.pack(fill="x", padx=14, pady=10)

        self.api_card = self._make_service_card(self.status_frame, "API 后端", "端口 5000")
        self.ui_card = self._make_service_card(self.status_frame, "UI 前端", "端口 5173")

        # -- 控制按钮 --
        btn_frame = ttk.Frame(self.root)
        btn_frame.pack(fill="x", padx=14, pady=(0, 8))

        self.btn_start = tk.Button(btn_frame, text="🚀 一键启动", bg="#065f46", fg="#6ee7b7",
                                    font=("微软雅黑", 10, "bold"), cursor="hand2", bd=0,
                                    padx=16, pady=6, activebackground="#047857",
                                    command=self._on_start)
        self.btn_start.pack(side="left", padx=(0, 6))

        self.btn_stop = tk.Button(btn_frame, text="⏹ 停止全部", bg="#7f1d1d", fg="#fca5a5",
                                   font=("微软雅黑", 10), cursor="hand2", bd=0,
                                   padx=16, pady=6, activebackground="#991b1b",
                                   command=self._on_stop)
        self.btn_stop.pack(side="left", padx=6)

        self.btn_restart = tk.Button(btn_frame, text="🔄 重启", bg="#1e3a5f", fg="#93c5fd",
                                      font=("微软雅黑", 10), cursor="hand2", bd=0,
                                      padx=16, pady=6, activebackground="#1e40af",
                                      command=self._on_restart)
        self.btn_restart.pack(side="left", padx=6)

        self.btn_open = tk.Button(btn_frame, text="🌐 打开页面", bg="#5b21b6", fg="#c4b5fd",
                                   font=("微软雅黑", 10), cursor="hand2", bd=0,
                                   padx=16, pady=6, activebackground="#6d28d9",
                                   command=self._on_open)
        self.btn_open.pack(side="right", padx=(6, 0))

        # -- 日志区域 --
        log_label = ttk.Frame(self.root)
        log_label.pack(fill="x", padx=14, pady=(2, 2))
        ttk.Label(log_label, text="📋 运行日志", font=("微软雅黑", 9, "bold"), foreground="#888").pack(side="left")
        tk.Button(log_label, text="清空", bg="#1e1e36", fg="#666", bd=1, font=("微软雅黑", 8),
                  cursor="hand2", command=self._clear_logs, activebackground="#2a2a4a").pack(side="right")

        self.log_text = tk.Text(self.root, bg="#08080f", fg="#a0a0b0", bd=0,
                                 font=("Consolas", 8), wrap="word",
                                 insertbackground="#a78bfa", highlightthickness=0,
                                 relief="flat", padx=8, pady=6)
        self.log_text.pack(fill="both", expand=True, padx=14, pady=(0, 10))
        self.log_text.configure(state="disabled")

        # 滚动条 (用 tk.Scrollbar 配合 tk.Text)
        scrollbar = tk.Scrollbar(self.log_text, command=self.log_text.yview, bg="#14142a")
        scrollbar.pack(side="right", fill="y")
        self.log_text.configure(yscrollcommand=scrollbar.set)

        # 注册日志回调
        self.manager._log_callbacks.append(self._append_log)

        # 底部状态栏
        self.statusbar = tk.Label(self.root, text="就绪", bg="#08080f", fg="#555",
                                   font=("微软雅黑", 8), anchor="w", padx=10)
        self.statusbar.pack(fill="x", side="bottom")

    def _make_service_card(self, parent, name, subtitle):
        card = tk.Frame(parent, bg="#14142a", highlightbackground="#2a2a4a", highlightthickness=1)
        card.pack(fill="x", pady=3)

        left = tk.Frame(card, bg="#14142a")
        left.pack(side="left", padx=12, pady=10)

        # 状态指示灯
        indicator = tk.Canvas(left, width=10, height=10, bg="#14142a", highlightthickness=0)
        indicator.pack(side="left", padx=(0, 10))

        text_col = tk.Frame(left, bg="#14142a")
        text_col.pack(side="left")
        name_label = tk.Label(text_col, text=name, bg="#14142a", fg="#ccc",
                              font=("微软雅黑", 10, "bold"))
        name_label.pack(anchor="w")
        sub_label = tk.Label(text_col, text=subtitle, bg="#14142a", fg="#666",
                             font=("微软雅黑", 8))
        sub_label.pack(anchor="w")

        right = tk.Frame(card, bg="#14142a")
        right.pack(side="right", padx=12, pady=10)

        status_label = tk.Label(right, text="", bg="#14142a",
                                font=("微软雅黑", 9))
        status_label.pack(side="right")

        card.indicator = indicator
        card.status_label = status_label
        card.sub_label = sub_label
        return card

    def _refresh(self):
        """定时刷新状态"""
        info = self.manager.get_info()

        # 更新 API 卡片
        self._update_card(self.api_card, info[0])
        # 更新 UI 卡片
        self._update_card(self.ui_card, info[1])

        # 更新按钮状态
        api_ok = info[0]["running"]
        ui_ok = info[1]["running"]
        all_ok = api_ok and ui_ok

        if all_ok:
            self.btn_start.configure(text="✅ 全部运行中", bg="#065f46", fg="#6ee7b7", state="disabled")
        else:
            self.btn_start.configure(text="🚀 一键启动", bg="#065f46", fg="#6ee7b7", state="normal")

        any_running = api_ok or ui_ok
        self.btn_stop.configure(state="normal" if any_running else "disabled")
        self.btn_open.configure(state="normal" if ui_ok else "disabled")

        self.statusbar.configure(
            text=f"API: {'🟢' if api_ok else '⚪'}  |  UI: {'🟢' if ui_ok else '⚪'}  |  "
                 f"刷新: {datetime.now().strftime('%H:%M:%S')}"
        )

        # 下次刷新
        self.root.after(REFRESH_INTERVAL, self._refresh)

    def _update_card(self, card, info):
        running = info["running"]
        color = "#10b981" if running else "#374151"
        card.indicator.delete("all")
        card.indicator.create_oval(1, 1, 9, 9, fill=color, outline="")

        if running:
            card.status_label.configure(text=f"● 运行中 (PID {info['pid']})", fg="#10b981")
            card.sub_label.configure(text=f"{info['desc']}  |  进程: {info['process']}")
        else:
            card.status_label.configure(text="○ 未运行", fg="#666")
            card.sub_label.configure(text=f"{info['desc']}  |  端口 {info['port']}")

    def _append_log(self, entry: str):
        """追加日志（线程安全）"""
        self.root.after(0, self._do_append, entry)

    def _do_append(self, entry: str):
        self.log_text.configure(state="normal")
        self.log_text.insert("end", entry + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _on_start(self):
        self.btn_start.configure(state="disabled", text="启动中...")
        threading.Thread(target=self._do_start, daemon=True).start()

    def _do_start(self):
        self.manager.start_all()
        self.root.after(0, lambda: self.btn_start.configure(state="normal"))

    def _on_stop(self):
        self.btn_stop.configure(state="disabled", text="停止中...")
        threading.Thread(target=self._do_stop, daemon=True).start()

    def _do_stop(self):
        self.manager.stop_all()
        self.root.after(0, lambda: self.btn_stop.configure(state="normal", text="⏹ 停止全部"))

    def _on_restart(self):
        self.btn_restart.configure(state="disabled", text="重启中...")
        threading.Thread(target=self._do_restart, daemon=True).start()

    def _do_restart(self):
        self.manager.restart_all()
        self.root.after(0, lambda: self.btn_restart.configure(state="normal", text="🔄 重启"))

    def _on_open(self):
        self.manager.log("打开浏览器 http://localhost:5173")
        webbrowser.open("http://localhost:5173")

    def _clear_logs(self):
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.configure(state="disabled")
        self.manager.logs.clear()

    def hide_window(self):
        self.root.withdraw()

    def show_window(self):
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()

    def quit_all(self):
        if self.manager.api.is_running() or self.manager.ui.is_running():
            if not messagebox.askyesno("确认退出", "服务正在运行中，是否停止所有服务并退出？"):
                return
            self.manager.stop_all()
        if self.tray_icon:
            self.tray_icon.stop()
        self.root.destroy()
        os._exit(0)

    def run(self):
        self.root.mainloop()


# ==================== 主程序 ====================

def main():
    manager = ServiceManager()

    # 创建仪表盘
    dashboard = Dashboard(manager)

    # 启动时自动检测并启动未运行的服务
    info = manager.get_info()
    if not info[0]["running"]:
        threading.Thread(target=manager._start_api, daemon=True).start()
    if not info[1]["running"]:
        threading.Thread(target=manager._start_ui, daemon=True).start()

    # 构建托盘菜单
    def tray_menu(icon):
        api_ok = is_port_open(API_PORT)
        ui_ok = is_port_open(UI_PORT)

        return pystray.Menu(
            pystray.MenuItem("📊 显示控制台", lambda: dashboard.show_window(), default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("🚀 一键启动",
                            lambda: threading.Thread(target=manager.start_all, daemon=True).start(),
                            enabled=not (api_ok and ui_ok)),
            pystray.MenuItem("⏹ 停止全部",
                            lambda: threading.Thread(target=manager.stop_all, daemon=True).start(),
                            enabled=api_ok or ui_ok),
            pystray.MenuItem("🔄 重启",
                            lambda: threading.Thread(target=manager.restart_all, daemon=True).start(),
                            enabled=api_ok or ui_ok),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("🌐 打开页面",
                            lambda: webbrowser.open("http://localhost:5173"),
                            enabled=ui_ok),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("❌ 退出", lambda: dashboard.quit_all()),
        )

    icon = pystray.Icon("MangaManager", create_tray_icon(), "MangaManager", menu=pystray.Menu(
        pystray.MenuItem("📊 显示控制台", lambda: dashboard.show_window(), default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("🚀 一键启动", lambda: threading.Thread(target=manager.start_all, daemon=True).start()),
        pystray.MenuItem("⏹ 停止全部", lambda: threading.Thread(target=manager.stop_all, daemon=True).start()),
        pystray.MenuItem("🔄 重启", lambda: threading.Thread(target=manager.restart_all, daemon=True).start()),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("🌐 打开页面", lambda: webbrowser.open("http://localhost:5173")),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("❌ 退出", lambda: dashboard.quit_all()),
    ))

    dashboard.tray_icon = icon

    # 托盘线程
    threading.Thread(target=icon.run, daemon=True).start()

    # 运行仪表盘
    dashboard.run()


if __name__ == "__main__":
    main()
