## ADDED Requirements

### Requirement: 内置工具直接调用
The system MUST provide direct method invocation capability for BuiltInExecutor with no inter-process communication overhead, supporting high-frequency tools such as file read/write and calculation.

#### Scenario: 调用FileRead工具
- **GIVEN** BuiltInToolsRegistry has registered FileRead tool
- **AND** file path: "./README.md"
- **WHEN** BuiltInExecutor.execute('file-read', { path: './README.md' }) is invoked
- **THEN** return file content within 10ms
- **AND** tool executes directly in memory without subprocess
- **AND** return format: { success: true, content: string }

#### Scenario: 调用Calculation工具
- **GIVEN** expression: "sqrt(144) + 10"
- **WHEN** BuiltInExecutor.execute('calculate', { expression: 'sqrt(144) + 10' }) is invoked
- **THEN** return result 22 within 5ms
- **AND** no process overhead

#### Scenario: 内置工具未找到
- **GIVEN** requesting unregistered tool 'unknown-tool'
- **WHEN** BuiltInExecutor.execute('unknown-tool', {}) is invoked
- **THEN** throw error: 'BuiltIn tool not found: unknown-tool'
- **AND** error code MUST be 'TOOL_NOT_FOUND'

### Requirement: Skills沙箱隔离执行
The system MUST execute Skills in isolated Node.js subprocesses via SkillsSandboxExecutor, providing process-level isolation and resource constraints.

#### Scenario: 成功执行Skills
- **GIVEN** installed Skills: git-commit
- **AND** parameters: { message: 'feat: add new feature' }
- **WHEN** SkillsSandboxExecutor.execute('git-commit', args) is invoked
- **THEN** execute git-commit/scripts/execute.js in subprocess
- **AND** return result containing stdout, exitCode, duration
- **AND** total execution time MUST be < 500ms
- **AND** main process MUST not be blocked

#### Scenario: Skills执行超时
- **GIVEN** a Skills that requires > 60 seconds to run
- **WHEN** SkillsSandboxExecutor.execute() is invoked
- **THEN** send SIGKILL signal after 60 seconds to terminate process
- **AND** return error: { success: false, error: 'Execution timeout', duration: 60000 }
- **AND** subprocess MUST be fully cleaned (no zombie processes)

#### Scenario: Skills输出超限
- **GIVEN** a Skills generating large output (> 10MB)
- **WHEN** SkillsSandboxExecutor.execute() is invoked
- **THEN** terminate process when output reaches 10MB
- **AND** return error: { success: false, error: 'Output size exceeded 10MB limit' }
- **AND** mark truncated output as "[TRUNCATED]"

### Requirement: 执行环境隔离
The system MUST provide clean environment variables and restricted system access via SkillsSandboxExecutor.

#### Scenario: 环境变量清理
- **GIVEN** main process contains sensitive environment variables (API_KEYS, TOKENS)
- **WHEN** Skills execute in subprocess
- **THEN** Skills can only access PATH environment variable
- **AND** all other environment variables MUST be cleaned
- **AND** process.env in subprocess MUST not contain sensitive information

#### Scenario: 工作区隔离
- **GIVEN** Skills execution requires temporary files
- **WHEN** SkillsSandboxExecutor creates execution environment
- **THEN** create isolated workspace for each execution: /tmp/skill-workspace-{uuid}/
- **AND** Skills can only access files within the workspace
- **AND** workspace MUST be cleaned after execution completes

### Requirement: 内存限制
The system MUST set memory usage limits for Skills execution to prevent memory leaks from affecting the system.

#### Scenario: 正常内存使用
- **GIVEN** a Skills using normal memory (< 100MB)
- **WHEN** Skills executes
- **THEN** complete execution successfully
- **AND** memory usage remains normal

#### Scenario: 内存溢出
- **GIVEN** a Skills with memory leak (allocating > 512MB)
- **WHEN** Skills executes
- **THEN** Node.js process parameter --max-old-space-size=512 takes effect
- **AND** terminate process due to OOM
- **AND** return error: { success: false, error: 'Out of memory' }
- **AND** main process MUST not be affected

### Requirement: 错误处理和恢复
The system MUST capture and handle various execution errors via SkillsSandboxExecutor, providing clear error messages.

#### Scenario: Skills脚本不存在
- **GIVEN** Skills 'non-existent' is not installed
- **WHEN** execute() is invoked
- **THEN** throw error: 'Skills not found: non-existent'
- **AND** error.code MUST be 'ENOENT'

#### Scenario: Skills执行错误
- **GIVEN** Skills throws internal exception
- **WHEN** Skills executes
- **THEN** capture error
- **AND** return: { success: false, error: error.message, exitCode: 1 }

#### Scenario: 进程启动失败
- **GIVEN** Node.js execution environment is corrupted
- **WHEN** spawn subprocess
- **THEN** capture spawn error
- **AND** return: { success: false, error: 'Failed to spawn process: ...' }

### Requirement: 执行结果格式化
The system MUST standardize execution result format via SkillsSandboxExecutor for easier post-processing.

#### Scenario: 成功结果
- **GIVEN** Skills executes successfully
- **WHEN** execute() completes
- **THEN** return format:
  ```typescript
  {
    success: true,
    stdout: string,        // Standard output
    stderr: string,        // Standard error
    exitCode: number,      // Exit code
    duration: number       // Execution duration (ms)
  }
  ```

#### Scenario: 失败结果
- **GIVEN** Skills execution fails
- **WHEN** execute() completes
- **THEN** success: false
- **AND** error field contains error message
- **AND** duration field records time until failure

### Requirement: 执行统计记录
The system MUST log execution statistics for each invocation via SkillsSandboxExecutor for monitoring and analysis.

#### Scenario: 记录成功执行统计
- **GIVEN** Skills 'git-commit' executes successfully in 150ms
- **WHEN** execution completes
- **THEN** update statistics:
  - callCount += 1
  - successCount += 1
  - totalDuration += 150

#### Scenario: 记录失败执行统计
- **GIVEN** Skills 'http-request' fails after 2000ms timeout
- **WHEN** execution completes
- **THEN** update statistics:
  - callCount += 1
  - successCount unchanged
  - totalDuration += 2000

#### Scenario: 获取执行统计
- **WHEN** getStats('git-commit') is invoked
- **THEN** return:
  ```typescript
  {
    toolName: "git-commit",
    callCount: 15,
    successCount: 14,
    averageDuration: 180,  // ms
    successRate: 0.93
  }
  ```

### Requirement: 并发执行控制
The system MUST support concurrent execution of multiple Skills through SkillsSandboxExecutor while limiting concurrency to protect system resources.

#### Scenario: 串行执行（并发数=1）
- **GIVEN** need to call 3 independent Skills
- **AND** configuration maxConcurrency = 1
- **WHEN** execute() is invoked
- **THEN** execute 3 Skills sequentially
- **AND** total duration ≈ sum of each Skills duration

#### Scenario: 并发执行（并发数=3）
- **GIVEN** need to call 3 independent Skills
- **AND** configuration maxConcurrency = 3
- **WHEN** execute() is invoked
- **THEN** launch 3 Skills simultaneously
- **AND** total duration ≈ max(skill1, skill2, skill3)

#### Scenario: 并发数限制
- **GIVEN** need to call 10 Skills
- **AND** configuration maxConcurrency = 3
- **WHEN** batch execute
- **THEN** maintain maximum 3 concurrent executions
- **AND** use p-queue to manage execution order

## MODIFIED Requirements

*无修改现有需求*

## REMOVED Requirements

*无删除现有需求*
