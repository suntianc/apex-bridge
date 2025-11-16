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

module.exports = async function registerCalendarTaskPlugin({ orchestrator, logger }) {
  const { recordCalendarTask } = resolveTaskStorage();

  orchestrator.registerTool('calendar_task', async ({ assignment, logger: taskLogger }) => {
    const args = assignment.toolArgs ?? {};
    const title = typeof args.title === 'string' ? args.title : undefined;

    if (!title) {
      return {
        success: false,
        error: {
          code: 'invalid_arguments',
          message: 'calendar_task requires a title'
        }
      };
    }

    const deadline = typeof args.deadline === 'string' ? args.deadline : undefined;
    const notes = typeof args.notes === 'string' ? args.notes : undefined;
    const metadataUserId =
      typeof assignment.metadata?.userId === 'string' ? assignment.metadata.userId : undefined;
    const userId = typeof args.userId === 'string' ? args.userId : metadataUserId;

    taskLogger.info('Recording calendar task', {
      title,
      deadline,
      userId
    });

    const record = await recordCalendarTask(
      {
        userId,
        title,
        deadline,
        notes,
        sourceTaskId: assignment.taskId,
        nodeId: assignment.nodeId
      },
      taskLogger
    );

    return {
      success: true,
      result: {
        scheduled: true,
        record
      }
    };
  });

  logger.debug('calendar_task tool plugin registered');
};

