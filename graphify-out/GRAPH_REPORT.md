# Graph Report - qpartners-neo  (2026-05-07)

## Corpus Check
- 360 files · ~590,328 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 945 nodes · 1521 edges · 29 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 311 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 38|Community 38]]

## God Nodes (most connected - your core abstractions)
1. `requireMenuPermission()` - 57 edges
2. `maskEmail()` - 42 edges
3. `logError()` - 39 edges
4. `fetchWithLog()` - 37 edges
5. `requirePageMenuPermission()` - 32 edges
6. `GET()` - 27 edges
7. `PUT()` - 26 edges
8. `getUserFromHeaders()` - 23 edges
9. `checkRateLimit()` - 22 edges
10. `isInsideDir()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `AdminNoticesPage()` --calls--> `requirePageMenuPermission()`  [INFERRED]
  src\app\admin\notices\page.tsx → src\lib\rbac-guard.ts
- `middleware()` --calls--> `verifyToken()`  [INFERRED]
  src\middleware.ts → src\lib\jwt.ts
- `LoginPage()` --calls--> `verifyToken()`  [INFERRED]
  src\app\(auth)\login\page.tsx → src\lib\jwt.ts
- `AdminBulkMailPage()` --calls--> `requirePageMenuPermission()`  [INFERRED]
  src\app\admin\bulk-mail\page.tsx → src\lib\rbac-guard.ts
- `AdminBulkMailCreatePage()` --calls--> `requirePageMenuPermission()`  [INFERRED]
  src\app\admin\bulk-mail\create\page.tsx → src\lib\rbac-guard.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (73): GET(), BulkDeleteError, POST(), GET(), CategoryError, MaxDescendantsExceededError, GET(), POST() (+65 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (48): isDecisive(), lookupQspUser(), POST(), POST(), rollbackAndRespond(), rollbackToken(), GET(), GET() (+40 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (24): BulkMailSearch(), BulkMailTable(), PageSizeSelect(), SelectBox(), handleKeyDown(), handleSearch(), useIsInternal(), toPositiveInt() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (26): AdminTransitionRefresh(), AlertDialog(), PopupController(), Spinner(), fetchAuthMe(), getRelatedSites(), getUserSiteKey(), handleLogout() (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (29): CategoriesContents(), CategoriesDetail(), getInitialForm(), extractErrorMessage(), findCategoryById(), generateChildCode(), resolveApiErrorMessage(), useCategoryMutations() (+21 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (23): ContentsFormInner(), ContentsFormEditor(), ContentsFormManagement(), buildInitialPostTargetsState(), orDash(), preferName(), downloadAllAttachments(), handleDownloadAll() (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (24): BulkMailContents(), AdminBulkMailPage(), AdminCategoriesPage(), AdminCodesPage(), ContentsPage(), BulkMailCreateClient(), ContentsForm(), AdminBulkMailCreatePage() (+16 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (13): DataGrid(), useUserType(), handleKeyDown(), handleSearch(), MembersTable(), formatDate(), formatDateTime(), level1SelectedCellClass() (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (23): pickRecipientEmails(), POST(), generateTwoFactorCode(), hashOtp(), getTransporter(), sendMail(), inquiryConfirmationMailHtml(), inquiryRecipientMailHtml() (+15 more)

### Community 9 - "Community 9"
Cohesion: 0.1
Nodes (23): runBatchOnce(), startAutoRetryBatch(), classifyFailure(), isPermanentSmtpFailure(), buildMailHtml(), collectAndQueueRecipients(), loadMassMailAttachments(), markSendFailed() (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (19): diffPreservedFields(), isSelfTarget(), mapQspDetailToResponse(), buildQspPreservedFields(), buildFallback(), getUserTypeLabelMap(), collectRecipients(), fetchAllByUserType() (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.1
Nodes (9): addFiles(), handleDrop(), handleFileSelect(), ContentsDetailAttachment(), PdfThumbnail(), getFileIconByMime(), getFileIconByName(), kindByExt() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (13): boolToYN(), flattenMenuTree(), rolesQueryKey(), rowsToPermissions(), toCreateRoleBody(), toPermissionItem(), toUpdateRoleBody(), ynToBool() (+5 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (13): AdminLayout(), GET(), isAdmin(), requireAdmin(), requireSuperAdmin(), getFallbackRole(), GET(), maskUserId() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (9): buildFormData(), formatMailDate(), toFormInitialData(), BulkMailFormBody(), BulkMailFormTitle(), handleDraft(), handleSend(), BulkMailFormInfo() (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (11): POST(), buildIv(), decryptAutoLogin(), decryptWithIv(), formatKstDate(), getInboundAesKey(), buildIv(), encryptOutboundCipher() (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.32
Nodes (3): addFiles(), handleDrop(), handleFileSelect()

### Community 17 - "Community 17"
Cohesion: 0.36
Nodes (5): createEditFormData(), handleSave(), handleStartEdit(), splitFullName(), validateEditForm()

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (2): handleKeyDown(), handleSelect()

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (3): buildExtensions(), prepareBodyForEditor(), RichEditor()

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (2): HomeMain(), HomeSidebar()

### Community 21 - "Community 21"
Cohesion: 0.7
Nodes (3): createPrismaClient(), requireEnv(), requireEnvInt()

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (2): main(), requireEnv()

### Community 23 - "Community 23"
Cohesion: 0.83
Nodes (3): buildIv(), decrypt(), encrypt()

### Community 26 - "Community 26"
Cohesion: 0.5
Nodes (1): RichEditorSkeleton()

### Community 27 - "Community 27"
Cohesion: 0.5
Nodes (1): Button()

### Community 28 - "Community 28"
Cohesion: 0.5
Nodes (1): MypageTab()

### Community 29 - "Community 29"
Cohesion: 0.5
Nodes (1): useHomeSearch()

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (1): TermsButton()

## Knowledge Gaps
- **Thin community `Community 18`** (7 nodes): `handleClear()`, `handleFocus()`, `handleInputChange()`, `handleKeyDown()`, `handleMouseDown()`, `handleSelect()`, `auto-complete-select.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (6 nodes): `Home()`, `HomeMain()`, `HomeSidebar()`, `page.tsx`, `home-main.tsx`, `home-sidebar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (4 nodes): `main()`, `requireEnv()`, `seed-inquiry-type.ts`, `client.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (4 nodes): `RichEditorLoader()`, `RichEditorSkeleton()`, `rich-editor-loader.tsx`, `rich-editor-skeleton.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (4 nodes): `Button()`, `handleFormSubmit()`, `button.tsx`, `login-form.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (4 nodes): `MypageTab()`, `getInitialTab()`, `mypage-tab.tsx`, `mypage-contents.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (4 nodes): `useHomeSearch()`, `home-search-mobile.tsx`, `home-search.tsx`, `use-home-search.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (3 nodes): `TermsButton()`, `footer.tsx`, `terms-button.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `requirePageMenuPermission()` connect `Community 6` to `Community 2`, `Community 13`?**
  _High betweenness centrality (0.219) - this node is a cross-community bridge._
- **Why does `getFallbackRole()` connect `Community 13` to `Community 0`, `Community 1`, `Community 6`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `useMenuPermission()` connect `Community 4` to `Community 2`, `Community 5`, `Community 6`, `Community 7`, `Community 11`, `Community 12`, `Community 14`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `requireMenuPermission()` (e.g. with `parseAndValidateRequest()` and `GET()`) actually correct?**
  _`requireMenuPermission()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 19 inferred relationships involving `maskEmail()` (e.g. with `GET()` and `PUT()`) actually correct?**
  _`maskEmail()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `logError()` (e.g. with `GET()` and `POST()`) actually correct?**
  _`logError()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `fetchWithLog()` (e.g. with `GET()` and `PUT()`) actually correct?**
  _`fetchWithLog()` has 17 INFERRED edges - model-reasoned connections that need verification._