-- CreateIndex
CREATE INDEX `idx_active_sort` ON `categories`(`is_active`, `sort_order`);

-- CreateIndex
CREATE INDEX `idx_target_period` ON `content_targets`(`target_type`, `start_at`, `end_at`);

-- CreateIndex
CREATE INDEX `idx_status_published` ON `contents`(`status`, `published_at`);

-- CreateIndex
CREATE INDEX `idx_author_department` ON `contents`(`author_department`);

-- CreateIndex
CREATE INDEX `idx_active_sort` ON `menus`(`is_active`, `sort_order`);

-- CreateIndex
CREATE INDEX `idx_expires_at` ON `password_reset_tokens`(`expires_at`);

-- CreateIndex
CREATE INDEX `idx_expires_at` ON `two_factor_codes`(`expires_at`);
