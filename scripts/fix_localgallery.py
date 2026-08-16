with open(r'd:\MangaManager\src\frontend\manga-ui\src\pages\LocalGallery.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Delete orphaned convertGroupToAlbum body: lines 479-484 (0-based: 478-483)
# Check the content first
for i in range(478, 484):
    print(f'{i+1:4d}: {lines[i].rstrip()[:120]}')

to_delete = set(range(478, 484))
new_lines = [l for i, l in enumerate(lines) if i not in to_delete]

with open(r'd:\MangaManager\src\frontend\manga-ui\src\pages\LocalGallery.jsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print(f'Removed {len(lines) - len(new_lines)} lines')
