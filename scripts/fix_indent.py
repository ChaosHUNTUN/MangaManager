with open(r'd:\MangaManager\src\backend\MangaManager.Services\LocalGalleryService.cs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Delete line 356 (0-based 355) — duplicate var map
del lines[355]

# 2. Fix indentation: lines after the old line 356 up to 'db.SaveChanges()' need -8 spaces
# Find where the extra indented block ends
start_fix = 355  # after deletion, line 355 (was 356) is now "albumsToCreate"
end_fix = -1
for i in range(start_fix, len(lines)):
    if 'groups = map.Values' in lines[i] or 'return groups' in lines[i]:
        end_fix = i - 1
        break

if end_fix > start_fix:
    for i in range(start_fix, end_fix + 1):
        if lines[i].startswith('                '):  # 16 spaces
            lines[i] = lines[i][8:]  # remove first 8 spaces
    print(f'Fixed indentation of {end_fix - start_fix + 1} lines')

with open(r'd:\MangaManager\src\backend\MangaManager.Services\LocalGalleryService.cs', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('Done')
