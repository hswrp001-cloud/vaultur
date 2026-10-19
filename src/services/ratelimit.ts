import type { Config } from "../config"
import { errCode } from "../error"

/**
 * Simple fixed-window login rate limiter backed by KV (per-IP).
 * KV is eventually consistent, so this is a soft limit — good enough to slow
 * credential stuffing; strict limits should also use Cloudflare WAF rules.
 */
export async function checkLoginRateLimit(
	kv: KVNamespace,
	config: Config,
	ip: string
): Promise<void> {
	const windowSeconds = 60
	const key = `ratelimit:login:${ip}:${Math.floor(Date.now() / 1000 / windowSeconds)}`
	const current = Number((await kv.get(key)) ?? "0")
	if (current >= config.loginRatelimitMaxBurst) {
		errCode("Too many requests. Try again later.", 429)
	}
	// Best-effort increment; KV has no atomic incr, acceptable for a soft limit.
	await kv.put(key, String(current + 1), { expirationTtl: windowSeconds * 2 })
}

/**
 * Per-IP fixed-window limiter for admin authentication attempts (login POST and
 * failed bearer/cookie checks). Separate key namespace from checkLoginRateLimit.
 */
export async function checkAdminLoginRateLimit(
	kv: KVNamespace,
	config: Config,
	ip: string
): Promise<void> {
	const windowSeconds = 60
	const key = `ratelimit:admin-login:${ip}:${Math.floor(Date.now() / 1000 / windowSeconds)}`
	const current = Number((await kv.get(key)) ?? "0")
	if (current >= config.loginRatelimitMaxBurst) {
		errCode("Too many requests. Try again later.", 429)
	}
	await kv.put(key, String(current + 1), { expirationTtl: windowSeconds * 2 })
}

/**
 * Per-account failed-login limiter (best-effort, KV). Counts only failures;
 * the counter expires 60 seconds after the last failed credential check.
 * Complements the per-IP limiter above (which an attacker evades by rotating
 * IPs) and stops the HeavyCompute PBKDF2 spend for locked accounts.
 */
export async function checkUserLoginFailureLimit(
	kv: KVNamespace,
	config: Config,
	email: string
): Promise<void> {
	const current = Number((await kv.get(userFailureKey(email))) ?? "0")
	if (current >= config.loginRatelimitUserMaxFailures) {
		errCode("Too many requests. Try again later.", 429)
	}
}

/** Record one failed credential check for this account (best-effort). */
export async function recordUserLoginFailure(kv: KVNamespace, email: string): Promise<void> {
	const key = userFailureKey(email)
	const current = Number((await kv.get(key)) ?? "0")
	await kv.put(key, String(current + 1), { expirationTtl: 60 })
}

function userFailureKey(email: string): string {
	return `ratelimit:login-user:${email}`
}
