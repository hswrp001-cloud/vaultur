import { SELF } from "cloudflare:test"
import { describe, expect, it, vi } from "vitest"

import type { Config } from "../src/config"
import { checkUserLoginFailureLimit, recordUserLoginFailure } from "../src/services/ratelimit"
import { login, registerUser, TEST_USER } from "./helpers"

describe("per-account failed-login rate limiting", () => {
	it("keeps failures across fixed-minute boundaries", async () => {
		const counters = new Map<string, string>()
		const kv = {
			get: async (key: string) => counters.get(key) ?? null,
			put: async (key: string, value: string, options: { expirationTtl: number }) => {
				expect(options.expirationTtl).toBe(60)
				counters.set(key, value)
			}
		} as unknown as KVNamespace
		const config = { loginRatelimitUserMaxFailures: 5 } as Config
		const now = vi.spyOn(Date, "now")

		try {
			now.mockReturnValue(59_000)
			for (let i = 0; i < 4; i++) {
				await recordUserLoginFailure(kv, TEST_USER.email)
			}
			now.mockReturnValue(60_000)
			await recordUserLoginFailure(kv, TEST_USER.email)

			await expect(checkUserLoginFailureLimit(kv, config, TEST_USER.email)).rejects.toMatchObject({
				status: 429
			})
			expect([...counters.entries()]).toEqual([[`ratelimit:login-user:${TEST_USER.email}`, "5"]])
		} finally {
			now.mockRestore()
		}
	})

	it("locks an account after five failed password logins", async () => {
		expect((await registerUser()).status).toBe(200)
		for (let i = 0; i < 5; i++) {
			expect((await login(TEST_USER.email, "wrong-hash")).status).toBe(400)
		}

		const blocked = await login()
		expect(blocked.status).toBe(429)
		const body = (await blocked.json()) as Record<string, any>
		expect(body.errorModel.message).toContain("Too many requests")
	})

	it("does not count successful logins as failures", async () => {
		expect((await registerUser()).status).toBe(200)
		expect((await login()).status).toBe(200)
		expect((await login()).status).toBe(200)
		for (let i = 0; i < 4; i++) {
			expect((await login(TEST_USER.email, "wrong-hash")).status).toBe(400)
		}
		expect((await login()).status).toBe(200)
	})

	it("isolates failure counters by account", async () => {
		const otherEmail = "other@vaultur.dev"
		expect((await registerUser()).status).toBe(200)
		expect((await registerUser({ email: otherEmail })).status).toBe(200)
		for (let i = 0; i < 5; i++) {
			expect((await login(TEST_USER.email, "wrong-hash")).status).toBe(400)
		}
		expect((await login(otherEmail)).status).toBe(200)
	})

	it("shares the account failure counter with the email-login endpoint", async () => {
		expect((await registerUser()).status).toBe(200)
		const attempt = () =>
			SELF.fetch("https://vault.test/api/two-factor/send-email-login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: TEST_USER.email,
					masterPasswordHash: "wrong-hash"
				})
			})

		for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(400)
		expect((await attempt()).status).toBe(429)
		expect((await login()).status).toBe(429)
	})
})
