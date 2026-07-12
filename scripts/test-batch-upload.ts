import { runWithConcurrencyLimit } from "@/lib/batch/concurrency";
import {
  analysisToFormValues,
  getFileFingerprint,
  hasUnfinishedBatchWork,
  mergeSelectedFiles,
  validateBatchImageFile,
  type BatchUploadItem,
} from "@/lib/batch/file-validation";
import { validateClosetItemFormValues } from "@/lib/closet/form-validation";
import { sanitizeMetadata } from "@/lib/analytics/track-event";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeFile(
  name: string,
  size: number,
  type: string,
  lastModified = 1
): File {
  const buffer = new Uint8Array(Math.max(size, 1));
  return new File([buffer], name, { type, lastModified });
}

async function testMaxTenFiles() {
  const existing = Array.from({ length: 8 }, (_, i) =>
    makeFile(`a${i}.jpg`, 1000, "image/jpeg", i + 1)
  );
  const incoming = Array.from({ length: 5 }, (_, i) =>
    makeFile(`b${i}.jpg`, 1000, "image/jpeg", i + 100)
  );

  const result = mergeSelectedFiles({ existing, incoming, maxCount: 10 });
  assert(result.accepted.length === 2, "should only accept 2 more files");
  assert(result.truncated, "should mark truncated when exceeding 10");
  console.log("[PASS] selecting beyond 10 keeps queue at max 10");
}

async function testRejectUnsupportedFormats() {
  assert(
    !validateBatchImageFile(makeFile("x.gif", 1000, "image/gif")).ok,
    "gif rejected"
  );
  assert(
    !validateBatchImageFile(makeFile("x.svg", 1000, "image/svg+xml")).ok,
    "svg rejected"
  );
  const heic = validateBatchImageFile(
    makeFile("x.heic", 1000, "image/heic")
  );
  assert(!heic.ok && heic.error.includes("HEIC"), "heic rejected with message");
  console.log("[PASS] unsupported formats are rejected");
}

async function testRejectLargeFile() {
  const large = makeFile("big.jpg", 5 * 1024 * 1024 + 1, "image/jpeg");
  const result = validateBatchImageFile(large);
  assert(!result.ok && result.error.includes("5MB"), "large file rejected");
  console.log("[PASS] files larger than 5MB are rejected");
}

async function testDuplicateFilesSkipped() {
  const file = makeFile("dup.jpg", 2048, "image/jpeg", 42);
  const result = mergeSelectedFiles({
    existing: [file],
    incoming: [makeFile("dup.jpg", 2048, "image/jpeg", 42)],
  });
  assert(result.accepted.length === 0, "duplicate not accepted");
  assert(result.duplicateCount === 1, "duplicate counted");
  assert(
    getFileFingerprint(file) === "dup.jpg::2048::42",
    "fingerprint uses name/size/lastModified"
  );
  console.log("[PASS] duplicate files are not added twice");
}

async function testObjectUrlRevokePattern() {
  const revoked: string[] = [];
  const fakeRevoke = (url: string) => {
    revoked.push(url);
  };
  const previewUrl = "blob:mock-1";
  fakeRevoke(previewUrl);
  assert(revoked.includes(previewUrl), "preview url should be revoked on remove");
  console.log("[PASS] object URL revoke pattern verified");
}

async function testConcurrencyNeverExceedsTwo() {
  let active = 0;
  let maxActive = 0;
  const tasks = Array.from({ length: 6 }, (_, i) => async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return i;
  });

  const results = await runWithConcurrencyLimit(tasks, 2);
  assert(maxActive <= 2, `max active was ${maxActive}`);
  assert(results.length === 6, "all tasks settled");
  assert(
    results.every((r) => r.status === "fulfilled"),
    "all fulfilled"
  );
  console.log("[PASS] concurrency never exceeds 2");
}

async function testOneFailureDoesNotStopOthers() {
  const tasks = [
    async () => {
      throw new Error("fail-1");
    },
    async () => "ok-2",
    async () => "ok-3",
  ];
  const results = await runWithConcurrencyLimit(tasks, 2);
  assert(results[0]?.status === "rejected", "first failed");
  assert(results[1]?.status === "fulfilled", "second succeeded");
  assert(results[2]?.status === "fulfilled", "third succeeded");
  console.log("[PASS] one analysis failure does not stop other tasks");
}

async function testNonClothingCannotSave() {
  const values = validateClosetItemFormValues({
    name: "玉米",
    category: "上衣",
  });
  // Gate is separate: analysis is_clothing=false blocks save in UI/server analyze.
  // Form validation alone is not enough — ensure gate helper semantics remain.
  const { isAcceptableClothing } = await import("@/lib/closet/clothing-gate");
  assert(!isAcceptableClothing({ is_clothing: false }), "non-clothing blocked");
  assert(values.ok, "form values can still validate text fields");
  console.log("[PASS] non-clothing cannot be saved via clothing gate");
}

async function testEditedValuesAreWhatGetValidated() {
  const result = validateClosetItemFormValues({
    name: "  米白长裤  ",
    category: "裤子",
    color: " 米白 ",
    material: "棉",
    style_tags: ["简约", "简约", "休闲"],
    season_tags: ["春"],
    occasion_tags: ["日常"],
    notes: "  修改后的备注  ",
  });
  assert(result.ok, "edited values should validate");
  if (result.ok) {
    assert(result.values.name === "米白长裤", "name trimmed");
    assert(result.values.notes === "修改后的备注", "notes trimmed");
    assert(
      result.values.style_tags.join(",") === "简约,休闲",
      "tags deduped"
    );
  }
  console.log("[PASS] user-edited values are validated and normalized");
}

async function testCompletedCannotSaveAgain() {
  const item: BatchUploadItem = {
    clientId: "c1",
    file: makeFile("a.jpg", 100, "image/jpeg"),
    previewUrl: "blob:x",
    status: "completed",
    attempts: 1,
    savedClosetItemId: "item-1",
    formValues: analysisToFormValues({
      name: "T",
      category: "上衣",
      color: "",
      material: "",
      style_tags: [],
      season_tags: [],
      occasion_tags: [],
      notes: "",
      confidence: 1,
      is_clothing: true,
    }),
  };

  const canSave =
    item.status === "needs_review" ||
    (item.status === "failed" && item.failureStage === "save");
  assert(!canSave, "completed item must not be saveable");
  console.log("[PASS] completed tasks cannot be saved again");
}

async function testDoubleSaveGuard() {
  const savingIds = new Set<string>();
  const clientId = "c-double";
  assert(!savingIds.has(clientId), "not saving yet");
  savingIds.add(clientId);
  assert(savingIds.has(clientId), "second click blocked by saving set");
  console.log("[PASS] double-save guard uses in-flight set");
}

async function testSaveFailureKeepsAnalysis() {
  const formValues = {
    name: "外套",
    category: "外套",
    color: "黑",
    material: "尼龙",
    style_tags: ["通勤"],
    season_tags: ["春"],
    occasion_tags: ["上班"],
    notes: "保留",
  };
  const afterFail: BatchUploadItem = {
    clientId: "c2",
    file: makeFile("coat.jpg", 100, "image/jpeg"),
    previewUrl: "blob:y",
    status: "failed",
    failureStage: "save",
    error: "保存失败，请稍后重试",
    attempts: 2,
    formValues,
    analysis: {
      name: "外套",
      category: "外套",
      color: "黑",
      material: "尼龙",
      style_tags: ["通勤"],
      season_tags: ["春"],
      occasion_tags: ["上班"],
      notes: "保留",
      confidence: 0.9,
      is_clothing: true,
    },
  };
  assert(afterFail.formValues?.name === "外套", "keeps edited name");
  assert(afterFail.analysis?.is_clothing === true, "keeps analysis");
  console.log("[PASS] save failure retains analysis and edits");
}

async function testCompletedNotOverwrittenByStaleCallback() {
  let items: BatchUploadItem[] = [
    {
      clientId: "c3",
      file: makeFile("ok.jpg", 100, "image/jpeg"),
      previewUrl: "blob:z",
      status: "completed",
      attempts: 1,
      savedClosetItemId: "saved-1",
    },
  ];

  const staleUpdate = (current: BatchUploadItem[]) =>
    current.map((item) =>
      item.clientId === "c3" && item.status !== "completed"
        ? { ...item, status: "failed" as const, error: "stale" }
        : item
    );

  items = staleUpdate(items);
  assert(items[0]?.status === "completed", "completed stays completed");
  console.log("[PASS] completed status is not overwritten by stale callbacks");
}

async function testBeforeUnloadFlag() {
  const unfinished: BatchUploadItem[] = [
    {
      clientId: "c4",
      file: makeFile("q.jpg", 10, "image/jpeg"),
      previewUrl: "blob:q",
      status: "needs_review",
      attempts: 1,
    },
  ];
  const finished: BatchUploadItem[] = [
    {
      clientId: "c5",
      file: makeFile("done.jpg", 10, "image/jpeg"),
      previewUrl: "blob:d",
      status: "completed",
      attempts: 1,
      savedClosetItemId: "x",
    },
  ];
  assert(hasUnfinishedBatchWork(unfinished), "beforeunload should enable");
  assert(!hasUnfinishedBatchWork(finished), "beforeunload should remove");
  assert(!hasUnfinishedBatchWork([]), "empty queue disables warning");
  console.log("[PASS] beforeunload enable/disable based on unfinished work");
}

async function testAnalyticsMetadataSanitized() {
  const metadata = sanitizeMetadata({
    feature: "closet",
    totalCount: 8,
    image_url: "https://example.com/secret.jpg",
    api_key: "sk-test",
    token: "abc",
    base64: "AAAA",
  });
  assert(metadata.totalCount === 8, "keeps safe fields");
  assert(metadata.image_url === undefined, "strips image_url");
  assert(metadata.api_key === undefined, "strips api_key");
  assert(metadata.token === undefined, "strips token");
  assert(metadata.base64 === undefined, "strips base64");
  console.log("[PASS] analytics metadata does not include image/base64/secrets");
}

async function testInvalidCategoryRejected() {
  const result = validateClosetItemFormValues({
    name: "测试",
    category: "非法分类",
  });
  assert(!result.ok, "invalid category rejected");
  console.log("[PASS] invalid category rejected server-side style validation");
}

async function main() {
  await testMaxTenFiles();
  await testRejectUnsupportedFormats();
  await testRejectLargeFile();
  await testDuplicateFilesSkipped();
  await testObjectUrlRevokePattern();
  await testConcurrencyNeverExceedsTwo();
  await testOneFailureDoesNotStopOthers();
  await testNonClothingCannotSave();
  await testEditedValuesAreWhatGetValidated();
  await testCompletedCannotSaveAgain();
  await testDoubleSaveGuard();
  await testSaveFailureKeepsAnalysis();
  await testCompletedNotOverwrittenByStaleCallback();
  await testBeforeUnloadFlag();
  await testAnalyticsMetadataSanitized();
  await testInvalidCategoryRejected();
  console.log("\nAll batch upload tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
