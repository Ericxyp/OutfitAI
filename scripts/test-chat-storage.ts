/**
 * 首页聊天消息本地存储测试（按 user.id 隔离）。
 * 运行：npm run test:chat-storage
 */
import {
  CHAT_MESSAGES_STORAGE_KEY,
  MAX_STORED_CHAT_MESSAGES,
  clearChatMessages,
  getChatMessagesStorageKey,
  readChatMessages,
  writeChatMessages,
  type ChatMessage,
  type ChatStorageLike,
} from "@/lib/chat/message-storage";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
function pass(name: string) {
  console.log(`[PASS] ${name}`);
}

class MemoryStorage implements ChatStorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const msg = (id: string, content: string): ChatMessage => ({ id, role: "user", content });

function testKeys() {
  assert(getChatMessagesStorageKey(USER_A) === `outfitai.chat.messages:${USER_A}`, "user key format");
  assert(getChatMessagesStorageKey(null) === "outfitai.chat.messages:anonymous", "anonymous key");
  assert(getChatMessagesStorageKey("") === "outfitai.chat.messages:anonymous", "empty → anonymous");
  assert(getChatMessagesStorageKey("anonymous") === "outfitai.chat.messages:anonymous", "literal anonymous not a user");
  assert(getChatMessagesStorageKey("a b") === "outfitai.chat.messages:anonymous", "whitespace id rejected");
  assert(getChatMessagesStorageKey(USER_A) !== getChatMessagesStorageKey(null), "anonymous ≠ logged-in");
  pass("9/10. 消息 key 按 user.id 隔离，anonymous 单独 key");
}

function testIsolation() {
  const storage = new MemoryStorage();
  writeChatMessages(storage, USER_A, [msg("1", "A 的需求")]);
  writeChatMessages(storage, USER_B, [msg("2", "B 的需求")]);
  writeChatMessages(storage, null, [msg("3", "匿名需求")]);

  const a = readChatMessages(storage, USER_A);
  const b = readChatMessages(storage, USER_B);
  const anon = readChatMessages(storage, null);
  assert(a.length === 1 && a[0].role === "user" && a[0].content === "A 的需求", "A reads only A");
  assert(b.length === 1 && b[0].role === "user" && b[0].content === "B 的需求", "B reads only B");
  assert(anon.length === 1 && anon[0].role === "user" && anon[0].content === "匿名需求", "anonymous separate");

  clearChatMessages(storage, USER_A);
  assert(readChatMessages(storage, USER_A).length === 0, "A cleared");
  assert(readChatMessages(storage, USER_B).length === 1 && readChatMessages(storage, null).length === 1, "others untouched");
  pass("9/10/13. A / B / 匿名消息互相隔离，清空只影响当前账号");
}

function testLegacyKeyNotMigrated() {
  const storage = new MemoryStorage();
  storage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify([msg("x", "旧版全局消息")]));
  const a = readChatMessages(storage, USER_A);
  assert(a.length === 0, "legacy messages not migrated to logged-in user");
  assert(storage.getItem(CHAT_MESSAGES_STORAGE_KEY) === null, "legacy global key deleted");
  storage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify([msg("y", "旧版")]));
  assert(readChatMessages(storage, null).length === 0, "legacy not migrated to anonymous either");
  pass("旧版全局 key 被删除，不迁移到任何账号");
}

function testInvalidCache() {
  const storage = new MemoryStorage();
  const key = getChatMessagesStorageKey(USER_A);
  for (const raw of ["{broken", "null", "{}", "42"]) {
    storage.setItem(key, raw);
    assert(readChatMessages(storage, USER_A).length === 0, `invalid cache ${raw} → empty`);
    assert(storage.getItem(key) === null, `invalid cache ${raw} deleted`);
  }
  storage.setItem(
    key,
    JSON.stringify([
      msg("ok", "合法"),
      { id: 1, role: "user", content: "bad id" },
      { id: "x", role: "assistant", content: "bad href", actionHref: "https://evil.example" },
      { id: "r", role: "recommendation", recommendation: { id: "x" } },
      { id: "s", role: "system", content: "?" },
    ])
  );
  const filtered = readChatMessages(storage, USER_A);
  assert(filtered.length === 1 && filtered[0].id === "ok", "only valid messages kept");

  const throwing: ChatStorageLike = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceeded");
    },
    removeItem() {
      throw new Error("SecurityError");
    },
  };
  assert(readChatMessages(throwing, USER_A).length === 0, "throwing storage read safe");
  writeChatMessages(throwing, USER_A, [msg("1", "x")]);
  clearChatMessages(throwing, USER_A);
  assert(readChatMessages(null, USER_A).length === 0, "no storage safe");
  pass("11. 非法本地消息缓存被删除 / 过滤，不会导致崩溃");
}

function testWriteLimits() {
  const storage = new MemoryStorage();
  const many = Array.from({ length: MAX_STORED_CHAT_MESSAGES + 30 }, (_, i) => msg(String(i), `m${i}`));
  writeChatMessages(storage, USER_A, [...many, { id: 5 } as unknown as ChatMessage]);
  const stored = JSON.parse(storage.getItem(getChatMessagesStorageKey(USER_A))!);
  assert(stored.length === MAX_STORED_CHAT_MESSAGES, "capped");
  assert(stored[stored.length - 1].id === String(MAX_STORED_CHAT_MESSAGES + 29), "keeps latest");
  writeChatMessages(storage, USER_A, []);
  assert(storage.getItem(getChatMessagesStorageKey(USER_A)) === null, "empty list removes key");
  pass("只持久化合法消息，数量有上限，空列表删除 key");
}

testKeys();
testIsolation();
testLegacyKeyNotMigrated();
testInvalidCache();
testWriteLimits();
console.log("\nAll chat storage tests passed.");
