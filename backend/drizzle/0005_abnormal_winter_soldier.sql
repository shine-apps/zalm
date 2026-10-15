CREATE TABLE "points_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"points" integer NOT NULL,
	"category" text NOT NULL,
	"source" text NOT NULL,
	"activity_id" text,
	"registration_id" text,
	"donation_kind" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"reversal_of" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_points" (
	"user_id" text PRIMARY KEY NOT NULL,
	"activity_points" integer DEFAULT 0 NOT NULL,
	"donation_points" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_registration_id_activity_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."activity_registration"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_reversal_of_points_ledger_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."points_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_points" ADD CONSTRAINT "user_points_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "points_ledger_registration_uidx" ON "points_ledger" USING btree ("registration_id") WHERE "points_ledger"."registration_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "points_ledger_reversal_uidx" ON "points_ledger" USING btree ("reversal_of") WHERE "points_ledger"."reversal_of" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "points_ledger_user_idx" ON "points_ledger" USING btree ("user_id","category","created_at" desc);--> statement-breakpoint
CREATE INDEX "points_ledger_category_idx" ON "points_ledger" USING btree ("category","created_at" desc);