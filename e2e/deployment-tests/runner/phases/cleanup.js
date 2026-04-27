/**
 * cleanup phase — destroy resources or preserve them, per scenario settings.
 *
 * On preserve, write PRESERVED.md with destroy instructions so the user can
 * tear down manually after inspecting.
 */
export async function runCleanup(ctx, overallStatus) {
    const { logger, scenario } = ctx;
    const { destroyOnSuccess, destroyOnFailure } = scenario.cleanup;
    const shouldDestroy = (overallStatus === 'pass' && destroyOnSuccess) || (overallStatus === 'fail' && destroyOnFailure);
    if (!shouldDestroy) {
        logger.note(`Preserving resources (overall=${overallStatus}, destroyOnSuccess=${destroyOnSuccess}, destroyOnFailure=${destroyOnFailure})`);
        const text = renderPreservedNotice(scenario.id, scenario.project.gcp.project, scenario.project.gcp.region);
        logger.writePreservedNotice(text);
        return { status: 'skipped' };
    }
    try {
        logger.note('Destroying deployed resources via UI');
        // The destroy button opens a DestroyConfirmModal — click it, then click
        // the modal's red Destroy button to actually fire the API. The fixture's
        // destroy() helper was written before the modal existed, so we drive
        // both the button and the confirm here.
        const { page } = ctx;
        const destroyBtn = page.locator('#ice-deploy-btn-destroy');
        if (!(await destroyBtn.isVisible().catch(() => false))) {
            logger.note('Destroy button not visible — nothing to clean up', 'warn');
            return { status: 'skipped' };
        }
        logger.emit({ kind: 'ui_action', action: 'click', selector: '#ice-deploy-btn-destroy' });
        await destroyBtn.click();
        // The DestroyConfirmModal requires typing the card name to enable
        // the destructive button (canConfirm = typed === cardName). The label
        // reads "Type <span>{cardName}</span> to confirm:" — anchor on that
        // text since `autoFocus` doesn't always reflect to a CSS-targetable
        // attribute.
        const confirmLabel = page
            .locator('label')
            .filter({ hasText: /Type .+ to confirm/i })
            .first();
        try {
            await confirmLabel.waitFor({ state: 'visible', timeout: 5000 });
        }
        catch {
            logger.note('DestroyConfirmModal label did not appear within 5s', 'warn');
            return { status: 'fail', error: 'DestroyConfirmModal not visible' };
        }
        // Card name is between "Type " and " to confirm" in the label text.
        const labelText = (await confirmLabel.textContent()) || '';
        const cardNameMatch = labelText.match(/Type\s+(.+?)\s+to confirm/i);
        const cardName = cardNameMatch?.[1]?.trim() || '';
        if (!cardName) {
            logger.note(`Could not extract cardName from label: "${labelText}"`, 'warn');
            return { status: 'fail', error: 'no cardName in label' };
        }
        // Input is the first text input under the label's parent <div>.
        const confirmInput = confirmLabel.locator('xpath=..').locator('input[type="text"]').first();
        await confirmInput.waitFor({ state: 'visible', timeout: 3000 });
        logger.emit({
            kind: 'ui_action',
            action: 'fill',
            selector: 'destroy-modal-confirm-input',
            args: { value: cardName },
        });
        await confirmInput.fill(cardName);
        // The button now reads "Destroy everything" (since destroyEverything
        // defaults to true when resources.length === 0 in the modal state, but
        // here resources.length>0 so default is false → "Destroy"). Match either.
        const confirmBtn = page
            .locator('button:has-text("Destroy"):not(#ice-deploy-btn-destroy), button:has-text("Destroy everything"):not(#ice-deploy-btn-destroy)')
            .last();
        await confirmBtn.waitFor({ state: 'visible', timeout: 3000 });
        logger.emit({ kind: 'ui_action', action: 'click', selector: 'destroy-modal-confirm', args: { cardName } });
        await confirmBtn.click();
        // Now wait for the destroy API to complete. fixture.destroy() expects
        // to see the destroy button and click it — but it's already gone, so
        // we mirror its waitForFunction directly.
        const ok = await page
            .waitForFunction(() => {
            const log = window.__ICE_ACTION_LOG__ || [];
            return log.some((e) => typeof e.target === 'string' &&
                e.target.includes('/canvas/deploy/destroy') &&
                (e.action === 'api_response' || e.action === 'api_error'));
        }, {}, { timeout: 180_000 })
            .then(() => true)
            .catch(() => false);
        if (!ok) {
            logger.note('Destroy API never responded within 180s', 'error');
            return { status: 'fail', error: 'destroy API timeout' };
        }
        // Drain the action log so the destroy API exchange is in events.jsonl.
        const log = (await page.evaluate(() => {
            const w = window;
            const arr = w.__ICE_ACTION_LOG__ || [];
            w.__ICE_ACTION_LOG__ = [];
            return arr;
        }));
        for (const ev of log) {
            const action = String(ev.action ?? '');
            const target = String(ev.target ?? '');
            const detail = ev.detail || {};
            const seq = Number(ev.seq ?? 0);
            if (action === 'api_call')
                logger.emit({ kind: 'api_call', target, detail, appSeq: seq });
            else if (action === 'api_response')
                logger.emit({ kind: 'api_response', target, status: Number(detail.status ?? 0), detail, appSeq: seq });
            else if (action === 'api_error')
                logger.emit({
                    kind: 'api_error',
                    target,
                    status: Number(detail.status ?? 0) || undefined,
                    detail,
                    appSeq: seq,
                });
        }
        logger.note('Destroy completed');
        return { status: 'pass' };
    }
    catch (err) {
        return { status: 'fail', error: err instanceof Error ? err.message : String(err) };
    }
}
function renderPreservedNotice(scenarioId, project, region) {
    return [
        `# Preserved resources for scenario \`${scenarioId}\``,
        '',
        `These resources were intentionally NOT destroyed because the scenario`,
        `failed and \`cleanup.destroyOnFailure\` is false. Inspect them in the`,
        `GCP console, then tear down manually:`,
        '',
        '```bash',
        `# List buckets`,
        `gcloud storage buckets list --project=${project}`,
        '',
        `# List Cloud Run services`,
        `gcloud run services list --project=${project} --region=${region}`,
        '',
        `# Re-open ICE and click "Destroy" in the deploy panel,`,
        `# or run terraform destroy in the deployment workspace.`,
        '```',
        '',
    ].join('\n');
}
