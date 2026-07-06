# ADR-001: Public MIT-Licensed Project

## Status

Accepted.

## Context

Fenéla is a small accountability app built for public portfolio use.

The project should be easy to inspect, run and understand. It should also be safe to publish without exposing secrets, private data or unfinished internal material.

The project is intended to be usable, studyable, adaptable and shareable by others. At the same time, Fenéla is not positioned as a community-led open-source project. The purpose is different: Fenéla is a public product and portfolio project released under the MIT License.

## Decision

Fenéla will be published as a public MIT-licensed project.

It should be described as:

```text
public MIT-licensed project
```

or:

```text
publicly available MIT-licensed application
```

It should not be described as an open-source community project unless that positioning is intentionally changed later.

## Reason

The MIT License fits the project because it is permissive and simple.

It allows others to:

- use the software;
- copy the software;
- modify the software;
- distribute the software;
- include it in other projects;
- use it commercially, as long as the license terms are followed.

This matches the intention: Fenéla may be used and adapted by others, while copyright attribution remains covered through the license notice.

## Trade-off

The MIT License gives people broad freedom.

That means someone can adapt or reuse the project, including commercially, as long as they keep the required copyright and license notice.

I accept that trade-off because the goal is visibility, portfolio value and practical usefulness, not strict control over reuse.

## Impact

The repository should include:

- a clear `LICENSE` file;
- consistent language in the README and documentation;
- no claims that Fenéla is a medical, therapy or professional support tool;
- no private data;
- no secrets;
- no local deployment files;
- no internal notes that do not belong in a public repository.

## Public repository rules

Do not commit:

```text
.env
.env.local
.env.*.local
node_modules/
.next/
.vercel/
*.log
*.exe
docs-learning-private/
```

Do commit:

```text
.env.example
README.md
LICENSE
architecture/
decisions/
docs/
scripts/
src/
public/
```

## Positioning boundary

Correct wording:

- public MIT-licensed project;
- publicly available application;
- portfolio project;
- MIT-licensed software.

Avoid:

- open-source community project;
- mental health product;
- therapy app;
- clinical tool;
- productivity platform.

## Licensing note

Under the MIT License, reuse requires keeping the copyright and license notice.

That means people who reuse the software should keep the license text with the copyright notice:

```text
Copyright (c) 2026 Nadira Büsse
```

This gives attribution through the license. It does not require people to promote the original author in their UI, marketing or documentation beyond what the license requires.

## Result

Fenéla is public, reusable and professionally documented without being positioned as larger than it is.

The project remains simple: a small accountability app, released under a permissive license, with clear boundaries and no unnecessary claims.
