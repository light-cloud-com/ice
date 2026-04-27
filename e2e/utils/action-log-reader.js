/**
 * Action Log Reader — Playwright utilities for reading structured action logs
 *
 * Reads events from window.__ICE_ACTION_LOG__ injected by the action-logger.
 */
/**
 * Get all action log events from the page.
 */
export async function getActionLog(page) {
    return page.evaluate(() => window.__ICE_ACTION_LOG__ || []);
}
/**
 * Get action log events filtered by category.
 */
export async function getLogByCategory(page, category) {
    const log = await getActionLog(page);
    return log.filter((e) => e.category === category);
}
/**
 * Get all API call/response events, optionally filtered by path pattern.
 */
export async function getApiCalls(page, pathPattern) {
    const log = await getActionLog(page);
    const apiEvents = log.filter((e) => e.category === 'api' && (e.action === 'api_call' || e.action === 'api_response' || e.action === 'api_error'));
    if (!pathPattern)
        return apiEvents;
    const regex = typeof pathPattern === 'string' ? new RegExp(pathPattern) : pathPattern;
    return apiEvents.filter((e) => regex.test(e.target));
}
/**
 * Get all error events from the action log.
 */
export async function getErrors(page) {
    const log = await getActionLog(page);
    return log.filter((e) => e.action === 'error' || e.action === 'api_error');
}
/**
 * Wait for a specific action event to appear in the log.
 */
export async function waitForAction(page, predicate, timeout = 30000) {
    const startSeq = await page.evaluate(() => window.__ICE_ACTION_SEQ__ || 0);
    const result = await page.waitForFunction(({ startSeq: seq, predicateStr }) => {
        const log = window.__ICE_ACTION_LOG__ || [];
        // Only check events after startSeq
        const fn = new Function('e', `return (${predicateStr})(e)`);
        return log.find((e) => e.seq >= seq && fn(e)) || null;
    }, { startSeq, predicateStr: predicate.toString() }, { timeout });
    return result.jsonValue();
}
/**
 * Wait for an API response matching the given path.
 */
export async function waitForApiResponse(page, pathPattern, timeout = 30000) {
    return page
        .waitForFunction(({ pattern }) => {
        const log = window.__ICE_ACTION_LOG__ || [];
        return (log.find((e) => (e.action === 'api_response' || e.action === 'api_error') && e.target.includes(pattern)) || null);
    }, { pattern: pathPattern }, { timeout })
        .then((r) => r.jsonValue());
}
/**
 * Get the last deploy result from the action log.
 */
export async function getLastDeployResult(page) {
    const log = await getActionLog(page);
    const deployResponses = log.filter((e) => e.category === 'api' && e.target.includes('/canvas/deploy/apply'));
    return deployResponses.length > 0 ? deployResponses[deployResponses.length - 1] : null;
}
/**
 * Get a summary of the action log for debugging.
 */
export async function getLogSummary(page) {
    const log = await getActionLog(page);
    const categories = new Map();
    const errors = [];
    for (const event of log) {
        categories.set(event.category, (categories.get(event.category) || 0) + 1);
        if (event.action === 'error' || event.action === 'api_error') {
            errors.push(`${event.target}: ${JSON.stringify(event.detail)}`);
        }
    }
    const lines = [
        `Total events: ${log.length}`,
        `Categories: ${[...categories.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`,
    ];
    if (errors.length > 0) {
        lines.push(`Errors (${errors.length}):`);
        errors.forEach((e) => lines.push(`  - ${e}`));
    }
    return lines.join('\n');
}
/**
 * Clear the action log on the page.
 */
export async function clearActionLog(page) {
    await page.evaluate(() => {
        if (window.__ICE_ACTION_LOG__) {
            window.__ICE_ACTION_LOG__.length = 0;
        }
    });
}
/**
 * Dump the action log to a JSON string (for saving to file on failure).
 */
export async function dumpActionLog(page) {
    const log = await getActionLog(page);
    return JSON.stringify(log, null, 2);
}
