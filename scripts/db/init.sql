-- ============================================
-- MangaManager 数据库初始化脚本
-- ============================================

CREATE DATABASE IF NOT EXISTS manga_db 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

USE manga_db;

-- 漫画表
CREATE TABLE IF NOT EXISTS manga (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(500) NOT NULL,
    folder_name VARCHAR(500) NOT NULL COMMENT '文件夹原始名称',
    folder_path VARCHAR(1000) NOT NULL COMMENT '文件夹完整路径',
    cover_path  VARCHAR(1000) NULL COMMENT '封面图路径',
    file_count  INT DEFAULT 0 COMMENT '文件数量',
    total_size  BIGINT DEFAULT 0 COMMENT '总大小(字节)',
    description TEXT NULL COMMENT '描述/备注',
    status      ENUM('ongoing','completed','unknown') DEFAULT 'unknown',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_folder_path (folder_path(255)),
    INDEX idx_title (title(255)),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 作者表
CREATE TABLE IF NOT EXISTS author (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    name    VARCHAR(200) NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 漫画-作者关联表
CREATE TABLE IF NOT EXISTS manga_author (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    manga_id  INT NOT NULL,
    author_id INT NOT NULL,
    
    UNIQUE KEY uk_manga_author (manga_id, author_id),
    FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES author(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 标签表
CREATE TABLE IF NOT EXISTS tag (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    name    VARCHAR(100) NOT NULL UNIQUE,
    color   VARCHAR(7) DEFAULT '#6366f1' COMMENT '标签颜色',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 漫画-标签关联表
CREATE TABLE IF NOT EXISTS manga_tag (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    manga_id INT NOT NULL,
    tag_id   INT NOT NULL,
    
    UNIQUE KEY uk_manga_tag (manga_id, tag_id),
    FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 阅读进度表
CREATE TABLE IF NOT EXISTS reading_progress (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    manga_id    INT NOT NULL,
    page_index  INT DEFAULT 0 COMMENT '当前页码(从0开始)',
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_manga_progress (manga_id),
    FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 扫描日志表
CREATE TABLE IF NOT EXISTS scan_log (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    directory    VARCHAR(1000) NOT NULL,
    status       ENUM('running','completed','failed') DEFAULT 'running',
    total_found  INT DEFAULT 0,
    new_added    INT DEFAULT 0,
    error_msg    TEXT NULL,
    started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at  DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入预设标签
INSERT IGNORE INTO tag (name, color) VALUES
    ('AI Generated', '#8b5cf6'),
    ('Patreon', '#f59e0b'),
    ('Pixiv', '#06b6d4'),
    ('Fanbox', '#ec4899'),
    ('同人志', '#10b981'),
    ('NSFW', '#ef4444'),
    ('全彩', '#f97316'),
    ('汉化', '#3b82f6');
