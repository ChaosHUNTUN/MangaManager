using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MangaManager.Data.Migrations
{
    /// <inheritdoc />
    public partial class DropLegacyMangaTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "manga_author");

            migrationBuilder.DropTable(
                name: "manga_tag");

            migrationBuilder.DropTable(
                name: "reading_progress");

            migrationBuilder.DropTable(
                name: "author");

            migrationBuilder.DropTable(
                name: "manga");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "author",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_author", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "manga",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    CoverPath = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    FileCount = table.Column<int>(type: "INTEGER", nullable: false),
                    FolderName = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    FolderPath = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false, defaultValue: "unknown"),
                    Title = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    TotalSize = table.Column<long>(type: "INTEGER", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_manga", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "manga_author",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AuthorId = table.Column<int>(type: "INTEGER", nullable: false),
                    MangaId = table.Column<int>(type: "INTEGER", nullable: false)
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

            migrationBuilder.CreateIndex(
                name: "IX_author_Name",
                table: "author",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_manga_FolderPath",
                table: "manga",
                column: "FolderPath");

            migrationBuilder.CreateIndex(
                name: "IX_manga_Title",
                table: "manga",
                column: "Title");

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
        }
    }
}
