import { VERSION } from "solution-validator";

const REPOSITORY_URL = "https://github.com/apostx/solution-validator";
const ROADMAP_URL = `${REPOSITORY_URL}/blob/main/docs/roadmap.md`;

export function App() {
  return (
    <main className="placeholder">
      <h1>SolutionValidator</h1>
      <p className="lead">
        A visual sandbox for the SolutionValidator library. It is strictly a tech demo.
      </p>
      <p>
        This page is a placeholder. The palette, canvas, property panel and findings panel arrive
        with Iteration 1 of the <a href={ROADMAP_URL}>roadmap</a>.
      </p>
      <dl>
        <dt>Library version</dt>
        <dd>
          <code>{VERSION}</code>
        </dd>
      </dl>
      <p>
        <a href={REPOSITORY_URL}>Source on GitHub</a>
      </p>
    </main>
  );
}
