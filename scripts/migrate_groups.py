with open(r'd:\MangaManager\src\backend\MangaManager.Services\LocalGalleryService.cs', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the duplicate "var map = new Dictionary..." from the body at line 356
# Find and remove the second occurrence of "var map = new Dictionary<string, GroupInfo>();"
old_text = '        var map = new Dictionary<string, GroupInfo>();\n        var albumsToCreate'
new_text = '        var albumsToCreate'

if old_text in content:
    content = content.replace(old_text, new_text, 1)
    with open(r'd:\MangaManager\src\backend\MangaManager.Services\LocalGalleryService.cs', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Fixed')
else:
    # Try searching without exact whitespace
    for line in content.split('\n'):
        if 'var map = new Dictionary<string, GroupInfo>' in line:
            print(f'Found map at: {line[:60]}...')
    print('Old text not found')
