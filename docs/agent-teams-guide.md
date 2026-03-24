# Agent Teams 마스터 참고 가이드

> 원본 문서: https://code.claude.com/docs/en/agent-teams
>
> 여러 Claude Code 인스턴스를 팀으로 구성하여 공유 태스크, 에이전트 간 메시징, 중앙 관리 기반으로 협업하는 기능.

---

## 목차

1. [개요](#1-개요)
2. [Agent Teams vs Subagents 비교](#2-agent-teams-vs-subagents-비교)
3. [활성화 방법](#3-활성화-방법)
4. [팀 시작하기](#4-팀-시작하기)
5. [팀 제어](#5-팀-제어)
6. [아키텍처](#6-아키텍처)
7. [활용 사례](#7-활용-사례)
8. [베스트 프랙티스](#8-베스트-프랙티스)
9. [트러블슈팅](#9-트러블슈팅)
10. [제한사항](#10-제한사항)

---

## 1. 개요

Agent Teams는 여러 Claude Code 인스턴스가 팀으로 함께 작업할 수 있게 해주는 **실험적 기능**이다.

- 하나의 세션이 **Team Lead**(리더)로서 작업을 조정하고, 태스크를 할당하며, 결과를 종합한다.
- **Teammates**(팀원)는 각자 독립적인 컨텍스트 윈도우에서 작업하며, 서로 직접 커뮤니케이션할 수 있다.
- Subagent와 달리, 개별 팀원에게 리더를 거치지 않고 직접 상호작용할 수 있다.

### 적합한 사용 시나리오

| 적합 | 부적합 |
|------|--------|
| 리서치 및 리뷰 (병렬 탐색) | 순차적 태스크 |
| 새 모듈/기능 개발 (독립적 소유) | 같은 파일 수정 |
| 경쟁 가설 기반 디버깅 | 의존성이 많은 작업 |
| 크로스 레이어 조정 (프론트/백/테스트) | 단순 루틴 작업 |

> **주의**: Agent Teams는 단일 세션보다 **상당히 더 많은 토큰**을 사용한다. 팀원이 독립적으로 작업할 수 있는 경우에만 효과적이다.

### 요구 사항

- Claude Code **v2.1.32** 이상
- 기본적으로 비활성화 — 별도 설정 필요

---

## 2. Agent Teams vs Subagents 비교

|                   | Subagents                              | Agent Teams                              |
|:------------------|:---------------------------------------|:-----------------------------------------|
| **컨텍스트**       | 자체 컨텍스트, 결과를 호출자에 반환       | 자체 컨텍스트, 완전 독립                    |
| **커뮤니케이션**    | 메인 에이전트에게만 결과 보고             | 팀원 간 직접 메시징                        |
| **조정 방식**      | 메인 에이전트가 모든 작업 관리            | 공유 태스크 리스트로 자기 조정               |
| **적합 용도**      | 결과만 필요한 집중 태스크                 | 토론과 협업이 필요한 복합 작업              |
| **토큰 비용**      | 낮음 (결과가 메인 컨텍스트로 요약됨)       | 높음 (각 팀원이 별도 Claude 인스턴스)       |

**요약**: 빠른 결과 보고가 필요하면 **Subagents**, 팀원 간 발견 공유와 상호 검증이 필요하면 **Agent Teams**.

---

## 3. 활성화 방법

### 방법 1: settings.json 설정

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 방법 2: 환경 변수

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

---

## 4. 팀 시작하기

Agent Teams를 활성화한 후, Claude에게 팀을 생성하도록 자연어로 요청한다.

### 기본 예시

```text
I'm designing a CLI tool that helps developers track TODO comments across
their codebase. Create an agent team to explore this from different angles: one
teammate on UX, one on technical architecture, one playing devil's advocate.
```

Claude가 수행하는 작업:
1. 팀 생성 (공유 태스크 리스트 포함)
2. 각 역할의 팀원 스폰
3. 문제 탐색 조정
4. 결과 종합
5. 완료 후 팀 정리

### 팀원 탐색

- **Shift+Down**: 팀원 사이를 순환
- 마지막 팀원 이후 다시 리더로 돌아감

---

## 5. 팀 제어

### 5.1 디스플레이 모드

| 모드 | 설명 | 요구 사항 |
|------|------|-----------|
| **in-process** | 모든 팀원이 메인 터미널 안에서 실행 | 없음 (모든 터미널) |
| **split panes** | 각 팀원이 별도 패널에서 실행 | tmux 또는 iTerm2 |
| **auto** (기본값) | tmux 세션 내에서는 split, 아니면 in-process | - |

#### 설정 방법

```json
// settings.json
{
  "teammateMode": "in-process"
}
```

```bash
# 단일 세션 플래그
claude --teammate-mode in-process
```

#### split panes 설치

- **tmux**: 시스템 패키지 매니저로 설치 (`brew install tmux` 등)
- **iTerm2**: `it2` CLI 설치 후 **iTerm2 → Settings → General → Magic → Enable Python API** 활성화

### 5.2 팀원 및 모델 지정

```text
Create a team with 4 teammates to refactor these modules in parallel.
Use Sonnet for each teammate.
```

### 5.3 계획 승인 요구 (Plan Approval)

복잡하거나 위험한 태스크에 대해 팀원이 구현 전 계획을 먼저 작성하도록 요구할 수 있다.

```text
Spawn an architect teammate to refactor the authentication module.
Require plan approval before they make any changes.
```

**동작 흐름**:
1. 팀원이 읽기 전용 Plan 모드에서 작업
2. 계획 완료 시 리더에게 승인 요청 전송
3. 리더가 승인 또는 피드백과 함께 거부
4. 거부 시 팀원이 Plan 모드에서 수정 후 재제출
5. 승인 시 팀원이 Plan 모드를 종료하고 구현 시작

> 리더의 판단 기준을 프롬프트에 포함하면 승인 품질을 높일 수 있다:
> "only approve plans that include test coverage" 또는 "reject plans that modify the database schema"

### 5.4 팀원과 직접 대화

각 팀원은 완전히 독립적인 Claude Code 세션이다.

| 모드 | 상호작용 방법 |
|------|--------------|
| **in-process** | `Shift+Down`으로 순환, 타이핑으로 메시지 전송, `Enter`로 세션 보기, `Escape`로 중단, `Ctrl+T`로 태스크 리스트 토글 |
| **split panes** | 팀원의 패널을 클릭하여 직접 상호작용 |

### 5.5 태스크 할당 및 클레임

공유 태스크 리스트로 팀 전체 작업을 조정한다.

**태스크 상태**: `pending` → `in progress` → `completed`

**태스크 의존성**: 의존하는 태스크가 완료되지 않으면 해당 태스크를 클레임할 수 없다.

**할당 방식**:
- **리더 할당**: 리더에게 특정 팀원에게 태스크를 할당하도록 지시
- **자기 클레임**: 팀원이 태스크 완료 후 다음 미할당/미차단 태스크를 자동으로 선택

> 태스크 클레임은 **파일 잠금**을 사용하여 동시 클레임 경쟁 조건을 방지한다.

### 5.6 팀원 종료

```text
Ask the researcher teammate to shut down
```

리더가 종료 요청을 보내면 팀원이 승인(정상 종료) 또는 거부(설명 포함)할 수 있다.

### 5.7 팀 정리

```text
Clean up the team
```

> **중요**: 반드시 **리더**를 통해 정리해야 한다. 팀원이 정리를 실행하면 팀 컨텍스트가 올바르게 해석되지 않아 리소스가 비일관 상태로 남을 수 있다.
>
> 정리 시 활성 팀원이 있으면 실패하므로, 먼저 모든 팀원을 종료한 후 정리한다.

### 5.8 Hooks를 통한 품질 게이트

| Hook | 시점 | 사용법 |
|------|------|--------|
| `TeammateIdle` | 팀원이 유휴 상태로 전환될 때 | exit code 2로 종료하면 피드백을 보내고 팀원이 계속 작업 |
| `TaskCompleted` | 태스크가 완료로 표시될 때 | exit code 2로 종료하면 완료를 차단하고 피드백 전송 |

---

## 6. 아키텍처

### 6.1 팀 구성 요소

| 구성 요소 | 역할 |
|:----------|:-----|
| **Team Lead** | 팀을 생성하고, 팀원을 스폰하며, 작업을 조정하는 메인 Claude Code 세션 |
| **Teammates** | 할당된 태스크를 각자 작업하는 별도 Claude Code 인스턴스 |
| **Task List** | 팀원들이 클레임하고 완료하는 공유 작업 목록 |
| **Mailbox** | 에이전트 간 커뮤니케이션을 위한 메시징 시스템 |

### 6.2 저장 위치

```
~/.claude/teams/{team-name}/config.json    # 팀 구성 (members 배열: name, agentId, agentType)
~/.claude/tasks/{team-name}/               # 태스크 리스트
```

팀원은 config.json을 읽어 다른 팀 멤버를 발견할 수 있다.

### 6.3 권한

- 팀원은 리더의 권한 설정으로 시작한다.
- 리더가 `--dangerously-skip-permissions`로 실행하면 모든 팀원도 동일하게 적용된다.
- 스폰 후 개별 팀원의 모드를 변경할 수 있지만, 스폰 시점에 팀원별 모드 설정은 불가하다.

### 6.4 컨텍스트와 커뮤니케이션

**컨텍스트 로딩**:
- 각 팀원은 일반 세션과 동일한 프로젝트 컨텍스트를 로드한다: `CLAUDE.md`, MCP 서버, Skills
- 리더의 스폰 프롬프트를 수신한다
- **리더의 대화 이력은 이월되지 않는다**

**정보 공유 방식**:

| 방식 | 설명 |
|------|------|
| **자동 메시지 전달** | 팀원이 메시지를 보내면 수신자에게 자동 전달 (리더가 폴링할 필요 없음) |
| **유휴 알림** | 팀원이 작업을 마치고 멈추면 리더에게 자동 알림 |
| **공유 태스크 리스트** | 모든 에이전트가 태스크 상태를 확인하고 가용 작업을 클레임 |

**팀원 메시징**:
- **message**: 특정 팀원 한 명에게 메시지 전송
- **broadcast**: 모든 팀원에게 동시 전송 (비용이 팀 크기에 비례하므로 절제하여 사용)

### 6.5 팀 시작 방식

1. **사용자 요청**: 병렬 작업이 유리한 태스크를 설명하고 에이전트 팀을 명시적으로 요청
2. **Claude 제안**: Claude가 태스크 분석 후 팀 생성을 제안하면 사용자가 확인 후 진행

> 두 경우 모두 사용자 승인 없이 팀이 생성되지 않는다.

---

## 7. 활용 사례

### 7.1 병렬 코드 리뷰

```text
Create an agent team to review PR #142. Spawn three reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

각 리뷰어가 동일한 PR을 다른 필터로 분석하고, 리더가 모든 결과를 종합한다.

### 7.2 경쟁 가설 기반 조사

```text
Users report the app exits after one message instead of staying connected.
Spawn 5 agent teammates to investigate different hypotheses. Have them talk to
each other to try to disprove each other's theories, like a scientific
debate. Update the findings doc with whatever consensus emerges.
```

토론 구조가 핵심이다. 순차적 조사는 **앵커링 편향**에 빠지기 쉽다. 여러 독립적 조사관이 서로의 이론을 적극적으로 반증하면, 살아남는 이론이 실제 근본 원인일 가능성이 훨씬 높아진다.

---

## 8. 베스트 프랙티스

### 8.1 충분한 컨텍스트 제공

팀원은 프로젝트 컨텍스트(CLAUDE.md, MCP 서버, Skills)를 자동 로드하지만, **리더의 대화 이력은 이월되지 않는다**. 스폰 프롬프트에 태스크별 세부사항을 포함해야 한다.

```text
Spawn a security reviewer teammate with the prompt: "Review the authentication module
at src/auth/ for security vulnerabilities. Focus on token handling, session
management, and input validation. The app uses JWT tokens stored in
httpOnly cookies. Report any issues with severity ratings."
```

### 8.2 적절한 팀 크기 선택

| 고려 사항 | 설명 |
|-----------|------|
| **토큰 비용** | 팀원 수에 비례하여 선형 증가 |
| **조정 오버헤드** | 팀원이 많을수록 커뮤니케이션과 충돌 가능성 증가 |
| **수확 체감** | 일정 수준 이상에서는 추가 팀원의 효과가 감소 |

> **권장**: 대부분의 워크플로우에서 **3~5명**으로 시작. 팀원당 **5~6개 태스크**가 최적.

### 8.3 적절한 태스크 크기

| 크기 | 문제 |
|------|------|
| **너무 작음** | 조정 오버헤드가 이점을 초과 |
| **너무 큼** | 중간 점검 없이 오래 작업하여 낭비 위험 증가 |
| **적정** | 명확한 산출물을 생성하는 자기 완결적 단위 (함수, 테스트 파일, 리뷰 등) |

> 리더가 충분한 태스크를 생성하지 않으면 작업을 더 작은 조각으로 나누도록 요청한다.

### 8.4 팀원 완료 대기

리더가 팀원 완료를 기다리지 않고 직접 태스크를 구현하기 시작할 때:

```text
Wait for your teammates to complete their tasks before proceeding
```

### 8.5 리서치/리뷰부터 시작

Agent Teams가 처음이라면 코드 작성이 필요 없는 명확한 경계의 태스크부터 시작한다:
- PR 리뷰
- 라이브러리 조사
- 버그 조사

### 8.6 파일 충돌 방지

두 팀원이 같은 파일을 편집하면 덮어쓰기가 발생한다. 각 팀원이 **서로 다른 파일 세트를 소유**하도록 작업을 분배해야 한다.

### 8.7 모니터링 및 조정

팀원의 진행 상황을 확인하고, 효과 없는 접근 방식을 리다이렉트하며, 결과가 나올 때마다 종합한다. 팀을 너무 오래 방치하면 낭비 위험이 증가한다.

---

## 9. 트러블슈팅

### 팀원이 나타나지 않을 때

- **in-process 모드**: `Shift+Down`으로 이미 실행 중인 팀원 확인
- 태스크가 팀을 구성할 만큼 복잡한지 확인
- **split panes 요청 시**: tmux 설치 및 PATH 확인
  ```bash
  which tmux
  ```
- **iTerm2**: `it2` CLI 설치 및 Python API 활성화 확인

### 너무 많은 권한 프롬프트

팀원의 권한 요청이 리더로 올라가면서 방해가 될 수 있다. 팀원 스폰 전에 일반적인 작업을 [권한 설정](https://code.claude.com/docs/en/permissions)에서 사전 승인한다.

### 팀원이 오류 후 중단

팀원 출력을 확인한 후:
- 직접 추가 지침을 제공하거나
- 대체 팀원을 스폰하여 작업 계속

### 리더가 작업 완료 전 종료

리더가 모든 태스크가 완료되기 전에 팀이 끝났다고 판단할 때:
- 계속 진행하도록 지시
- 팀원 완료를 기다리도록 지시

### 고아 tmux 세션

팀 종료 후 tmux 세션이 남아 있을 때:

```bash
tmux ls
tmux kill-session -t <session-name>
```

---

## 10. 제한사항

| 제한사항 | 설명 |
|----------|------|
| **세션 재개 불가** | `/resume`, `/rewind`가 in-process 팀원을 복원하지 않음. 재개 후 새 팀원을 스폰해야 함 |
| **태스크 상태 지연** | 팀원이 태스크 완료 표시를 누락할 수 있음. 수동 업데이트 또는 리더에게 독촉 요청 |
| **느린 종료** | 팀원이 현재 요청/도구 호출을 완료한 후 종료하므로 시간이 걸릴 수 있음 |
| **세션당 1팀** | 리더는 한 번에 하나의 팀만 관리 가능. 현재 팀을 정리한 후 새 팀 시작 |
| **중첩 팀 불가** | 팀원은 자체 팀이나 팀원을 스폰할 수 없음. 리더만 팀 관리 가능 |
| **리더 고정** | 팀을 생성한 세션이 수명 동안 리더. 리더십 이전 불가 |
| **권한은 스폰 시 설정** | 모든 팀원이 리더의 권한 모드로 시작. 이후 변경 가능하나 스폰 시 팀원별 설정 불가 |
| **split panes 환경 제한** | VS Code 내장 터미널, Windows Terminal, Ghostty에서는 split-pane 모드 미지원 |

> **참고**: `CLAUDE.md`는 정상적으로 작동한다. 팀원은 작업 디렉토리의 `CLAUDE.md` 파일을 읽는다. 이를 통해 모든 팀원에게 프로젝트별 가이드를 제공할 수 있다.

---

## 관련 문서

| 접근 방식 | 설명 | 용도 |
|-----------|------|------|
| [Subagents](https://code.claude.com/docs/en/sub-agents) | 세션 내에서 헬퍼 에이전트를 스폰 | 에이전트 간 조정이 불필요한 태스크 |
| [Git Worktrees](https://code.claude.com/docs/en/common-workflows#run-parallel-claude-code-sessions-with-git-worktrees) | 수동 병렬 세션 운영 | 자동 팀 조정 없이 직접 관리 |

---

> 이 문서는 Claude Code 공식 문서 (2026-03-24 기준)를 기반으로 작성되었다.
