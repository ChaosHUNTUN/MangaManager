using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MangaManager.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "album_config",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Key = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Gids = table.Column<string>(type: "text", nullable: false),
                    Order = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false, defaultValueSql: "datetime('now')"),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_album_config", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "author",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_author", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "download_task",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Gid = table.Column<int>(type: "INTEGER", nullable: false),
                    Token = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    CoverUrl = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    TotalPages = table.Column<int>(type: "INTEGER", nullable: false),
                    DownloadedPages = table.Column<int>(type: "INTEGER", nullable: false),
                    FailedPages = table.Column<int>(type: "INTEGER", nullable: false),
                    DownloadedBytes = table.Column<long>(type: "INTEGER", nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false, defaultValue: "pending"),
                    ErrorMsg = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_download_task", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "local_reading_progress",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Gid = table.Column<int>(type: "INTEGER", nullable: false),
                    PageIndex = table.Column<int>(type: "INTEGER", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_local_reading_progress", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "manga",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    FolderName = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    FolderPath = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    CoverPath = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    FileCount = table.Column<int>(type: "INTEGER", nullable: false),
                    TotalSize = table.Column<long>(type: "INTEGER", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false, defaultValue: "unknown"),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_manga", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "reader_settings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    FitMode = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    FitPercent = table.Column<int>(type: "INTEGER", nullable: false),
                    Direction = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Transition = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    ReadMode = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    SlideInterval = table.Column<int>(type: "INTEGER", nullable: false),
                    ScrollSpeed = table.Column<int>(type: "INTEGER", nullable: false),
                    LoopMode = table.Column<bool>(type: "INTEGER", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reader_settings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "scan_log",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Directory = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    TotalFound = table.Column<int>(type: "INTEGER", nullable: false),
                    NewAdded = table.Column<int>(type: "INTEGER", nullable: false),
                    ErrorMsg = table.Column<string>(type: "text", nullable: true),
                    StartedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    FinishedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_scan_log", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "tag",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Color = table.Column<string>(type: "TEXT", maxLength: 7, nullable: false),
                    Category = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false, defaultValue: "other"),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tag", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "manga_author",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    MangaId = table.Column<int>(type: "INTEGER", nullable: false),
                    AuthorId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_manga_author", x => x.Id);
                    table.ForeignKey(
                        name: "FK_manga_author_author_AuthorId",
                        column: x => x.AuthorId,
                        principalTable: "author",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_manga_author_manga_MangaId",
                        column: x => x.MangaId,
                        principalTable: "manga",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "reading_progress",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    MangaId = table.Column<int>(type: "INTEGER", nullable: false),
                    PageIndex = table.Column<int>(type: "INTEGER", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reading_progress", x => x.Id);
                    table.ForeignKey(
                        name: "FK_reading_progress_manga_MangaId",
                        column: x => x.MangaId,
                        principalTable: "manga",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "manga_tag",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    MangaId = table.Column<int>(type: "INTEGER", nullable: false),
                    TagId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_manga_tag", x => x.Id);
                    table.ForeignKey(
                        name: "FK_manga_tag_manga_MangaId",
                        column: x => x.MangaId,
                        principalTable: "manga",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_manga_tag_tag_TagId",
                        column: x => x.TagId,
                        principalTable: "tag",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_album_config_Key",
                table: "album_config",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_author_Name",
                table: "author",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_download_task_Gid",
                table: "download_task",
                column: "Gid",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_local_reading_progress_Gid",
                table: "local_reading_progress",
                column: "Gid",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_manga_author_AuthorId",
                table: "manga_author",
                column: "AuthorId");

            migrationBuilder.CreateIndex(
                name: "IX_manga_author_MangaId_AuthorId",
                table: "manga_author",
                columns: new[] { "MangaId", "AuthorId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_manga_tag_MangaId_TagId",
                table: "manga_tag",
                columns: new[] { "MangaId", "TagId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_manga_tag_TagId",
                table: "manga_tag",
                column: "TagId");

            migrationBuilder.CreateIndex(
                name: "IX_reading_progress_MangaId",
                table: "reading_progress",
                column: "MangaId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_tag_Name",
                table: "tag",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "album_config");

            migrationBuilder.DropTable(
                name: "download_task");

            migrationBuilder.DropTable(
                name: "local_reading_progress");

            migrationBuilder.DropTable(
                name: "manga_author");

            migrationBuilder.DropTable(
                name: "manga_tag");

            migrationBuilder.DropTable(
                name: "reader_settings");

            migrationBuilder.DropTable(
                name: "reading_progress");

            migrationBuilder.DropTable(
                name: "scan_log");

            migrationBuilder.DropTable(
                name: "author");

            migrationBuilder.DropTable(
                name: "tag");

            migrationBuilder.DropTable(
                name: "manga");
        }
    }
}
