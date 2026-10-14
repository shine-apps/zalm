CREATE TABLE "share_event" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"platform" text NOT NULL,
	"page" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"channel" text,
	"event" text NOT NULL,
	"share_url" text,
	"panel_id" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "share_event_target_idx" ON "share_event" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "share_event_event_idx" ON "share_event" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "share_event_actor_idx" ON "share_event" USING btree ("actor_user_id");