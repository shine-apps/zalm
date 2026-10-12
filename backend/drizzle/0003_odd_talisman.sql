CREATE TABLE "activity_media" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"media_id" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_media_activity_media_unique" UNIQUE("activity_id","media_id")
);
--> statement-breakpoint
ALTER TABLE "activity_media" ADD CONSTRAINT "activity_media_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_media" ADD CONSTRAINT "activity_media_media_id_media_file_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_file"("id") ON DELETE restrict ON UPDATE no action;