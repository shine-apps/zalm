CREATE TABLE "follow" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_user_target_unique" UNIQUE("user_id","target_type","target_id")
);
--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_user_type_idx" ON "follow" USING btree ("user_id","target_type");