# graphify 설치 및 사용 가이드

> 본 프로젝트(qpartners-neo)에 도입된 **graphify** 사용 안내. graphify 는 코드베이스/문서/이미지 등 임의의 폴더를 입력으로 받아 클러스터링된 지식 그래프(HTML + JSON + 감사 리포트)를 만들어내는 AI 코딩 어시스턴트용 스킬이다. Claude Code 안에서 `/graphify` 슬래시 커맨드로 동작한다.
>
> 공식 저장소: https://github.com/safishamsi/graphify · PyPI 패키지: `graphifyy` (y가 두 개)

---

## 1. 개요

이 프로젝트의 루트에는 이미 `graphify` 의 always-on 훅이 적용되어 있다.

- [CLAUDE.md](../CLAUDE.md) 에 `graphify` 섹션이 등록되어 있어, Claude Code 가 아키텍처/코드베이스 질문에 답하기 전에 `graphify-out/GRAPH_REPORT.md` 를 먼저 읽는다.
- [.claude/settings.json](../.claude/settings.json) 의 `PreToolUse` 훅이 `Bash` 도구 호출(grep/find/rg/fd/ack/ag) 직전에 그래프 존재 여부를 확인하고, 존재하면 그래프 우선 탐색을 안내하는 컨텍스트를 주입한다.

따라서 새로 합류한 개발자는 **로컬에서 graphify CLI 만 설치**하면 즉시 동일한 워크플로우를 사용할 수 있다. 그래프 산출물(`graphify-out/`)은 git 에 커밋되어 있을 수도 있고(팀 정책에 따라), 없다면 본인이 한 번 생성하면 된다.

---

## 2. 사전 요구사항

| 항목 | 버전 | 비고 |
|------|------|------|
| Python | **3.10 이상** | macOS 시스템 Python(3.9) 은 사용 불가 — 별도 설치 필요 |
| Claude Code | 최신 | https://claude.ai/code |
| (선택) Node | 22 LTS | 본 프로젝트의 `pnpm dev` 와 동일 |

> **macOS 시스템 Python 주의**: `/usr/bin/python3` 는 3.9.x 라 호환되지 않는다. Homebrew Python 또는 `uv` 가 자체 관리하는 Python 인터프리터를 사용하면 PATH 충돌 없이 해결된다.

---

## 3. graphify CLI 설치 (OS 별)

세 가지 방법 중 하나를 선택한다. **`uv` 권장** — PATH 설정이 자동이고 격리된 도구 환경을 제공한다.

### 3.1 macOS

```bash
# 1) uv 설치 (이미 설치된 경우 스킵)
brew install uv
# 또는
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2) graphifyy 설치 + 글로벌 skill 등록
uv tool install graphifyy
graphify install

# 3) 설치 확인
which graphify          # /Users/<you>/.local/bin/graphify
ls ~/.claude/skills/graphify/SKILL.md
```

대안 (pipx):
```bash
brew install pipx && pipx ensurepath
pipx install graphifyy && graphify install
```

### 3.2 Linux (Ubuntu / Debian / WSL 포함)

```bash
# 1) Python 3.10+ 와 uv 준비
sudo apt update && sudo apt install -y python3 python3-venv curl
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env   # 또는 새 터미널 열기

# 2) graphifyy 설치 + 글로벌 skill 등록
uv tool install graphifyy
graphify install

# 3) 설치 확인
which graphify          # /home/<you>/.local/bin/graphify
ls ~/.claude/skills/graphify/SKILL.md
```

대안 (시스템 pip — PEP 668 환경에서는 실패할 수 있어 가급적 venv 사용):
```bash
python3 -m venv ~/.graphify-venv
source ~/.graphify-venv/bin/activate
pip install graphifyy
graphify install
# 활성화 없이 쓰려면 ~/.local/bin 에 심볼릭 링크
ln -s ~/.graphify-venv/bin/graphify ~/.local/bin/graphify
```

### 3.3 Windows (PowerShell)

```powershell
# 1) uv 설치
irm https://astral.sh/uv/install.ps1 | iex

# 새 PowerShell 세션을 열거나 PATH 갱신
$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"

# 2) graphifyy 설치 + Windows 플랫폼으로 skill 등록
uv tool install graphifyy
graphify install --platform windows

# 3) 설치 확인
Get-Command graphify
Test-Path "$env:USERPROFILE\.claude\skills\graphify\SKILL.md"
```

대안 (pip): `pip install graphifyy` 후 `%APPDATA%\Python\PythonXY\Scripts` 가 PATH 에 있는지 확인.

> **WSL 사용자**는 Linux 섹션을 그대로 따르되, Claude Code 도 WSL 안에서 실행해야 글로벌 skill 경로가 일치한다.

---

## 4. 프로젝트 always-on 훅 (이미 적용됨, 신규 환경 참고용)

이 프로젝트에는 이미 적용되어 있으므로 **재실행할 필요는 없다**. 다른 프로젝트에서 같은 설정을 깔고 싶을 때 참고하면 된다.

```bash
cd <프로젝트-루트>
graphify claude install
```

위 명령은 두 가지를 수행한다.
1. 프로젝트 `CLAUDE.md` 에 `## graphify` 섹션을 추가한다 — Claude 에게 답변 전 `GRAPH_REPORT.md` 를 먼저 읽도록 지시.
2. 프로젝트 `.claude/settings.json` 에 `PreToolUse` 훅을 등록한다 — `grep`/`rg`/`find`/`fd`/`ack`/`ag` 호출 직전에 그래프 존재 시 컨텍스트 주입.

해제는 `graphify claude uninstall`.

---

## 5. 첫 그래프 빌드

프로젝트 루트에서:

```bash
# Claude Code 안에서
/graphify .

# 또는 CLI 로 직접
graphify update .         # 코드 파일만 AST 로 추출 (LLM 호출 없음, 무료)
```

> `/graphify .` 는 코드 + 문서 + 이미지를 모두 처리하므로 **Anthropic API 키 토큰 비용**이 발생한다. 비용 없이 코드 구조만 빠르게 보고 싶으면 `graphify update .` 를 사용한다.

산출물:

```
graphify-out/
├── graph.html         인터랙티브 그래프 (브라우저로 열기)
├── GRAPH_REPORT.md    god nodes / 커뮤니티 / 의외의 연결 / 추천 질문
├── graph.json         쿼리/MCP 용 영속 그래프
└── cache/             SHA256 캐시 (재실행 시 변경 파일만 재처리)
```

---

## 6. 일상 사용법

### 6.1 슬래시 커맨드 (Claude Code 안에서)

```
/graphify .                              # 현재 프로젝트 전체
/graphify ./src                          # 특정 폴더
/graphify ./src --mode deep              # INFERRED 엣지를 더 적극적으로 추출
/graphify ./src --update                 # 변경 파일만 재추출, 기존 그래프에 머지
/graphify ./src --cluster-only           # 추출 없이 클러스터링만 재실행
/graphify ./src --no-viz                 # HTML 생략 (리포트 + JSON 만)
```

### 6.2 그래프 질의 (CLI)

`graphify-out/graph.json` 이 만들어진 후 사용 가능하다.

```bash
graphify query "인증 플로우의 핵심 컴포넌트는?"
graphify query "DigestAuth 와 Response 가 어떻게 연결되나?" --dfs --budget 1500
graphify path "ContentsForm" "POST /api/contents"
graphify explain "BlockEditor"
```

### 6.3 외부 자료를 그래프에 추가

```bash
graphify add https://arxiv.org/abs/1706.03762 --author "Vaswani et al."
graphify add https://x.com/karpathy/status/...
graphify add <video-url>                  # 자동 전사 후 추가 (whisper)
```

### 6.4 자동 동기화 (선택)

```bash
graphify hook install    # post-commit / post-checkout git 훅 등록 — 코드 변경 시 자동 갱신
graphify update .        # 수동 갱신 (LLM 호출 없음)
graphify ./src --watch   # 파일 워처 모드
```

---

## 7. 제외 규칙 — `.graphifyignore`

`.gitignore` 와 동일한 문법. 프로젝트 루트에 두면 하위 폴더에서 graphify 를 실행해도 그대로 적용된다.

본 프로젝트 권장 패턴 예시:

```gitignore
# .graphifyignore
node_modules/
.next/
dist/
build/
prisma/migrations/
src/generated/
.worktrees/
docker/
*.lock
*.log

# graphify 자기 설치 산출물은 그래프에 포함시키지 않는다
CLAUDE.md
AGENTS.md
.claude/
docs/translations/
```

---

## 8. 팀 워크플로우 — `graphify-out/` 의 git 정책

`graphify-out/` 은 **커밋 가능**하다 (팀 전체가 즉시 그래프를 공유할 수 있음). 단, 일부 하위 항목은 반드시 무시하는 것이 좋다. 본 프로젝트의 `.gitignore` 에 다음을 추가하는 것을 권장한다:

```gitignore
# graphify
graphify-out/cache/         # 로컬 캐시, 공유 의미 없음
graphify-out/manifest.json  # mtime 기반, clone 후 무효
graphify-out/cost.json      # 토큰 사용량 로컬 추적
```

추가 후 한 명이 `/graphify .` 로 초기 그래프를 만들고 `graphify-out/graph.json` + `graphify-out/GRAPH_REPORT.md` + `graphify-out/graph.html` 을 커밋하면, 다른 팀원은 pull 만 받아도 Claude 가 즉시 그래프 컨텍스트를 사용한다.

---

## 9. 트러블슈팅

| 증상 | 원인 / 해결 |
|------|-------------|
| `graphify: command not found` | PATH 미설정. `uv tool install graphifyy` 로 재설치하거나, `~/.local/bin`(Linux/macOS) / `%USERPROFILE%\.local\bin`(Windows) 을 PATH 에 추가. |
| `Python 3.10+ required` | macOS 시스템 Python 3.9 사용 중. `brew install python@3.12` 또는 `uv tool install --python 3.12 graphifyy`. |
| `pip install graphify` 가 다른 패키지 설치됨 | 패키지명은 **`graphifyy`** (y 두 개). 잘못 설치 시 `pip uninstall graphify` 후 `pip install graphifyy`. |
| Claude 가 그래프를 무시하고 grep 만 함 | `graphify-out/graph.json` 이 존재해야 훅이 컨텍스트를 주입한다. `/graphify .` 또는 `graphify update .` 로 그래프를 먼저 만든다. |
| WSL 에서 `python` 명령 없음 | Ubuntu 는 `python3` 만 제공. `python3 -m venv .venv && .venv/bin/pip install "graphifyy[mcp]"` 후 `.venv/bin/python3` 를 사용. |
| Windows 에서 hook 이 동작 안 함 | `graphify install --platform windows` 로 재설치. PowerShell 실행 정책이 `Restricted` 면 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| 토큰 비용을 줄이고 싶음 | `graphify update .` (AST 만, LLM 미호출) 또는 `/graphify ./src --no-viz --cluster-only`. 변경 파일만 처리하므로 재실행 시 거의 0 비용. |

---

## 10. 추가 참고

- 본 프로젝트 [CLAUDE.md](../CLAUDE.md) 의 `## graphify` 섹션 — Claude 에게 적용된 행동 규칙
- 본 프로젝트 [.claude/settings.json](../.claude/settings.json) — PreToolUse 훅 정의
- 글로벌 SKILL: `~/.claude/skills/graphify/SKILL.md`
- 공식 README: https://github.com/safishamsi/graphify
- MCP 서버 모드: `python -m graphify.serve graphify-out/graph.json` — Claude Code MCP 설정에 등록하면 `query_graph`, `get_node`, `get_neighbors`, `shortest_path` 도구 호출이 가능
