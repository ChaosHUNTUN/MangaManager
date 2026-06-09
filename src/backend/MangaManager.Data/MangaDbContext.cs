using Microsoft.EntityFrameworkCore;
using MangaManager.Core.Entities;

namespace MangaManager.Data;

public class MangaDbContext : DbContext
{
    public MangaDbContext(DbContextOptions<MangaDbContext> options) : base(options) { }

    public DbSet<Manga> Mangas => Set<Manga>();
    public DbSet<Author> Authors => Set<Author>();
    public DbSet<MangaAuthor> MangaAuthors => Set<MangaAuthor>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<MangaTag> MangaTags => Set<MangaTag>();
    public DbSet<ReadingProgress> ReadingProgresses => Set<ReadingProgress>();
    public DbSet<ScanLog> ScanLogs => Set<ScanLog>();
    public DbSet<DownloadTask> DownloadTasks => Set<DownloadTask>();
    public DbSet<ReaderSettings> ReaderSettings => Set<ReaderSettings>();
    public DbSet<AlbumConfig> AlbumConfigs => Set<AlbumConfig>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Manga>(e =>
        {
            e.ToTable("manga");
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(500);
            e.Property(x => x.FolderName).HasMaxLength(500);
            e.Property(x => x.FolderPath).HasMaxLength(1000);
            e.Property(x => x.CoverPath).HasMaxLength(1000);
            e.Property(x => x.Description).HasColumnType("text");
            e.Property(x => x.Status).HasMaxLength(20).HasDefaultValue("unknown");
        });

        modelBuilder.Entity<Author>(e =>
        {
            e.ToTable("author");
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(200);
            e.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<MangaAuthor>(e =>
        {
            e.ToTable("manga_author");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.MangaId, x.AuthorId }).IsUnique();
            e.HasOne(x => x.Manga).WithMany(m => m.MangaAuthors).HasForeignKey(x => x.MangaId);
            e.HasOne(x => x.Author).WithMany(a => a.MangaAuthors).HasForeignKey(x => x.AuthorId);
        });

        modelBuilder.Entity<Tag>(e =>
        {
            e.ToTable("tag");
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.Color).HasMaxLength(7);
            e.Property(x => x.Category).HasMaxLength(20).HasDefaultValue("other");
            e.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<MangaTag>(e =>
        {
            e.ToTable("manga_tag");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.MangaId, x.TagId }).IsUnique();
            e.HasOne(x => x.Manga).WithMany(m => m.MangaTags).HasForeignKey(x => x.MangaId);
            e.HasOne(x => x.Tag).WithMany(t => t.MangaTags).HasForeignKey(x => x.TagId);
        });

        modelBuilder.Entity<ReadingProgress>(e =>
        {
            e.ToTable("reading_progress");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.MangaId).IsUnique();
            e.HasOne(x => x.Manga).WithOne(m => m.ReadingProgress).HasForeignKey<ReadingProgress>(x => x.MangaId);
        });

        modelBuilder.Entity<ScanLog>(e =>
        {
            e.ToTable("scan_log");
            e.HasKey(x => x.Id);
            e.Property(x => x.Directory).HasMaxLength(1000);
            e.Property(x => x.Status).HasMaxLength(20);
            e.Property(x => x.ErrorMsg).HasColumnType("text");
        });

        modelBuilder.Entity<DownloadTask>(e =>
        {
            e.ToTable("download_task");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Gid).IsUnique();
            e.Property(x => x.Token).HasMaxLength(20);
            e.Property(x => x.Title).HasMaxLength(500);
            e.Property(x => x.CoverUrl).HasMaxLength(500);
            e.Property(x => x.Status).HasMaxLength(20).HasDefaultValue("pending");
            e.Property(x => x.ErrorMsg).HasColumnType("text");
            e.Ignore(x => x.LastBytes);
            e.Ignore(x => x.LastSpeedTime);
            e.Ignore(x => x.SpeedBps);
        });

        modelBuilder.Entity<ReaderSettings>(e =>
        {
            e.ToTable("reader_settings");
            e.HasKey(x => x.Id);
            e.Property(x => x.FitMode).HasMaxLength(20);
            e.Property(x => x.Direction).HasMaxLength(10);
            e.Property(x => x.Transition).HasMaxLength(10);
            e.Property(x => x.ReadMode).HasMaxLength(10);
        });

        modelBuilder.Entity<AlbumConfig>(e =>
        {
            e.ToTable("album_config");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Key).IsUnique();
            e.Property(x => x.Key).HasMaxLength(200);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Gids).HasColumnType("text");
            e.Property(x => x.Order).HasColumnType("text");
        });
    }
}
