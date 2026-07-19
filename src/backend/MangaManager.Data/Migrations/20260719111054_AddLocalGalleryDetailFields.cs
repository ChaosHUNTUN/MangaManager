using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MangaManager.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLocalGalleryDetailFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "Posted",
                table: "local_gallery",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<int>(
                name: "RatingCount",
                table: "local_gallery",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "TitleJpn",
                table: "local_gallery",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Uploader",
                table: "local_gallery",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Posted",
                table: "local_gallery");

            migrationBuilder.DropColumn(
                name: "RatingCount",
                table: "local_gallery");

            migrationBuilder.DropColumn(
                name: "TitleJpn",
                table: "local_gallery");

            migrationBuilder.DropColumn(
                name: "Uploader",
                table: "local_gallery");
        }
    }
}
