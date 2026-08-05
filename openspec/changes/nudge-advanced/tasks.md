## 1. åŽç«¯ï¼šåå•æŽ¥å£å¸¦å‡ºå·²è·³è¿‡äººæ•°

### Contract
- **Spec**: åå•å¤´éƒ¨æ‘˜è¦è¡Œ SHALL åŒæ—¶æ˜¾ç¤º"æœªäº¤"äººæ•°ä¸Ž"å·²è·³è¿‡"äººæ•°ã€‚æ²¡æœ‰äººè¢«è·³è¿‡æ—¶ SHALL æ˜¾ç¤ºè¯¥æ•°å­—ä¸º 0ï¼Œä¸æ˜¯éšè—è¿™ä¸€é¡¹ã€‚ï¼ˆ`specs/nudge/spec.md`ï¼‰
- **Runtime**: `cd backend && pytest tests/test_nudge.py` â†’ expected: å…¨éƒ¨é€šè¿‡ï¼Œè¦†ç›–å“åº”å½¢çŠ¶å˜åŒ–ï¼ˆ`items`/`skipped_count`ï¼‰ä¸Žè·³è¿‡äººæ•°è®¡ç®—ï¼ˆå« 0 äººè·³è¿‡çš„æƒ…å½¢ï¼‰
- **Code**: `GET /api/nudge?course=` å“åº”å½¢çŠ¶ä»Žè£¸æ•°ç»„æ”¹æˆ `{items, skipped_count}`ï¼ˆdesign.md å†³å®š 4ï¼‰ï¼›`skipped_count` ç”¨ä¸€æ¬¡ç‹¬ç«‹çš„ `COUNT(DISTINCT student_email)` æŸ¥è¯¢ï¼ˆcourse çº§åˆ«å¸¸æ•°æ¬¡ï¼Œä¸éšåå•äººæ•°å¢žé•¿ï¼Œèµ° `nudge_events` æ—¢æœ‰å¤åˆç´¢å¼•ï¼‰ï¼Œè¿™æ˜¯å¯¹ requirements åŽŸæ–‡"é›¶é¢å¤–å¾€è¿”"çš„ä¸€å¤„å·²æŠ«éœ²åç¦»ï¼Œdesign.md é‡Œå†™æ˜Žäº†åŽŸå› 
- **Threshold**: 80

- [x] 1.0 CONTRACT â€” write openspec/changes/nudge-advanced/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED â€” `backend/tests/test_nudge.py`ï¼šæ–°å¢žç”¨ä¾‹ï¼ŒæŸè¯¾ç¨‹æœ‰ 2 äººæœªäº¤ã€1 äººè¢«è·³è¿‡ï¼Œæ–­è¨€ `GET /api/nudge?course=` è¿”å›žä½“æ˜¯ `{"items": [...], "skipped_count": 1}` å½¢çŠ¶ï¼Œ`items` é•¿åº¦ä¸º 2ï¼›æ­¤æ—¶ç«¯ç‚¹è¿˜è¿”å›žè£¸æ•°ç»„ï¼Œæ–­è¨€åº”å¤±è´¥
- [x] 1.2 GREEN â€” `backend/app/schemas.py` åŠ  `NudgeListRead{items, skipped_count}`ï¼›`nudge.py::list_nudge` æ”¹ç”¨å®ƒä½œä¸º `response_model`ï¼ŒåŠ  `skipped_count` æŸ¥è¯¢å¹¶åŒ…è¿›è¿”å›žä½“
- [x] 1.3 RED â€” æ–°å¢žç”¨ä¾‹ï¼šæŸè¯¾ç¨‹æ²¡æœ‰ä»»ä½•äººè¢«è·³è¿‡ï¼Œæ–­è¨€ `skipped_count == 0`ï¼ˆä¸æ˜¯ç¼ºå¤±è¿™ä¸ªå­—æ®µï¼‰
- [x] 1.4 GREEN â€” ç¡®è®¤æ²¡æœ‰è·³è¿‡äº‹ä»¶æ—¶ `COUNT` å¤©ç„¶è¿”å›ž 0ï¼ˆå¤šæ•°æƒ…å†µä¸‹ 1.2 å·²ç»è¦†ç›–ï¼Œè¿™ä¸€æ­¥ç”¨äºŽç¡®è®¤è¾¹ç•Œï¼‰
- [x] 1.E EVAL â€” spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total â‰¥ 80 â†’ PASS; < 80 â†’ append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. å‰ç«¯ï¼šä¸‰æ¡£æ–‡æ¡ˆæ¨¡æ¿ tab

### Contract
- **Spec**: é€‰ä¸­ä¸€äººåŽ SHALL å±•ç¤ºä¸‰æ¡£å›ºå®šæ–‡æ¡ˆæ¨¡æ¿ï¼ˆç¬¬ä¸€æ¬¡æé†’/ç¬¬äºŒæ¬¡æé†’/æœ€åŽä¸€æ¬¡ï¼‰ï¼ŒSHALL æŒ‰è¯¥å­¦å‘˜å·²å‚¬æ¬¡æ•°è‡ªåŠ¨é€‰ä¸­é»˜è®¤æ¡£ä½ï¼ˆ0 æ¬¡â†’ç¬¬ä¸€æ¡£ï¼Œ1 æ¬¡â†’ç¬¬äºŒæ¡£ï¼Œâ‰¥2 æ¬¡â†’ç¬¬ä¸‰æ¡£ï¼‰ï¼›æ‰‹åŠ¨åˆ‡æ¢æ¡£ä½æ—¶ï¼Œè‹¥è‰ç¨¿æ˜¯å½“å‰æ¡£ä½æœªç¼–è¾‘è¿‡çš„é»˜è®¤æ–‡æœ¬ï¼ŒSHALL æ›¿æ¢ä¸ºæ–°æ¡£ä½é»˜è®¤æ–‡æ¡ˆï¼Œå·²ç¼–è¾‘è¿‡çš„è‰ç¨¿ SHALL NOT è¢«åˆ‡æ¢åŠ¨ä½œè¦†ç›–ã€‚ï¼ˆ`specs/nudge/spec.md`ï¼›UI è§ `docs/superpowers/specs/mocks/2026-08-04-nudge-advanced-mocks.html#template-tabs-desktop`ï¼‰
- **Runtime**: `cd frontend && npm run test -- NudgeClient` â†’ expected: å…¨éƒ¨é€šè¿‡ï¼Œè¦†ç›–é»˜è®¤æ¡£ä½é€‰æ‹©/æ‰‹åŠ¨åˆ‡æ¢æ›¿æ¢è‰ç¨¿/å·²ç¼–è¾‘è‰ç¨¿ä¸è¢«åˆ‡æ¢è¦†ç›–
- **Code**: `NudgeClient.tsx` æ–°å¢ž `TEMPLATES` å¸¸é‡ï¼ˆä¸‰æ¡£å›ºå®šæ–‡æ¡ˆï¼‰ä¸Ž `defaultTemplateKey(nudgedCount)` çº¯å‡½æ•°ï¼ˆdesign.md å†³å®š 1ï¼‰ï¼›`DetailPanel` æ–°å¢ž `templateKey` stateï¼Œéš `key={studentEmail}` æ¢äººå¤ä½ï¼ˆæ²¿ç”¨ MVP å·²æœ‰çš„çŠ¶æ€å¤ä½æœºåˆ¶ï¼‰ï¼›åˆ‡æ¢ tab æ—¶ç”¨å­—ç¬¦ä¸²ç›¸ç­‰æ¯”è¾ƒåˆ¤æ–­"æ˜¯å¦å·²ç¼–è¾‘"
- **Threshold**: 70

- [x] 2.0 CONTRACT â€” write openspec/changes/nudge-advanced/contracts/group-2.md with the ### Contract block above
- [x] 2.1 MOCK â€” open docs/superpowers/specs/mocks/2026-08-04-nudge-advanced-mocks.html#template-tabs-desktop ä¸Ž #mobileï¼›è®°å½• tab æ–‡æ¡ˆï¼ˆç¬¬ä¸€æ¬¡æé†’/ç¬¬äºŒæ¬¡æé†’/æœ€åŽä¸€æ¬¡ï¼‰ã€é€‰ä¸­æ€æ ·å¼ã€"æŒ‰å·²å‚¬æ¬¡æ•°è‡ªåŠ¨æŽ¨è"æç¤ºæ–‡æ¡ˆ
- [x] 2.2 RED â€” `frontend/app/(app)/nudge/NudgeClient.test.tsx`ï¼šæ–°å¢žç”¨ä¾‹ï¼Œé€‰ä¸­ä¸€åå·²å‚¬ 0 æ¬¡çš„å­¦å‘˜ï¼Œæ–­è¨€"ç¬¬ä¸€æ¬¡æé†’"tab å¤„äºŽé€‰ä¸­æ€ï¼›æ­¤æ—¶ç»„ä»¶æ²¡æœ‰æ¨¡æ¿ tabï¼Œæµ‹è¯•åº”å¤±è´¥
- [x] 2.3 GREEN â€” å®žçŽ° `TEMPLATES`ã€`defaultTemplateKey()`ã€`templateKey` state ä¸Ž tab æ¸²æŸ“
- [x] 2.4 RED â€” æ–°å¢žç”¨ä¾‹ï¼šé€‰ä¸­å·²å‚¬ 1 æ¬¡çš„å­¦å‘˜é»˜è®¤ç¬¬äºŒæ¡£ã€å·²å‚¬ 2 æ¬¡é»˜è®¤ç¬¬ä¸‰æ¡£
- [x] 2.5 GREEN â€” ç¡®è®¤é˜ˆå€¼åˆ¤æ–­æ­£ç¡®ï¼ˆå¤šæ•°æƒ…å†µä¸‹ 2.3 å·²ç»è¦†ç›–ï¼Œè¿™ä¸€æ­¥ç”¨äºŽç¡®è®¤è¾¹ç•Œï¼‰
- [x] 2.6 RED â€” æ–°å¢žç”¨ä¾‹ï¼šæ‰‹åŠ¨ç‚¹å‡»å¦ä¸€ä¸ª tabï¼Œæœªç¼–è¾‘è¿‡çš„è‰ç¨¿æ›¿æ¢æˆæ–°æ¡£ä½é»˜è®¤æ–‡æ¡ˆ
- [x] 2.7 GREEN â€” å®žçŽ°åˆ‡æ¢æ›¿æ¢é€»è¾‘
- [x] 2.8 RED â€” æ–°å¢žç”¨ä¾‹ï¼šå…ˆç¼–è¾‘è‰ç¨¿ï¼Œå†ç‚¹å‡»å¦ä¸€ä¸ª tabï¼Œè‰ç¨¿æ–‡æœ¬ä¸å˜ï¼ˆä¸è¢«è¦†ç›–ï¼‰
- [x] 2.9 GREEN â€” åŠ "æ˜¯å¦å·²ç¼–è¾‘"åˆ¤æ–­ï¼ˆå­—ç¬¦ä¸²ç›¸ç­‰æ¯”è¾ƒå½“å‰è‰ç¨¿ä¸Žå½“å‰æ¡£ä½é»˜è®¤æ–‡æ¡ˆï¼‰
- [x] 2.10 VISUAL DIFF â€” bring up dev stack (`npm run dev --prefix frontend`)ï¼›æ ¸å¯¹æ¨¡æ¿ tab ä¸Ž mock ä¸€è‡´ï¼ˆè‹¥ç«™ç‚¹ Basic Auth æŒ¡ä½è‡ªåŠ¨åŒ–æµè§ˆå™¨ï¼ŒæŒ‰æ—¢æœ‰é™çº§æ–¹æ¡ˆæ”¹ç”¨ç»„ä»¶çº§æ¸²æŸ“æ ¸å¯¹å¹¶å¦‚å®žè®°å½•ï¼‰
- [x] 2.E EVAL â€” spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total â‰¥ 70 â†’ PASS; < 70 â†’ append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. å‰ç«¯ï¼šå¯¼å‡ºåå• + è¿›åº¦æŒ‡ç¤º + å¤´éƒ¨ç»Ÿè®¡è¡Œ

### Contract
- **Spec**: åå•é¡µ SHALL æä¾›"å¯¼å‡ºåå•"å…¥å£ï¼Œç‚¹å‡»åŽ SHALL ç”Ÿæˆ CSVï¼ˆå§“å/é‚®ç®±/å¾®ä¿¡/é€¾æœŸå¤©æ•°/å·²å‚¬æ¬¡æ•°ï¼‰ï¼ŒSHALL NOT ä¸ºå¯¼å‡ºå‘èµ·æ–°çš„ç½‘ç»œè¯·æ±‚ã€‚åå•é¡µå¤´éƒ¨ SHALL å±•ç¤º 3 æ­¥è¿›åº¦æŒ‡ç¤ºï¼ˆç®—åå•â†’èµ·è‰æ–‡æ¡ˆâ†’æ ‡è®°/è·³è¿‡ï¼‰ï¼ŒSHALL NOT å‡ºçŽ°"å‘é€é‚®ä»¶"è¿™ä¸€æ­¥ã€‚å¤´éƒ¨æ‘˜è¦è¡Œ SHALL åŒæ—¶æ˜¾ç¤ºæœªäº¤äººæ•°ä¸Žå·²è·³è¿‡äººæ•°ã€‚ï¼ˆ`specs/nudge/spec.md`ï¼›UI è§ mock `#header-stats-desktop` `#progress-steps-desktop`ï¼‰
- **Runtime**: `cd frontend && npm run test -- NudgeClient page` â†’ expected: å…¨éƒ¨é€šè¿‡ï¼Œè¦†ç›– CSV å†…å®¹ç”Ÿæˆï¼ˆä¸å‘è¯·æ±‚ï¼‰/è¿›åº¦æŒ‡ç¤ºä¸‰æ­¥/å¤´éƒ¨ç»Ÿè®¡è¡Œå«è·³è¿‡äººæ•°
- **Code**: `NudgeClient.tsx` æ–°å¢ž `toCsv(people)` çº¯å‡½æ•° + `Blob`/`URL.createObjectURL`/éšè— `<a download>` è§¦å‘ä¸‹è½½ï¼ˆdesign.md å†³å®š 2ï¼‰ï¼›è¿›åº¦æŒ‡ç¤ºæ˜¯é™æ€ä¸‰æ­¥ JSXï¼Œä¸ä¾èµ–æ–°æ•°æ®ï¼ˆdesign.md å†³å®š 3ï¼‰ï¼›`page.tsx`/`lib/api.ts::getNudgeList` é€‚é…æ–°çš„ `{items, skippedCount}` å“åº”å½¢çŠ¶
- **Threshold**: 70

- [x] 3.0 CONTRACT â€” write openspec/changes/nudge-advanced/contracts/group-3.md with the ### Contract block above
- [x] 3.1 MOCK â€” open docs/superpowers/specs/mocks/2026-08-04-nudge-advanced-mocks.html#header-stats-desktop ä¸Ž #progress-steps-desktop ä¸Ž #mobileï¼›è®°å½•"å¯¼å‡ºåå•"æŒ‰é’®ä½ç½®ã€3 æ­¥è¿›åº¦æŒ‡ç¤ºçš„æ–‡æ¡ˆä¸ŽçŠ¶æ€æ ·å¼ï¼ˆå·²å®Œæˆ/å½“å‰/å¾…åŠžï¼‰ã€å¤´éƒ¨æ‘˜è¦è¡Œ"N äººæœªäº¤ Â· å·²è·³è¿‡ M äºº"çš„æŽªè¾ž
- [x] 3.2 RED â€” `frontend/lib/api.ts` ä¸Ž `frontend/app/(app)/nudge/types.ts`ï¼š`getNudgeList` æ”¹é€ æˆè¿”å›ž `{people, skippedCount}`ï¼›`frontend/app/(app)/nudge/page.test.tsx` æ–°å¢ž/æ”¹ç”¨ä¾‹æ–­è¨€ `NudgeClient` æ”¶åˆ°çš„ `skippedCount` æ¥è‡ªåŽç«¯ `skipped_count` å­—æ®µï¼›æ­¤æ—¶ `getNudgeList` è¿˜è¿”å›žè£¸æ•°ç»„ï¼Œæµ‹è¯•åº”å¤±è´¥
- [x] 3.3 GREEN â€” æ”¹é€  `getNudgeList`ã€`page.tsx` é€‚é…æ–°å“åº”å½¢çŠ¶
- [x] 3.4 RED â€” `NudgeClient.test.tsx` æ–°å¢žç”¨ä¾‹ï¼šå¤´éƒ¨æ‘˜è¦è¡ŒåŒæ—¶æ˜¾ç¤º"N äººæœªäº¤"ä¸Ž"å·²è·³è¿‡ M äºº"ï¼ˆå« M=0 çš„æƒ…å½¢ï¼‰
- [x] 3.5 GREEN â€” å®žçŽ°å¤´éƒ¨ç»Ÿè®¡è¡Œæ¸²æŸ“
- [x] 3.6 RED â€” æ–°å¢žç”¨ä¾‹ï¼šé¡µé¢æ¸²æŸ“å‡º 3 æ­¥è¿›åº¦æŒ‡ç¤ºï¼Œä¸åŒ…å«"å‘é€é‚®ä»¶"æ–‡æ¡ˆ
- [x] 3.7 GREEN â€” å®žçŽ°é™æ€è¿›åº¦æŒ‡ç¤ºç»„ä»¶
- [x] 3.8 RED â€” æ–°å¢žç”¨ä¾‹ï¼šç‚¹å‡»"å¯¼å‡ºåå•"ï¼Œæ–­è¨€è§¦å‘äº† `Blob`/ä¸‹è½½ç›¸å…³è°ƒç”¨ï¼ˆmock `URL.createObjectURL`ï¼‰ï¼Œä¸”æ²¡æœ‰ `fetch` è¢«è°ƒç”¨
- [x] 3.9 GREEN â€” å®žçŽ° `toCsv()` ä¸Žä¸‹è½½è§¦å‘é€»è¾‘
- [x] 3.10 VISUAL DIFF â€” æ ¸å¯¹å¯¼å‡ºæŒ‰é’®ã€è¿›åº¦æŒ‡ç¤ºã€å¤´éƒ¨ç»Ÿè®¡è¡Œä¸Ž mock ä¸€è‡´ï¼ˆåŒæ ·çš„ Basic Auth é™çº§æ–¹æ¡ˆï¼‰
- [x] 3.E EVAL â€” spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total â‰¥ 70 â†’ PASS; < 70 â†’ append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. éªŒè¯ä¸Žæ”¶å°¾

- [x] 4.1 Run backend test suite â€” ensure no regressions (`cd backend && pytest`)
- [x] 4.2 Run frontend test suite â€” ensure no regressions (`cd frontend && npm run test`)
- [x] 4.3 Run e2e suite if applicable â€” æ— é…ç½®ï¼ˆ`project.e2e_command` ä¸ºç©ºï¼‰ï¼Œè·³è¿‡
- [x] 4.4 Run superpowers:verification-before-completionï¼ˆè¿è¡Œ `openspec/config.yaml` é‡Œçš„ `project.test_commands`ï¼›`grep -rn 'console.log' frontend/app frontend/lib`ï¼›`project.custom_verification_checks` ä¸¤æ¡çŽ¯å¢ƒå˜é‡æ³„æ¼æ£€æŸ¥ï¼‰
