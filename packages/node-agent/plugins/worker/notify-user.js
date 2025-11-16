const path = require('path');

function resolveTaskStorage() {
  const distPath = path.resolve(__dirname, '..', '..', 'dist', 'utils', 'taskStorage');
  const srcPath = path.resolve(__dirname, '..', '..', 'src', 'utils', 'taskStorage');

  try {
     
    return require(distPath);
  } catch (error) {
     
    return require(srcPath);
  }
}

module.exports = async function registerNotifyUserPlugin({ orchestrator, logger }) {
  const { recordNotification } = resolveTaskStorage();

  orchestrator.registerTool('notify_user', async ({ assignment, logger: taskLogger }) => {
    const args = assignment.toolArgs ?? {};
    const channel = typeof args.channel === 'string' ? args.channel : undefined;
    const message = typeof args.message === 'string' ? args.message : undefined;

    if (!channel || !message) {
      return {
        success: false,
        error: {
          code: 'invalid_arguments',
          message: 'notify_user requires channel and message'
        }
      };
    }

    const metadataUserId =
      typeof assignment.metadata?.userId === 'string' ? assignment.metadata.userId : undefined;
    const userId = typeof args.userId === 'string' ? args.userId : metadataUserId;

    taskLogger.info('Recording user notification', {
      channel,
      userId
    });

    const record = await recordNotification(
      {
        userId,
        channel,
        message,
        sourceTaskId: assignment.taskId,
        nodeId: assignment.nodeId
      },
      taskLogger
    );

    return {
      success: true,
      result: {
        notified: true,
        record
      }
    };
  });

  logger.debug('notify_user tool plugin registered');
};

