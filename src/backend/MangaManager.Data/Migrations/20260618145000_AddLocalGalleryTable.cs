using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MangaManager.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLocalGalleryTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "local_gallery",
                columns: table => new
                {
                    Gid = table.Column<int>(type: "INTEGER", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    DirPath = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    Category = table.Column<string>(type: "TEXT", maxLength: 50, nullable: true),
                    Language = table.Column<string>(type: "TEXT", maxLength: 50, nullable: true),
                    Rating = table.Column<double>(type: "REAL", nullable: false),
                    FileCount = table.Column<int>(type: "INTEGER", nullable: false),
                    FileSize = table.Column<long>(type: "INTEGER", nullable: false),
                    CoverFile = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    Artists = table.Column<string>(type: "text", nullable: true),
                    Groups = table.Column<string>(type: "text", nullable: true),
                    OnlineUrl = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    Token = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    DownloadedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    LastModified = table.Column<DateTime>(type: "TEXT", nullable: false),
                    SyncedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_local_gallery", x => x.Gid);
                });

            migrationBuilder.CreateIndex(
                name: "IX_local_gallery_Category",
                table: "local_gallery",
                column: "Category");

            migrationBuilder.CreateIndex(
                name: "IX_local_gallery_Language",
                table: "local_gallery",
                column: "Language");

            migrationBuilder.CreateIndex(
                name: "IX_local_gallery_DownloadedAt",
                table: "local_gallery",
                column: "DownloadedAt");

            migrationBuilder.CreateIndex(
                name: "IX_local_gallery_LastModified",
                table: "local_gallery",
                column: "LastModified");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "local_gallery");
        }
    }
}
