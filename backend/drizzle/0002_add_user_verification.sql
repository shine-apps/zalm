CREATE TABLE "user_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"verification_image" text NOT NULL,
	"showcase_media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"introduction" text DEFAULT '' NOT NULL,
	"ocr_result" jsonb,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_verification" ADD CONSTRAINT "user_verification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_verification" ADD CONSTRAINT "user_verification_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_verification_user_idx" ON "user_verification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_verification_status_created_idx" ON "user_verification" USING btree ("status","created_at");