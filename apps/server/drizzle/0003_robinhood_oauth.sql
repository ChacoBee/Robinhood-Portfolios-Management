CREATE TABLE "robinhood_oauth_credentials" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "client_information" text,
  "token_set" text,
  "connection_state" text NOT NULL,
  "token_updated_at" timestamp with time zone,
  "last_heartbeat_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "robinhood_oauth_credentials" ADD CONSTRAINT "robinhood_oauth_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "robinhood_oauth_credentials_owner_provider_unique"
  ON "robinhood_oauth_credentials" USING btree ("user_id", "provider");
--> statement-breakpoint
CREATE INDEX "robinhood_oauth_credentials_provider_idx"
  ON "robinhood_oauth_credentials" USING btree ("provider");
