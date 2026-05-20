-- DR-O1: keep deploy_event rows alive after their parent CanvasDeployment is
-- pruned so incident archaeology still works. Pruning is handled on a separate
-- schedule in services/deploy/src/services/cron.service.ts.
--
-- The prior constraint was ON DELETE CASCADE; we drop it and re-add with
-- NO ACTION. Existing orphaned rows (there shouldn't be any yet) remain
-- untouched.
ALTER TABLE "deploy_event" DROP CONSTRAINT IF EXISTS "deploy_event_deployment_id_fkey";
ALTER TABLE "deploy_event" ADD CONSTRAINT "deploy_event_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "canvas_deployment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
