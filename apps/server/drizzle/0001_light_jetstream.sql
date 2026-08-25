CREATE TABLE "option_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_option_key" text NOT NULL,
	"symbol" text NOT NULL,
	"quantity" numeric(40, 18) NOT NULL,
	"provider_market_value" numeric(30, 10) NOT NULL,
	"currency" text NOT NULL,
	"detail_support" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source_as_of" timestamp with time zone NOT NULL,
	"provenance" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" RENAME COLUMN "provider_account_ref" TO "provider_account_key";--> statement-breakpoint
DROP INDEX "accounts_provider_ref_unique";--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "supported_position_value" numeric(30, 10);--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "unsupported_detail_value" numeric(30, 10);--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "cash_value" numeric(30, 10);--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "accrued_value" numeric(30, 10);--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "inclusion_reason" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "source_window_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD COLUMN "source_window_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "sync_completeness" text DEFAULT 'complete' NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "source_window_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "source_window_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "source_fingerprint" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "sync_completeness" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "source_window_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "source_window_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "source_fingerprint" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "mapping_version" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "calculation_version" text;--> statement-breakpoint
ALTER TABLE "option_observations" ADD CONSTRAINT "option_observations_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_observations" ADD CONSTRAINT "option_observations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "option_observations_sync_account_option_unique" ON "option_observations" USING btree ("sync_run_id","account_id","provider_option_key");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_snapshots_source_fingerprint_unique" ON "portfolio_snapshots" USING btree ("user_id","source_fingerprint","calculation_version");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_ref_unique" ON "accounts" USING btree ("user_id","provider","provider_account_key");