import sqlite3
c = sqlite3.connect(r'D:\MangaManager\data\api-data\manga.db')
r = c.execute("SELECT DirPath FROM local_gallery WHERE Gid=4010665")
print(r.fetchone()[0])
c.close()
