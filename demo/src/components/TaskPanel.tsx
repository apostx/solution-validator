import type { Component, Finding, RequirementsResult, Task } from "solution-validator";

interface TaskPanelProps {
  task: Task | undefined;
  /** Problems with the task itself, from parseTask. */
  taskFindings: readonly Finding[];
  result: RequirementsResult | undefined;
  /** The solution's components, to show which ones carry the task's roles. */
  components: readonly Component[];
}

/** The task's requirements as a checklist with verdicts and evidence. */
export function TaskPanel({ task, taskFindings, result, components }: TaskPanelProps) {
  if (!task) {
    return <p className="hint">This scenario has no task. It is analyzed on its own.</p>;
  }
  return (
    <div className="task-panel">
      <h2>{task.title ?? task.id}</h2>
      {task.description && <p className="hint">{task.description}</p>}
      {task.roles && task.roles.length > 0 && (
        <>
          <h3>Roles</h3>
          <p className="hint">Tag components with these roles in the Properties tab.</p>
          <ul className="roles">
            {task.roles.map((role) => {
              const tagged = components.filter((component) => component.roles?.includes(role.id));
              return (
                <li key={role.id}>
                  <code>{role.id}</code> {role.label ?? ""}{" "}
                  <span className="hint">
                    {tagged.length > 0
                      ? `→ ${tagged.map((component) => component.id).join(", ")}`
                      : "→ not assigned"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {taskFindings.length > 0 && (
        <ul className="related-findings">
          {taskFindings.map((finding) => (
            <li key={finding.message} className={`severity-${finding.severity}`}>
              {finding.message}
            </li>
          ))}
        </ul>
      )}
      {result ? (
        <>
          <p>
            Overall: <span className={`verdict verdict-${result.verdict}`}>{result.verdict}</span>{" "}
            <span className="hint">
              ({result.summary.pass} pass, {result.summary.fail} fail, {result.summary.undecidable}{" "}
              undecidable)
            </span>
          </p>
          <ol className="checklist">
            {result.requirements.map((requirement) => {
              const definition = task.requirements.find((r) => r.id === requirement.requirement);
              return (
                <li key={requirement.requirement} className={`verdict-${requirement.verdict}`}>
                  <div className="requirement-head">
                    <span className={`verdict verdict-${requirement.verdict}`}>
                      {requirement.verdict}
                    </span>
                    <strong>{requirement.requirement}</strong>
                    <code>{requirement.type}</code>
                    {Object.keys(requirement.meta).length > 0 && (
                      <code className="meta">{JSON.stringify(requirement.meta)}</code>
                    )}
                  </div>
                  {definition?.description && <div>{definition.description}</div>}
                  <ul>
                    {requirement.evidence.map((evidence) => (
                      <li key={`${evidence.code}:${evidence.message}`}>{evidence.message}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
          {result.findings
            .filter((finding) => finding.code.startsWith("TASK_"))
            .map((finding) => (
              <p key={finding.message} className="error">
                {finding.message}
              </p>
            ))}
        </>
      ) : (
        taskFindings.length === 0 && (
          <p className="hint">The requirements are checked once the model is valid JSON.</p>
        )
      )}
    </div>
  );
}
