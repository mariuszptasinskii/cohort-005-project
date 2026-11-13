ALTER TABLE `refunds` RENAME TO `cancellations`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cancellations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`reason` text NOT NULL,
	`amount_refunded` integer,
	`requested_at` text NOT NULL,
	`resolved_at` text,
	`resolved_by_user_id` integer,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_cancellations`("id", "purchase_id", "status", "reason", "amount_refunded", "requested_at", "resolved_at", "resolved_by_user_id") SELECT "id", "purchase_id", "status", "reason", "amount_refunded", "requested_at", "resolved_at", "resolved_by_user_id" FROM `cancellations`;--> statement-breakpoint
DROP TABLE `cancellations`;--> statement-breakpoint
ALTER TABLE `__new_cancellations` RENAME TO `cancellations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `cancellations_purchase_idx` ON `cancellations` (`purchase_id`);