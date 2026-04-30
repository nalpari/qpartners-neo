# Graph Report - ./src  (2026-04-30)

## Corpus Check
- Large corpus: 284 files · ~159,731 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 827 nodes · 955 edges · 44 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 264 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_大量메일 관리 API|大量메일 관리 API]]
- [[_COMMUNITY_인터페이스 로그 & QSP API|인터페이스 로그 & QSP API]]
- [[_COMMUNITY_MyPage 및 인증 API|MyPage 및 인증 API]]
- [[_COMMUNITY_페이지 라우팅 & 미들웨어|페이지 라우팅 & 미들웨어]]
- [[_COMMUNITY_권한·레이아웃·다운로드|권한·레이아웃·다운로드]]
- [[_COMMUNITY_大量메일 발송 배치|大量메일 발송 배치]]
- [[_COMMUNITY_메일 발송 (Notifications)|메일 발송 (Notifications)]]
- [[_COMMUNITY_Header & Auth Client|Header & Auth Client]]
- [[_COMMUNITY_大量메일 수신자 수집|大量메일 수신자 수집]]
- [[_COMMUNITY_권한 매트릭스 UI|권한 매트릭스 UI]]
- [[_COMMUNITY_공지(Notice) 폼|공지(Notice) 폼]]
- [[_COMMUNITY_회원가입 플로우|회원가입 플로우]]
- [[_COMMUNITY_회원 상세 팝업|회원 상세 팝업]]
- [[_COMMUNITY_관리자 리스트 화면|관리자 리스트 화면]]
- [[_COMMUNITY_코드(Code) 관리|코드(Code) 관리]]
- [[_COMMUNITY_大量메일 작성 폼|大量메일 작성 폼]]
- [[_COMMUNITY_카테고리 관리|카테고리 관리]]
- [[_COMMUNITY_콘텐츠 폼 & MyPage 멤버|콘텐츠 폼 & MyPage 멤버]]
- [[_COMMUNITY_다운로드 이력|다운로드 이력]]
- [[_COMMUNITY_콘텐츠 첨부 업로드|콘텐츠 첨부 업로드]]
- [[_COMMUNITY_大量메일 첨부 업로드|大量메일 첨부 업로드]]
- [[_COMMUNITY_권한 게이트(Hook)|권한 게이트(Hook)]]
- [[_COMMUNITY_콘텐츠 리스트  홈 카드|콘텐츠 리스트 / 홈 카드]]
- [[_COMMUNITY_콘텐츠 페이지 컨테이너|콘텐츠 페이지 컨테이너]]
- [[_COMMUNITY_메뉴 관리|메뉴 관리]]
- [[_COMMUNITY_AutoComplete UI|AutoComplete UI]]
- [[_COMMUNITY_MyPage 정보 편집|MyPage 정보 편집]]
- [[_COMMUNITY_자동로그인 암호화|자동로그인 암호화]]
- [[_COMMUNITY_Module 30|Module 30]]
- [[_COMMUNITY_Module 31|Module 31]]
- [[_COMMUNITY_Module 32|Module 32]]
- [[_COMMUNITY_Module 33|Module 33]]
- [[_COMMUNITY_Module 34|Module 34]]
- [[_COMMUNITY_Module 35|Module 35]]
- [[_COMMUNITY_Module 37|Module 37]]
- [[_COMMUNITY_Module 38|Module 38]]
- [[_COMMUNITY_Module 39|Module 39]]
- [[_COMMUNITY_Module 41|Module 41]]
- [[_COMMUNITY_Module 43|Module 43]]
- [[_COMMUNITY_Module 48|Module 48]]
- [[_COMMUNITY_Module 52|Module 52]]
- [[_COMMUNITY_Module 60|Module 60]]
- [[_COMMUNITY_Module 66|Module 66]]
- [[_COMMUNITY_Module 68|Module 68]]

## God Nodes (most connected - your core abstractions)
1. `requireMenuPermission()` - 31 edges
2. `PUT()` - 25 edges
3. `GET()` - 24 edges
4. `maskEmail()` - 21 edges
5. `fetchWithLog()` - 20 edges
6. `logError()` - 19 edges
7. `requirePageMenuPermission()` - 15 edges
8. `getUserFromHeaders()` - 13 edges
9. `DELETE()` - 11 edges
10. `getUserFromRequest()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `getUserFromHeaders()`  [INFERRED]
  app/api/contents/route.ts → lib/auth.ts
- `mapQspDetailToResponse()` --calls--> `normalizeAuthCdToUserRole()`  [INFERRED]
  app/api/admin/members/[id]/route.ts → lib/schemas/member.ts
- `middleware()` --calls--> `verifyToken()`  [INFERRED]
  middleware.ts → lib/jwt.ts
- `ContentsPage()` --calls--> `requirePageMenuPermission()`  [INFERRED]
  app/contents/page.tsx → lib/rbac-guard.ts
- `ContentsDetailPage()` --calls--> `requirePageMenuPermission()`  [INFERRED]
  app/contents/[id]/page.tsx → lib/rbac-guard.ts

## Communities

### Community 0 - "大量메일 관리 API"
Cohesion: 0.05
Nodes (41): BulkDeleteError, POST(), GET(), GET(), POST(), GET(), POST(), GET() (+33 more)

### Community 1 - "인터페이스 로그 & QSP API"
Cohesion: 0.06
Nodes (38): isDecisive(), lookupQspUser(), POST(), DELETE(), diffPreservedFields(), GET(), HomeNoticeUpdateError, isSelfTarget() (+30 more)

### Community 2 - "MyPage 및 인증 API"
Cohesion: 0.08
Nodes (23): POST(), rollbackAndRespond(), rollbackToken(), extractClientIp(), GET(), resolveAuthRole(), generateTwoFactorCode(), hashOtp() (+15 more)

### Community 3 - "페이지 라우팅 & 미들웨어"
Cohesion: 0.06
Nodes (20): AdminBulkMailPage(), AdminCategoriesPage(), AdminCodesPage(), ContentsPage(), ContentsCreatePage(), GET(), ContentsEditPage(), ContentsDetailPage() (+12 more)

### Community 4 - "권한·레이아웃·다운로드"
Cohesion: 0.1
Nodes (22): GET(), AdminLayout(), GET(), resolveDuplicateName(), sanitizeHeaderBase(), GET(), GET(), canAccessContent() (+14 more)

### Community 5 - "大量메일 발송 배치"
Cohesion: 0.1
Nodes (19): runBatchOnce(), startAutoRetryBatch(), isPermanentSmtpFailure(), buildMailHtml(), markSendFailed(), processMassMailRetry(), processMassMailSend(), RedirectPartialFanoutError (+11 more)

### Community 6 - "메일 발송 (Notifications)"
Cohesion: 0.14
Nodes (15): pickRecipientEmails(), POST(), getTransporter(), sendMail(), inquiryConfirmationMailHtml(), inquiryRecipientMailHtml(), twoFactorMailHtml(), buildBodyHtml() (+7 more)

### Community 7 - "Header & Auth Client"
Cohesion: 0.12
Nodes (10): AdminBulkMailDetailPage(), fetchAuthMe(), getRelatedSites(), getUserSiteKey(), handleLogout(), handleRelatedSiteClick(), isSafeRedirect(), canModifyClient() (+2 more)

### Community 8 - "大量메일 수신자 수집"
Cohesion: 0.16
Nodes (13): collectRecipients(), fetchAllByUserType(), fetchSuperAdminIds(), isSafeEmail(), mapRecipient(), resolveUserTypesToQuery(), SekoNotSupportedError, collectAndQueueRecipients() (+5 more)

### Community 9 - "권한 매트릭스 UI"
Cohesion: 0.17
Nodes (10): boolToYN(), rowsToPermissions(), toPermissionItem(), toUpdateRoleBody(), ynToBool(), applyReadCudConstraints(), getColumnState(), handleSave() (+2 more)

### Community 10 - "공지(Notice) 폼"
Cohesion: 0.15
Nodes (3): targetsToPayload(), handleSave(), validate()

### Community 11 - "회원가입 플로우"
Cohesion: 0.15
Nodes (6): extractApiError(), PersonalInfoPopup(), validatePasswordPolicy(), handleSubmit(), submitSignup(), validate()

### Community 12 - "회원 상세 팝업"
Cohesion: 0.17
Nodes (1): MemberDetailContextLost

### Community 13 - "관리자 리스트 화면"
Cohesion: 0.18
Nodes (6): BulkMailTable(), PageSizeSelect(), toPositiveInt(), usePageSize(), MembersContents(), NoticesContents()

### Community 14 - "코드(Code) 관리"
Cohesion: 0.17
Nodes (5): CodesContents(), ValidationError, useCellEdit(), useCodeDetails(), useCodeHeaders()

### Community 15 - "大量메일 작성 폼"
Cohesion: 0.18
Nodes (4): buildFormData(), handleDraft(), handleSend(), validate()

### Community 16 - "카테고리 관리"
Cohesion: 0.2
Nodes (6): CategoriesContents(), extractErrorMessage(), findCategoryById(), resolveApiErrorMessage(), useCategoryMutations(), useCategoryQuery()

### Community 17 - "콘텐츠 폼 & MyPage 멤버"
Cohesion: 0.22
Nodes (4): ContentsFormInner(), buildMemberFields(), formatNewsletter(), formatDate()

### Community 18 - "다운로드 이력"
Cohesion: 0.22
Nodes (2): handleKeyDown(), handleSearch()

### Community 19 - "콘텐츠 첨부 업로드"
Cohesion: 0.28
Nodes (3): addFiles(), handleDrop(), handleFileSelect()

### Community 20 - "大量메일 첨부 업로드"
Cohesion: 0.32
Nodes (3): addFiles(), handleDrop(), handleFileSelect()

### Community 21 - "권한 게이트(Hook)"
Cohesion: 0.36
Nodes (5): PermissionGate(), canPerform(), useMenuPermission(), useMenuPermissionMap(), useMePermissionsQuery()

### Community 22 - "콘텐츠 리스트 / 홈 카드"
Cohesion: 0.33
Nodes (3): downloadAllAttachments(), handleDownloadAll(), handleClick()

### Community 23 - "콘텐츠 페이지 컨테이너"
Cohesion: 0.33
Nodes (3): useIsInternal(), ContentsContents(), parseSearchParams()

### Community 26 - "메뉴 관리"
Cohesion: 0.48
Nodes (6): boolToYN(), toCreateBody(), toFormState(), toMenuItem(), toUpdateBody(), ynToBool()

### Community 27 - "AutoComplete UI"
Cohesion: 0.33
Nodes (2): handleKeyDown(), handleSelect()

### Community 28 - "MyPage 정보 편집"
Cohesion: 0.38
Nodes (4): createEditFormData(), handleSave(), handleStartEdit(), validateEditForm()

### Community 29 - "자동로그인 암호화"
Cohesion: 0.43
Nodes (5): POST(), buildIv(), encryptOutboundCipher(), formatKstDate(), getOutboundAesKey()

### Community 30 - "Module 30"
Cohesion: 0.4
Nodes (2): handleKeyDown(), handleSearch()

### Community 31 - "Module 31"
Cohesion: 0.6
Nodes (5): level1SelectedCellClass(), Level2MenuNameRenderer(), level2SelectedCellClass(), MenuNameRenderer(), toCtx()

### Community 32 - "Module 32"
Cohesion: 0.6
Nodes (5): buildIv(), decryptAutoLogin(), decryptWithIv(), formatKstDate(), getInboundAesKey()

### Community 33 - "Module 33"
Cohesion: 0.4
Nodes (2): CategoryError, MaxDescendantsExceededError

### Community 34 - "Module 34"
Cohesion: 0.5
Nodes (2): handleKeyDown(), handleSearch()

### Community 35 - "Module 35"
Cohesion: 0.5
Nodes (2): handleKeyDown(), handleSearch()

### Community 37 - "Module 37"
Cohesion: 0.4
Nodes (2): useUserType(), MembersTable()

### Community 38 - "Module 38"
Cohesion: 0.7
Nodes (3): createPrismaClient(), requireEnv(), requireEnvInt()

### Community 39 - "Module 39"
Cohesion: 0.7
Nodes (4): getFileIconByMime(), getFileIconByName(), kindByExt(), kindByMime()

### Community 41 - "Module 41"
Cohesion: 0.67
Nodes (2): orDash(), preferName()

### Community 43 - "Module 43"
Cohesion: 0.5
Nodes (2): ContentsFormManagement(), useApprover()

### Community 48 - "Module 48"
Cohesion: 0.5
Nodes (2): useMenuTree(), MenusContents()

### Community 52 - "Module 52"
Cohesion: 1.0
Nodes (2): escapeHtml(), signupCompleteMailHtml()

### Community 60 - "Module 60"
Cohesion: 1.0
Nodes (2): CategoriesDetail(), getInitialForm()

### Community 66 - "Module 66"
Cohesion: 0.67
Nodes (1): ConfigError

### Community 68 - "Module 68"
Cohesion: 1.0
Nodes (2): ensureHooksRegistered(), sanitizeContentHtml()

## Knowledge Gaps
- **Thin community `회원 상세 팝업`** (12 nodes): `member-detail-popup.tsx`, `FormCell()`, `handleApiError()`, `handleClose()`, `handlePasswordReset()`, `handleSave()`, `LabelCell()`, `MemberDetailContextLost`, `.constructor()`, `safeRole()`, `TextValue()`, `ValueCell()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `다운로드 이력`** (10 nodes): `download-history.tsx`, `FileNameCell()`, `formatDate()`, `handleDownload()`, `handleKeyDown()`, `handleLoadMore()`, `handlePageChange()`, `handlePageSizeChange()`, `handleSearch()`, `handleSearchClear()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AutoComplete UI`** (7 nodes): `handleClear()`, `handleFocus()`, `handleInputChange()`, `handleKeyDown()`, `handleMouseDown()`, `handleSelect()`, `auto-complete-select.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 30`** (6 nodes): `notices-search.tsx`, `handleKeyDown()`, `handleReset()`, `handleSearch()`, `toggleStatus()`, `toggleTargetType()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 33`** (5 nodes): `_constants.ts`, `CategoryError`, `.constructor()`, `MaxDescendantsExceededError`, `.constructor()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 34`** (5 nodes): `contents-search.tsx`, `handleCheckboxChange()`, `handleKeyDown()`, `handleReset()`, `handleSearch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 35`** (5 nodes): `members-search.tsx`, `handleKeyDown()`, `handleReset()`, `handleSearch()`, `updateLocal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 37`** (5 nodes): `members-table.tsx`, `use-user-type.ts`, `useUserType()`, `MembersTable()`, `NameCellRenderer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 41`** (4 nodes): `contents-detail-info.tsx`, `handleCopyUrl()`, `orDash()`, `preferName()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 43`** (4 nodes): `contents-form-management.tsx`, `ContentsFormManagement()`, `use-approver.ts`, `useApprover()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 48`** (4 nodes): `menus-contents.tsx`, `use-menu-tree.ts`, `useMenuTree()`, `MenusContents()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 52`** (3 nodes): `signup-complete.ts`, `escapeHtml()`, `signupCompleteMailHtml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 60`** (3 nodes): `CategoriesDetail()`, `getInitialForm()`, `categories-detail.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 66`** (3 nodes): `ConfigError`, `.constructor()`, `errors.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module 68`** (3 nodes): `ensureHooksRegistered()`, `sanitizeContentHtml()`, `sanitize-html.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PUT()` connect `인터페이스 로그 & QSP API` to `大量메일 관리 API`, `권한·레이아웃·다운로드`, `大量메일 발송 배치`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `requireMenuPermission()` connect `大量메일 관리 API` to `인터페이스 로그 & QSP API`, `권한·레이아웃·다운로드`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `getFallbackRole()` connect `페이지 라우팅 & 미들웨어` to `권한·레이아웃·다운로드`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 28 inferred relationships involving `requireMenuPermission()` (e.g. with `POST()` and `PUT()`) actually correct?**
  _`requireMenuPermission()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `PUT()` (e.g. with `requireMenuPermission()` and `canModifyResource()`) actually correct?**
  _`PUT()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `GET()` (e.g. with `getUserFromHeaders()` and `canAccessContent()`) actually correct?**
  _`GET()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `maskEmail()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`maskEmail()` has 18 INFERRED edges - model-reasoned connections that need verification._