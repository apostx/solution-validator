# SolutionValidator

**Product vision and usage expectations**

> Translated from the original Hungarian version (`SolutionValidator_termekvizio.md`) on 2026-11-10. The content is unchanged.

This document records the purpose and expected behavior of the project as agreed so far. It is not a technical specification or a complete development backlog. It does not authorize implementing further features that have not been agreed.

## 1. Purpose of the project

SolutionValidator is a standalone, reusable library that analyzes how software and infrastructure solutions work and evaluates them against requirements. Its goal is to support a solution architect mindset. It should examine the relationships, operability and suitability of the solution as a whole, not only individual components or a single cloud architecture.

The first, narrower area of application is the analysis of AWS-based systems. The long-term goal is to also support Azure, other cloud environments, and on-premises and hybrid systems. The library must not be tied to AWS or to a single way of use.

## 2. Expected behavior

- From the description of a designed system, the library should understand the components, their relationships, their functions and the settings needed for the analysis.
- It should examine whether the relationships are valid and whether the solution works logically, not merely whether certain components are present. For example, connecting an application to a database does not by itself prove that the application can reach the database.
- It should be possible to evaluate a solution on its own, and also against the requirements of a given task. Analysis and task-specific scoring should be usable separately.
- A task should accept several correct solutions. The engine should examine how the solution works and whether the requirements are met, not search for one predefined diagram. If the task prescribes a specific service or approach, it should be possible to take that into account too.
- Evaluation must be deterministic: the same input and the same analysis conditions produce the same result. The finished product must not use AI to analyze operation or to score. AI-generated explanations are not needed either.

## 3. Level of detail and feasibility

Both simple, logical design and detailed technical examination should be possible. It should not be necessary to specify every configuration for a system to be analyzable at a high level. At the same time, the library must not rule out later examination of concrete IP addresses, network settings and other details.

- It should be possible to adjust to the use case which analyses are performed and at what level of detail. Detailed checks should be optional.
- Example: in simple mode, network placement and the role of the Security Group and the ACL can be examined without exact IP addresses. In detailed mode, the addresses, routing and access rules actually specified can be checked as well.
- The purpose of the detailed examination is a static check that the planned configuration is feasible. It is not a goal to simulate every real runtime condition or to guarantee a successful deployment.

If a requirement cannot be decided from the available data or the supported analyses, this must be clearly distinguished from both compliance and failure. The analysis must not claim more than the given information supports.

## 4. ArchitectMate and further uses

ArchitectMate is the planned first consumer of SolutionValidator: a minimalist, visual system design practice application. Based on a task description, the player places components and specifies connections and the necessary logical settings. The library then evaluates the solution. LeetCode-style challenges can accept several correct solutions and can be scored by how well the requirements are met.

In the game, what matters most is the function of the components, how they relate to each other, and how the solution is designed. Mandatory handling of the full cloud configuration or of exact IP addresses is not a goal. Regardless of this, the library must be usable from other applications without a UI, for example for more detailed architecture analysis and feasibility checking.

SolutionValidator should be built on its own, extensible description model. Terraform is not the base format and is not part of the current implementation goals. It may come up later as an optional export capability.

## 5. Development framework

The expectations in this document define the intent of the product. The exact feature set of the first version, the depth of analysis, the supported components and the details of scoring are not final yet. Later goals do not need to be built into the first version automatically.

When designing the technical solution, the developer is free to propose approaches, but these must not automatically become product requirements.

### Guidance for the developer AI

- Use this document to understand the purpose and expectations of the product. Do not extend the product's behavior on your own with new features or use cases.
- If information needed for a substantive decision is missing, ask before implementing. This is especially important if the decision would change the behavior the user experiences, the scope, or the evaluation result.
- If you consider something essential beyond the agreed expectations, flag it as a separate proposal with a short justification. Wait for approval; do not treat it as a requirement to implement.
- Take the future ArchitectMate application and further analysis possibilities into account for extensibility, but do not implement them without prior agreement.

### Open questions before actual development

The following are topics to clarify, not pre-decided requirements.

- Which AWS components and operating rules should the first version actually support?
- Which analyses must the first version already perform, and at what level of detail?
- How should task requirements be specified, and on what principles should scoring work, especially when a requirement is partially met or cannot be decided?

The developer AI should ask for a decision on these during design, when they are needed for the next development step.
