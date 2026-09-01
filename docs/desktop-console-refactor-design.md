# 桌面控制台 P1 重构设计（Services + ViewModels + 共享 DTO + 配置化）

> 版本：1.0（2026-08-29）
> 目标：把 `MainWindow.xaml.cs`（25KB 单文件 code-behind）拆分为可测试的分层架构；消除桌面端与后端的 DTO 重复；配置外置。
> 约束：**视觉零变化**（MainWindow.xaml 布局/样式不动，只改数据来源）；每阶段可编译、可运行、可回退。

## 1. 现状问题（重构动机）

| 问题 | 现状 |
|---|---|
| 职责混叠 | 进程管理、端口探测、HTTP、轮询、日志、UI 状态、DTO 全在 `MainWindow` 一个类 |
| DTO 重复 | `ApiResponse<T>` / `DownloadTaskVm` 桌面端手写，靠 `JsonPropertyName` 对齐后端 JSON；后端直接序列化 `DownloadTask` 实体（含 `speedText` 计算属性），字段漂移无编译期保护 |
| 硬编码 | 端口/路径/URL/超时/轮询间隔/日志上限全在代码里 |
| 不可测试 | 无接口、无注入、UI 直操作 |
| 线程风险 | `_refreshingXxx` 防重入是"丢弃"；`Log` 跨线程路径不统一 |

## 2. 目标架构

```
┌─────────────────────────────────────────────┐
│ App.xaml.cs（组合根：组装依赖、单实例、托盘）      │
├─────────────────────────────────────────────┤
│ MainWindow（View）→ MainViewModel（ViewModel） │
├───────────────┬───────────────┬─────────────┤
│ Services      │ ViewModels    │ Shared DTO  │
│ ProcessRunner │ MainViewModel │ MangaManager │
│ ServiceManager│ ServiceCardVm │ .Shared      │
│ ApiClient     │ DownloadTaskVm│ (ApiResponse │
│ DownloadMonitor│              │  DownloadDto)│
│ EnvironmentProbe               │             │
└───────────────┴───────────────┴─────────────┘
```

依赖方向：**View → ViewModel → Services → Shared**；Services 只依赖 Shared 与配置，不依赖 WPF。

## 3. 目标目录结构

```
src/desktop/MangaManager.Console/
├── App.xaml / App.xaml.cs            # 仅保留：单实例、托盘、组合根
├── MainWindow.xaml                   # 视觉不变；绑定替换事件
├── MainWindow.xaml.cs                # 目标 <100 行：DataContext + Loaded/Closing/Close 确认/拖拽
├── Models/
│   ├── AppConfig.cs                  # 强类型配置（IConfiguration 绑定）
│   └── ServiceState.cs               # Stopped/Starting/Running/Stopping
├── Services/
│   ├── IProcessRunner.cs / ProcessRunner.cs
│   ├── IServiceManager.cs / ServiceManager.cs
│   ├── IApiClient.cs / ApiClient.cs
│   ├── IDownloadMonitor.cs / DownloadMonitor.cs
│   └── EnvironmentProbe.cs           # dotnet/node 版本检测
├── ViewModels/
│   ├── ViewModelBase.cs              # INPC 基类
│   ├── MainViewModel.cs
│   ├── ServiceCardViewModel.cs
│   └── DownloadTaskVm.cs             # 瘦身：纯 UI VM，从 DTO 映射
├── Infrastructure/
│   ├── RelayCommand.cs / AsyncRelayCommand.cs
│   └── DispatcherService.cs          # 统一回 UI 线程
├── NativeMethods.cs
└── appsettings.json                  # 配置（复制到输出目录）

src/shared/MangaManager.Shared/        # 已有空项目，本次填充
├── MangaManager.Shared.csproj        # net9.0（无 WPF/ASP.NET 依赖）
├── ApiResponse.cs
└── Download/DownloadTaskDto.cs
```

## 4. 共享 DTO 设计（MangaManager.Shared）

### 4.1 项目约束
- `net9.0` 纯类库：后端（net9.0）与桌面端（net9.0-windows）都能引用；不引 WPF / ASP.NET Core。
- 只放纯数据 DTO + `ApiResponse<T>`，不放实体、不放服务。

### 4.2 DownloadTaskDto（字段与现有 JSON 对齐，含 speedText）

```csharp
namespace MangaManager.Shared.Download;

public class DownloadTaskDto
{
    public int Id { get; set; }
    public int Gid { get; set; }
    public string Title { get; set; } = "";
    public string? CoverUrl { get; set; }
    public int TotalPages { get; set; }
    public int DownloadedPages { get; set; }
    public int FailedPages { get; set; }
    public long DownloadedBytes { get; set; }
    public string Status { get; set; } = "pending";
    public string? ErrorMsg { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    /// <summary>实时速率 (bytes/s)，后端计算后填充</summary>
    public double SpeedBps { get; set; }
    /// <summary>格式化速率文本（"23 KB/s"），与现有前端契约保持一致</summary>
    public string SpeedText { get; set; } = "0 B/s";
    public double ProgressPercent { get; set; }
}
```

> 序列化保持 ASP.NET 全局 camelCase 策略 → 输出 `speedText`、`speedBps` 等，与现在前端/桌面读取的字段名一致。

### 4.3 后端迁移
- `DownloadController` 不再直接序列化实体，改为映射 DTO：
  ```csharp
  var tasks = _dm.GetAllTasks().Select(DownloadTaskMapper.ToDto);
  ```
- 映射器（`MangaManager.Api/DownloadTaskMapper.cs`）：实体 → DTO，`SpeedBps`/`SpeedText`/`ProgressPercent` 从实体计算属性取。
- 实体 `DownloadTask` 留在 Core 不动；`Token` 字段不进入 DTO（避免泄露，桌面端不需要）。
- 后端 Api/Data/Services 项目引用 `MangaManager.Shared`。

### 4.4 桌面端消费
- `ApiClient.GetDownloadTasksAsync()` 返回 `ApiResponse<List<DownloadTaskDto>>`。
- `DownloadTaskVm` 移除全部 `[JsonPropertyName]`，由显式 `MapFrom(dto)` 填充；计算属性（StatusText/颜色/可见性/进度）保留。

## 5. Services 设计

### 5.1 ProcessRunner（进程启停封装，同时解决 P0 进程树问题）
```csharp
public interface IProcessRunner
{
    Task<ManagedProcess> StartAsync(ProcessRequest req);
    Task StopAsync(ManagedProcess proc, int timeoutMs = 5000);
}
public record ProcessRequest(string FileName, string Arguments, string? WorkingDir, Action<string>? OnOutput, Action<string>? OnError);
public record ManagedProcess(int Id, DateTime StartedAt, Process Process);
```
- `StartAsync`：配置 Redirect 输出/错误，通过 `DispatcherService` 转发到 UI 线程写日志；记录进程树根 PID。
- `StopAsync`：优先 `Process.Kill(entireProcessTree: true)`（一次杀掉 `dotnet run` 派生的子进程），`WaitForExit(timeout)` 后兜底再 Kill；彻底摆脱"主进程死、子进程泄漏"。
- `KillPort` 仅作最后兜底，并加安全校验：先解析占用端口的 PID，核对 `ProcessName` ∈ {dotnet, node, npx, MangaManager.Api} 且路径位于项目目录内才杀，绝不误杀无关进程。

### 5.2 ServiceManager（API / UI 服务生命周期）
```csharp
public enum ServiceState { Stopped, Starting, Running, Stopping }

public interface IServiceManager
{
    event EventHandler<ServiceStatusChangedEventArgs>? StatusChanged;
    ServiceStatus GetStatus(string serviceKey);        // api | ui
    Task StartAsync(string serviceKey);
    Task StopAsync(string serviceKey);
    Task RestartAsync(string serviceKey);
    Task StartAllAsync();
    Task StopAllAsync();
}
public record ServiceStatus(string Key, string Name, ServiceState State, string? Endpoint, bool HasProcess, DateTime? StartedAt);
```
- 状态机：`Stopped → Starting →（健康检查通过）→ Running`；失败/进程退出 → `Stopped` 并触发事件。
- 启动：`Starting` 状态下重复调用直接忽略（防重复启动竞态）；健康检查用 `ApiClient`（127.0.0.1，可配超时/次数/间隔）。
- 配置驱动命令：开发模式 `dotnet run --project ...` / `npx vite ...`；发布模式支持 `ExePath`（直接启动已发布服务）。
- 进程退出事件 → 状态置 Stopped（保留自愈钩子，P2 再加自动重启）。

### 5.3 ApiClient（HTTP 封装）
```csharp
public interface IApiClient
{
    Task<bool> IsHealthyAsync(CancellationToken ct = default);
    Task<List<DownloadTaskDto>> GetDownloadTasksAsync(CancellationToken ct = default);
    Task PauseTaskAsync(int gid);
    Task ResumeTaskAsync(int gid);
    Task RestartTaskAsync(int gid);
    Task RemoveTaskAsync(int gid);
    Task RestartAllFailedAsync();
}
```
- 内部 `HttpClient` 单例（`SocketsHttpHandler` + `ConnectTimeout` + `PooledConnectionLifetime`，超时来自配置）。
- 统一把非 2xx 转为 `ApiException`（含状态码 + `message`）。
- 健康检查不再 `new HttpClient()`，复用实例，URL 统一 `127.0.0.1`。

### 5.4 DownloadMonitor（后台任务监控）
```csharp
public interface IDownloadMonitor : IAsyncDisposable
{
    event EventHandler<IReadOnlyList<DownloadTaskDto>>? TasksUpdated;
    void Start();
    void Stop();
}
```
- 独立后台循环（`CancellationTokenSource` + `PeriodicTimer`），与服务轮询分离。
- 拉取列表 → 与内存快照 diff（新增/更新/清理，复用现有合并逻辑）→ 触发 `TasksUpdated`（在 UI 线程）。
- **失败退避**：5s → 10s → 20s → 上限 60s，成功即恢复 5s；API 未运行时不写错误日志（静默跳过）。
- 预留 `ITaskSource` 抽象（轮询实现），后续换 SSE 实时推送（P2）不改 ViewModel。

### 5.5 EnvironmentProbe
- 检测 dotnet/node 版本，结果事件/属性供 UI 显示；与窗口解耦，可测试。
- **实现注意**：版本探测带 3s 超时（`Task.WhenAny` + Kill），环境异常时不得阻塞控制台启动；`InitializeAsync` 第一条日志在探测前输出，保证启动即有反馈。

## 6. ViewModels 设计

### 6.1 基础设施
- `ViewModelBase`：`Set<T>(ref, value)` + `OnPropertyChanged`（现 DownloadTaskVm 的 Set 上移复用）。
- `RelayCommand` / `AsyncRelayCommand`：**统一异常兜底**——`AsyncRelayCommand.ExecuteAsync` 内 try/catch，异常写入日志而不冒泡（解决 P0 的 async void 崩溃）。
- `DispatcherService`：`Invoke(Action)`，Service 事件统一经它回到 UI 线程。

### 6.2 MainViewModel
| 属性/命令 | 说明 |
|---|---|
| `ApiCard` / `UiCard`（ServiceCardViewModel） | 服务状态、按钮可用性、端点、状态颜色 |
| `GlobalStatusText` / `GlobalStatusBrush` | "全部运行中/部分运行中/全部停止" |
| `DownloadSummary` | "N 下载中 · M 等待中 · K 失败" |
| `Tasks`（ObservableCollection<DownloadTaskVm>） | 下载任务列表 |
| `LogText` | 日志（MaxLogLines 截断，策略沿用现有） |
| 命令 | StartAll/StopAll/StartApi/StopApi/RestartApi/StartUi/StopUi/RestartUi/OpenWeb/OpenLocal/OpenEH/ClearLog |

- 订阅 `IServiceManager.StatusChanged` 与 `IDownloadMonitor.TasksUpdated`；更新全部走 `DispatcherService`。
- `StartAll` = 并行启动 API+UI（原 `_ = StartApiAsync(); _ = StartUiAsync()` 语义保留）。

### 6.3 ServiceCardViewModel
- `Name`、`StateText`（运行中/已停止/启动中/停止中）、`StateBrush`、`IsStartEnabled`、`IsStopEnabled`、`IsRestartEnabled`、`Endpoint`、`DotBrush`。

### 6.4 DownloadTaskVm（瘦身）
- 删除 `[JsonPropertyName]` 与反序列化职责；增加 `void MapFrom(DownloadTaskDto dto)`。
- 保留：`StatusText`/`StatusColor`/`StatusBgBrush`/`ProgressBrush`/`ProgressFraction`/`SpeedText`/`SubText`/各可见性属性（视觉零变化）。
- `Speed`/`SpeedBps` 冗余字段清理：仅保留 `SpeedBps`（DTO 提供）+ `SpeedText`。

## 7. 配置化设计（appsettings.json）

```json
{
  "Services": {
    "Api": {
      "Name": "API 后端",
      "Url": "http://127.0.0.1:5208",
      "HealthPath": "/health",
      "DevCommand": "dotnet",
      "DevArguments": "run --project {ProjectPath} --urls http://0.0.0.0:5208",
      "ProjectPath": "src/backend/MangaManager.Api/MangaManager.Api.csproj",
      "ExePath": "",
      "ReadyTimeoutSeconds": 10
    },
    "Ui": {
      "Name": "Web 前端",
      "Url": "http://127.0.0.1:5173",
      "DevCommand": "npx",
      "DevArguments": "vite --host 0.0.0.0 --port 5173",
      "WorkingDir": "src/frontend/manga-ui",
      "ExePath": "",
      "ReadyTimeoutSeconds": 20
    }
  },
  "Monitoring": {
    "IntervalSeconds": 5,
    "FailureBackoffSeconds": [5, 10, 20, 40, 60],
    "HttpTimeoutSeconds": 5
  },
  "Logging": { "MaxLines": 2000 }
}
```

- `AppConfig` 强类型绑定：`new ConfigurationBuilder().AddJsonFile("appsettings.json").Build().Get<AppConfig>()`。
- 相对路径（ProjectPath/WorkingDir）基于 `FindProjectRoot()` 解析；绝对路径优先。
- 文件属性 `CopyToOutputDirectory=PreserveNewest`。

## 8. MainWindow / App 改造点

### MainWindow.xaml
- 所有 `Click=` 事件改为 `Command="{Binding ...}"`（或 `CommandParameter`）。
- 文本/颜色/可见性绑定 VM 属性（颜色用 Brush 属性直绑，或加 `StateToBrushConverter`）。
- `ItemsControl ItemsSource="{Binding Tasks}"`，DataTemplate 内按钮 `CommandParameter="{Binding Gid}"`。
- 布局、样式、模板**原样保留**。

### MainWindow.xaml.cs（目标 <100 行）
- 保留：`InitializeComponent()`、`DataContext` 注入、`Loaded`（触发自动启动）、`Closing`（托盘隐藏）、`Close_Click`（确认 + 停止）、窗口拖拽。
- 全部业务逻辑移除。

### App.xaml.cs（组合根）
- 手动组合（不引 DI 容器，依赖少）：`config → ApiClient → ServiceManager/DownloadMonitor → MainViewModel → MainWindow`。
- 单实例 / 托盘 / ShowWindow 逻辑保留；托盘"全部启动/停止"改为调用 `MainViewModel` 命令。
- `Exit` 时统一 `StopAllAsync` + Dispose monitor。

## 9. 迁移步骤（每阶段可编译运行）

| 阶段 | 内容 | 验证 |
|---|---|---|
| S1 | 建 Shared 项目 + `ApiResponse` + `DownloadTaskDto` + 映射器；后端 DownloadController 改返 DTO；后端项目引 Shared | `dotnet build` 全绿；`/api/download/tasks` 返回字段不变（对照旧 JSON）—— **已完成（2026-08-29）** |
| S2 | 桌面端引 Shared；建 Models/AppConfig + appsettings.json + Infrastructure（RelayCommand/AsyncRelayCommand/DispatcherService） | 桌面端编译；配置可读—— **已完成（2026-08-29）** |
| S3 | 建 Services（ProcessRunner/ServiceManager/ApiClient/DownloadMonitor/EnvironmentProbe） | 单测/手动验证各 service（可用临时 console 入口）—— **已完成（2026-08-29），编译通过；运行时行为随 S5 冒烟验证** |
| S4 | 建 ViewModels；MainWindow 绑定替换；code-behind 事件逐步迁移 | 功能对照清单（见 §10）—— **已完成（2026-08-29）**，已通过运行时冒烟：窗口显示、环境探测、API 自动拉起（`已就绪`）、下载监控 |
| S5 | App 组合根收尾；删除旧逻辑（KillPort 兜底、_refreshingXxx、硬编码）；`dotnet build` + 冒烟 | 全量回归 |

## 10. 功能对照验证清单

- [ ] 启动控制台自动拉起 API + UI，状态从"启动中"→"运行中"
- [ ] 单独启动/停止/重启 API、UI；全部启动/停止
- [ ] 重复点击启动不会产生多个进程
- [ ] 停止后端口被释放、无残留 dotnet/node 子进程
- [ ] 下载任务列表 5s 刷新：新增/进度变化/完成移除/失败摘要
- [ ] 暂停/恢复/重启/移除/重启全部失败 按钮行为与旧版一致
- [ ] 日志滚动、截断、Clear
- [ ] 托盘：隐藏/显示/全部启动/停止/退出
- [ ] 健康检查统一 127.0.0.1；服务未启动时日志不刷屏
- [ ] 视觉与旧版一致（布局/配色/字体）

## 11. 风险与注意事项

- **DTO 字段名必须与现有 JSON 契约一致**（camelCase + `speedText`），前端 Web UI 也在读同一接口；S1 阶段用字段对照测试锁定。
- WPF 线程亲和：所有状态更新经 `DispatcherService`；Service 层不触碰 UI 元素。
- `Process.Kill(true)` 在 .NET 可用；若目标进程树包含 shell 中转，`StopAsync` 需等端口释放（复用现有 KillPort 兜底 + 安全校验）。
- Shared 项目不引 WPF/ASP.NET，避免桌面/后端双向依赖。
- 重构期间保持旧逻辑并行可回退：每阶段独立提交。

## 12. 后续（P2，不在本次范围）

- SSE 实时推送替代轮询（`ITaskSource` 已预留）
- 崩溃自动重启（`ProcessRunner.Exited` 事件 + 策略）
- 日志持久化（文件 + 导出）
- 任务列表虚拟化（`VirtualizingStackPanel`）
