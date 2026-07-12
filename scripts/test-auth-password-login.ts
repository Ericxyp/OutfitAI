import { mapAuthError } from "@/lib/auth/auth-errors";
import { getSafeNextPath } from "@/lib/auth/safe-next";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function testSafeNextPath() {
  assert(getSafeNextPath(undefined) === "/", "undefined should fallback");
  assert(getSafeNextPath(null) === "/", "null should fallback");
  assert(getSafeNextPath("") === "/", "empty should fallback");
  assert(getSafeNextPath("/closet") === "/closet", "/closet should be allowed");
  assert(
    getSafeNextPath("/closet/new") === "/closet/new",
    "/closet/new should be allowed"
  );
  assert(
    getSafeNextPath("//evil.com") === "/",
    "//evil.com should be blocked"
  );
  assert(
    getSafeNextPath("https://evil.com") === "/",
    "absolute url should be blocked"
  );
  assert(
    getSafeNextPath("closet") === "/",
    "relative without slash should be blocked"
  );

  console.log("[PASS] getSafeNextPath blocks open redirects");
}

function testAuthErrorMapping() {
  assert(
    mapAuthError({ code: "invalid_credentials", message: "Invalid" }, "login") ===
      "登录失败，请检查邮箱和密码。",
    "invalid_credentials"
  );
  assert(
    mapAuthError(
      { message: "User already registered" },
      "signup"
    ) === "该邮箱可能已经注册，请返回登录。",
    "already registered"
  );
  assert(
    mapAuthError({ code: "weak_password", message: "weak" }, "signup") ===
      "密码强度不足，请使用至少 8 位更安全的密码。",
    "weak_password"
  );
  assert(
    mapAuthError(
      { name: "AuthRetryableFetchError", message: "Failed to fetch" },
      "login"
    ) === "暂时无法连接登录服务，请稍后重试。",
    "network"
  );
  assert(
    !mapAuthError({ message: "secret stack dump" }, "login").includes("secret"),
    "should not leak raw message"
  );

  console.log("[PASS] mapAuthError returns safe Chinese messages");
}

function main() {
  testSafeNextPath();
  testAuthErrorMapping();
  console.log("\nAll auth password login tests passed.");
}

main();
