using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using MangaManager.Core.DTOs;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/download")]
public class DownloadController : ControllerBase
{
    private readonly DownloadManager _dm;
    private readonly EhentaiService _eh;

    public DownloadController(DownloadManager dm, EhentaiService eh)
    {
        _dm = dm;
        _eh = eh;
    }

    // ==================== 任务管理 ====================

    /// <summary>获取所有下载任务</summary>
    [HttpGet("tasks")]
    public IActionResult GetAllTasks()
    {
        var tasks = _dm.GetAllTasks();
        return Ok(new ApiResponse<object>(true, tasks));
    }

    /// <summary>获取活跃任务</summary>
    [HttpGet("tasks/active")]
    public IActionResult GetActiveTasks()
    {
        var tasks = _dm.GetActiveTasks();
        return Ok(new ApiResponse<object>(true, tasks));
    }

    /// <summary>获取单个任务进度</summary>
    [HttpGet("tasks/{gid}")]
    public IActionResult GetTask(int gid)
    {
        var task = _dm.GetTask(gid);
        if (task == null) return NotFound(new ApiResponse<object>(false, null, "任务不存在"));
        return Ok(new ApiResponse<object>(true, task));
    }

    /// <summary>添加下载任务</summary>
    [HttpPost("tasks")]
    public IActionResult AddTask([FromBody] AddDownloadRequest req)
    {
        if (!_eh.HasCookie())
            return BadRequest(new ApiResponse<object>(false, null, "请先配置 Cookie"));

        var task = _dm.AddTask(req.Gid, req.Token, req.Title ?? "", req.CoverUrl);
        if (task == null)
            return BadRequest(new ApiResponse<object>(false, null, "添加任务失败"));

        return Ok(new ApiResponse<object>(true, task));
    }

    /// <summary>暂停任务</summary>
    [HttpPost("tasks/{gid}/pause")]
    public IActionResult PauseTask(int gid)
    {
        var ok = _dm.PauseTask(gid);
        return ok
            ? Ok(new ApiResponse<object>(true, new { message = "已暂停" }))
            : BadRequest(new ApiResponse<object>(false, null, "无法暂停"));
    }

    /// <summary>恢复任务</summary>
    [HttpPost("tasks/{gid}/resume")]
    public IActionResult ResumeTask(int gid)
    {
        var ok = _dm.ResumeTask(gid);
        return ok
            ? Ok(new ApiResponse<object>(true, new { message = "已恢复" }))
            : BadRequest(new ApiResponse<object>(false, null, "无法恢复"));
    }

    /// <summary>删除任务</summary>
    [HttpDelete("tasks/{gid}")]
    public IActionResult RemoveTask(int gid)
    {
        var ok = _dm.RemoveTask(gid);
        return ok
            ? Ok(new ApiResponse<object>(true, new { message = "已删除" }))
            : BadRequest(new ApiResponse<object>(false, null, "任务不存在"));
    }

    /// <summary>重启失败任务</summary>
    [HttpPost("tasks/{gid}/restart")]
    public IActionResult RestartTask(int gid)
    {
        var task = _dm.RestartTask(gid);
        return task != null
            ? Ok(new ApiResponse<object>(true, task))
            : BadRequest(new ApiResponse<object>(false, null, "无法重启"));
    }

    /// <summary>重启所有失败任务</summary>
    [HttpPost("tasks/restart-all-failed")]
    public IActionResult RestartAllFailed()
    {
        var count = _dm.RestartAllFailed();
        return Ok(new ApiResponse<object>(true, new { restarted = count, message = $"已重启 {count} 个失败任务" }));
    }

    /// <summary>从本地遗留 .progress 恢复下载（兼容旧版本未通过管理器管理的任务）</summary>
    [HttpPost("tasks/resume-legacy")]
    public IActionResult ResumeLegacyTask([FromBody] ResumeLegacyRequest req)
    {
        if (!_eh.HasCookie())
            return BadRequest(new ApiResponse<object>(false, null, "请先配置 Cookie"));

        var task = _dm.ResumeLegacyTask(req.Gid, req.Token, req.Title ?? $"Gallery {req.Gid}");
        if (task == null)
            return BadRequest(new ApiResponse<object>(false, null, "无法恢复遗留任务"));

        return Ok(new ApiResponse<object>(true, new
        {
            task.Gid, task.Title, task.DownloadedPages,
            message = task.DownloadedPages > 0
                ? $"从第 {task.DownloadedPages + 1} 页继续下载"
                : "已加入下载队列"
        }));
    }

    // ==================== 传统下载触发（兼容旧 API） ====================

    /// <summary>下载画廊（通过 DownloadManager）</summary>
    [HttpPost("gallery/{gid}/{token}")]
    public IActionResult DownloadGallery(int gid, string token, [FromQuery] string? title)
    {
        if (!_eh.HasCookie())
            return BadRequest(new ApiResponse<object>(false, null, "请先配置 Cookie"));

        var task = _dm.AddTask(gid, token, title ?? $"Gallery {gid}");
        return Ok(new ApiResponse<object>(true, (object?)task ?? new { message = "任务已存在" }));
    }

    // ==================== SSE 实时推送 ====================

    /// <summary>SSE 进度推送（全局）</summary>
    [HttpGet("events")]
    public async Task Events([FromQuery] int? gid)
    {
        Response.Headers["Content-Type"] = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["Connection"] = "keep-alive";

        var channel = _dm.GetOrCreateSseChannel(gid);

        // 先发送当前所有任务状态
        var tasks = gid.HasValue
            ? new[] { _dm.GetTask(gid.Value) }.Where(t => t != null).Cast<object>().ToList()
            : _dm.GetAllTasks().Cast<object>().ToList();

        var initJson = JsonSerializer.Serialize(new { type = "download_init", data = tasks });
        await Response.WriteAsync($"data: {initJson}\n\n", Encoding.UTF8);
        await Response.Body.FlushAsync();

        // 持续推送
        try
        {
            while (!HttpContext.RequestAborted.IsCancellationRequested)
            {
                if (channel.Reader.TryRead(out var msg))
                {
                    await Response.WriteAsync(msg, Encoding.UTF8, HttpContext.RequestAborted);
                    await Response.Body.FlushAsync();
                }
                else
                {
                    await Task.Delay(200, HttpContext.RequestAborted);
                    // 发送心跳
                    await Response.WriteAsync(": heartbeat\n\n", Encoding.UTF8, HttpContext.RequestAborted);
                    await Response.Body.FlushAsync();
                }
            }
        }
        catch (OperationCanceledException) { }
    }

    // ==================== WebSocket 实时推送 ====================

    /// <summary>WebSocket 进度推送</summary>
    [HttpGet("ws")]
    public async Task WebSocket()
    {
        if (!HttpContext.WebSockets.IsWebSocketRequest)
        {
            HttpContext.Response.StatusCode = 400;
            return;
        }

        var ws = await HttpContext.WebSockets.AcceptWebSocketAsync();
        var clientId = Guid.NewGuid().ToString();
        _dm.RegisterWebSocket(clientId, ws);

        try
        {
            // 发送初始状态
            var tasks = _dm.GetAllTasks();
            var initJson = JsonSerializer.Serialize(new { type = "download_init", data = tasks });
            await ws.SendAsync(
                new ArraySegment<byte>(Encoding.UTF8.GetBytes(initJson)),
                WebSocketMessageType.Text, true, HttpContext.RequestAborted);

            // 保持连接
            var buffer = new byte[1024];
            while (ws.State == WebSocketState.Open)
            {
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), HttpContext.RequestAborted);
                if (result.MessageType == WebSocketMessageType.Close) break;
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            _dm.UnregisterWebSocket(clientId);
            if (ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseReceived)
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closed", CancellationToken.None);
        }
    }
}

public record AddDownloadRequest(int Gid, string Token, string? Title, string? CoverUrl);
public record ResumeLegacyRequest(int Gid, string Token, string? Title);
