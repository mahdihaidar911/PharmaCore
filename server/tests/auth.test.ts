import { startServer, uniqueName, type TestServer } from "./helpers.js";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

let s: TestServer;
before(async () => {
  s = await startServer();
});
after(() => s.close());

describe("authentication", () => {
  test("rejects a wrong password with 401", async () => {
    const res = await s.call("POST", "/api/auth/login", { body: { username: "admin", password: "nope" } });
    assert.equal(res.status, 401);
  });

  test("requires a token for protected routes", async () => {
    assert.equal((await s.call("GET", "/api/products")).status, 401);
    assert.equal((await s.call("GET", "/api/products", { token: "garbage" })).status, 401);
  });

  test("login returns role and permissions; /me matches", async () => {
    const login = await s.call("POST", "/api/auth/login", { body: { username: "admin", password: "admin123" } });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, "owner");
    assert.ok(login.body.user.permissions.includes("users.manage"));

    const me = await s.call("GET", "/api/auth/me", { token: login.body.token });
    assert.equal(me.body.user.username, "admin");
    assert.deepEqual(me.body.user.permissions, login.body.user.permissions);
  });

  test("throttles repeated failed logins for a username", async () => {
    const cashier = await s.createUser("cashier");
    for (let i = 0; i < 5; i++) {
      await s.call("POST", "/api/auth/login", { body: { username: cashier.username, password: "wrong" } });
    }
    const blocked = await s.call("POST", "/api/auth/login", { body: { username: cashier.username, password: "secret123" } });
    assert.equal(blocked.status, 429);
  });

  test("users can change their own password", async () => {
    const user = await s.createUser("pharmacist");
    const bad = await s.call("POST", "/api/auth/change-password", {
      token: user.token,
      body: { current_password: "wrong", new_password: "newpass1" },
    });
    assert.equal(bad.status, 400);

    const ok = await s.call("POST", "/api/auth/change-password", {
      token: user.token,
      body: { current_password: "secret123", new_password: "newpass1" },
    });
    assert.equal(ok.status, 200);
    await s.login(user.username, "newpass1");
  });
});

describe("user management", () => {
  test("only owners can list or create users", async () => {
    const pharmacist = await s.createUser("pharmacist");
    assert.equal((await s.call("GET", "/api/users", { token: pharmacist.token })).status, 403);
    const create = await s.call("POST", "/api/users", {
      token: pharmacist.token,
      body: { username: uniqueName("x"), role: "owner", password: "secret123" },
    });
    assert.equal(create.status, 403);
  });

  test("rejects duplicate usernames and weak passwords", async () => {
    const dup = await s.call("POST", "/api/users", {
      token: s.ownerToken,
      body: { username: "ADMIN", role: "cashier", password: "secret123" },
    });
    assert.equal(dup.status, 409);
    const weak = await s.call("POST", "/api/users", {
      token: s.ownerToken,
      body: { username: uniqueName("weak"), role: "cashier", password: "123" },
    });
    assert.equal(weak.status, 400);
  });

  test("disabling a user revokes their existing session immediately", async () => {
    const cashier = await s.createUser("cashier");
    assert.equal((await s.call("GET", "/api/products", { token: cashier.token })).status, 200);

    await s.call("PUT", `/api/users/${cashier.id}`, { token: s.ownerToken, body: { is_active: false } });
    assert.equal((await s.call("GET", "/api/products", { token: cashier.token })).status, 401);
    const relogin = await s.call("POST", "/api/auth/login", { body: { username: cashier.username, password: "secret123" } });
    assert.equal(relogin.status, 403);
  });

  test("role changes apply to existing sessions", async () => {
    const user = await s.createUser("cashier");
    assert.equal((await s.call("GET", "/api/reports/sales-summary", { token: user.token })).status, 403);
    await s.call("PUT", `/api/users/${user.id}`, { token: s.ownerToken, body: { role: "pharmacist" } });
    assert.equal((await s.call("GET", "/api/reports/sales-summary", { token: user.token })).status, 200);
  });

  test("the last active owner cannot be demoted or disabled", async () => {
    const users = await s.call("GET", "/api/users", { token: s.ownerToken });
    const admin = users.body.find((u: { username: string }) => u.username === "admin");
    const demote = await s.call("PUT", `/api/users/${admin.id}`, { token: s.ownerToken, body: { role: "cashier" } });
    assert.equal(demote.status, 400);
    const self = await s.call("PUT", `/api/users/${admin.id}`, { token: s.ownerToken, body: { is_active: false } });
    assert.equal(self.status, 400);
  });

  test("owner can reset another user's password", async () => {
    const user = await s.createUser("cashier");
    const res = await s.call("POST", `/api/users/${user.id}/reset-password`, { token: s.ownerToken, body: { password: "reset123" } });
    assert.equal(res.status, 200);
    await s.login(user.username, "reset123");
  });
});
