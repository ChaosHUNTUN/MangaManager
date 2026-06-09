using Microsoft.AspNetCore.Mvc;
using MangaManager.Core.DTOs;

namespace MangaManager.Api.Controllers;

/// <summary>
/// 文件系统浏览 —— 供前端目录选择器使用
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class FilesystemController : ControllerBase
{
    [HttpGet("drives")]
    public IActionResult GetDrives()
    {
        var drives = DriveInfo.GetDrives()
            .Where(d => d.IsReady && d.DriveType == DriveType.Fixed)
            .Select(d => new
            {
                name = $"{d.Name.TrimEnd('\\')} ({d.VolumeLabel})",
                path = d.RootDirectory.FullName
            })
            .ToList();
        return Ok(new ApiResponse<object>(true, drives));
    }

    [HttpGet("browse")]
    public IActionResult Browse([FromQuery] string? path = null)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                // 返回驱动器列表
                var drives = DriveInfo.GetDrives()
                    .Where(d => d.IsReady)
                    .Select(d => new { name = d.Name.TrimEnd('\\'), path = d.RootDirectory.FullName, isDir = true })
                    .ToList();
                return Ok(new ApiResponse<object>(true, drives));
            }

            if (!Directory.Exists(path))
                return BadRequest(new ApiResponse<object>(false, null, $"目录不存在: {path}"));

            var items = new List<object>();

            // 目录在前
            foreach (var d in Directory.GetDirectories(path).OrderBy(d => Path.GetFileName(d)))
            {
                try { items.Add(new { name = Path.GetFileName(d), path = d, isDir = true }); }
                catch { }
            }

            return Ok(new ApiResponse<object>(true, items));
        }
        catch (UnauthorizedAccessException)
        {
            return Ok(new ApiResponse<object>(true, new List<object>()));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    [HttpGet("dirs")]
    public IActionResult GetDirectories([FromQuery] string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return BadRequest(new ApiResponse<object>(false, null, "路径不能为空"));

        try
        {
            if (!Directory.Exists(path))
                return BadRequest(new ApiResponse<object>(false, null, $"目录不存在: {path}"));

            var dirs = Directory.GetDirectories(path)
                .Select(d => new
                {
                    name = Path.GetFileName(d),
                    path = d,
                    hasImages = ContainsImages(d)
                })
                .OrderBy(d => d.name)
                .ToList();

            // 检查当前目录是否包含图片
            bool currentHasImages = ContainsImages(path);

            return Ok(new ApiResponse<object>(true, new
            {
                current = path,
                parent = Path.GetDirectoryName(path),
                hasImages = currentHasImages,
                directories = dirs
            }));
        }
        catch (UnauthorizedAccessException)
        {
            return Ok(new ApiResponse<object>(true, new
            {
                current = path,
                parent = Path.GetDirectoryName(path),
                hasImages = false,
                directories = new List<object>(),
                error = "无权限访问此目录"
            }));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    private static bool ContainsImages(string directory)
    {
        try
        {
            var imageExts = new HashSet<string> { ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif" };
            return Directory.EnumerateFiles(directory)
                .Any(f => imageExts.Contains(Path.GetExtension(f).ToLowerInvariant()));
        }
        catch { return false; }
    }
}
