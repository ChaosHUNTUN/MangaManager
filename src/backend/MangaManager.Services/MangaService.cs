using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.Entities;
using MangaManager.Core.DTOs;
using MangaManager.Data;
using Microsoft.Extensions.Logging;

namespace MangaManager.Services;

public class MangaService
{
    private readonly MangaDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<MangaService> _logger;

    // 颜色池（用于自动创建的上层标签）
    private static readonly string[] _autoColors = {
        "#8b5cf6","#f59e0b","#06b6d4","#ec4899","#10b981",
        "#ef4444","#f97316","#3b82f6","#6366f1","#14b8a6","#d946ef","#84cc16"
    };

    public MangaService(MangaDbContext db, IWebHostEnvironment env, ILogger<MangaService> logger)
    {
        _db = db;
        _env = env;
        _logger = logger;
    }

    // ==================== 列表 / 详情 ====================


    public async Task<PagedResult<MangaListItem>> GetListAsync(string? search = null, List<int>? tagIds = null, int page = 1, int pageSize = 50)
    {
        var query = _db.Mangas.AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(m => m.Title.Contains(search) || m.FolderName.Contains(search));
        if (tagIds != null && tagIds.Count > 0)
            query = query.Where(m => m.MangaTags.Any(mt => tagIds.Contains(mt.TagId)));

        var total = await query.CountAsync();
        var items = await query.OrderByDescending(m => m.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(m => new MangaListItem(
                m.Id, m.Title,
                m.CoverPath != null ? $"/api/cover/{m.Id}" : null,
                m.FileCount, m.Status, m.CreatedAt,
                m.MangaTags.Select(mt => new TagDto(mt.Tag.Id, mt.Tag.Name, mt.Tag.Color, mt.Tag.Category)).ToList()
            )).ToListAsync();

        return new PagedResult<MangaListItem>(items, total, page, pageSize);
    }

    public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize)
    {
        public int TotalPages => (int)Math.Ceiling((double)Total / PageSize);
    }

    public async Task<MangaDetail?> GetDetailAsync(int id)
    {
        var manga = await _db.Mangas
            .Include(m => m.MangaAuthors).ThenInclude(ma => ma.Author)
            .Include(m => m.MangaTags).ThenInclude(mt => mt.Tag)
            .Include(m => m.ReadingProgress)
            .FirstOrDefaultAsync(m => m.Id == id);
        if (manga == null) return null;

        return new MangaDetail(
            manga.Id, manga.Title, manga.FolderName, manga.FolderPath,
            manga.CoverPath != null ? $"/api/cover/{manga.Id}" : null,
            manga.FileCount, manga.TotalSize, manga.Description, manga.Status,
            manga.MangaAuthors.Select(ma => ma.Author.Name).ToList(),
            manga.MangaTags.Select(mt => new TagDto(mt.Tag.Id, mt.Tag.Name, mt.Tag.Color, mt.Tag.Category)).ToList(),
            manga.ReadingProgress?.PageIndex,
            manga.CreatedAt, manga.UpdatedAt
        );
    }

    // ==================== SSE 进度通道（static，跨请求共享） ====================

    private static readonly ConcurrentDictionary<string, StreamWriter> _sseClients = new();

    public StreamWriter SubscribeSSE(string clientId)
    {
        // 返回一个占位，实际 StreamWriter 由 Controller 管理
        return null!;
    }

    public void RegisterSSEClient(string clientId, StreamWriter writer)
    {
        _sseClients[clientId] = writer;
    }

    public void UnregisterSSEClient(string clientId)
    {
        _sseClients.TryRemove(clientId, out _);
    }

    private async Task SendProgress(string? clientId, ScanProgress progress)
    {
        if (clientId == null) return;
        if (_sseClients.TryGetValue(clientId, out var writer))
        {
            try
            {
                var json = JsonSerializer.Serialize(progress);
                await writer.WriteAsync($"data: {json}\n\n");
                await writer.FlushAsync();
            }
            catch { }
        }
    }

    // ==================== 扫描引擎（带进度） ====================

    public async Task<ScanResult> ScanDirectoryAsync(string rootDirectory, string? sseClientId = null)
    {
        if (!Directory.Exists(rootDirectory))
            return new ScanResult(0, 0, 0, $"目录不存在: {rootDirectory}");

        var log = new ScanLog { Directory = rootDirectory, Status = "running" };
        _db.ScanLogs.Add(log);
        await _db.SaveChangesAsync();

        async Task Progress(string phase, string message, int current, int total)
        {
            await SendProgress(sseClientId, new ScanProgress
            {
                Phase = phase, Message = message,
                Current = current, Total = total,
                IsComplete = false
            });
        }

        try
        {
            // 阶段1：递归扫描文件夹
            await Progress("scanning", "正在扫描目录结构...", 0, 0);
            var leafFolders = FindLeafMangaFolders(rootDirectory);
            int total = leafFolders.Count, added = 0, updated = 0;

            await Progress("scanning", $"找到 {total} 个漫画文件夹", total, total);

            // 阶段2：预加载数据库
            await Progress("loading", "正在加载数据库记录...", 0, total);
            var leafPaths = leafFolders.Select(f => f.Path).ToHashSet();
            var existingMangas = await _db.Mangas.ToListAsync();
            var existingMap = existingMangas
                .Where(m => leafPaths.Contains(m.FolderPath))
                .ToDictionary(m => m.FolderPath);

            var allTags = await _db.Tags.ToListAsync();

            // 阶段3：逐个处理漫画
            await Progress("processing", "开始处理漫画...", 0, total);

            int processed = 0;
            foreach (var leaf in leafFolders)
            {
                processed++;
                var name = leaf.Name.Length > 40 ? leaf.Name[..40] + "..." : leaf.Name;

                if (existingMap.TryGetValue(leaf.Path, out var existing))
                {
                    await UpdateMangaFromFolderAsync(existing, leaf, allTags);
                    updated++;
                    await Progress("processing", $"🔄 更新: {name}", processed, total);
                }
                else
                {
                    var manga = await BuildMangaFromFolderAsync(leaf, allTags);
                    _db.Mangas.Add(manga);
                    added++;
                    await Progress("processing", $"✨ 新增: {name}", processed, total);
                }

                // 每 10 个保存一次，避免内存过大
                if (processed % 10 == 0)
                    await _db.SaveChangesAsync();
            }

            await _db.SaveChangesAsync();

            log.TotalFound = total;
            log.NewAdded = added;
            log.Status = "completed";
            log.FinishedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            await SendProgress(sseClientId, new ScanProgress
            {
                Phase = "complete",
                Message = $"扫描完成！共 {total} 部，新增 {added}，更新 {updated}",
                Current = total, Total = total,
                IsComplete = true,
                Added = added, Updated = updated
            });

            return new ScanResult(total, added, updated, null);
        }
        catch (Exception ex)
        {
            log.Status = "failed";
            log.ErrorMsg = ex.Message;
            log.FinishedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            await SendProgress(sseClientId, new ScanProgress
            {
                Phase = "error",
                Message = $"扫描失败: {ex.Message}",
                IsComplete = true
            });

            return new ScanResult(0, 0, 0, ex.Message);
        }
    }

    public class ScanProgress
    {
        public string Phase { get; set; } = "";        // scanning | loading | processing | complete | error
        public string Message { get; set; } = "";
        public int Current { get; set; }
        public int Total { get; set; }
        public bool IsComplete { get; set; }
        public int Added { get; set; }
        public int Updated { get; set; }
    }

    // ==================== 递归查找叶子漫画文件夹 ====================

    /// <summary>
    /// 从入口目录递归向下，找到所有直接包含图片的"叶子文件夹"。
    /// 如果一个文件夹包含图片但子文件夹也包含图片，则以子文件夹为叶子。
    /// </summary>
    private List<LeafFolder> FindLeafMangaFolders(string rootDirectory)
    {
        var result = new List<LeafFolder>();
        FindLeafFoldersRecursive(rootDirectory, rootDirectory, result);
        return result;
    }

    private void FindLeafFoldersRecursive(string currentDir, string rootDir, List<LeafFolder> result)
    {
        try
        {
            // 获取当前目录的图片文件
            var imageFiles = Directory.GetFiles(currentDir)
                .Where(f => IsImageFile(f))
                .ToList();

            // 获取子目录
            var subDirs = Directory.GetDirectories(currentDir);

            if (subDirs.Length == 0)
            {
                // 没有子目录 → 这就是叶子，只要有图片就收录
                if (imageFiles.Count > 0)
                    result.Add(CreateLeafFolder(currentDir, rootDir, imageFiles));
            }
            else
            {
                // 检查子目录中是否有漫画（即子目录是否包含图片）
                bool anyChildHasImages = false;
                foreach (var sub in subDirs)
                {
                    if (HasImageFilesDeep(sub))
                    {
                        anyChildHasImages = true;
                        FindLeafFoldersRecursive(sub, rootDir, result);
                    }
                }

                // 如果子目录都不包含图片，但当前目录有图片 → 当前就是叶子
                if (!anyChildHasImages && imageFiles.Count > 0)
                {
                    result.Add(CreateLeafFolder(currentDir, rootDir, imageFiles));
                }
            }
        }
        catch (UnauthorizedAccessException) { /* 跳过无权限目录 */ }
        catch (Exception ex)
        {
            // 记录但不中断
            _logger.LogDebug($"扫描错误: {currentDir} - {ex.Message}");
        }
    }

    /// <summary>
    /// 检查目录树中是否存在任何图片文件（递归）
    /// </summary>
    private bool HasImageFilesDeep(string directory)
    {
        try
        {
            if (Directory.GetFiles(directory).Any(f => IsImageFile(f)))
                return true;
            foreach (var sub in Directory.GetDirectories(directory))
            {
                if (HasImageFilesDeep(sub))
                    return true;
            }
        }
        catch { }
        return false;
    }

    private static readonly System.Text.RegularExpressions.Regex _idPrefixRegex = new(
        @"^(\d{6,8}-)", System.Text.RegularExpressions.RegexOptions.Compiled);

    private LeafFolder CreateLeafFolder(string folderPath, string rootDir, List<string> imageFiles)
    {
        // 计算上层路径（相对于 rootDir）
        var relativePath = Path.GetRelativePath(rootDir, folderPath);
        var parentNames = new List<string>();

        if (relativePath != "." && relativePath != folderPath)
        {
            var parts = relativePath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            for (int i = 0; i < parts.Length - 1; i++)
            {
                if (!string.IsNullOrWhiteSpace(parts[i]))
                    parentNames.Add(parts[i]);
            }
        }

        // 解析文件夹名：识别并提取编号前缀
        var rawName = Path.GetFileName(folderPath);
        string? idPrefix = null;
        string displayName = rawName;

        var match = _idPrefixRegex.Match(rawName);
        if (match.Success)
        {
            idPrefix = match.Groups[1].Value;            // e.g. "3379665-"
            displayName = rawName[idPrefix.Length..].Trim(); // 去掉编号后的名称
        }

        return new LeafFolder
        {
            Path = folderPath,
            Name = rawName,
            DisplayName = displayName,
            IdPrefix = idPrefix,
            ImageFiles = imageFiles,
            ParentFolderNames = parentNames
        };
    }

    // ==================== 构建 / 更新漫画 ====================

    private class LeafFolder
    {
        public string Path { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;  // 去掉编号后的名称
        public string? IdPrefix { get; set; }                     // 形如 "3379665-" 的七位数字前缀
        public List<string> ImageFiles { get; set; } = new();
        public List<string> ParentFolderNames { get; set; } = new();
    }

    private async Task<Manga> BuildMangaFromFolderAsync(LeafFolder leaf, List<Tag> allTags)
    {
        // 如果有编号前缀，重命名文件夹
        string folderPath = leaf.Path;
        string folderName = leaf.DisplayName;
        if (leaf.IdPrefix != null && Directory.Exists(leaf.Path))
        {
            var parentDir = Path.GetDirectoryName(leaf.Path)!;
            var newPath = Path.Combine(parentDir, leaf.DisplayName);
            if (!string.Equals(leaf.Path, newPath, StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    Directory.Move(leaf.Path, newPath);
                    folderPath = newPath;
                }
                catch
                {
                    // 重命名失败则保持原名
                    folderName = leaf.Name;
                }
            }
        }

        var coverPath = leaf.ImageFiles.FirstOrDefault();
        // 如果文件夹被重命名了，封面路径也要更新
        if (coverPath != null && folderPath != leaf.Path)
        {
            coverPath = coverPath.Replace(leaf.Path, folderPath);
        }

        long totalSize = leaf.ImageFiles.Sum(f =>
        {
            try { return new FileInfo(f).Length; }
            catch { return 0; }
        });

        var manga = new Manga
        {
            Title = folderName,
            FolderName = folderName,
            FolderPath = folderPath,
            CoverPath = coverPath,
            FileCount = leaf.ImageFiles.Count,
            TotalSize = totalSize,
            Status = "unknown",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await ApplyTagsAsync(manga, leaf, allTags, isNew: true);
        return manga;
    }

    private async Task UpdateMangaFromFolderAsync(Manga manga, LeafFolder leaf, List<Tag> allTags)
    {
        // 使用 DisplayName（去编号后的名称）
        string folderName = leaf.DisplayName;
        string folderPath = leaf.Path;

        // 如果数据库记录的文件夹路径与当前实际路径不同（已被重命名），用实际路径
        if (!string.Equals(manga.FolderPath, leaf.Path, StringComparison.OrdinalIgnoreCase))
        {
            folderPath = leaf.Path;
        }

        var coverPath = leaf.ImageFiles.FirstOrDefault();
        long totalSize = leaf.ImageFiles.Sum(f =>
        {
            try { return new FileInfo(f).Length; }
            catch { return 0; }
        });

        manga.Title = folderName;
        manga.FolderName = folderName;
        manga.FolderPath = folderPath;
        manga.CoverPath = coverPath;
        manga.FileCount = leaf.ImageFiles.Count;
        manga.TotalSize = totalSize;
        manga.UpdatedAt = DateTime.UtcNow;

        // 清除旧的自动标签，重新打
        await ApplyTagsAsync(manga, leaf, allTags, isNew: false);
    }

    private async Task ApplyTagsAsync(Manga manga, LeafFolder leaf, List<Tag> allTags, bool isNew)
    {
        if (!isNew)
        {
            // 清除旧的 MangaTag 关联
            var oldTags = await _db.MangaTags.Where(mt => mt.MangaId == manga.Id).ToListAsync();
            _db.MangaTags.RemoveRange(oldTags);
            await _db.SaveChangesAsync();  // 立即保存删除，避免 UNIQUE 冲突
        }

        // 先确保所有需要的新 Tag 都已保存到数据库（获取有效 Id）
        // 上层文件夹名 → 作为「作者」分类
        foreach (var parentName in leaf.ParentFolderNames)
        {
            var tag = allTags.FirstOrDefault(t =>
                t.Name.Equals(parentName, StringComparison.OrdinalIgnoreCase));
            if (tag == null)
            {
                tag = new Tag
                {
                    Name = parentName,
                    Color = _autoColors[Math.Abs(parentName.GetHashCode()) % _autoColors.Length],
                    Category = "author"  // 上层文件夹名视为作者
                };
                _db.Tags.Add(tag);
                _db.SaveChanges();
                allTags.Add(tag);
            }
        }

        // 确保 Manga 已保存（新建时 Id 可能为 0）
        if (manga.Id == 0)
            _db.SaveChanges();

        // 1. 上层文件夹名作为标签
        foreach (var parentName in leaf.ParentFolderNames)
        {
            var tag = allTags.First(t =>
                t.Name.Equals(parentName, StringComparison.OrdinalIgnoreCase));
            manga.MangaTags.Add(new MangaTag { MangaId = manga.Id, TagId = tag.Id });
        }

        // 2. 基于漫画文件夹名匹配已有标签（如 "AI Generated", "Patreon" 等）
        foreach (var tag in allTags)
        {
            if (leaf.Name.Contains(tag.Name, StringComparison.OrdinalIgnoreCase)
                && !manga.MangaTags.Any(mt => mt.TagId == tag.Id))
            {
                manga.MangaTags.Add(new MangaTag { MangaId = manga.Id, TagId = tag.Id });
            }
        }
    }

    private static bool IsImageFile(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext is ".jpg" or ".jpeg" or ".png" or ".webp" or ".bmp" or ".gif";
    }

    public record ScanResult(int Total, int Added, int Updated, string? Error);

    // ==================== 重命名漫画 ====================

    public async Task<RenameResult> RenameMangaAsync(int mangaId, string newName)
    {
        var manga = await _db.Mangas.FindAsync(mangaId);
        if (manga == null)
            return new RenameResult(false, null, null, null, null, "漫画不存在");

        var oldName = manga.Title;
        var oldPath = manga.FolderPath;

        // 检查文件夹是否存在
        if (!Directory.Exists(oldPath))
            return new RenameResult(false, oldName, newName, oldPath, null, "原始文件夹不存在，无法重命名");

        // 新路径：保持父目录不变，只改文件夹名
        var parentDir = Path.GetDirectoryName(oldPath)!;
        var newPath = Path.Combine(parentDir, newName);

        // 检查新路径是否已存在
        if (Directory.Exists(newPath) && !string.Equals(oldPath, newPath, StringComparison.OrdinalIgnoreCase))
            return new RenameResult(false, oldName, newName, oldPath, newPath, "目标文件夹已存在");

        // 检查数据库中是否已有相同路径的漫画
        var duplicate = await _db.Mangas.FirstOrDefaultAsync(m =>
            m.FolderPath == newPath && m.Id != mangaId);
        if (duplicate != null)
            return new RenameResult(false, oldName, newName, oldPath, newPath, "数据库中已存在相同路径的漫画");

        try
        {
            // 重命名实际文件夹
            if (!string.Equals(oldPath, newPath, StringComparison.OrdinalIgnoreCase))
            {
                Directory.Move(oldPath, newPath);
            }

            // 更新数据库
            manga.Title = newName;
            manga.FolderName = newName;
            manga.FolderPath = newPath;
            manga.UpdatedAt = DateTime.UtcNow;

            // 封面路径也需更新
            if (manga.CoverPath != null && manga.CoverPath.StartsWith(oldPath))
            {
                manga.CoverPath = manga.CoverPath.Replace(oldPath, newPath);
            }

            await _db.SaveChangesAsync();

            return new RenameResult(true, oldName, newName, oldPath, newPath, null);
        }
        catch (Exception ex)
        {
            return new RenameResult(false, oldName, newName, oldPath, newPath, $"重命名失败: {ex.Message}");
        }
    }

    public record RenameResult(bool Success, string? OldName, string? NewName, string? OldPath, string? NewPath, string? Error);

    // ==================== 删除漫画 ====================

    public async Task<DeleteResult> DeleteMangaAsync(int mangaId, bool deleteFolder = false)
    {
        var manga = await _db.Mangas
            .Include(m => m.MangaTags)
            .Include(m => m.MangaAuthors)
            .Include(m => m.ReadingProgress)
            .FirstOrDefaultAsync(m => m.Id == mangaId);

        if (manga == null)
            return new DeleteResult(false, null, null, "漫画不存在");

        var title = manga.Title;
        var folderPath = manga.FolderPath;
        string? error = null;

        // 删除关联数据
        if (manga.MangaTags.Any())
            _db.MangaTags.RemoveRange(manga.MangaTags);
        if (manga.MangaAuthors.Any())
            _db.MangaAuthors.RemoveRange(manga.MangaAuthors);
        if (manga.ReadingProgress != null)
            _db.ReadingProgresses.Remove(manga.ReadingProgress);

        // 删除漫画主记录
        _db.Mangas.Remove(manga);
        await _db.SaveChangesAsync();

        // 可选：删除实际文件夹
        if (deleteFolder && Directory.Exists(folderPath))
        {
            try
            {
                Directory.Delete(folderPath, true);
            }
            catch (Exception ex)
            {
                error = $"数据库记录已删除，但文件夹删除失败: {ex.Message}";
            }
        }

        return new DeleteResult(true, title, folderPath, error);
    }

    public record DeleteResult(bool Success, string? Title, string? FolderPath, string? Error);
}
