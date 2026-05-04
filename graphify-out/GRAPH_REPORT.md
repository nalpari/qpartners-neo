# Graph Report - qpartners-neo  (2026-05-04)

## Corpus Check
- 306 files · ~413,170 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 886 nodes · 1019 edges · 46 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 281 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]

## God Nodes (most connected - your core abstractions)
1. `requireMenuPermission()` - 32 edges
2. `GET()` - 27 edges
3. `PUT()` - 26 edges
4. `logError()` - 22 edges
5. `maskEmail()` - 21 edges
6. `fetchWithLog()` - 20 edges
7. `requirePageMenuPermission()` - 15 edges
8. `getUserFromHeaders()` - 14 edges
9. `DELETE()` - 11 edges
10. `getUserFromRequest()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `PUT()` --calls--> `buildQspPreservedFields()`  [INFERRED]
  src/app/api/categories/[id]/route.ts → src/lib/qsp-member.ts
- `POST()` --calls--> `requireMenuPermission()`  [INFERRED]
  src/app/api/roles/route.ts → src/lib/auth.ts
- `middleware()` --calls--> `verifyToken()`  [INFERRED]
  src/middleware.ts → src/lib/jwt.ts
- `ContentsPage()` --calls--> `requirePageMenuPermission()`  [INFERRED]
  src/app/contents/page.tsx → src/lib/rbac-guard.ts
- `ContentsDetailPage()` --calls--> `requirePageMenuPermission()`  [INFERRED]
  src/app/contents/[id]/page.tsx → src/lib/rbac-guard.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (51): GET(), GET(), POST(), GET(), POST(), GET(), POST(), DELETE() (+43 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (57): BulkDeleteError, POST(), isDecisive(), lookupQspUser(), POST(), POST(), rollbackAndRespond(), rollbackToken() (+49 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (20): AdminBulkMailPage(), AdminCategoriesPage(), AdminCodesPage(), ContentsPage(), ContentsCreatePage(), GET(), ContentsEditPage(), ContentsDetailPage() (+12 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (25): GET(), AdminLayout(), formatDateYYYYMMDDJst(), GET(), resolveDuplicateName(), sanitizeHeaderBase(), toAsciiHeaderFilename(), GET() (+17 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (20): runBatchOnce(), startAutoRetryBatch(), isPermanentSmtpFailure(), buildMailHtml(), loadMassMailAttachments(), markSendFailed(), processMassMailRetry(), processMassMailSend() (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (10): AdminBulkMailDetailPage(), fetchAuthMe(), getRelatedSites(), getUserSiteKey(), handleLogout(), handleRelatedSiteClick(), isSafeRedirect(), canModifyClient() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (15): mapQspDetailToResponse(), collectRecipients(), fetchAllByUserType(), fetchSuperAdminIds(), isSafeEmail(), mapRecipient(), resolveUserTypesToQuery(), SekoNotSupportedError (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (9): BulkMailTable(), PageSizeSelect(), useIsInternal(), toPositiveInt(), usePageSize(), ContentsContents(), parseSearchParams(), MembersContents() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (10): boolToYN(), rowsToPermissions(), toPermissionItem(), toUpdateRoleBody(), ynToBool(), applyReadCudConstraints(), getColumnState(), handleSave() (+2 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (4): targetsToPayload(), handleSave(), isPastDate(), validate()

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (5): CodesContents(), ValidationError, useCellEdit(), useCodeDetails(), useCodeHeaders()

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (11): inquiryConfirmationMailHtml(), inquiryRecipientMailHtml(), twoFactorMailHtml(), buildBodyHtml(), diffFields(), escapeHtml(), formatValue(), mapPreFieldValue() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (6): extractApiError(), PersonalInfoPopup(), validatePasswordPolicy(), handleSubmit(), submitSignup(), validate()

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (1): MemberDetailContextLost

### Community 14 - "Community 14"
Cohesion: 0.2
Nodes (4): buildFormData(), handleDraft(), handleSend(), validate()

### Community 15 - "Community 15"
Cohesion: 0.2
Nodes (6): CategoriesContents(), extractErrorMessage(), findCategoryById(), resolveApiErrorMessage(), useCategoryMutations(), useCategoryQuery()

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (4): ContentsFormInner(), buildMemberFields(), formatNewsletter(), formatDate()

### Community 17 - "Community 17"
Cohesion: 0.22
Nodes (2): handleKeyDown(), handleSearch()

### Community 18 - "Community 18"
Cohesion: 0.28
Nodes (3): addFiles(), handleDrop(), handleFileSelect()

### Community 19 - "Community 19"
Cohesion: 0.31
Nodes (5): PermissionGate(), canPerform(), useMenuPermission(), useMenuPermissionMap(), useMePermissionsQuery()

### Community 20 - "Community 20"
Cohesion: 0.32
Nodes (3): addFiles(), handleDrop(), handleFileSelect()

### Community 21 - "Community 21"
Cohesion: 0.43
Nodes (5): POST(), buildIv(), encryptOutboundCipher(), formatKstDate(), getOutboundAesKey()

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (3): downloadAllAttachments(), handleDownloadAll(), handleClick()

### Community 25 - "Community 25"
Cohesion: 0.48
Nodes (6): boolToYN(), toCreateBody(), toFormState(), toMenuItem(), toUpdateBody(), ynToBool()

### Community 26 - "Community 26"
Cohesion: 0.33
Nodes (2): handleKeyDown(), handleSelect()

### Community 27 - "Community 27"
Cohesion: 0.38
Nodes (4): createEditFormData(), handleSave(), handleStartEdit(), validateEditForm()

### Community 28 - "Community 28"
Cohesion: 0.4
Nodes (2): handleKeyDown(), handleSearch()

### Community 29 - "Community 29"
Cohesion: 0.4
Nodes (2): handleKeyDown(), handleSearch()

### Community 30 - "Community 30"
Cohesion: 0.6
Nodes (5): level1SelectedCellClass(), Level2MenuNameRenderer(), level2SelectedCellClass(), MenuNameRenderer(), toCtx()

### Community 31 - "Community 31"
Cohesion: 0.6
Nodes (5): buildIv(), decryptAutoLogin(), decryptWithIv(), formatKstDate(), getInboundAesKey()

### Community 32 - "Community 32"
Cohesion: 0.4
Nodes (2): CategoryError, MaxDescendantsExceededError

### Community 34 - "Community 34"
Cohesion: 0.5
Nodes (2): handleKeyDown(), handleSearch()

### Community 36 - "Community 36"
Cohesion: 0.4
Nodes (2): useUserType(), MembersTable()

### Community 37 - "Community 37"
Cohesion: 0.7
Nodes (3): createPrismaClient(), requireEnv(), requireEnvInt()

### Community 38 - "Community 38"
Cohesion: 0.7
Nodes (4): getFileIconByMime(), getFileIconByName(), kindByExt(), kindByMime()

### Community 39 - "Community 39"
Cohesion: 0.83
Nodes (3): buildIv(), decrypt(), encrypt()

### Community 40 - "Community 40"
Cohesion: 0.67
Nodes (2): orDash(), preferName()

### Community 45 - "Community 45"
Cohesion: 0.5
Nodes (2): buildExtensions(), RichEditor()

### Community 47 - "Community 47"
Cohesion: 0.5
Nodes (2): useMenuTree(), MenusContents()

### Community 48 - "Community 48"
Cohesion: 0.5
Nodes (2): ContentsFormManagement(), useApprover()

### Community 50 - "Community 50"
Cohesion: 0.5
Nodes (2): reconcileInlineImages(), extractInlineImageIds()

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (2): main(), requireEnv()

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (2): CategoriesDetail(), getInitialForm()

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (1): ConfigError

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (2): normalizeTiptapTableWidths(), prepareBodyForRender()

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (2): ensureHooksRegistered(), sanitizeContentHtml()

## Knowledge Gaps
- **Thin community `Community 13`** (12 nodes): `FormCell()`, `handleApiError()`, `handleClose()`, `handlePasswordReset()`, `handleSave()`, `LabelCell()`, `MemberDetailContextLost`, `.constructor()`, `safeRole()`, `TextValue()`, `ValueCell()`, `member-detail-popup.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (10 nodes): `FileNameCell()`, `formatDate()`, `handleDownload()`, `handleKeyDown()`, `handleLoadMore()`, `handlePageChange()`, `handlePageSizeChange()`, `handleSearch()`, `handleSearchClear()`, `download-history.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (7 nodes): `handleClear()`, `handleFocus()`, `handleInputChange()`, `handleKeyDown()`, `handleMouseDown()`, `handleSelect()`, `auto-complete-select.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (6 nodes): `handleCheckboxChange()`, `handleClearKeyword()`, `handleKeyDown()`, `handleReset()`, `handleSearch()`, `contents-search.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (6 nodes): `handleKeyDown()`, `handleReset()`, `handleSearch()`, `toggleStatus()`, `toggleTargetType()`, `notices-search.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (5 nodes): `CategoryError`, `.constructor()`, `MaxDescendantsExceededError`, `.constructor()`, `_constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (5 nodes): `handleKeyDown()`, `handleReset()`, `handleSearch()`, `updateLocal()`, `members-search.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (5 nodes): `useUserType()`, `MembersTable()`, `NameCellRenderer()`, `members-table.tsx`, `use-user-type.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (4 nodes): `handleCopyUrl()`, `orDash()`, `preferName()`, `contents-detail-info.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (4 nodes): `buildExtensions()`, `RichEditor()`, `editor-extensions.ts`, `rich-editor.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (4 nodes): `useMenuTree()`, `MenusContents()`, `menus-contents.tsx`, `use-menu-tree.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (4 nodes): `ContentsFormManagement()`, `useApprover()`, `contents-form-management.tsx`, `use-approver.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (4 nodes): `reconcileInlineImages()`, `extractInlineImageIds()`, `inline-image-cleanup.ts`, `extract-inline-image-ids.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (3 nodes): `main()`, `requireEnv()`, `seed-inquiry-type.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (3 nodes): `CategoriesDetail()`, `getInitialForm()`, `categories-detail.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (3 nodes): `ConfigError`, `.constructor()`, `errors.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (3 nodes): `normalizeTiptapTableWidths()`, `prepareBodyForRender()`, `prepare-body-for-render.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (3 nodes): `ensureHooksRegistered()`, `sanitizeContentHtml()`, `sanitize-html.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PUT()` connect `Community 0` to `Community 1`, `Community 4`, `Community 6`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `requireMenuPermission()` connect `Community 0` to `Community 1`, `Community 3`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `getFallbackRole()` connect `Community 2` to `Community 3`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `requireMenuPermission()` (e.g. with `POST()` and `PUT()`) actually correct?**
  _`requireMenuPermission()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `GET()` (e.g. with `getUserFromHeaders()` and `canAccessContent()`) actually correct?**
  _`GET()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `PUT()` (e.g. with `requireMenuPermission()` and `canModifyResource()`) actually correct?**
  _`PUT()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `logError()` (e.g. with `GET()` and `POST()`) actually correct?**
  _`logError()` has 21 INFERRED edges - model-reasoned connections that need verification._