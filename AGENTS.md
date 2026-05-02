<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

## Memo

- 코드 작성시 기본적으로 @/docs/coding-conventions.md 문서를 반드시 참조한다.
- 모든 답변과 추론과정은 한국어로 작성한다.
- task가 끝나면 서브 에이전트를 사용해서 **린트체크**, **타입체크**, **빌드체크**를 수행한다.
- 린트체크시 오류가 있으면 반드시 해결하고 넘어가도록 하고, 경고가 있더라도 해결하려고 노력한다.
- 커밋시에 접두사는 영어로 나머지 타이틀과 내용은 한국어로 작성한다.
- task 완료시 CLAUDE.md 및 README.md 문서에 업데이트가 필요하면 진행한다.
- 에이전트 팀을 활용할 경우 @docs/agent-teams-guild.md 문서를 참조한다.

<!-- END:nextjs-agent-rules -->
