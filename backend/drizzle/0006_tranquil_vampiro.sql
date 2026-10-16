CREATE TABLE "activity_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"description" text DEFAULT '' NOT NULL,
	"cover_url" text,
	"location" jsonb,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"register_deadline" timestamp with time zone,
	"capacity" integer,
	"points" integer,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_template" ADD CONSTRAINT "activity_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;