import db from '@nangohq/database';
import type { ActivityLog, ActivityLogMessage, LogAction } from '../../models/Activity.js';
import { LogActionEnum } from '../../models/Activity.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';

import { getLogger } from '@nangohq/utils';

const logger = getLogger('Activity');

const activityLogTableName = '_nango_activity_logs';
const activityLogMessageTableName = '_nango_activity_log_messages';

export type ActivityLogMessagesGrouped = Record<number, ActivityLogMessage[]>;

/**
 * _nango_activity_logs
 * _nango_activity_log_messages
 * @desc Store activity logs for all user facing operations
 *
 * _nango_activity_logs:
 *      index:
 *          - environment_id
 *          - session_id
 *
 * _nango_activity_log_messages:
 *     index:
 *          - environment_id
 *          - activity_log_id: activity_log_id_index
 *          - created_at: created_at_index
 */

export async function createActivityLog(log: ActivityLog): Promise<number | null> {
    if (!log.environment_id) {
        return null;
    }

    try {
        const result: void | Pick<ActivityLog, 'id'> = await db.knex.from<ActivityLog>(activityLogTableName).insert(log, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
            return result[0].id;
        }
    } catch (e) {
        errorManager.report(e, {
            source: ErrorSourceEnum.PLATFORM,
            environmentId: log.environment_id,
            operation: LogActionEnum.DATABASE,
            metadata: {
                log
            }
        });
    }

    return null;
}

export async function updateProvider(id: number, provider: string): Promise<void> {
    if (!id) {
        return;
    }
    await db.knex.from<ActivityLog>(activityLogTableName).where({ id }).update({
        provider
    });
}

export async function updateProviderConfigKey(id: number, provider_config_key: string): Promise<void> {
    if (!id) {
        return;
    }
    await db.knex.from<ActivityLog>(activityLogTableName).where({ id }).update({
        provider_config_key
    });
}

export async function updateConnectionId(id: number, connection_id: string): Promise<void> {
    await db.knex.from<ActivityLog>(activityLogTableName).where({ id }).update({
        connection_id
    });
}

export async function updateProviderConfigAndConnectionId(id: number, provider_config_key: string, connection_id: string): Promise<void> {
    await updateConnectionId(id, connection_id);
    await db.knex.from<ActivityLog>(activityLogTableName).where({ id }).update({
        provider_config_key
    });
}

export async function updateSuccess(id: number, success: boolean | null): Promise<void> {
    if (!id) {
        return;
    }
    await db.knex.from<ActivityLog>(activityLogTableName).where({ id }).update({
        success
    });
}

export async function updateEndpoint(id: number, endpoint: string): Promise<void> {
    if (!id) {
        return;
    }
    await db.knex.from<ActivityLog>(activityLogTableName).where({ id }).update({
        endpoint
    });
}

export async function updateAction(id: number, action: LogAction): Promise<void> {
    await db.knex.from<ActivityLog>(activityLogTableName).where({ id }).update({
        action
    });
}

export async function createActivityLogAndLogMessage(log: ActivityLog, logMessage: ActivityLogMessage): Promise<number | null> {
    const logId = await createActivityLog(log);

    if (logId === null) {
        return null;
    }

    logMessage.activity_log_id = logId;

    await createActivityLogMessage(logMessage);

    return logId;
}

export async function createActivityLogMessage(logMessage: ActivityLogMessage, logToConsole = true): Promise<boolean> {
    if (logToConsole) {
        logger.log(logMessage.level as string, logMessage.content);
    }

    if (!logMessage.activity_log_id) {
        return false;
    }

    try {
        const result: void | Pick<ActivityLogMessage, 'id'> = await db.knex.from<ActivityLogMessage>(activityLogMessageTableName).insert(logMessage, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
            return true;
        }
    } catch (e) {
        errorManager.report(e, {
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                logMessage
            }
        });
    }

    return false;
}

export async function addEndTime(activity_log_id: number): Promise<void> {
    try {
        await db.knex.from<ActivityLog>(activityLogTableName).where({ id: activity_log_id }).update({
            end: Date.now()
        });
    } catch (e) {
        errorManager.report(e, {
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                activity_log_id
            }
        });
    }
}

export async function createActivityLogMessageAndEnd(logMessage: ActivityLogMessage): Promise<void> {
    if (!logMessage.activity_log_id) {
        return;
    }
    await createActivityLogMessage(logMessage);
    if (logMessage.activity_log_id !== undefined) {
        await addEndTime(logMessage.activity_log_id);
    }
}

export async function createActivityLogDatabaseErrorMessageAndEnd(baseMessage: string, error: any, activityLogId: number, environment_id: number) {
    let errorMessage = baseMessage;

    if ('code' in error) errorMessage += ` Error code: ${error.code}.\n`;
    if ('detail' in error) errorMessage += ` Detail: ${error.detail}.\n`;

    errorMessage += `Error Message: ${error.message}`;

    await createActivityLogMessageAndEnd({
        level: 'error',
        environment_id,
        activity_log_id: activityLogId,
        timestamp: Date.now(),
        content: errorMessage
    });
}

export async function findOldActivities({ retention, limit }: { retention: number; limit: number }): Promise<{ id: number }[]> {
    const q = db.knex
        .queryBuilder()

        .from('_nango_activity_logs')
        .select('id')
        .where(db.knex.raw(`_nango_activity_logs.updated_at <  NOW() - INTERVAL '${retention} days'`))
        .limit(limit);
    const logs: { id: number }[] = await q;

    return logs;
}

export async function deleteLog({ activityLogId }: { activityLogId: number }): Promise<void> {
    await db.knex.from('_nango_activity_logs').where({ id: activityLogId }).del();
}

export async function deleteLogsMessages({ activityLogId, limit }: { activityLogId: number; limit: number }): Promise<number> {
    const del = await db.knex
        .from('_nango_activity_log_messages')
        .whereIn('id', db.knex.queryBuilder().select('id').from('_nango_activity_log_messages').where({ activity_log_id: activityLogId }).limit(limit))
        .del();
    return del;
}
